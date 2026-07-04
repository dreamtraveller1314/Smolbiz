import { supabase } from "./supabaseClient.js";
import { $, $all, money, fmtDate, toast, initials } from "./utils.js";
import { state } from "./state.js";
import { mountMain, pageHeader, openModal, closeModal, renderShell } from "./shell.js";
import { generateInsight, forecastNextPeriod } from "./groq.js";

// ================= HOME =================
export async function renderAdminHome() {
  renderShell("home");
  mountMain(`${pageHeader("Home", state.business.name)}<div class="empty-state">Loading your dashboard…</div>`);

  const bizId = state.business.id;
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - 6); startOfWeek.setHours(0, 0, 0, 0);
  const startOfLastWeek = new Date(startOfWeek); startOfLastWeek.setDate(startOfWeek.getDate() - 7);

  const { data: txns } = await supabase.from("transactions").select("*, products(name)").eq("business_id", bizId).order("created_at", { ascending: false });
  const { data: products } = await supabase.from("products").select("*").eq("business_id", bizId);
  const { data: attendanceToday } = await supabase.from("attendance").select("*, profiles(name)").eq("business_id", bizId).gte("clock_in", startOfDay.toISOString());

  const all = txns || [];
  const sales = all.filter(t => t.type === "sale");
  const expenses = all.filter(t => t.type === "expense");
  const todaySales = sales.filter(t => new Date(t.created_at) >= startOfDay).reduce((s, t) => s + Number(t.amount), 0);
  const weekSales = sales.filter(t => new Date(t.created_at) >= startOfWeek).reduce((s, t) => s + Number(t.amount), 0);
  const lastWeekSales = sales.filter(t => new Date(t.created_at) >= startOfLastWeek && new Date(t.created_at) < startOfWeek).reduce((s, t) => s + Number(t.amount), 0);
  const totalProfit = sales.reduce((s, t) => s + Number(t.amount), 0) - expenses.reduce((s, t) => s + Number(t.amount), 0);
  const pendingOrders = all.filter(t => t.type === "sale" && (t.note || "").toLowerCase().includes("pending")).length;
  const lowStockItems = (products || []).filter(p => p.stock <= p.low_stock_threshold);

  const productCounts = {};
  sales.forEach(t => { const n = t.products?.name; if (n) productCounts[n] = (productCounts[n] || 0) + t.quantity; });
  const topProduct = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // last 14 days of sales for the forecast chart
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const total = sales.filter(t => new Date(t.created_at) >= d && new Date(t.created_at) < next).reduce((s, t) => s + Number(t.amount), 0);
    days.push({ label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), total });
  }
  const { projected } = forecastNextPeriod(days.map(d => d.total));

  mountMain(`
    ${pageHeader("Home", state.business.name)}
    <div class="insight-note loading" id="insight-box">
      <div class="pin">📌</div>
      <div><h4>AI insight</h4><p>Reading your latest numbers…</p></div>
    </div>
    <div class="kpi-grid">
      <div class="tag-card"><div class="tag-label">Today's sales</div><div class="tag-value amber">${money(todaySales)}</div></div>
      <div class="tag-card"><div class="tag-label">Total profit</div><div class="tag-value ${totalProfit >= 0 ? "teal" : "coral"}">${money(totalProfit)}</div></div>
      <div class="tag-card"><div class="tag-label">Pending orders</div><div class="tag-value">${pendingOrders}</div></div>
      <div class="tag-card"><div class="tag-label">Low stock alerts</div><div class="tag-value ${lowStockItems.length ? "coral" : "teal"}">${lowStockItems.length}</div></div>
    </div>
    <div class="quick-actions">
      <button class="btn btn-primary" id="qa-sale">+ Add sale</button>
      <button class="btn btn-ghost" id="qa-product">+ Add product</button>
      <button class="btn btn-ghost" id="qa-expense">+ Record expense</button>
    </div>
    <div class="grid-2">
      <div class="panel">
        <h3>Sales forecast — next 7 days</h3>
        <canvas id="forecast-chart" height="160"></canvas>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Attendance today</h3>
          <button class="btn btn-ghost btn-sm" id="export-attendance">Export CSV</button>
        </div>
        ${(attendanceToday && attendanceToday.length) ? attendanceToday.map(a => `
          <div class="item-card">
            <div class="item-main">
              <div class="name">${a.profiles?.name || "Worker"}</div>
              <div class="meta">In ${new Date(a.clock_in).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}${a.clock_out ? " · Out " + new Date(a.clock_out).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""}</div>
            </div>
            <span class="pill ${a.within_range === false ? "low" : "ok"}">${a.within_range === false ? "Off-site" : "On-site"}</span>
          </div>`).join("") : `<div class="empty-state">No one has clocked in yet today.</div>`}
      </div>
    </div>
    ${lowStockItems.length ? `
      <div class="panel">
        <h3>Low stock</h3>
        ${lowStockItems.map(p => `<div class="item-card"><div class="item-main"><div class="name">${p.name}</div><div class="meta">${p.stock} left · threshold ${p.low_stock_threshold}</div></div><span class="pill low">Low</span></div>`).join("")}
      </div>` : ""}
  `);

  drawForecastChart(days, projected);

  $("#qa-sale").onclick = () => openTransactionModal("sale", () => renderAdminHome());
  $("#qa-product").onclick = () => openProductModal(null, () => renderAdminHome());
  $("#qa-expense").onclick = () => openTransactionModal("expense", () => renderAdminHome());
  $("#export-attendance").onclick = () => exportAttendanceCSV(attendanceToday || []);

  generateInsight({
    businessName: state.business.name,
    todaySales, weekSales, lastWeekSales, topProduct,
    lowStock: lowStockItems.length
  }).then(text => {
    const box = document.getElementById("insight-box");
    if (box) { box.classList.remove("loading"); box.querySelector("p").textContent = text; }
  });
}

