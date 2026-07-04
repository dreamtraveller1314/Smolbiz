import { supabase } from "./supabaseClient.js";
import { $, toast } from "./utils.js";
import { state, resetOnboarding } from "./state.js";
import { bootApp } from "./main.js";

const BUSINESS_TYPES = [
  { id: "food_fashion_handmade", emoji: "🧵", label: "Food, Fashion & Handmade" },
  { id: "digital_products", emoji: "💾", label: "Digital Products" },
  { id: "services", emoji: "🛠️", label: "Services" },
  { id: "others", emoji: "✨", label: "Others" }
];

function mountScreen(html) {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="screen center-screen">${html}</div>`;
}

export function renderWelcome() {
  mountScreen(`
    <div class="auth-card" style="text-align:center;max-width:380px;">
      <div class="brand" style="justify-content:center;"><span class="dot"></span> SMOLBIZ</div>
      <h1 style="margin-top:18px;">Run your small business from one tab.</h1>
      <p class="sub">Sales, stock, shifts, and your team's group chat — with an AI assist that reads your numbers so you don't have to.</p>
      <button class="btn btn-primary btn-block" id="go-signup">Get started</button>
      <div class="switch-row">Already onboarded? <button class="link-btn" id="go-login">Log in</button></div>
    </div>
  `);
  $("#go-signup").onclick = renderSignup;
  $("#go-login").onclick = renderLogin;
}

export function renderLogin() {
  mountScreen(`
    <div class="auth-card">
      <div class="brand"><span class="dot"></span> SMOLBIZ</div>
      <h1>Welcome back</h1>
      <p class="sub">Log in to your workspace.</p>
      <div id="auth-error"></div>
      <form id="login-form">
        <div class="field"><label>Email</label><input type="email" required id="email"></div>
        <div class="field"><label>Password</label><input type="password" required id="password"></div>
        <button class="btn btn-primary btn-block" type="submit">Log in</button>
      </form>
      <div class="switch-row">New here? <button class="link-btn" id="go-signup">Create an account</button></div>
    </div>
  `);
  $("#go-signup").onclick = renderSignup;
  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("#email").value.trim();
    const password = $("#password").value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return showAuthError(error.message);
    state.user = data.user;
    await bootApp();
  };
}

export function renderSignup() {
  mountScreen(`
    <div class="auth-card">
      <div class="brand"><span class="dot"></span> SMOLBIZ</div>
      <h1>Create your account</h1>
      <p class="sub">If your email was invited by an admin, we'll take you straight into their workspace. Otherwise we'll set up a new business for you.</p>
      <div id="auth-error"></div>
      <form id="signup-form">
        <div class="field"><label>Email</label><input type="email" required id="email"></div>
        <div class="field"><label>Password</label><input type="password" required minlength="6" id="password"></div>
        <button class="btn btn-primary btn-block" type="submit">Continue</button>
      </form>
      <div class="switch-row">Already have an account? <button class="link-btn" id="go-login">Log in</button></div>
    </div>
  `);
  $("#go-login").onclick = renderLogin;
  $("#signup-form").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("#email").value.trim();
    const password = $("#password").value;

    // Check for a pending invite BEFORE creating the account, so we know which route to take.
    const { data: invite } = await supabase
      .from("invites")
      .select("*")
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return showAuthError(error.message);
    state.user = data.user;

    if (invite) {
      await finishWorkerJoin(invite);
    } else {
      resetOnboarding();
      renderAdminStep1();
    }
  };
}

function showAuthError(msg) {
  const box = $("#auth-error");
  if (box) box.innerHTML = `<div class="error-msg">${msg}</div>`;
}

async function finishWorkerJoin(invite) {
  const { error: profileErr } = await supabase.from("profiles").insert({
    id: state.user.id,
    business_id: invite.business_id,
    role: "worker",
    name: invite.name || "",
    email: invite.email
  });
  if (profileErr) return toast(profileErr.message, "error");
  await supabase.from("invites").update({ status: "accepted" }).eq("id", invite.id);
  toast(`You've joined the team!`, "success");
  await bootApp();
}

// ---------------- ADMIN ONBOARDING WIZARD ----------------

function stepsBar(activeIdx, total = 3) {
  return `<div class="steps">${Array.from({ length: total }, (_, i) =>
    `<span class="${i <= activeIdx ? "done" : ""}"></span>`).join("")}</div>`;
}

function renderAdminStep1() {
  mountScreen(`
    <div class="auth-card" style="max-width:480px;">
      ${stepsBar(0)}
      <h1>What kind of business is this?</h1>
      <p class="sub">This helps us tailor your dashboard and suggest better collaborations.</p>
      <div class="choice-grid" id="type-grid">
        ${BUSINESS_TYPES.map(t => `
          <div class="choice-card" data-id="${t.id}">
            <div class="emoji">${t.emoji}</div>
            <div class="label">${t.label}</div>
          </div>`).join("")}
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:20px;" id="next-btn" disabled>Continue</button>
    </div>
  `);
  const cards = document.querySelectorAll(".choice-card");
  cards.forEach(c => c.onclick = () => {
    cards.forEach(x => x.classList.remove("selected"));
    c.classList.add("selected");
    state.onboarding.businessType = c.dataset.id;
    $("#next-btn").disabled = false;
  });
  $("#next-btn").onclick = () => renderAdminStep2();
}

