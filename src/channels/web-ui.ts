/**
 * Chat UI HTML template for the web channel.
 * Returns a complete HTML document with embedded CSS and JS.
 */

export function getChatHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Klaus AI</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/styles/github.min.css" media="(prefers-color-scheme: light)">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/styles/github-dark.min.css" media="(prefers-color-scheme: dark)">
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/highlight.min.js"><\/script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg: #ffffff;
  --fg: #0f172a;
  --msg-user: #f1f5f9;
  --msg-bot: #ffffff;
  border-radius: 20px;
  --border: #e2e8f0;
  --input-container: #ffffff;
  --input-border: #cbd5e1;
  --input-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025);
  --accent: #020617;
  --accent-text: #ffffff;
  --accent-hover: #334155;
  --code-bg: #f8fafc;
  --thinking: #64748b;
  --preview-bg: #f1f5f9;
  --font-main: 'Inter', -apple-system, sans-serif;
  --avatar-user: #e2e8f0;
  --avatar-bot: #0f172a;
}
@media(prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a;
    --fg: #f8fafc;
    --msg-user: #1e293b;
    --msg-bot: #0f172a;
    --border: #334155;
    --input-container: #1e293b;
    --input-border: #475569;
    --input-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3);
    --accent: #f8fafc;
    --accent-text: #0f172a;
    --accent-hover: #e2e8f0;
    --code-bg: #0b1120;
    --thinking: #94a3b8;
    --preview-bg: #1e293b;
    --avatar-user: #334155;
    --avatar-bot: #f8fafc;
  }
}
html, body { height: 100%; font-family: var(--font-main); background: var(--bg); color: var(--fg); -webkit-font-smoothing: antialiased; }
#app { display: flex; flex-direction: column; height: 100%; position: relative; }
#header { padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; background: rgba(var(--bg), 0.8); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); z-index: 10; }
.brand { font-weight: 600; font-size: 16px; display: flex; align-items: center; gap: 8px; }
.brand-icon { width: 24px; height: 24px; background: var(--fg); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--bg); font-size: 14px; font-weight: bold; }
#status { font-size: 13px; font-weight: 500; color: #10b981; display: flex; align-items: center; gap: 6px; }
#status::before { content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
#status.disconnected { color: #ef4444; }
#status.disconnected::before { background: #ef4444; }
#messages { flex: 1; overflow-y: auto; padding: 32px 16px; display: flex; flex-direction: column; gap: 32px; scroll-behavior: smooth; }
.msg-container { display: flex; gap: 16px; max-width: 800px; width: 100%; margin: 0 auto; animation: fade-in 0.3s ease-out; }
.msg-container.user { flex-direction: row-reverse; }
@keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.avatar { width: 36px; height: 36px; flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; }
.msg-container.user .avatar { background: var(--avatar-user); color: var(--fg); }
.msg-container.assistant .avatar { background: var(--avatar-bot); color: var(--bg); }
.msg { padding: 14px 18px; border-radius: 20px; font-size: 15px; line-height: 1.6; word-wrap: break-word; font-weight: 400; max-width: 85%; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
.msg.user { white-space: pre-wrap; background: var(--msg-user); border-top-right-radius: 4px; }
.msg.assistant { background: var(--msg-bot); border-top-left-radius: 4px; border: 1px solid var(--border); }
.msg.error { background: #fee2e2; color: #991b1b; display: flex; align-items: center; gap: 8px; font-size: 14px; border-radius: 12px; max-width: fit-content; margin: 0 auto; padding: 12px 16px; border: 1px solid #fca5a5; }
.msg code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13.5px; background: var(--code-bg); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border); }
.msg pre { background: var(--code-bg); padding: 16px; border-radius: 12px; border: 1px solid var(--border); overflow-x: auto; margin: 12px 0; }
.msg pre code { background: none; padding: 0; border: none; font-size: 13.5px; }
.msg pre code.hljs { background: var(--code-bg); }
.msg table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 14px; }
.msg thead { background: var(--code-bg); }
.msg th, .msg td { padding: 8px 12px; border: 1px solid var(--border); text-align: left; }
.msg th { font-weight: 600; }
.msg blockquote { border-left: 3px solid var(--border); padding: 4px 16px; margin: 8px 0; color: var(--thinking); }
.msg ul, .msg ol { padding-left: 24px; margin: 8px 0; }
.msg li { margin: 4px 0; }
.msg p { margin: 0 0 8px 0; }
.msg p:last-child { margin-bottom: 0; }
.msg hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
.code-block { position: relative; margin: 12px 0; }
.code-block pre { margin: 0; }
.code-lang { position: absolute; top: 6px; left: 12px; font-size: 11px; color: var(--thinking); font-weight: 500; text-transform: uppercase; font-family: var(--font-main); }
.code-copy { position: absolute; top: 6px; right: 8px; opacity: 0; background: rgba(0,0,0,0.5); color: #fff; border: none; padding: 3px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: opacity 0.2s; font-family: var(--font-main); }
.code-block:hover .code-copy { opacity: 1; }
.msg a { color: #3b82f6; text-decoration: none; font-weight: 500; }
.msg a:hover { text-decoration: underline; }
.msg img { max-width: 100%; border-radius: 12px; margin: 8px 0; border: 1px solid var(--border); }
.file-badge { display: inline-flex; align-items: center; gap: 6px; background: var(--code-bg); border: 1px solid var(--border); padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 500; margin: 4px; }
.thinking { color: var(--thinking); font-size: 14px; display: flex; align-items: center; gap: 8px; margin-top: 8px; font-weight: 500; }
.spinner { width: 16px; height: 16px; border: 2px solid var(--thinking); border-bottom-color: transparent; border-radius: 50%; display: inline-block; animation: rotation 1s linear infinite; }
@keyframes rotation { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
#input-wrapper { max-width: 800px; width: 100%; margin: 0 auto; padding: 0 16px 24px; }
#input-area { background: var(--input-container); border: 1px solid var(--input-border); border-radius: 24px; padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: var(--input-shadow); transition: border-color 0.2s, box-shadow 0.2s; }
#input-area:focus-within { border-color: var(--thinking); box-shadow: 0 0 0 2px rgba(100, 116, 139, 0.1), var(--input-shadow); }
#previews { display: flex; gap: 8px; flex-wrap: wrap; padding: 0 4px; }
#previews:empty { display: none; }
.preview-item { position: relative; border-radius: 12px; overflow: hidden; background: var(--preview-bg); border: 1px solid var(--border); display: flex; align-items: center; }
.preview-item img { display: block; height: 64px; width: 64px; object-fit: cover; }
.preview-item .file-info { padding: 8px 12px; font-size: 12px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.preview-item .remove { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); transition: background 0.2s; }
.preview-item .remove:hover { background: rgba(0,0,0,0.8); }
.input-row { display: flex; gap: 10px; align-items: flex-end; }
#attach { background: transparent; border: none; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--thinking); flex-shrink: 0; transition: background 0.2s, color 0.2s; margin-bottom: 2px; }
#attach:hover { background: var(--preview-bg); color: var(--fg); }
#attach svg { width: 20px; height: 20px; stroke-width: 2; }
#input { flex: 1; resize: none; border: none; background: transparent; color: var(--fg); max-height: 200px; min-height: 40px; line-height: 1.5; outline: none; font-family: inherit; font-size: 15px; padding: 8px 0; }
#input::placeholder { color: var(--thinking); }
#send { background: var(--accent); color: var(--accent-text); border: none; border-radius: 50%; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s, transform 0.1s; margin-bottom: 1px; }
#send:hover:not(:disabled) { background: var(--accent-hover); }
#send:active:not(:disabled) { transform: scale(0.95); }
#send:disabled { opacity: 0.5; cursor: not-allowed; }
#send svg { width: 18px; height: 18px; stroke-width: 2.5; margin-left: 2px; }
.drop-overlay { position: fixed; inset: 0; background: rgba(var(--bg), 0.8); backdrop-filter: blur(4px); border: 3px dashed var(--thinking); z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: var(--fg); font-weight: 600; font-size: 20px; pointer-events: none; border-radius: 20px; margin: 16px; }
.drop-icon { width: 64px; height: 64px; color: var(--thinking); }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--thinking); }
.tool-container { display: flex; flex-direction: column; gap: 2px; max-width: 800px; width: 100%; margin: 0 auto; padding: 0 16px 0 68px; }
.tool-item { display: flex; align-items: center; gap: 8px; padding: 5px 12px; border-left: 2px solid var(--border); font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; animation: fade-in 0.2s ease-out; transition: opacity 0.4s ease; }
.tool-item.terminal { border-left-color: #22c55e; }
.tool-item.file { border-left-color: #3b82f6; }
.tool-item.search { border-left-color: #a855f7; }
.tool-icon { flex-shrink: 0; width: 14px; height: 14px; color: var(--thinking); }
.tool-label { font-size: 12px; color: var(--thinking); flex-shrink: 0; font-family: var(--font-main); font-weight: 500; }
.tool-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg); opacity: 0.8; }
.tool-value.terminal-cmd { color: #4ade80; }
@media(prefers-color-scheme: light) { .tool-value.terminal-cmd { color: #16a34a; } }
.tool-secondary { font-size: 11px; color: var(--thinking); font-family: var(--font-main); flex-shrink: 0; }
.tool-item.done { opacity: 0.35; }
.tool-item.error { opacity: 0.8; }
.tool-item.error .tool-value { color: #ef4444; }
.tool-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--thinking); animation: pulse 1.4s ease-in-out infinite; flex-shrink: 0; }
@keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
.msg.streaming { white-space: pre-wrap; }
.msg.streaming .cursor { display: inline-block; width: 2px; height: 1em; background: var(--thinking); animation: blink 0.8s step-end infinite; vertical-align: text-bottom; margin-left: 1px; }
@keyframes blink { 50% { opacity: 0; } }
.sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: 280px; background: var(--input-container); border-right: 1px solid var(--border); z-index: 30; transform: translateX(-100%); transition: transform 0.25s ease; display: flex; flex-direction: column; }
.sidebar.open { transform: translateX(0); }
.sidebar-header { padding: 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); }
.sidebar-title { font-weight: 600; font-size: 15px; }
.new-chat-btn { background: var(--accent); color: var(--accent-text); border: none; padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-main); transition: background 0.2s; }
.new-chat-btn:hover { background: var(--accent-hover); }
.session-list { flex: 1; overflow-y: auto; padding: 8px; }
.session-item { padding: 10px 12px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 13px; transition: background 0.15s; }
.session-item:hover { background: var(--preview-bg); }
.session-item.active { background: var(--preview-bg); font-weight: 600; }
.session-item .s-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-item .s-del { opacity: 0; background: none; border: none; color: var(--thinking); cursor: pointer; padding: 2px 4px; font-size: 14px; line-height: 1; border-radius: 4px; transition: opacity 0.15s; }
.session-item:hover .s-del { opacity: 0.6; }
.session-item .s-del:hover { opacity: 1; background: var(--code-bg); }
.sidebar-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 25; display: none; }
.sidebar-overlay.show { display: block; }
.menu-btn { background: transparent; border: none; cursor: pointer; color: var(--fg); padding: 4px; display: flex; align-items: center; font-size: 18px; }
.perm-banner { position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); max-width: 600px; width: calc(100% - 32px); background: var(--input-container); border: 1px solid var(--border); border-radius: 16px; padding: 14px 18px; box-shadow: 0 8px 30px rgba(0,0,0,0.12); z-index: 20; animation: fade-in 0.3s ease-out; display: flex; align-items: center; gap: 12px; }
.perm-info { flex: 1; min-width: 0; }
.perm-title { font-size: 13px; font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
.perm-value { font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: var(--thinking); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.perm-btn { border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-main); transition: background 0.2s; }
.perm-btn.approve { background: #22c55e; color: #fff; }
.perm-btn.approve:hover { background: #16a34a; }
.perm-btn.deny { background: #ef4444; color: #fff; }
.perm-btn.deny:hover { background: #dc2626; }
</style>
</head>
<body>
<div id="app">
  <div id="sidebar" class="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">Chats</span>
      <button class="new-chat-btn" id="new-chat-btn">+ New</button>
    </div>
    <div class="session-list" id="session-list"></div>
  </div>
  <div id="sidebar-overlay" class="sidebar-overlay"></div>
  <div id="header">
    <div class="brand">
      <button class="menu-btn" id="menu-btn">&#9776;</button>
      <div class="brand-icon">K</div>
      Klaus AI
    </div>
    <span id="status">connected</span>
  </div>
  <div id="messages"></div>
  <div id="input-wrapper">
    <div id="input-area">
      <div id="previews"></div>
      <div class="input-row">
        <button id="attach" title="Attach file">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
        </button>
        <input type="file" id="file-input" multiple hidden accept="image/*,audio/*,video/*,.pdf,.txt,.md,.json,.csv,.xml,.html,.js,.ts,.py,.go,.rs,.java,.c,.cpp,.h,.yaml,.yml,.toml,.log,.sh,.bat">
        <textarea id="input" rows="1" placeholder="Send a message to Klaus..." autocomplete="off"></textarea>
        <button id="send" disabled>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>
        </button>
      </div>
    </div>
  </div>
</div>
<script>
(function(){
  if (typeof marked !== "undefined") {
    marked.use({ breaks: true, gfm: true, renderer: {
      html: function(token) { return escHtml(typeof token === "string" ? token : token.text); }
    }});
  }

  const token = new URLSearchParams(location.search).get("token");
  if (!token) { document.body.innerHTML = "<p style='padding:40px;text-align:center'>Missing token parameter.</p>"; return; }

  const msgs = document.getElementById("messages");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("send");
  const statusEl = document.getElementById("status");
  const attachBtn = document.getElementById("attach");
  const fileInput = document.getElementById("file-input");
  const previewsEl = document.getElementById("previews");
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  const menuBtn = document.getElementById("menu-btn");
  const newChatBtn = document.getElementById("new-chat-btn");
  const sessionListEl = document.getElementById("session-list");
  let busy = false;

  // --- Session management ---
  var SP = "klaus_" + token.slice(0, 8);
  var sessionsMeta = (function() {
    try {
      var raw = JSON.parse(localStorage.getItem(SP + "_s") || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.filter(function(s) { return s && typeof s.id === "string"; });
    } catch(_) { return []; }
  })();
  var currentSessionId = localStorage.getItem(SP + "_c") || null;
  var sessionDom = new Map();
  var prevSessionId = null;

  if (!currentSessionId || !sessionsMeta.find(function(s){ return s.id === currentSessionId; })) {
    currentSessionId = crypto.randomUUID();
    sessionsMeta.unshift({ id: currentSessionId, title: "New Chat", ts: Date.now() });
  }
  saveSessionMeta();
  renderSessionList();

  function saveSessionMeta() {
    localStorage.setItem(SP + "_s", JSON.stringify(sessionsMeta));
    localStorage.setItem(SP + "_c", currentSessionId);
  }

  function createNewChat() {
    // Save current DOM
    var frag = document.createDocumentFragment();
    while (msgs.firstChild) frag.appendChild(msgs.firstChild);
    if (frag.childNodes.length) sessionDom.set(currentSessionId, frag);
    // Create new session
    prevSessionId = currentSessionId;
    currentSessionId = crypto.randomUUID();
    sessionsMeta.unshift({ id: currentSessionId, title: "New Chat", ts: Date.now() });
    saveSessionMeta();
    busy = false; isStreaming = false; streamBuffer = "";
    if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
    activeTools.clear(); toolContainer = null;
    updateBtn(); renderSessionList(); closeSidebar();
  }

  function switchSession(id) {
    if (id === currentSessionId) { closeSidebar(); return; }
    // Save current DOM
    var frag = document.createDocumentFragment();
    while (msgs.firstChild) frag.appendChild(msgs.firstChild);
    if (frag.childNodes.length) sessionDom.set(currentSessionId, frag);
    // Load target
    prevSessionId = currentSessionId;
    currentSessionId = id;
    var saved = sessionDom.get(id);
    if (saved) { msgs.appendChild(saved); sessionDom.delete(id); }
    busy = false; isStreaming = false; streamBuffer = "";
    if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
    activeTools.clear(); toolContainer = null;
    updateBtn(); saveSessionMeta(); renderSessionList(); closeSidebar(); scrollBottom();
  }

  function deleteSession(id, evt) {
    if (evt) { evt.stopPropagation(); evt.preventDefault(); }
    sessionsMeta = sessionsMeta.filter(function(s){ return s.id !== id; });
    sessionDom.delete(id);
    if (id === currentSessionId) {
      // Clear current messages
      while (msgs.firstChild) msgs.removeChild(msgs.firstChild);
      if (!sessionsMeta.length) { createNewChat(); return; }
      currentSessionId = sessionsMeta[0].id;
      var saved = sessionDom.get(currentSessionId);
      if (saved) { msgs.appendChild(saved); sessionDom.delete(currentSessionId); }
    }
    saveSessionMeta(); renderSessionList();
  }

  function updateSessionTitle(text) {
    var s = sessionsMeta.find(function(s){ return s.id === currentSessionId; });
    if (s && s.title === "New Chat" && text) {
      s.title = text.slice(0, 40);
      s.ts = Date.now();
      saveSessionMeta(); renderSessionList();
    }
  }

  function renderSessionList() {
    sessionListEl.innerHTML = "";
    sessionsMeta.forEach(function(s) {
      var el = document.createElement("div");
      el.className = "session-item" + (s.id === currentSessionId ? " active" : "");
      var title = document.createElement("span");
      title.className = "s-title";
      title.textContent = s.title || "New Chat";
      var del = document.createElement("button");
      del.className = "s-del";
      del.innerHTML = "&#10005;";
      del.title = "Delete";
      del.onclick = function(e) { deleteSession(s.id, e); };
      el.appendChild(title);
      el.appendChild(del);
      el.onclick = function() { switchSession(s.id); };
      sessionListEl.appendChild(el);
    });
  }

  function openSidebar() { sidebar.classList.add("open"); sidebarOverlay.classList.add("show"); }
  function closeSidebar() { sidebar.classList.remove("open"); sidebarOverlay.classList.remove("show"); }
  menuBtn.addEventListener("click", function() { sidebar.classList.contains("open") ? closeSidebar() : openSidebar(); });
  sidebarOverlay.addEventListener("click", closeSidebar);
  newChatBtn.addEventListener("click", createNewChat);

  const pendingFiles = [];

  input.addEventListener("input", function(){
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 200) + "px";
    updateBtn();
  });

  var ws = null;
  var reconnectAttempt = 0;

  function connectWs() {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(proto + "//" + location.host + "/api/ws?token=" + encodeURIComponent(token));
    ws.onopen = function() {
      reconnectAttempt = 0;
      statusEl.textContent = "Connected";
      statusEl.className = "";
    };
    ws.onclose = function() {
      ws = null;
      statusEl.textContent = "Reconnecting...";
      statusEl.className = "disconnected";
      var base = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000);
      var delay = Math.round(base + base * 0.2 * Math.random());
      reconnectAttempt++;
      setTimeout(connectWs, delay);
    };
    ws.onerror = function() {};
    ws.onmessage = function(e) {
      var data;
      try { data = JSON.parse(e.data); } catch(_) { return; }
      if (data.type === "ping") return;
      if (data.sessionId && data.sessionId !== currentSessionId) return;
      if (data.type === "permission") { showPermissionBanner(data.data); return; }
      if (data.type === "tool") { handleToolEvent(data.data); return; }
      if (data.type === "stream") { handleStreamChunk(data.chunk); return; }
      if (!isStreaming) { removeThinking(); clearToolContainer(); }
      removePermissionBanner();
      if (data.type === "message") {
        if (isStreaming) { finalizeStreamingMessage(data.text); }
        else { appendMsg("assistant", data.text); }
        busy = false; updateBtn();
      }
      else if (data.type === "merged") { if (isStreaming) { finalizeStreamingMessage(""); } busy = false; updateBtn(); }
      else if (data.type === "error") { if (isStreaming) { finalizeStreamingMessage(""); } appendErrorMsg(data.message); busy = false; updateBtn(); }
    };
  }
  connectWs();

  attachBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (fileInput.files) addFiles(Array.from(fileInput.files));
    fileInput.value = "";
  });

  function addFiles(files) {
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) { appendErrorMsg("File too large (max 10 MB): " + f.name); continue; }
      const entry = { file: f, objectUrl: null, uploadId: null, uploading: true };
      if (f.type.startsWith("image/")) entry.objectUrl = URL.createObjectURL(f);
      pendingFiles.push(entry);
      uploadFile(entry);
    }
    renderPreviews();
    updateBtn();
  }

  async function uploadFile(entry) {
    try {
      const res = await fetch("/api/upload?token=" + encodeURIComponent(token) + "&name=" + encodeURIComponent(entry.file.name), {
        method: "POST",
        headers: { "Content-Type": entry.file.type || "application/octet-stream" },
        body: entry.file
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      entry.uploadId = data.id;
    } catch(err) {
      appendErrorMsg("Upload failed: " + entry.file.name);
      const idx = pendingFiles.indexOf(entry);
      if (idx >= 0) pendingFiles.splice(idx, 1);
    }
    entry.uploading = false;
    renderPreviews();
    updateBtn();
  }

  function removeFile(idx) {
    const entry = pendingFiles[idx];
    if (entry && entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    pendingFiles.splice(idx, 1);
    renderPreviews();
    updateBtn();
  }

  function renderPreviews() {
    previewsEl.innerHTML = "";
    pendingFiles.forEach((entry, i) => {
      const wrap = document.createElement("div");
      wrap.className = "preview-item";
      if (entry.objectUrl) {
        const img = document.createElement("img");
        img.src = entry.objectUrl;
        wrap.appendChild(img);
      } else {
        const info = document.createElement("div");
        info.className = "file-info";
        info.textContent = (entry.uploading ? "Uploading... " : "") + entry.file.name;
        wrap.appendChild(info);
      }
      const rm = document.createElement("button");
      rm.className = "remove";
      rm.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      rm.onclick = () => removeFile(i);
      wrap.appendChild(rm);
      previewsEl.appendChild(wrap);
    });
  }

  let dragCount = 0;
  let dropOverlay = null;
  document.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCount++;
    if (dragCount === 1) showDropOverlay();
  });
  document.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCount--;
    if (dragCount <= 0) { dragCount = 0; hideDropOverlay(); }
  });
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCount = 0;
    hideDropOverlay();
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files));
  });
  function showDropOverlay() {
    if (dropOverlay) return;
    dropOverlay = document.createElement("div");
    dropOverlay.className = "drop-overlay";
    dropOverlay.innerHTML = '<svg class="drop-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>Drop files to upload';
    document.body.appendChild(dropOverlay);
  }
  function hideDropOverlay() {
    if (dropOverlay) { dropOverlay.remove(); dropOverlay = null; }
  }

  input.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const f = items[i].getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) { e.preventDefault(); addFiles(files); }
  });

  async function send() {
    const text = input.value.trim();
    const hasFiles = pendingFiles.length > 0;
    if ((!text && !hasFiles) || busy) return;
    if (pendingFiles.some(e => e.uploading)) return;

    const fileNames = pendingFiles.map(e => e.file.name);
    const imageUrls = pendingFiles.filter(e => e.objectUrl).map(e => e.objectUrl);
    const nonImageFiles = pendingFiles.filter(e => !e.objectUrl).map(e => e.file.name);
    
    appendUserMsg(text, imageUrls, nonImageFiles);

    const fileIds = pendingFiles.map(e => e.uploadId).filter(Boolean);
    pendingFiles.length = 0;
    renderPreviews();

    input.value = ""; input.style.height = "auto";
    busy = true; updateBtn(); showThinking();
    updateSessionTitle(text);
    if (ws && ws.readyState === WebSocket.OPEN) {
      var msg = { type: "message", text: text, sessionId: currentSessionId };
      if (fileIds.length) msg.files = fileIds;
      ws.send(JSON.stringify(msg));
    } else {
      appendErrorMsg("Not connected"); removeThinking(); busy = false; updateBtn();
    }
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => { 
    if (e.key==="Enter" && !e.shiftKey) { 
      // check if it's on mobile, usually shiftKey isn't easy there, but let's just do standard enter to send
      e.preventDefault(); send(); 
    } 
  });

  function updateBtn() {
    const uploading = pendingFiles.some(e => e.uploading);
    const text = input.value.trim();
    const hasFiles = pendingFiles.length > 0;
    sendBtn.disabled = busy || uploading || (!text && !hasFiles);
  }

  function showThinking() {
    if (document.getElementById("thinking-container")) return;
    const el = document.createElement("div");
    el.className = "msg-container assistant";
    el.id = "thinking-container";
    el.innerHTML = '<div class="avatar">K</div><div class="msg assistant"><div class="thinking"><div class="spinner"></div>Thinking...</div></div>';
    msgs.appendChild(el); scrollBottom();
  }
  function removeThinking() {
    const el = document.getElementById("thinking-container");
    if (el) el.remove();
  }

  const activeTools = new Map();
  let toolContainer = null;

  const toolIcons = {
    terminal: '<svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 9l3 3-3 3"/><path d="M13 15h3"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>',
    file: '<svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>',
    "file-plus": '<svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
    edit: '<svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    search: '<svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    globe: '<svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    list: '<svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    agent: '<svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2m-9-11h2m18 0h2m-3.64-6.36l-1.42 1.42M6.34 17.66l-1.42 1.42m0-13.08l1.42 1.42m11.32 11.32l1.42 1.42"/></svg>',
    tool: '<svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>'
  };

  function getOrCreateToolContainer() {
    if (toolContainer && document.contains(toolContainer)) return toolContainer;
    toolContainer = document.createElement("div");
    toolContainer.className = "tool-container";
    toolContainer.id = "active-tools";
    const thinking = document.getElementById("thinking-container");
    if (thinking) {
      msgs.insertBefore(toolContainer, thinking);
    } else {
      msgs.appendChild(toolContainer);
    }
    return toolContainer;
  }

  function clearToolContainer() {
    const tc = document.getElementById("active-tools");
    if (tc) tc.remove();
    toolContainer = null;
    activeTools.clear();
  }

  function handleToolEvent(te) {
    if (!te) return;
    if (te.type === "tool_start") {
      const container = getOrCreateToolContainer();
      const el = document.createElement("div");
      el.className = "tool-item " + (te.display.style || "default");
      el.id = "tool-" + te.toolUseId;
      const iconKey = Object.prototype.hasOwnProperty.call(toolIcons, te.display.icon) ? te.display.icon : "tool";
      let html = toolIcons[iconKey];
      html += '<span class="tool-label">' + escHtml(te.display.label) + '</span>';
      if (te.display.value) {
        const cls = te.display.style === "terminal" ? "tool-value terminal-cmd" : "tool-value";
        const prefix = te.display.style === "terminal" ? "$ " : "";
        html += '<span class="' + cls + '">' + prefix + escHtml(te.display.value) + '</span>';
      }
      if (te.display.secondary) {
        html += '<span class="tool-secondary">' + escHtml(te.display.secondary) + '</span>';
      }
      html += '<span class="tool-dot"></span>';
      el.innerHTML = html;
      container.appendChild(el);
      activeTools.set(te.toolUseId, { element: el, toolName: te.toolName });
      scrollBottom();
    }
    if (te.type === "tool_result") {
      const tracked = activeTools.get(te.toolUseId);
      if (tracked) {
        const dot = tracked.element.querySelector(".tool-dot");
        if (dot) dot.remove();
        if (te.isError) {
          tracked.element.classList.add("error");
          const errSpan = document.createElement("span");
          errSpan.className = "tool-secondary";
          errSpan.style.color = "#ef4444";
          errSpan.textContent = "error";
          tracked.element.appendChild(errSpan);
        } else {
          tracked.element.classList.add("done");
        }
        activeTools.delete(te.toolUseId);
      }
    }
  }

  let streamBuffer = "";
  let streamTimer = null;
  let isStreaming = false;

  function handleStreamChunk(chunk) {
    if (!isStreaming) {
      removeThinking();
      clearToolContainer();
      createStreamingMessage();
      isStreaming = true;
    }
    streamBuffer += chunk;
    if (!streamTimer) {
      streamTimer = setTimeout(flushStreamBuffer, 100);
    }
  }

  function flushStreamBuffer() {
    streamTimer = null;
    if (!streamBuffer) return;
    const el = document.getElementById("streaming-msg");
    if (!el) return;
    const msgEl = el.querySelector(".msg");
    const cursor = msgEl.querySelector(".cursor");
    msgEl.insertBefore(document.createTextNode(streamBuffer), cursor);
    streamBuffer = "";
    scrollBottom();
  }

  function createStreamingMessage() {
    const wrap = document.createElement("div");
    wrap.className = "msg-container assistant";
    wrap.id = "streaming-msg";
    wrap.innerHTML = '<div class="avatar">K</div><div class="msg assistant streaming"><span class="cursor"></span></div>';
    msgs.appendChild(wrap);
    scrollBottom();
  }

  function finalizeStreamingMessage(fullText) {
    if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
    if (streamBuffer) { flushStreamBuffer(); }
    streamBuffer = "";
    isStreaming = false;
    const el = document.getElementById("streaming-msg");
    if (el) {
      if (fullText) {
        const msgEl = el.querySelector(".msg");
        if (msgEl) { msgEl.className = "msg assistant"; msgEl.innerHTML = renderMd(fullText); postProcessMsg(msgEl); }
      } else {
        const cursor = el.querySelector(".cursor");
        if (cursor) cursor.remove();
        const msgEl = el.querySelector(".msg");
        if (msgEl) msgEl.classList.remove("streaming");
      }
      el.removeAttribute("id");
    }
    scrollBottom();
  }

  function appendUserMsg(text, imageUrls, fileNames) {
    const wrap = document.createElement("div");
    wrap.className = "msg-container user";
    
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "U";
    wrap.appendChild(avatar);

    const el = document.createElement("div");
    el.className = "msg user";
    
    let html = "";
    if (imageUrls.length) {
      html += imageUrls.map(u => '<img src="' + escAttr(u) + '">').join("");
    }
    if (fileNames.length) {
      html += fileNames.map(n => '<span class="file-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>' + escHtml(n) + '</span>').join(" ");
    }
    if (text) {
      if (html) html += "<br>";
      html += escHtml(text);
    }
    
    el.innerHTML = html;
    wrap.appendChild(el);
    msgs.appendChild(wrap); 
    scrollBottom();
  }

  function appendMsg(role, text) {
    const wrap = document.createElement("div");
    wrap.className = "msg-container " + role;
    
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = role === "user" ? "U" : "K";
    wrap.appendChild(avatar);

    const el = document.createElement("div");
    el.className = "msg " + role;
    el.innerHTML = role === "user" ? escHtml(text) : renderMd(text);
    if (role !== "user") postProcessMsg(el);

    wrap.appendChild(el);
    msgs.appendChild(wrap);
    scrollBottom();
  }

  function appendErrorMsg(text) {
    const el = document.createElement("div");
    el.className = "msg error";
    el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' + escHtml(text);
    msgs.appendChild(el); scrollBottom();
  }

  function scrollBottom() { msgs.scrollTop = msgs.scrollHeight; }

  function escHtml(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function escAttr(s) { return s.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  function renderMd(text) {
    if (typeof marked !== "undefined") {
      return marked.parse(text);
    }
    text = escHtml(text);
    text = text.replace(/\\\`\\\`\\\`(\\w*)?\\n([\\s\\S]*?)\\\`\\\`\\\`/g, (_,lang,code) =>
      "<pre><code>" + code.replace(/\\n$/,"") + "</code></pre>");
    text = text.replace(/\\\`([^\\\`]+)\\\`/g, (_,c) => "<code>"+c+"</code>");
    text = text.replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");
    text = text.replace(/(?:^|[^*])\\*([^*]+)\\*(?:[^*]|$)/g, (m,c) =>
      m.replace("*"+c+"*", "<em>"+c+"</em>"));
    text = text.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)]+)\\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const parts = text.split(/(<pre>[\\s\\S]*?<\\/pre>)/g);
    return parts.map((p,i) => i%2===0 ? p.replace(/\\n/g,"<br>") : p).join("");
  }

  function showPermissionBanner(req) {
    removePermissionBanner();
    var banner = document.createElement("div");
    banner.className = "perm-banner";
    banner.id = "perm-banner";
    var iconHtml = toolIcons[req.display.icon] || toolIcons.tool;
    var info = document.createElement("div");
    info.className = "perm-info";
    info.innerHTML = '<div class="perm-title">' + iconHtml + ' ' + escHtml(req.display.label) + '</div>'
      + '<div class="perm-value">' + (req.display.style === "terminal" ? "$ " : "") + escHtml(req.display.value) + '</div>';
    var approveBtn = document.createElement("button");
    approveBtn.className = "perm-btn approve";
    approveBtn.textContent = "Approve";
    approveBtn.onclick = function() { respondPermission(req.requestId, true); };
    var denyBtn = document.createElement("button");
    denyBtn.className = "perm-btn deny";
    denyBtn.textContent = "Deny";
    denyBtn.onclick = function() { respondPermission(req.requestId, false); };
    banner.appendChild(info);
    banner.appendChild(denyBtn);
    banner.appendChild(approveBtn);
    document.body.appendChild(banner);
  }

  function removePermissionBanner() {
    var el = document.getElementById("perm-banner");
    if (el) el.remove();
  }

  function respondPermission(requestId, allow) {
    removePermissionBanner();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "permission", requestId: requestId, allow: allow }));
    }
  }

  function postProcessMsg(container) {
    container.querySelectorAll("pre code").forEach(function(block) {
      if (typeof hljs !== "undefined") hljs.highlightElement(block);
      var pre = block.parentElement;
      if (!pre || !pre.parentElement || pre.parentElement.classList.contains("code-block")) return;
      var wrapper = document.createElement("div");
      wrapper.className = "code-block";
      pre.parentElement.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);
      var langClass = Array.from(block.classList).find(function(c) { return c.startsWith("language-"); });
      var lang = langClass ? langClass.replace("language-", "") : "";
      if (lang && lang !== "plaintext") {
        var badge = document.createElement("span");
        badge.className = "code-lang";
        badge.textContent = lang;
        wrapper.appendChild(badge);
      }
      var btn = document.createElement("button");
      btn.className = "code-copy";
      btn.textContent = "Copy";
      btn.onclick = function() {
        navigator.clipboard.writeText(block.textContent).then(function() {
          btn.textContent = "Copied!";
          setTimeout(function() { btn.textContent = "Copy"; }, 2000);
        }).catch(function() { btn.textContent = "Failed"; setTimeout(function() { btn.textContent = "Copy"; }, 2000); });
      };
      wrapper.appendChild(btn);
    });
    container.querySelectorAll("a").forEach(function(a) {
      if (!a.getAttribute("target")) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
    });
  }
})();
</script>
</body>
</html>`;
}
