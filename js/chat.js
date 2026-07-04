import { supabase } from "./supabaseClient.js";
import { $, $all, fmtDate, fmtTime, toast, parseMeetingIntent } from "./utils.js";
import { state } from "./state.js";
import { mountMain, pageHeader, renderShell, openModal, closeModal } from "./shell.js";

let tab = "chat"; // "chat" | "calendar"

export async function renderChat(initialTab = "chat") {
  tab = initialTab;
  renderShell("chat");
  await paintChatPage();
}

async function paintChatPage() {
  const isAdmin = state.profile.role === "admin";
  let { data: channels } = await supabase.from("channels").select("*").eq("business_id", state.business.id).order("created_at");
  channels = channels || [];
  if (!state.activeChannelId && channels.length) state.activeChannelId = channels[0].id;

  mountMain(`
    ${pageHeader("Chat & Calendar", "Mention a meeting with a time and it'll land on the calendar automatically")}
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button class="btn ${tab === "chat" ? "btn-primary" : "btn-ghost"} btn-sm" id="tab-chat">💬 Chat</button>
      <button class="btn ${tab === "calendar" ? "btn-primary" : "btn-ghost"} btn-sm" id="tab-cal">🗓️ Calendar</button>
    </div>
    <div id="tab-body"></div>
  `);
  $("#tab-chat").onclick = () => { tab = "chat"; paintChatPage(); };
  $("#tab-cal").onclick = () => { tab = "calendar"; paintChatPage(); };

  if (tab === "chat") paintChatTab(channels, isAdmin);
  else paintCalendarTab();
}

function paintChatTab(channels, isAdmin) {
  const body = $("#tab-body");
  body.innerHTML = `
    <div class="chat-wrap">
      <div class="channel-list" id="channel-list">
        ${channels.map(c => `<div class="channel-item ${c.id === state.activeChannelId ? "active" : ""}" data-ch="${c.id}"># ${c.name}</div>`).join("")}
        ${isAdmin ? `<div class="channel-item" id="new-channel" style="color:var(--amber);margin-top:8px;">+ New channel</div>` : ""}
      </div>
      <div class="chat-main">
        <div class="chat-messages" id="chat-messages"><div class="empty-state">Select a channel</div></div>
        <div class="chat-input">
          <input id="chat-text" placeholder="Message the team… try: “Meeting tomorrow at 4pm”">
          <button class="btn btn-primary" id="chat-send">Send</button>
        </div>
      </div>
    </div>
  `;
  $all("[data-ch]").forEach(el => el.onclick = () => { state.activeChannelId = el.dataset.ch; paintChatTab(channels, isAdmin); });
  if (isAdmin) $("#new-channel").onclick = () => openNewChannelModal(channels);

  if (state.activeChannelId) loadMessages(state.activeChannelId);

  $("#chat-send").onclick = sendMessage;
  $("#chat-text").onkeydown = (e) => { if (e.key === "Enter") sendMessage(); };
}

async function loadMessages(channelId) {
  const { data: messages } = await supabase.from("messages").select("*, profiles(name)").eq("channel_id", channelId).order("created_at").limit(100);
  renderMessages(messages || []);

  if (state.chatSubscription) supabase.removeChannel(state.chatSubscription);
  state.chatSubscription = supabase.channel(`messages-${channelId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, payload => {
      appendMessageToDOM(payload.new);
    })
    .subscribe();
}

function renderMessages(messages) {
  const box = $("#chat-messages");
  if (!box) return;
  box.innerHTML = messages.length ? "" : `<div class="empty-state">No messages yet — say hi 👋</div>`;
  messages.forEach(m => appendMessageToDOM(m, false));
  box.scrollTop = box.scrollHeight;
}

function appendMessageToDOM(m, scroll = true) {
  const box = $("#chat-messages");
  if (!box) return;
  if (box.querySelector(".empty-state")) box.innerHTML = "";
  const mine = m.sender_id === state.profile.id;
  const div = document.createElement("div");
  div.className = `msg ${mine ? "me" : ""}`;
  const senderName = mine ? "You" : (m.profiles?.name || m.senderName || "Teammate");
  div.innerHTML = `${m.isBot ? "🤖 " : ""}${escapeHtml(m.content)}<div class="meta">${senderName} · ${fmtTime(m.created_at || new Date())}</div>`;
  box.appendChild(div);
  if (scroll) box.scrollTop = box.scrollHeight;
}

function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

async function sendMessage() {
  const input = $("#chat-text");
  const text = input.value.trim();
  if (!text || !state.activeChannelId) return;
  input.value = "";

  const { error } = await supabase.from("messages").insert({
    channel_id: state.activeChannelId, sender_id: state.profile.id, content: text
  });
  if (error) return toast(error.message, "error");

  // local "NLP" parsing — mirrors the spec's chatbot-triggers-calendar mechanism
  const intent = parseMeetingIntent(text);
  if (intent) {
    const { error: evErr } = await supabase.from("events").insert({
      business_id: state.business.id, channel_id: state.activeChannelId,
      title: intent.title, event_time: intent.when.toISOString(), created_by: state.profile.id
    });
    if (!evErr) {
      await supabase.from("messages").insert({
        channel_id: state.activeChannelId, sender_id: state.profile.id,
        content: `Scheduled "${intent.title}" for ${intent.when.toLocaleString()} and added it to the team calendar.`
      });
      toast("Added to calendar", "success");
    }
  }
}

function openNewChannelModal(channels) {
  openModal(`
    <button class="modal-close" id="modal-x">✕</button>
    <h3>New channel</h3>
    <div class="field"><label>Channel name</label><input id="ch-name" placeholder="e.g. Kitchen team"></div>
    <button class="btn btn-primary btn-block" id="create-ch">Create</button>
  `);
  $("#modal-x").onclick = closeModal;
  $("#create-ch").onclick = async () => {
    const name = $("#ch-name").value.trim();
    if (!name) return toast("Channel name is required", "error");
    const { data, error } = await supabase.from("channels").insert({ business_id: state.business.id, name }).select().single();
    if (error) return toast(error.message, "error");
    await supabase.from("channel_members").insert({ channel_id: data.id, profile_id: state.profile.id });
    closeModal(); state.activeChannelId = data.id; paintChatPage();
  };
}

async function paintCalendarTab() {
  const { data: events } = await supabase.from("events").select("*").eq("business_id", state.business.id).order("event_time");
  const body = $("#tab-body");
  const now = new Date();
  const upcoming = (events || []).filter(e => new Date(e.event_time) >= now);
  const past = (events || []).filter(e => new Date(e.event_time) < now);
  body.innerHTML = `
    <div class="panel">
      <h3>Upcoming</h3>
      ${upcoming.length ? upcoming.map(e => `<div class="event-row"><span class="event-date mono">${fmtDate(e.event_time)}</span><span>${e.title}</span></div>`).join("") : `<div class="empty-state">Nothing scheduled. Mention a meeting in chat to add one.</div>`}
    </div>
    ${past.length ? `<div class="panel"><h3>Past</h3>${past.slice(-10).reverse().map(e => `<div class="event-row"><span class="event-date mono">${fmtDate(e.event_time)}</span><span>${e.title}</span></div>`).join("")}</div>` : ""}
  `;
}
