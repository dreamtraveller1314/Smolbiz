import { supabase } from "./supabaseClient.js";
import { $, money, fmtDate, toast, distanceMeters } from "./utils.js";
import { state } from "./state.js";
import { mountMain, pageHeader, openModal, closeModal, renderShell } from "./shell.js";
import { ATTENDANCE_RADIUS_METERS } from "./config.js";

let activeStream = null;

export async function renderWorkerHome() {
  renderShell("home");
  mountMain(`${pageHeader("Home", state.business.name)}<div class="empty-state">Loading…</div>`);

  const bizId = state.business.id;
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);

  const { data: myTxns } = await supabase.from("transactions").select("*, products(name)").eq("business_id", bizId).eq("worker_id", state.profile.id).order("created_at", { ascending: false }).limit(20);
  const { data: products } = await supabase.from("products").select("*").eq("business_id", bizId);
  const { data: openAttendance } = await supabase.from("attendance").select("*").eq("business_id", bizId).eq("worker_id", state.profile.id).is("clock_out", null).order("clock_in", { ascending: false }).limit(1).maybeSingle();

  const todaysSales = (myTxns || []).filter(t => t.type === "sale" && new Date(t.created_at) >= startOfDay).reduce((s, t) => s + Number(t.amount), 0);
  const lowStock = (products || []).filter(p => p.stock <= p.low_stock_threshold);
  const clockedIn = !!openAttendance;

  mountMain(`
    ${pageHeader("Home", state.business.name)}
    <div class="grid-2">
      <div class="panel">
        <h3>Attendance</h3>
        <div class="attendance-station">
          <button class="clock-btn ${clockedIn ? "in" : "out"}" id="clock-btn">
            ${clockedIn ? "CLOCK OUT" : "CLOCK IN"}
          </button>
          <div class="status-line" id="clock-status">${clockedIn ? `Clocked in at ${new Date(openAttendance.clock_in).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : "You're currently clocked out."}</div>
        </div>
      </div>
      <div class="panel">
        <div class="tag-card" style="margin-bottom:12px;"><div class="tag-label">Today's sales contribution</div><div class="tag-value amber">${money(todaysSales)}</div></div>
        <div class="quick-actions">
          <button class="btn btn-primary" id="qa-sale">+ Add sale</button>
          <button class="btn btn-ghost" id="qa-expense">+ Record expense</button>
        </div>
        ${lowStock.length ? `<div class="panel" style="margin-top:14px;"><h3>Low stock (store-wide)</h3>${lowStock.map(p => `<div class="item-card"><div class="item-main"><div class="name">${p.name}</div><div class="meta">${p.stock} left</div></div><span class="pill low">Low</span></div>`).join("")}</div>` : ""}
      </div>
    </div>
    <div class="panel">
      <h3>My recent activity</h3>
      <table>
        <thead><tr><th>Type</th><th>Item</th><th>Amount</th><th>When</th></tr></thead>
        <tbody>
          ${(myTxns && myTxns.length) ? myTxns.map(t => `
            <tr><td><span class="pill ${t.type}">${t.type}</span></td><td>${t.products?.name || t.note || "—"}</td><td class="mono">${money(t.amount)}</td><td>${fmtDate(t.created_at)}</td></tr>
          `).join("") : `<tr><td colspan="4"><div class="empty-state">Nothing logged yet today.</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `);

  $("#clock-btn").onclick = () => clockedIn ? handleClockOut(openAttendance) : handleClockIn();
  $("#qa-sale").onclick = () => openWorkerSaleModal();
  $("#qa-expense").onclick = () => openWorkerExpenseModal();
}