function drawForecastChart(days, projected) {
  const ctx = document.getElementById("forecast-chart");
  if (!ctx || !window.Chart) return;
  const labels = [...days.map(d => d.label), ...projected.map((_, i) => `+${i + 1}d`)];
  const actual = [...days.map(d => d.total), ...Array(projected.length).fill(null)];
  const forecast = [...Array(days.length - 1).fill(null), days[days.length - 1].total, ...projected];
  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Actual", data: actual, borderColor: "#F2A93C", backgroundColor: "rgba(242,169,60,.15)", tension: .35, spanGaps: false },
        { label: "Forecast", data: forecast, borderColor: "#4FB0A5", borderDash: [5, 4], tension: .35, spanGaps: false }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: "#9297BE", font: { family: "Inter" } } } },
      scales: {
        x: { ticks: { color: "#9297BE", maxRotation: 0, autoSkip: true }, grid: { color: "#33385E" } },
        y: { ticks: { color: "#9297BE" }, grid: { color: "#33385E" } }
      }
    }
  });
}

function exportAttendanceCSV(rows) {
  const header = "Worker,Clock In,Clock Out,On Site\n";
  const body = rows.map(r => `${(r.profiles?.name || "Worker").replace(/,/g, "")},${r.clock_in || ""},${r.clock_out || ""},${r.within_range === false ? "No" : "Yes"}`).join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ================= SALES & PRODUCTS =================
export async function renderSales() {
  renderShell("sales");
  mountMain(`${pageHeader("Sales & Products")}<div class="empty-state">Loading…</div>`);

  const bizId = state.business.id;
  const { data: txns } = await supabase.from("transactions").select("*, products(name), profiles(name)").eq("business_id", bizId).order("created_at", { ascending: false }).limit(50);
  const { data: products } = await supabase.from("products").select("*").eq("business_id", bizId).order("created_at", { ascending: false });

  mountMain(`
    ${pageHeader("Sales & Products")}
    <div class="quick-actions">
      <button class="btn btn-primary" id="qa-sale">+ Add sale</button>
      <button class="btn btn-ghost" id="qa-expense">+ Record expense</button>
      <button class="btn btn-ghost" id="qa-product">+ Add product</button>
    </div>
    <div class="grid-2">
      <div class="panel">
        <h3>Transaction ledger</h3>
        <table>
          <thead><tr><th>Type</th><th>Item</th><th>Amount</th><th>By</th><th>When</th></tr></thead>
          <tbody>
            ${(txns && txns.length) ? txns.map(t => `
              <tr>
                <td><span class="pill ${t.type}">${t.type}</span></td>
                <td>${t.products?.name || t.note || "—"}</td>
                <td class="mono">${money(t.amount)}</td>
                <td>${t.profiles?.name || "—"}</td>
                <td>${fmtDate(t.created_at)}</td>
              </tr>`).join("") : `<tr><td colspan="5"><div class="empty-state">No transactions logged yet.</div></td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Products</h3></div>
        ${(products && products.length) ? products.map(p => `
          <div class="item-card">
            <div class="item-main">
              <div class="name">${p.name}</div>
              <div class="meta">${money(p.price)} · ${p.stock} in stock${p.sku ? " · SKU " + p.sku : ""}</div>
            </div>
            <div class="item-actions">
              <button class="icon-btn" data-edit="${p.id}">Edit</button>
              <button class="icon-btn" data-del="${p.id}">Delete</button>
            </div>
          </div>`).join("") : `<div class="empty-state">No products yet — add your first one.</div>`}
      </div>
    </div>
  `);

  $("#qa-sale").onclick = () => openTransactionModal("sale", renderSales);
  $("#qa-expense").onclick = () => openTransactionModal("expense", renderSales);
  $("#qa-product").onclick = () => openProductModal(null, renderSales);
  $all("[data-edit]").forEach(b => b.onclick = () => openProductModal(products.find(p => p.id === b.dataset.edit), renderSales));
  $all("[data-del]").forEach(b => b.onclick = async () => {
    if (!confirm("Delete this product?")) return;
    await supabase.from("products").delete().eq("id", b.dataset.del);
    renderSales();
  });
}

function openProductModal(product, onDone) {
  const editing = !!product;
  openModal(`
    <button class="modal-close" id="modal-x">✕</button>
    <h3>${editing ? "Edit product" : "Add product"}</h3>
    <div class="field"><label>Name</label><input id="p-name" value="${product?.name || ""}"></div>
    <div class="field-row">
      <div class="field"><label>Price</label><input id="p-price" type="number" step="0.01" min="0" value="${product?.price ?? ""}"></div>
      <div class="field"><label>Stock</label><input id="p-stock" type="number" min="0" value="${product?.stock ?? 0}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>SKU (optional)</label><input id="p-sku" value="${product?.sku || ""}"></div>
      <div class="field"><label>Low stock alert at</label><input id="p-threshold" type="number" min="0" value="${product?.low_stock_threshold ?? 5}"></div>
    </div>
    <button class="btn btn-primary btn-block" id="save-product">${editing ? "Save changes" : "Add product"}</button>
  `);
  $("#modal-x").onclick = closeModal;
  $("#save-product").onclick = async () => {
    const payload = {
      name: $("#p-name").value.trim(),
      price: parseFloat($("#p-price").value) || 0,
      stock: parseInt($("#p-stock").value) || 0,
      sku: $("#p-sku").value.trim() || null,
      low_stock_threshold: parseInt($("#p-threshold").value) || 5,
      business_id: state.business.id
    };
    if (!payload.name) return toast("Product name is required", "error");
    const { error } = editing
      ? await supabase.from("products").update(payload).eq("id", product.id)
      : await supabase.from("products").insert(payload);
    if (error) return toast(error.message, "error");
    closeModal(); toast("Saved", "success"); onDone();
  };
}

export function openTransactionModal(type, onDone) {
  supabase.from("products").select("*").eq("business_id", state.business.id).then(({ data: products }) => {
    openModal(`
      <button class="modal-close" id="modal-x">✕</button>
      <h3>${type === "sale" ? "Add sale" : "Record expense"}</h3>
      ${type === "sale" ? `
        <div class="field"><label>Product</label>
          <select id="t-product"><option value="">— none / custom —</option>
          ${(products || []).map(p => `<option value="${p.id}" data-price="${p.price}">${p.name} (${money(p.price)})</option>`).join("")}
          </select>
        </div>
        <div class="field-row">
          <div class="field"><label>Quantity</label><input id="t-qty" type="number" min="1" value="1"></div>
          <div class="field"><label>Amount</label><input id="t-amount" type="number" step="0.01" min="0"></div>
        </div>
      ` : `<div class="field"><label>Amount</label><input id="t-amount" type="number" step="0.01" min="0"></div>`}
      <div class="field"><label>Payment method</label>
        <select id="t-payment"><option>Cash</option><option>Card</option><option>Bank transfer</option><option>E-wallet</option></select>
      </div>
      <div class="field"><label>Note (optional)</label><input id="t-note" placeholder="e.g. pending fulfillment"></div>
      <button class="btn btn-primary btn-block" id="save-txn">Save</button>
    `);
    $("#modal-x").onclick = closeModal;
    const productSel = document.getElementById("t-product");
    if (productSel) productSel.onchange = () => {
      const opt = productSel.selectedOptions[0];
      if (opt && opt.dataset.price) document.getElementById("t-amount").value = opt.dataset.price;
    };
    $("#save-txn").onclick = async () => {
      const amount = parseFloat($("#t-amount").value);
      if (!amount || amount <= 0) return toast("Enter a valid amount", "error");
      const payload = {
        business_id: state.business.id,
        type,
        amount,
        payment_method: $("#t-payment").value,
        note: $("#t-note").value.trim() || null,
        worker_id: state.profile.id
      };
      if (type === "sale" && productSel) {
        payload.product_id = productSel.value || null;
        payload.quantity = parseInt($("#t-qty").value) || 1;
        if (payload.product_id) {
          const prod = products.find(p => p.id === payload.product_id);
          if (prod) await supabase.from("products").update({ stock: Math.max(0, prod.stock - payload.quantity) }).eq("id", prod.id);
        }
      }
      const { error } = await supabase.from("transactions").insert(payload);
      if (error) return toast(error.message, "error");
      closeModal(); toast("Saved", "success"); onDone();
    };
  });
}

// ================= COLLAB & TREND =================
export async function renderCollab() {
  renderShell("collab");
  mountMain(`${pageHeader("Collab & Trend", "Discover nearby businesses to team up with")}<div class="empty-state">Loading…</div>`);

  const { data: others } = await supabase.from("businesses").select("*").neq("id", state.business.id).limit(9);
  const { data: events } = await supabase.from("events").select("*").eq("business_id", state.business.id).order("event_time", { ascending: true }).limit(8);

  const collabTypeFor = (type) => {
    if (type === state.business.business_type) return "Cross-promo bundle";
    return "Product line swap";
  };

  mountMain(`
    ${pageHeader("Collab & Trend", "Discover nearby businesses to team up with")}
    <div class="panel">
      <h3>Suggested collaborations</h3>
      <div class="collab-grid">
        ${(others && others.length) ? others.map(b => `
          <div class="collab-card">
            <div class="logo">${b.logo_url ? `<img src="${b.logo_url}" style="width:100%;height:100%;border-radius:10px;object-fit:cover;">` : initials(b.name)}</div>
            <div class="biz-name">${b.name}</div>
            <div class="niche">${(b.business_type || "business").replace(/_/g, " ")}</div>
            <span class="collab-tag">${collabTypeFor(b.business_type)}</span>
          </div>`).join("") : `<div class="empty-state">No other businesses on SMOLBIZ yet — check back soon.</div>`}
      </div>
    </div>
    <div class="panel">
      <h3>Upcoming events</h3>
      ${(events && events.length) ? events.map(e => `
        <div class="event-row"><span class="event-date mono">${fmtDate(e.event_time)}</span><span>${e.title}</span></div>
      `).join("") : `<div class="empty-state">Nothing scheduled — events mentioned in your chat will show up here automatically.</div>`}
    </div>
  `);
}

// ================= WORKER MANAGEMENT =================
export async function renderWorkers() {
  renderShell("workers");
  mountMain(`${pageHeader("Worker Management")}<div class="empty-state">Loading…</div>`);

  const { data: workers } = await supabase.from("profiles").select("*").eq("business_id", state.business.id).eq("role", "worker");
  const { data: pendingInvites } = await supabase.from("invites").select("*").eq("business_id", state.business.id).eq("status", "pending");
  const { data: sales } = await supabase.from("transactions").select("worker_id, amount").eq("business_id", state.business.id).eq("type", "sale");

  const salesByWorker = {};
  (sales || []).forEach(s => { if (s.worker_id) salesByWorker[s.worker_id] = (salesByWorker[s.worker_id] || 0) + Number(s.amount); });

  mountMain(`
    ${pageHeader("Worker Management")}
    <div class="quick-actions"><button class="btn btn-primary" id="qa-invite">+ Invite worker</button></div>
    <div class="panel">
      <h3>Team (${(workers || []).length})</h3>
      ${(workers && workers.length) ? workers.map(w => `
        <div class="item-card">
          <div class="item-main"><div class="name">${w.name || w.email}</div><div class="meta">${w.email} · ${money(salesByWorker[w.id] || 0)} in logged sales</div></div>
          <div class="item-actions">
            <button class="icon-btn" data-perm="${w.id}">Permissions</button>
            <button class="icon-btn" data-del="${w.id}">Remove</button>
          </div>
        </div>`).join("") : `<div class="empty-state">No workers yet — invite your team.</div>`}
    </div>
    <div class="panel">
      <h3>Pending invites</h3>
      ${(pendingInvites && pendingInvites.length) ? pendingInvites.map(i => `
        <div class="item-card"><div class="item-main"><div class="name">${i.name || i.email}</div><div class="meta">${i.email} · waiting to sign up</div></div></div>
      `).join("") : `<div class="empty-state">No pending invites.</div>`}
    </div>
  `);

  $("#qa-invite").onclick = () => openInviteModal(renderWorkers);
  $all("[data-del]").forEach(b => b.onclick = async () => {
    if (!confirm("Remove this worker's access?")) return;
    await supabase.from("profiles").delete().eq("id", b.dataset.del);
    renderWorkers();
  });
  $all("[data-perm]").forEach(b => b.onclick = () => openPermissionsModal(workers.find(w => w.id === b.dataset.perm), renderWorkers));
}

function openInviteModal(onDone) {
  openModal(`
    <button class="modal-close" id="modal-x">✕</button>
    <h3>Invite a worker</h3>
    <div class="field"><label>Name</label><input id="i-name"></div>
    <div class="field"><label>Email</label><input id="i-email" type="email"></div>
    <button class="btn btn-primary btn-block" id="send-invite">Send invite</button>
  `);
  $("#modal-x").onclick = closeModal;
  $("#send-invite").onclick = async () => {
    const email = $("#i-email").value.trim();
    if (!email) return toast("Email is required", "error");
    const { error } = await supabase.from("invites").insert({ business_id: state.business.id, name: $("#i-name").value.trim(), email });
    if (error) return toast(error.message, "error");
    closeModal(); toast("Invite created — share the signup link with them", "success"); onDone();
  };
}

function openPermissionsModal(worker, onDone) {
  const perms = worker.permissions || { sales: true, products: true };
  openModal(`
    <button class="modal-close" id="modal-x">✕</button>
    <h3>Permissions — ${worker.name || worker.email}</h3>
    <div class="field"><label><input type="checkbox" id="perm-sales" ${perms.sales ? "checked" : ""}> Can log sales</label></div>
    <div class="field"><label><input type="checkbox" id="perm-products" ${perms.products ? "checked" : ""}> Can view products</label></div>
    <button class="btn btn-primary btn-block" id="save-perm">Save</button>
  `);
  $("#modal-x").onclick = closeModal;
  $("#save-perm").onclick = async () => {
    const permissions = { sales: $("#perm-sales").checked, products: $("#perm-products").checked };
    await supabase.from("profiles").update({ permissions }).eq("id", worker.id);
    closeModal(); toast("Permissions updated", "success"); onDone();
  };
}

// ================= SETTINGS =================
export async function renderAdminSettings() {
  renderShell("settings");
  const b = state.business;
  mountMain(`
    ${pageHeader("Settings")}
    <div class="panel">
      <h3>Business profile</h3>
      <div class="field"><label>Business name</label><input id="s-name" value="${b.name || ""}"></div>
      <div class="field"><label>Logo</label><input id="s-logo" type="file" accept="image/*"></div>
      <button class="btn btn-primary" id="save-profile">Save changes</button>
    </div>
    <div class="panel">
      <h3>Social media links</h3>
      <div class="field"><label>Instagram</label><input id="s-instagram" value="${b.social_links?.instagram || ""}"></div>
      <div class="field"><label>TikTok</label><input id="s-tiktok" value="${b.social_links?.tiktok || ""}"></div>
      <button class="btn btn-primary" id="save-social">Save links</button>
    </div>
    <div class="panel">
      <h3>AI forecast sensitivity</h3>
      <p class="sub" style="margin-top:-6px;">Higher values make the forecast react faster to recent sales swings.</p>
      <div class="field"><input id="s-sensitivity" type="range" min="0.5" max="2" step="0.1" value="${b.forecast_sensitivity || 1}"></div>
      <button class="btn btn-primary" id="save-sensitivity">Save</button>
    </div>
  `);

  $("#save-profile").onclick = async () => {
    const payload = { name: $("#s-name").value.trim() };
    const file = $("#s-logo").files[0];
    if (file) {
      const path = `logos/${state.business.id}-${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("smolbiz-media").upload(path, file);
      if (!error) payload.logo_url = supabase.storage.from("smolbiz-media").getPublicUrl(path).data.publicUrl;
    }
    await supabase.from("businesses").update(payload).eq("id", b.id);
    Object.assign(state.business, payload);
    toast("Saved", "success");
  };
  $("#save-social").onclick = async () => {
    const social_links = { instagram: $("#s-instagram").value.trim(), tiktok: $("#s-tiktok").value.trim() };
    await supabase.from("businesses").update({ social_links }).eq("id", b.id);
    state.business.social_links = social_links;
    toast("Saved", "success");
  };
  $("#save-sensitivity").onclick = async () => {
    const forecast_sensitivity = parseFloat($("#s-sensitivity").value);
    await supabase.from("businesses").update({ forecast_sensitivity }).eq("id", b.id);
    state.business.forecast_sensitivity = forecast_sensitivity;
    toast("Saved", "success");
  };
}