function renderAdminStep2() {
  mountScreen(`
    <div class="auth-card" style="max-width:480px;">
      ${stepsBar(1)}
      <h1>Set up your business profile</h1>
      <p class="sub">Location is optional — add it only if you want worker attendance checked against it.</p>
      <div id="step2-error"></div>
      <div class="field"><label>Business name</label><input id="biz-name" required></div>
      <div class="field"><label>Logo (optional)</label><input id="biz-logo" type="file" accept="image/*"></div>
      <div class="field-row">
        <div class="field"><label>Sales platform</label>
          <select id="biz-platform">
            <option value="in_person">In person</option>
            <option value="instagram">Instagram</option>
            <option value="shopify">Shopify</option>
            <option value="etsy">Etsy</option>
            <option value="tiktok_shop">TikTok Shop</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="field"><label>Monthly revenue (approx.)</label><input id="biz-revenue" type="number" min="0" placeholder="e.g. 3000"></div>
      </div>
      <div class="field">
        <label>Company location (optional)</label>
        <button type="button" class="btn btn-ghost btn-block" id="use-location">📍 Use my current location</button>
        <div class="status-line" id="loc-status" style="margin-top:6px;"></div>
      </div>
      <button class="btn btn-primary btn-block" id="next-btn">Continue</button>
    </div>
  `);
  $("#use-location").onclick = () => {
    if (!navigator.geolocation) return toast("Geolocation isn't available in this browser", "error");
    $("#loc-status").textContent = "Getting location…";
    navigator.geolocation.getCurrentPosition(pos => {
      state.onboarding.locationLat = pos.coords.latitude;
      state.onboarding.locationLng = pos.coords.longitude;
      $("#loc-status").textContent = `Location set (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}). Workers will need to be nearby to clock in.`;
    }, () => { $("#loc-status").textContent = "Couldn't get your location — you can skip this."; });
  };
  $("#next-btn").onclick = async () => {
    const name = $("#biz-name").value.trim();
    if (!name) { $("#step2-error").innerHTML = `<div class="error-msg">Business name is required.</div>`; return; }
    state.onboarding.businessName = name;
    state.onboarding.salesPlatform = $("#biz-platform").value;
    state.onboarding.monthlyRevenue = $("#biz-revenue").value || 0;

    const file = $("#biz-logo").files[0];
    if (file) {
      const path = `logos/${state.user.id}-${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("smolbiz-media").upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from("smolbiz-media").getPublicUrl(path);
        state.onboarding.logoUrl = data.publicUrl;
      }
    }
    renderAdminStep3();
  };
}

function renderAdminStep3() {
  if (state.onboarding.invites.length === 0) state.onboarding.invites.push({ name: "", email: "" });
  paintStep3();
}

function paintStep3() {
  mountScreen(`
    <div class="auth-card" style="max-width:480px;">
      ${stepsBar(2)}
      <h1>Invite your team</h1>
      <p class="sub">Add workers now, or skip and invite them later from Settings.</p>
      <div id="invite-list"></div>
      <button class="btn btn-ghost btn-block" id="add-invite" style="margin-bottom:16px;">+ Add worker</button>
      <button class="btn btn-primary btn-block" id="finish-btn">Finish & go to dashboard</button>
      <div class="switch-row"><button class="link-btn" id="skip-btn">Skip for now</button></div>
    </div>
  `);
  const list = $("#invite-list");
  state.onboarding.invites.forEach((inv, i) => {
    const row = document.createElement("div");
    row.className = "invite-card";
    row.innerHTML = `
      <input placeholder="Name" value="${inv.name}" data-i="${i}" data-f="name">
      <input placeholder="Email" type="email" value="${inv.email}" data-i="${i}" data-f="email">
      <button type="button" class="icon-btn" data-remove="${i}">✕</button>
    `;
    list.appendChild(row);
  });
  list.querySelectorAll("input").forEach(inp => {
    inp.oninput = () => { state.onboarding.invites[inp.dataset.i][inp.dataset.f] = inp.value; };
  });
  list.querySelectorAll("[data-remove]").forEach(btn => {
    btn.onclick = () => { state.onboarding.invites.splice(btn.dataset.remove, 1); paintStep3(); };
  });
  $("#add-invite").onclick = () => { state.onboarding.invites.push({ name: "", email: "" }); paintStep3(); };
  $("#skip-btn").onclick = () => finishAdminOnboarding([]);
  $("#finish-btn").onclick = () => finishAdminOnboarding(state.onboarding.invites.filter(i => i.email.trim()));
}

async function finishAdminOnboarding(invites) {
  const ob = state.onboarding;
  const { data: biz, error: bizErr } = await supabase.from("businesses").insert({
    admin_id: state.user.id,
    name: ob.businessName,
    logo_url: ob.logoUrl || null,
    business_type: ob.businessType,
    sales_platform: ob.salesPlatform,
    monthly_revenue: ob.monthlyRevenue || 0,
    location_lat: ob.locationLat,
    location_lng: ob.locationLng
  }).select().single();
  if (bizErr) return toast(bizErr.message, "error");

  const { error: profErr } = await supabase.from("profiles").insert({
    id: state.user.id,
    business_id: biz.id,
    role: "admin",
    name: ob.businessName + " Admin",
    email: state.user.email
  });
  if (profErr) return toast(profErr.message, "error");

  // default "General" channel so chat/calendar has somewhere to live
  const { data: channel } = await supabase.from("channels").insert({ business_id: biz.id, name: "General" }).select().single();
  if (channel) {
    await supabase.from("channel_members").insert({ channel_id: channel.id, profile_id: state.user.id });
  }

  if (invites.length) {
    await supabase.from("invites").insert(invites.map(i => ({ business_id: biz.id, name: i.name, email: i.email })));
    toast(`Invited ${invites.length} worker${invites.length > 1 ? "s" : ""}`, "success");
  }

  toast("Workspace ready!", "success");
  await bootApp();
}

export async function logout() {
  await supabase.auth.signOut();
  state.user = null;
  state.profile = null;
  state.business = null;
  renderWelcome();
}