// ---------- attendance: GPS + camera ----------
async function handleClockIn() {
  const biz = state.business;
  const needsGPS = biz.location_lat != null && biz.location_lng != null;

  openModal(`
    <button class="modal-close" id="modal-x">✕</button>
    <h3>Clock in</h3>
    <p class="sub" style="margin-top:-8px;">${needsGPS ? "We'll check you're near the workplace, then " : ""}Take a quick photo to confirm it's you.</p>
    <div id="clockin-status" class="status-line"></div>
    <video id="cam-video" class="cam-preview hidden" autoplay playsinline></video>
    <canvas id="cam-canvas" class="hidden"></canvas>
    <img id="cam-shot" class="cam-preview hidden">
    <button class="btn btn-ghost btn-block" id="start-cam" style="margin-top:8px;">📷 Open camera</button>
    <button class="btn btn-primary btn-block" id="confirm-clockin" style="margin-top:8px;" disabled>Confirm clock-in</button>
  `);
  $("#modal-x").onclick = () => { stopCamera(); closeModal(); };

  let lat = null, lng = null, withinRange = true;
  if (needsGPS) {
    $("#clockin-status").textContent = "Checking your location…";
    navigator.geolocation.getCurrentPosition(pos => {
      lat = pos.coords.latitude; lng = pos.coords.longitude;
      const dist = distanceMeters(lat, lng, biz.location_lat, biz.location_lng);
      withinRange = dist <= ATTENDANCE_RADIUS_METERS;
      $("#clockin-status").textContent = withinRange
        ? `You're on-site (${Math.round(dist)}m from the shop).`
        : `Heads up — you're ${Math.round(dist)}m away, outside the ${ATTENDANCE_RADIUS_METERS}m radius. You can still clock in; it'll be flagged.`;
    }, () => { $("#clockin-status").textContent = "Couldn't read your location — continuing with photo only."; });
  }

  let photoDataUrl = null;
  $("#start-cam").onclick = async () => {
    try {
      activeStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = $("#cam-video");
      video.srcObject = activeStream; video.classList.remove("hidden");
      $("#start-cam").textContent = "📸 Take photo";
      $("#start-cam").onclick = () => {
        const canvas = $("#cam-canvas");
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        photoDataUrl = canvas.toDataURL("image/jpeg", .85);
        $("#cam-shot").src = photoDataUrl; $("#cam-shot").classList.remove("hidden");
        video.classList.add("hidden"); stopCamera();
        $("#confirm-clockin").disabled = false;
        $("#start-cam").classList.add("hidden");
      };
    } catch (e) { toast("Couldn't access your camera — check browser permissions.", "error"); }
  };

  $("#confirm-clockin").onclick = async () => {
    const photo_url = await uploadDataUrl(photoDataUrl, "attendance");
    const { error } = await supabase.from("attendance").insert({
      business_id: state.business.id, worker_id: state.profile.id,
      clock_in: new Date().toISOString(), lat, lng, within_range: withinRange, photo_url
    });
    if (error) return toast(error.message, "error");
    closeModal(); toast("Clocked in!", "success"); renderWorkerHome();
  };
}

async function handleClockOut(record) {
  if (!confirm("Clock out now?")) return;
  await supabase.from("attendance").update({ clock_out: new Date().toISOString() }).eq("id", record.id);
  toast("Clocked out — nice work today.", "success");
  renderWorkerHome();
}

function stopCamera() {
  if (activeStream) { activeStream.getTracks().forEach(t => t.stop()); activeStream = null; }
}

async function uploadDataUrl(dataUrl, folder) {
  if (!dataUrl) return null;
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${folder}/${state.profile.id}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("smolbiz-media").upload(path, blob, { contentType: "image/jpeg" });
  if (error) return null;
  return supabase.storage.from("smolbiz-media").getPublicUrl(path).data.publicUrl;
}

// ---------- worker sale (mandatory photo proof) ----------
function openWorkerSaleModal() {
  supabase.from("products").select("*").eq("business_id", state.business.id).then(({ data: products }) => {
    openModal(`
      <button class="modal-close" id="modal-x">✕</button>
      <h3>Add sale</h3>
      <div class="field"><label>Product</label>
        <select id="t-product"><option value="">— custom —</option>
        ${(products || []).map(p => `<option value="${p.id}" data-price="${p.price}">${p.name} (${money(p.price)})</option>`).join("")}
        </select>
      </div>
      <div class="field-row">
        <div class="field"><label>Quantity</label><input id="t-qty" type="number" min="1" value="1"></div>
        <div class="field"><label>Amount</label><input id="t-amount" type="number" step="0.01" min="0"></div>
      </div>
      <div class="field"><label>Payment method</label>
        <select id="t-payment"><option>Cash</option><option>Card</option><option>Bank transfer</option><option>E-wallet</option></select>
      </div>
      <div class="field">
        <label>Proof of sale photo (required)</label>
        <input type="file" id="t-photo" accept="image/*" capture="environment">
      </div>
      <button class="btn btn-primary btn-block" id="save-sale">Save sale</button>
    `);
    $("#modal-x").onclick = closeModal;
    const productSel = $("#t-product");
    productSel.onchange = () => { const o = productSel.selectedOptions[0]; if (o?.dataset.price) $("#t-amount").value = o.dataset.price; };
    $("#save-sale").onclick = async () => {
      const amount = parseFloat($("#t-amount").value);
      const file = $("#t-photo").files[0];
      if (!amount || amount <= 0) return toast("Enter a valid amount", "error");
      if (!file) return toast("A proof-of-sale photo is required", "error");
      const path = `sales/${state.profile.id}-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("smolbiz-media").upload(path, file);
      const photo_url = upErr ? null : supabase.storage.from("smolbiz-media").getPublicUrl(path).data.publicUrl;
      const payload = {
        business_id: state.business.id, type: "sale", amount,
        payment_method: $("#t-payment").value, worker_id: state.profile.id,
        product_id: productSel.value || null, quantity: parseInt($("#t-qty").value) || 1, photo_url
      };
      if (payload.product_id) {
        const prod = products.find(p => p.id === payload.product_id);
        if (prod) await supabase.from("products").update({ stock: Math.max(0, prod.stock - payload.quantity) }).eq("id", prod.id);
      }
      const { error } = await supabase.from("transactions").insert(payload);
      if (error) return toast(error.message, "error");
      closeModal(); toast("Sale logged", "success"); renderWorkerHome();
    };
  });
}

function openWorkerExpenseModal() {
  openModal(`
    <button class="modal-close" id="modal-x">✕</button>
    <h3>Record expense</h3>
    <div class="field"><label>Amount</label><input id="t-amount" type="number" step="0.01" min="0"></div>
    <div class="field"><label>Note</label><input id="t-note" placeholder="What was this for?"></div>
    <button class="btn btn-primary btn-block" id="save-exp">Save</button>
  `);
  $("#modal-x").onclick = closeModal;
  $("#save-exp").onclick = async () => {
    const amount = parseFloat($("#t-amount").value);
    if (!amount || amount <= 0) return toast("Enter a valid amount", "error");
    const { error } = await supabase.from("transactions").insert({
      business_id: state.business.id, type: "expense", amount,
      note: $("#t-note").value.trim() || null, worker_id: state.profile.id
    });
    if (error) return toast(error.message, "error");
    closeModal(); toast("Expense recorded", "success"); renderWorkerHome();
  };
}

// ---------- settings ----------
export async function renderWorkerSettings() {
  renderShell("settings");
  const p = state.profile;
  mountMain(`
    ${pageHeader("Settings")}
    <div class="panel">
      <h3>My profile</h3>
      <div class="field"><label>Name</label><input id="w-name" value="${p.name || ""}"></div>
      <div class="field"><label>Phone</label><input id="w-phone" value="${p.phone || ""}"></div>
      <button class="btn btn-primary" id="save-worker">Save changes</button>
    </div>
  `);
  $("#save-worker").onclick = async () => {
    const payload = { name: $("#w-name").value.trim(), phone: $("#w-phone").value.trim() };
    await supabase.from("profiles").update(payload).eq("id", p.id);
    Object.assign(state.profile, payload);
    toast("Saved", "success");
  };
}
