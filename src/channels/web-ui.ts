/**
 * Chat UI HTML template for the web channel.
 * Returns a complete HTML document with embedded CSS and JS.
 *
 * Design: Inspired by claude.ai — centered layout, welcome state,
 * refined dark theme with Plus Jakarta Sans typography.
 */

export function getChatHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Klaus AI</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/styles/github.min.css">
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/highlight.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#ffffff;
  --bg-surface:#f8fafc;
  --bg-elevated:#ffffff;
  --bg-hover:#f1f5f9;
  --fg:#0f172a;
  --fg-secondary:#334155;
  --fg-tertiary:#64748b;
  --fg-quaternary:#94a3b8;
  --border:#e2e8f0;
  --border-subtle:#f1f5f9;
  --input-bg:#ffffff;
  --input-border:#cbd5e1;
  --input-focus:#94a3b8;
  --accent:#020617;
  --accent-text:#ffffff;
  --accent-hover:#334155;
  --code-bg:#f8fafc;
  --msg-user-bg:#f1f5f9;
  --font:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --font-mono:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;
  --radius-sm:8px;
  --radius-md:16px;
  --radius-lg:24px;
  --radius-xl:28px;
  --shadow-lg:0 24px 48px -12px rgba(0,0,0,0.1);
  --shadow-md:0 8px 24px -4px rgba(0,0,0,0.06);
  --transition:150ms cubic-bezier(0.4,0,0.2,1);
}
html,body{height:100dvh;width:100vw;font-family:var(--font);background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;overflow:hidden}
::selection{background:rgba(2,6,23,0.1)}
#app{display:flex;height:100%;width:100%;position:fixed;inset:0}

/* ─── Sidebar ─── */
.sidebar{
  width:260px;background:var(--bg);border-right:1px solid var(--border);
  display:flex;flex-direction:column;z-index:30;
  position:fixed;left:0;top:0;bottom:0;
  transform:translateX(-100%);transition:transform .25s ease,visibility 0s .25s,width .2s ease;
  visibility:hidden;pointer-events:none;
}
.sidebar.open{transform:translateX(0);visibility:visible;pointer-events:auto;transition:transform .25s ease,visibility 0s 0s,width .2s ease}
@media(min-width:769px){
  .sidebar{position:relative;transform:none!important;visibility:visible!important;pointer-events:auto!important;transition:width .2s ease}
  .sidebar.collapsed{width:60px}
}
.sidebar-header{padding:14px 16px;display:flex;align-items:center;justify-content:space-between}
.sidebar.collapsed .sidebar-header{padding:14px 12px;justify-content:center}
.sidebar.collapsed .sidebar-brand{display:none}
.sidebar-toggle{
  width:32px;height:32px;border-radius:var(--radius-sm);
  background:transparent;border:none;
  color:var(--fg-tertiary);cursor:pointer;
  display:none;align-items:center;justify-content:center;
  transition:all var(--transition);flex-shrink:0;
}
.sidebar-toggle:hover{color:var(--fg);background:var(--bg-hover)}
.sidebar-toggle svg{width:18px;height:18px;stroke-width:2}
@media(min-width:769px){.sidebar-toggle{display:flex}}
.sidebar-brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px;letter-spacing:-0.02em;white-space:nowrap;overflow:hidden}
.sidebar-brand img{width:22px;height:22px;border-radius:6px;flex-shrink:0}
.sidebar.collapsed .sidebar-brand span{display:none}
.sidebar-nav{display:flex;flex-direction:column;gap:2px;padding:8px}
.sidebar-nav-item{
  display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--radius-sm);
  cursor:pointer;color:var(--fg-tertiary);font-size:14px;font-weight:500;
  transition:all var(--transition);border:none;background:transparent;font-family:var(--font);width:100%;text-align:left;
}
.sidebar-nav-item:hover{background:var(--bg-hover);color:var(--fg)}
.sidebar-nav-item svg{width:18px;height:18px;flex-shrink:0;stroke-width:2}
.sidebar.collapsed .sidebar-nav-item span{display:none}
.sidebar.collapsed .sidebar-nav-item{justify-content:center;padding:10px}
.sidebar-section-label{font-size:11px;font-weight:600;color:var(--fg-quaternary);text-transform:uppercase;letter-spacing:0.06em;padding:12px 12px 4px}
.sidebar.collapsed .sidebar-section-label{display:none}
.session-list{flex:1;overflow-y:auto;padding:4px 8px}
.sidebar.collapsed .session-list{display:none}
.session-item{
  padding:10px 12px;border-radius:var(--radius-sm);cursor:pointer;
  display:flex;align-items:center;gap:8px;font-size:14px;
  color:var(--fg-secondary);transition:all var(--transition);margin:1px 0;
}
.session-item:hover{background:var(--bg-hover);color:var(--fg)}
.session-item.active{background:var(--bg-hover);color:var(--fg);font-weight:500}
.session-item .s-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.session-item .s-del{
  opacity:0;background:none;border:none;color:var(--fg-tertiary);cursor:pointer;
  padding:2px;font-size:12px;line-height:1;border-radius:4px;transition:opacity var(--transition);
  display:flex;align-items:center;justify-content:center;
}
.session-item:hover .s-del{opacity:0.6}
.session-item .s-del:hover{opacity:1;color:var(--fg)}
.sidebar-footer{padding:12px 16px;border-top:1px solid var(--border);margin-top:auto}
.sidebar-user{
  display:flex;align-items:center;gap:10px;padding:4px;cursor:pointer;
  border-radius:var(--radius-sm);transition:all var(--transition);
}
.sidebar-user:hover{background:var(--bg-hover)}
.sidebar-avatar{
  width:32px;height:32px;border-radius:50%;background:var(--bg-hover);
  display:flex;align-items:center;justify-content:center;font-size:13px;
  font-weight:600;color:var(--fg);flex-shrink:0;border:1px solid var(--border);
}
.sidebar-username{font-size:14px;font-weight:500;color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sidebar-useremail{font-size:12px;color:var(--fg-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sidebar.collapsed .sidebar-footer{padding:12px 8px;display:flex;justify-content:center}
.sidebar.collapsed .sidebar-user-info{display:none}
.sidebar-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.3);backdrop-filter:blur(4px);z-index:25;display:none}
.sidebar-overlay.show{display:block}
@media(min-width:769px){.sidebar-overlay{display:none!important}}

/* ─── Main Content ─── */
.main-content{flex:1;display:flex;flex-direction:column;min-width:0;height:100%;position:relative}

/* ─── Header ─── */
#header{
  padding:12px 20px;display:flex;align-items:center;justify-content:space-between;
  flex-shrink:0;position:relative;z-index:10;
}
.header-left{display:flex;align-items:center;gap:8px}
.menu-btn{
  background:transparent;border:none;cursor:pointer;color:var(--fg-secondary);
  padding:8px;margin:-8px;display:flex;align-items:center;justify-content:center;
  border-radius:var(--radius-sm);transition:all var(--transition);
}
.menu-btn:hover{color:var(--fg);background:var(--bg-hover)}
.menu-btn svg{width:20px;height:20px}
@media(min-width:769px){.menu-btn{display:none!important}}
.header-right{display:flex;align-items:center;gap:8px}
#status{
  font-size:12px;font-weight:500;color:#16a34a;
  display:flex;align-items:center;gap:5px;
  padding:4px 10px;border-radius:20px;background:rgba(22,163,74,0.06);
}
#status::before{content:"";width:6px;height:6px;border-radius:50%;background:#16a34a}
#status.disconnected{color:#dc2626;background:rgba(220,38,38,0.06)}
#status.disconnected::before{background:#dc2626}

/* ─── Welcome State ─── */
#welcome{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:0 24px 120px;gap:12px;opacity:1;transition:opacity .3s ease;
}
#welcome.hidden{display:none}
.welcome-greeting{
  font-size:32px;font-weight:700;letter-spacing:-0.04em;
  color:var(--fg);line-height:1.2;text-align:center;
}
.welcome-sub{
  font-size:16px;color:var(--fg-tertiary);font-weight:400;
  text-align:center;margin-bottom:8px;
}
.welcome-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:560px;margin-top:8px}
.welcome-chip{
  padding:10px 18px;border-radius:20px;font-size:14px;font-weight:500;
  background:var(--bg-surface);border:1px solid var(--border);
  color:var(--fg-secondary);cursor:pointer;font-family:var(--font);
  transition:all var(--transition);white-space:nowrap;
}
.welcome-chip:hover{background:var(--bg-hover);color:var(--fg);border-color:var(--input-border)}

/* ─── Messages ─── */
#messages{
  flex:1;overflow-y:auto;padding:24px 16px 24px;
  display:none;flex-direction:column;gap:4px;
  scroll-behavior:smooth;
}
#messages.active{display:flex}
.msg-group{max-width:720px;width:100%;margin:0 auto;padding:16px 0}
.msg-group.user{padding:12px 0}
.msg-group.assistant{padding:16px 0}
.msg-label{
  font-size:13px;font-weight:600;color:var(--fg-tertiary);
  margin-bottom:6px;letter-spacing:-0.01em;
}
.msg{
  font-size:15px;line-height:1.75;word-wrap:break-word;font-weight:400;
  letter-spacing:-0.01em;color:var(--fg);
}
.msg.user{
  background:var(--msg-user-bg);padding:12px 18px;border-radius:var(--radius-md);
  white-space:pre-wrap;color:var(--fg);
}
.msg.assistant{color:var(--fg)}
.msg.error{
  background:#fef2f2;color:#991b1b;display:flex;align-items:center;gap:8px;
  font-size:14px;border-radius:var(--radius-md);max-width:fit-content;margin:4px auto;
  padding:10px 16px;border:1px solid #fecaca;
}
@keyframes fade-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.msg-group{animation:fade-in .3s ease-out}

/* ─── Markdown Content ─── */
.msg h1{font-size:1.6em;font-weight:700;margin:20px 0 10px;line-height:1.3;letter-spacing:-0.03em}
.msg h2{font-size:1.3em;font-weight:650;margin:18px 0 8px;line-height:1.35;letter-spacing:-0.02em}
.msg h3{font-size:1.1em;font-weight:600;margin:14px 0 6px;line-height:1.4}
.msg h4{font-size:1em;font-weight:600;margin:12px 0 4px;line-height:1.4}
.msg h1:first-child,.msg h2:first-child,.msg h3:first-child,.msg h4:first-child{margin-top:0}
.msg code{
  font-family:var(--font-mono);font-size:0.85em;
  background:var(--code-bg);padding:2px 7px;border-radius:6px;
  border:1px solid var(--border);color:#1e293b;
}
.msg pre{
  background:var(--code-bg);padding:16px;border-radius:var(--radius-md);
  border:1px solid var(--border);overflow-x:auto;margin:12px 0;max-width:100%;
}
.msg pre code{background:none;padding:0;border:none;font-size:13.5px;line-height:1.65;color:var(--fg)}
.msg pre code.hljs{background:var(--code-bg)}
.msg table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px}
.msg thead{background:var(--bg-surface)}
.msg th,.msg td{padding:8px 12px;border:1px solid var(--border);text-align:left}
.msg th{font-weight:600;color:var(--fg-secondary)}
.msg blockquote{border-left:3px solid var(--fg-quaternary);padding:4px 16px;margin:8px 0;color:var(--fg-secondary)}
.msg ul,.msg ol{padding-left:24px;margin:8px 0}
.msg li{margin:4px 0;line-height:1.65}
.msg p{margin:0 0 8px 0}
.msg p:last-child{margin-bottom:0}
.msg hr{border:none;border-top:1px solid var(--border);margin:16px 0}
.msg a{color:#2563eb;text-decoration:none;font-weight:500;transition:color var(--transition)}
.msg a:hover{color:#1d4ed8;text-decoration:underline}
.msg img{max-width:100%;border-radius:var(--radius-md);margin:8px 0;border:1px solid var(--border)}
.code-block{position:relative;margin:12px 0}
.code-block pre{margin:0}
.code-lang{position:absolute;top:8px;left:14px;font-size:11px;color:var(--fg-quaternary);font-weight:600;text-transform:uppercase;font-family:var(--font);letter-spacing:0.04em}
.code-copy{
  position:absolute;top:8px;right:10px;opacity:0;
  background:var(--bg-hover);color:var(--fg-secondary);border:1px solid var(--border);
  padding:3px 10px;border-radius:6px;font-size:12px;cursor:pointer;
  transition:opacity var(--transition);font-family:var(--font);
}
.code-block:hover .code-copy{opacity:1}
.code-copy:hover{background:var(--input-border);color:var(--fg)}

/* ─── Thinking indicator ─── */
.thinking-indicator{
  max-width:720px;width:100%;margin:8px auto;padding:0 0 0 4px;
  display:flex;align-items:center;gap:10px;
  color:var(--fg-tertiary);font-size:14px;font-weight:500;
  animation:fade-in .3s ease-out;
}
.thinking-dots{display:flex;gap:4px}
.thinking-dots span{
  width:6px;height:6px;border-radius:50%;background:var(--fg-tertiary);
  animation:thinking-bounce 1.4s ease-in-out infinite;
}
.thinking-dots span:nth-child(2){animation-delay:0.16s}
.thinking-dots span:nth-child(3){animation-delay:0.32s}
@keyframes thinking-bounce{0%,80%,100%{opacity:0.3;transform:scale(0.8)}40%{opacity:1;transform:scale(1)}}

/* ─── Streaming cursor ─── */
.msg.streaming{white-space:pre-wrap}
.msg.streaming .cursor{
  display:inline-block;width:2px;height:1.1em;background:var(--fg-tertiary);
  animation:blink .7s step-end infinite;vertical-align:text-bottom;margin-left:1px;
}
@keyframes blink{50%{opacity:0}}

/* ─── Input Area ─── */
#input-wrapper{
  max-width:720px;width:100%;margin:0 auto;padding:0 16px 20px;
  position:relative;z-index:5;
}
#input-area{
  background:var(--input-bg);border:1px solid var(--border);
  border-radius:var(--radius-xl);padding:8px 12px;
  display:flex;flex-direction:column;gap:6px;
  transition:border-color var(--transition),box-shadow var(--transition);
}
#input-area:focus-within{border-color:var(--input-focus);box-shadow:0 0 0 1px var(--input-focus)}
#previews{display:flex;gap:8px;flex-wrap:wrap;padding:4px 6px 0}
#previews:empty{display:none}
.preview-item{
  position:relative;border-radius:var(--radius-sm);overflow:hidden;
  background:var(--bg-hover);border:1px solid var(--border);
  display:flex;align-items:center;
}
.preview-item img{display:block;height:56px;width:56px;object-fit:cover}
.preview-item .file-info{padding:6px 10px;font-size:12px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;color:var(--fg-secondary)}
.preview-item .remove{
  position:absolute;top:3px;right:3px;width:20px;height:20px;
  background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:50%;
  font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;
  backdrop-filter:blur(4px);transition:background var(--transition);
}
.preview-item .remove:hover{background:rgba(0,0,0,0.9)}
.input-row{display:flex;gap:6px;align-items:flex-end}
#attach{
  background:transparent;border:none;border-radius:50%;width:36px;height:36px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  color:var(--fg-tertiary);flex-shrink:0;transition:all var(--transition);
}
#attach:hover{color:var(--fg);background:var(--bg-hover)}
#attach svg{width:18px;height:18px;stroke-width:2}
#input{
  flex:1;resize:none;border:none;background:transparent;color:var(--fg);
  max-height:200px;min-height:40px;line-height:1.5;outline:none;
  font-family:var(--font);font-size:15px;padding:8px 0;
  letter-spacing:-0.01em;
}
#input::placeholder{color:var(--fg-quaternary)}
#send{
  background:var(--accent);color:var(--accent-text);border:none;
  border-radius:50%;width:36px;height:36px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  transition:all var(--transition);flex-shrink:0;
}
#send:hover:not(:disabled){background:var(--accent-hover);transform:scale(1.04)}
#send:active:not(:disabled){transform:scale(0.96)}
#send:disabled{opacity:0.25;cursor:not-allowed}
#send svg{width:16px;height:16px;stroke-width:2.5;margin-left:1px}
.input-hint{
  text-align:center;padding:8px 0 0;font-size:12px;color:var(--fg-quaternary);
}

/* ─── Tool display ─── */
.tool-container{display:flex;flex-direction:column;gap:2px;max-width:720px;width:100%;margin:0 auto;padding:0 0 0 4px}
.tool-item{
  display:flex;align-items:center;gap:8px;padding:4px 10px;
  border-left:2px solid var(--border);font-size:13px;
  font-family:var(--font-mono);animation:fade-in .2s ease-out;
  transition:opacity .4s ease;
}
.tool-item.terminal{border-left-color:#16a34a}
.tool-item.file{border-left-color:#2563eb}
.tool-item.search{border-left-color:#9333ea}
.tool-icon{flex-shrink:0;width:14px;height:14px;color:var(--fg-tertiary)}
.tool-label{font-size:12px;color:var(--fg-tertiary);flex-shrink:0;font-family:var(--font);font-weight:500}
.tool-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fg);opacity:0.7}
.tool-value.terminal-cmd{color:#16a34a}
.tool-secondary{font-size:11px;color:var(--fg-tertiary);font-family:var(--font);flex-shrink:0}
.tool-item.done{opacity:0.3}
.tool-item.error{opacity:0.8}
.tool-item.error .tool-value{color:#dc2626}
.tool-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--fg-tertiary);animation:pulse 1.4s ease-in-out infinite;flex-shrink:0}
@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}
.agent-container{display:flex;flex-direction:column;gap:2px;border-left:2px solid var(--fg-quaternary);border-radius:4px;padding:4px 0 4px 12px;margin:2px 0}
.agent-header{display:flex;align-items:center;gap:8px;padding:4px 10px;font-size:13px;cursor:pointer;user-select:none;font-family:var(--font);font-weight:500;color:var(--fg-tertiary)}
.agent-header:hover{color:var(--fg)}
.agent-toggle{font-size:10px;transition:transform .2s;display:inline-block}
.agent-toggle.collapsed{transform:rotate(-90deg)}
.agent-children{display:flex;flex-direction:column;gap:2px}
.agent-children.collapsed{display:none}
.agent-container.done{opacity:0.3}

/* ─── File badge / card ─── */
.file-badge{
  display:inline-flex;align-items:center;gap:6px;
  background:var(--bg-surface);border:1px solid var(--border);
  padding:5px 12px;border-radius:20px;font-size:13px;font-weight:500;margin:3px;
  color:var(--fg-secondary);
}
.file-card{
  display:flex;align-items:center;gap:12px;padding:12px 16px;
  border:1px solid var(--border);border-radius:var(--radius-md);
  max-width:360px;margin:8px 0;background:var(--bg-surface);
  transition:background var(--transition);
}
.file-card:hover{background:var(--bg-hover)}
.file-card-icon{
  flex-shrink:0;width:36px;height:36px;border-radius:var(--radius-sm);
  background:var(--fg);color:var(--bg);
  display:flex;align-items:center;justify-content:center;
  font-size:12px;font-weight:700;letter-spacing:0.02em;
}
.file-card-info{flex:1;min-width:0}
.file-card-name{font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fg)}
.file-card-hint{font-size:12px;color:var(--fg-tertiary);margin-top:2px}
.file-card-dl{
  flex-shrink:0;padding:6px 14px;border-radius:var(--radius-sm);
  background:var(--fg);color:var(--bg);font-size:13px;font-weight:600;
  text-decoration:none;cursor:pointer;border:none;transition:background var(--transition);
}
.file-card-dl:hover{background:var(--accent-hover)}

/* ─── System commands ─── */
.system-cmd{max-width:720px;width:100%;margin:4px auto}
.system-cmd span{
  display:inline-block;background:var(--bg-surface);color:var(--fg-tertiary);
  font-size:13px;font-family:var(--font-mono);border:1px solid var(--border);
  border-radius:20px;padding:5px 14px;
}

/* ─── Permission banner ─── */
.perm-banner{
  position:fixed;bottom:100px;left:50%;transform:translateX(-50%);
  max-width:560px;width:calc(100% - 32px);background:var(--bg-elevated);
  border:1px solid var(--border);border-radius:var(--radius-md);
  padding:14px 18px;box-shadow:var(--shadow-lg);z-index:20;
  animation:fade-in .3s ease-out;display:flex;align-items:center;gap:12px;
}
.perm-info{flex:1;min-width:0}
.perm-title{font-size:13px;font-weight:600;margin-bottom:3px;display:flex;align-items:center;gap:6px}
.perm-value{font-size:13px;font-family:var(--font-mono);color:var(--fg-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.perm-btn{border:none;padding:8px 16px;border-radius:var(--radius-sm);font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font);transition:all var(--transition)}
.perm-btn.approve{background:#22c55e;color:#fff}
.perm-btn.approve:hover{background:#16a34a}
.perm-btn.deny{background:#ef4444;color:#fff}
.perm-btn.deny:hover{background:#dc2626}

/* ─── Config notification ─── */
.config-banner{
  position:fixed;top:70px;left:50%;transform:translateX(-50%);
  max-width:480px;width:calc(100% - 32px);background:var(--bg-elevated);
  border:1px solid rgba(250,204,21,0.2);border-radius:var(--radius-md);
  padding:12px 16px;box-shadow:var(--shadow-md);z-index:20;
  animation:fade-in .3s ease-out;display:flex;align-items:center;gap:12px;font-size:14px;
}
.config-banner button{background:none;border:none;font-size:18px;cursor:pointer;color:var(--fg-tertiary);padding:2px 6px;line-height:1}

/* ─── Drop overlay ─── */
.drop-overlay{
  position:fixed;inset:0;background:rgba(255,255,255,0.85);backdrop-filter:blur(8px);
  border:2px dashed var(--fg-quaternary);z-index:100;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:16px;color:var(--fg);font-weight:600;font-size:18px;pointer-events:none;
  border-radius:var(--radius-lg);margin:16px;
}
.drop-icon{width:56px;height:56px;color:var(--fg-tertiary)}

/* ─── User Menu ─── */
.user-menu{
  position:absolute;bottom:calc(100% + 8px);left:8px;right:8px;
  background:var(--bg-elevated);border:1px solid var(--border);border-radius:12px;
  box-shadow:var(--shadow-lg);z-index:50;
  display:none;flex-direction:column;padding:4px;
  animation:fade-in .15s ease-out;
}
.user-menu.open{display:flex}
.user-menu-email{padding:10px 12px 6px;font-size:13px;color:var(--fg-tertiary);border-bottom:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.user-menu-item{
  display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;
  cursor:pointer;color:var(--fg);font-size:14px;font-weight:400;
  border:none;background:transparent;font-family:var(--font);width:100%;text-align:left;
  transition:background var(--transition);position:relative;
}
.user-menu-item:hover,.user-menu-item.selected{background:var(--bg-hover)}
.user-menu-item svg{width:18px;height:18px;flex-shrink:0;color:var(--fg-tertiary);stroke-width:1.5}
.user-menu-item .menu-arrow{margin-left:auto;color:var(--fg-quaternary);width:14px;height:14px}
.user-menu-sep{height:1px;background:var(--border);margin:4px 8px}
.user-menu-sub{
  position:fixed;min-width:200px;
  background:var(--bg-elevated);border:1px solid var(--border);border-radius:12px;
  box-shadow:var(--shadow-lg);padding:4px;display:none;flex-direction:column;
  animation:fade-in .1s ease-out;z-index:51;
}
.user-menu-sub.open{display:flex}
.user-menu-sub .user-menu-item{font-size:14px;padding:8px 12px}
.user-menu-item .menu-check{margin-left:auto;color:var(--fg-tertiary);width:16px;height:16px;display:none}
.user-menu-item.active .menu-check{display:block}

/* ─── Scrollbar ─── */
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:var(--fg-quaternary)}
</style>
</head>
<body>
<div id="app">
  <div id="sidebar" class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-brand"><img src="/logo.png" alt="K"><span>Klaus</span></div>
      <button class="sidebar-toggle" id="sidebar-toggle" title="Toggle sidebar" data-i18n-title="toggle_sidebar">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
      </button>
    </div>
    <div class="sidebar-nav">
      <button class="sidebar-nav-item" id="new-chat-btn">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        <span data-i18n="new_chat_nav">New chat</span>
      </button>
    </div>
    <div class="sidebar-section-label" data-i18n="recents">Recents</div>
    <div class="session-list" id="session-list"></div>
    <div class="sidebar-footer" style="position:relative">
      <div id="user-menu" class="user-menu"></div>
      <div id="user-menu-lang" class="user-menu-sub"></div>
      <div class="sidebar-user" id="sidebar-user">
        <div class="sidebar-avatar" id="sidebar-avatar">U</div>
        <div class="sidebar-user-info">
          <div class="sidebar-username" id="sidebar-username"></div>
        </div>
      </div>
    </div>
  </div>
  <div id="sidebar-overlay" class="sidebar-overlay"></div>
  <div class="main-content">
    <div id="header">
      <div class="header-left">
        <button class="menu-btn" id="menu-btn">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
      <div class="header-right">
        <span id="status" data-i18n="connected">Connected</span>
      </div>
    </div>
    <div id="welcome">
      <div class="welcome-greeting" id="welcome-greeting"></div>
      <div class="welcome-sub" data-i18n="welcome_sub">How can I help you today?</div>
      <div class="welcome-chips" id="welcome-chips"></div>
    </div>
    <div id="messages"></div>
    <div id="input-wrapper">
      <div id="input-area">
        <div id="previews"></div>
        <div class="input-row">
          <button id="attach" title="Attach file" data-i18n-title="attach_file">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </button>
          <input type="file" id="file-input" multiple hidden accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.md,.json,.csv,.xml,.html,.js,.ts,.py,.go,.rs,.java,.c,.cpp,.h,.yaml,.yml,.toml,.log,.sh,.bat">
          <textarea id="input" rows="1" placeholder="Send a message..." data-i18n-placeholder="placeholder" autocomplete="off"></textarea>
          <button id="send" disabled>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
<script>
(function(){
  // --- i18n ---
  var I18N = {
    en: {
      chats: "Chats",
      new_chat: "+ New",
      new_chat_title: "New Chat",
      connected: "Connected",
      reconnecting: "Reconnecting...",
      logout: "Logout",
      placeholder: "Send a message...",
      thinking: "Thinking",
      not_connected: "Not connected",
      copy: "Copy",
      copied: "Copied!",
      copy_failed: "Failed",
      approve: "Allow",
      deny: "Deny",
      config_updated: "Config updated. Reload to apply changes.",
      file_too_large: "File too large (max 10 MB): ",
      upload_failed: "Upload failed: ",
      uploading: "Uploading... ",
      drop_files: "Drop files to upload",
      file_ready: "Ready to download",
      download: "Download",
      delete_title: "Delete",
      error: "error",
      language: "Language",
      lang_en: "English",
      lang_zh: "中文",
      welcome_morning: "Good morning",
      welcome_afternoon: "Good afternoon",
      welcome_evening: "Good evening",
      welcome_sub: "How can I help you today?",
      chip_write: "Help me write",
      chip_code: "Write code",
      chip_explain: "Explain a concept",
      chip_brainstorm: "Brainstorm ideas",
      recents: "Recents",
      new_chat_nav: "New chat",
      menu_settings: "Settings",
      menu_language: "Language",
      menu_admin: "Admin",
      menu_help: "Get help",
      menu_logout: "Log out",
      attach_file: "Attach file",
      toggle_sidebar: "Toggle sidebar",
      admin: "Admin",
      bot_name: "Klaus",
    },
    zh: {
      chats: "对话",
      new_chat: "+ 新建",
      new_chat_title: "新对话",
      connected: "已连接",
      reconnecting: "重新连接中...",
      logout: "退出",
      placeholder: "发送消息...",
      thinking: "思考中",
      not_connected: "未连接",
      copy: "复制",
      copied: "已复制!",
      copy_failed: "失败",
      approve: "允许",
      deny: "拒绝",
      config_updated: "配置已更新，请刷新页面以应用更改。",
      file_too_large: "文件过大 (最大 10 MB): ",
      upload_failed: "上传失败: ",
      uploading: "上传中... ",
      drop_files: "拖拽文件到此处上传",
      file_ready: "可下载",
      download: "下载",
      delete_title: "删除",
      error: "错误",
      language: "语言",
      lang_en: "English",
      lang_zh: "中文",
      welcome_morning: "早上好",
      welcome_afternoon: "下午好",
      welcome_evening: "晚上好",
      welcome_sub: "有什么我可以帮您的？",
      chip_write: "帮我写一段文字",
      chip_code: "帮我写代码",
      chip_explain: "解释一个概念",
      chip_brainstorm: "头脑风暴",
      recents: "最近",
      new_chat_nav: "新对话",
      menu_settings: "设置",
      menu_language: "语言",
      menu_admin: "管理面板",
      menu_help: "获取帮助",
      menu_logout: "退出登录",
      attach_file: "附加文件",
      toggle_sidebar: "切换侧边栏",
      admin: "管理",
      bot_name: "Klaus",
    }
  };
  var currentLang = localStorage.getItem("klaus_lang") || "en";
  function tt(key) { return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key; }
  function setLang(lang) {
    if (!I18N[lang]) return;
    currentLang = lang;
    localStorage.setItem("klaus_lang", lang);
    applyI18n();
  }
  function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach(function(el) {
      el.textContent = tt(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function(el) {
      el.placeholder = tt(el.getAttribute("data-i18n-placeholder"));
    });
    document.querySelectorAll("[data-i18n-title]").forEach(function(el) {
      el.title = tt(el.getAttribute("data-i18n-title"));
    });
    i18nCallbacks.forEach(function(cb) { cb(); });
  }
  var i18nCallbacks = [];

  if (typeof marked !== "undefined") {
    marked.use({ breaks: true, gfm: true, renderer: {
      html: function(token) { return escHtml(typeof token === "string" ? token : token.text); },
      image: function() { return ""; },
      link: function(token) {
        var href = (typeof token === "string" ? token : token.href) || "";
        var text = (typeof token === "string" ? "" : token.text) || href;
        if (!/^https?:\\/\\//i.test(href)) return escHtml(text);
        return '<a href="' + escAttr(href) + '" target="_blank" rel="noopener noreferrer">' + escHtml(text) + '</a>';
      }
    }});
  }

  applyI18n();

  // Auth
  fetch("/api/auth/me", { credentials: "same-origin" })
    .then(function(r) {
      if (!r.ok) { location.href = "/login"; throw new Error("not authenticated"); }
      return r.json();
    })
    .then(function(data) {
      initChat(data.user, data.user.role === "admin");
    })
    .catch(function() {});

  function initChat(currentUser, isAdmin) {

  var msgs = document.getElementById("messages");
  var input = document.getElementById("input");
  var sendBtn = document.getElementById("send");
  var statusEl = document.getElementById("status");
  var attachBtn = document.getElementById("attach");
  var fileInput = document.getElementById("file-input");
  var previewsEl = document.getElementById("previews");
  var sidebar = document.getElementById("sidebar");
  var sidebarOverlay = document.getElementById("sidebar-overlay");
  var menuBtn = document.getElementById("menu-btn");
  var newChatBtn = document.getElementById("new-chat-btn");
  var sessionListEl = document.getElementById("session-list");
  var welcomeEl = document.getElementById("welcome");
  var sidebarToggleBtn = document.getElementById("sidebar-toggle");
  var busy = false;

  // --- Sidebar collapse (desktop only) ---
  var sidebarCollapsed = localStorage.getItem("klaus_sidebar_collapsed") === "1";
  if (sidebarCollapsed) sidebar.classList.add("collapsed");
  sidebarToggleBtn.addEventListener("click", function() {
    sidebarCollapsed = !sidebarCollapsed;
    sidebar.classList.toggle("collapsed", sidebarCollapsed);
    localStorage.setItem("klaus_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
  });

  // --- User info in sidebar footer ---
  var avatarEl = document.getElementById("sidebar-avatar");
  var usernameEl = document.getElementById("sidebar-username");
  var initial = (currentUser.name || currentUser.email || "U").charAt(0).toUpperCase();
  avatarEl.textContent = initial;
  usernameEl.textContent = currentUser.name || currentUser.email || "User";

  // --- User menu ---
  var userMenuEl = document.getElementById("user-menu");
  var sidebarUserEl = document.getElementById("sidebar-user");
  var userMenuOpen = false;

  function renderUserMenu() {
    var checkSvg = '<svg class="menu-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var arrowSvg = '<svg class="menu-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>';
    userMenuEl.innerHTML =
      '<div class="user-menu-email">' + escHtml(currentUser.email || "") + '</div>' +
      '<button class="user-menu-item" id="menu-settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span>' + tt("menu_settings") + '</span></button>' +
      '<button class="user-menu-item" id="menu-language"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span>' + tt("menu_language") + '</span>' + arrowSvg + '</button>' +
      (isAdmin ? '<button class="user-menu-item" id="menu-admin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>' + tt("menu_admin") + '</span></button>' : '') +
      '<button class="user-menu-item" id="menu-help"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>' + tt("menu_help") + '</span></button>' +
      '<div class="user-menu-sep"></div>' +
      '<button class="user-menu-item" id="menu-logout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span>' + tt("menu_logout") + '</span></button>';
  }
  renderUserMenu();
  i18nCallbacks.push(renderUserMenu);

  function toggleUserMenu() {
    userMenuOpen = !userMenuOpen;
    userMenuEl.classList.toggle("open", userMenuOpen);
  }
  function closeUserMenu() {
    userMenuOpen = false;
    userMenuEl.classList.remove("open");
    var lp = document.getElementById("user-menu-lang");
    if (lp) lp.classList.remove("open");
  }

  sidebarUserEl.addEventListener("click", function(e) {
    e.stopPropagation();
    toggleUserMenu();
  });
  var langPanelEl = document.getElementById("user-menu-lang");
  var langPanelOpen = false;

  function renderLangPanel() {
    var checkSvg = '<svg class="menu-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';
    langPanelEl.innerHTML =
      '<button class="user-menu-item' + (currentLang === "en" ? " active" : "") + '" data-lang="en"><span>English</span>' + checkSvg + '</button>' +
      '<button class="user-menu-item' + (currentLang === "zh" ? " active" : "") + '" data-lang="zh"><span>中文</span>' + checkSvg + '</button>';
  }
  function toggleLangPanel(show) {
    langPanelOpen = show;
    langPanelEl.classList.toggle("open", show);
    var langItem = document.getElementById("menu-language");
    if (langItem) langItem.classList.toggle("selected", show);
    if (show) {
      renderLangPanel();
      var rect = langItem.getBoundingClientRect();
      langPanelEl.style.left = (rect.right + 8) + "px";
      langPanelEl.style.top = rect.top + "px";
    }
  }
  function closeLangPanel() { toggleLangPanel(false); }

  langPanelEl.addEventListener("click", function(e) {
    e.stopPropagation();
    var target = e.target.closest("[data-lang]");
    if (target) {
      setLang(target.getAttribute("data-lang"));
      renderLangPanel();
    }
  });

  userMenuEl.addEventListener("click", function(e) {
    e.stopPropagation();
    var item = e.target.closest(".user-menu-item");
    if (!item) return;
    if (item.id === "menu-settings") {
      closeUserMenu();
      window.location.href = "/settings";
    } else if (item.id === "menu-admin") {
      closeUserMenu();
      window.location.href = "/admin";
    } else if (item.id === "menu-language") {
      toggleLangPanel(!langPanelOpen);
    } else if (item.id === "menu-help") {
      closeUserMenu();
      window.open("https://github.com/meitianwang/klaus", "_blank");
    } else if (item.id === "menu-logout") {
      closeUserMenu();
      fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
        .finally(function() { location.href = "/login"; });
    }
  });
  document.addEventListener("click", function() { closeUserMenu(); closeLangPanel(); });

  // --- Welcome state ---
  function getGreeting() {
    var h = new Date().getHours();
    if (h < 12) return tt("welcome_morning");
    if (h < 18) return tt("welcome_afternoon");
    return tt("welcome_evening");
  }
  function renderWelcome() {
    document.getElementById("welcome-greeting").textContent = getGreeting();
    var chipsEl = document.getElementById("welcome-chips");
    chipsEl.innerHTML = "";
    var chipKeys = ["chip_write", "chip_code", "chip_explain", "chip_brainstorm"];
    chipKeys.forEach(function(key) {
      var chip = document.createElement("button");
      chip.className = "welcome-chip";
      chip.textContent = tt(key);
      chip.onclick = function() {
        input.value = chip.textContent;
        input.dispatchEvent(new Event("input"));
        input.focus();
      };
      chipsEl.appendChild(chip);
    });
  }
  function showWelcome() {
    welcomeEl.classList.remove("hidden");
    msgs.classList.remove("active");
  }
  function hideWelcome() {
    welcomeEl.classList.add("hidden");
    msgs.classList.add("active");
  }
  renderWelcome();
  i18nCallbacks.push(renderWelcome);

  // --- Session management ---
  var SP = "klaus_" + currentUser.id.slice(0, 8);
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

  i18nCallbacks.push(function() { renderSessionList(); });
  applyI18n();

  renderSessionList();

  async function loadSessionList() {
    try {
      var res = await fetch("/api/sessions", { credentials: "same-origin" });
      if (!res.ok) return;
      var data = await res.json();
      if (!data.sessions || !Array.isArray(data.sessions)) return;
      var changed = false;
      data.sessions.forEach(function(srv) {
        var idx = sessionsMeta.findIndex(function(s) { return s.id === srv.sessionId; });
        if (idx >= 0) {
          var local = sessionsMeta[idx];
          var newTitle = (local.title === "New Chat" && srv.title !== "New Chat") ? srv.title : local.title;
          var newTs = srv.updatedAt > (local.ts || 0) ? srv.updatedAt : local.ts;
          if (newTitle !== local.title || newTs !== local.ts) {
            sessionsMeta[idx] = { id: local.id, title: newTitle, ts: newTs };
            changed = true;
          }
        } else {
          sessionsMeta.push({ id: srv.sessionId, title: srv.title, ts: srv.updatedAt });
          changed = true;
        }
      });
      if (changed) {
        sessionsMeta.sort(function(a, b) { return (b.ts || 0) - (a.ts || 0); });
        saveSessionMeta();
        renderSessionList();
      }
    } catch(e) {
      console.warn("Failed to load session list:", e);
    }
  }
  loadSessionList();

  function saveSessionMeta() {
    localStorage.setItem(SP + "_s", JSON.stringify(sessionsMeta));
    localStorage.setItem(SP + "_c", currentSessionId);
  }

  function createNewChat() {
    var frag = document.createDocumentFragment();
    while (msgs.firstChild) frag.appendChild(msgs.firstChild);
    if (frag.childNodes.length) sessionDom.set(currentSessionId, frag);
    prevSessionId = currentSessionId;
    currentSessionId = crypto.randomUUID();
    sessionsMeta.unshift({ id: currentSessionId, title: "New Chat", ts: Date.now() });
    saveSessionMeta();
    busy = false; isStreaming = false; streamBuffer = ""; streamFullText = "";
    if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
    activeTools.clear(); agentContainers.clear(); toolContainer = null;
    updateBtn(); renderSessionList(); closeSidebar();
    showWelcome();
  }

  function switchSession(id) {
    if (id === currentSessionId) { closeSidebar(); return; }
    var frag = document.createDocumentFragment();
    while (msgs.firstChild) frag.appendChild(msgs.firstChild);
    if (frag.childNodes.length) sessionDom.set(currentSessionId, frag);
    prevSessionId = currentSessionId;
    currentSessionId = id;
    var saved = sessionDom.get(id);
    if (saved) {
      msgs.appendChild(saved); sessionDom.delete(id);
      hideWelcome();
    } else {
      loadHistory(id);
    }
    busy = false; isStreaming = false; streamBuffer = ""; streamFullText = "";
    if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
    activeTools.clear(); agentContainers.clear(); toolContainer = null;
    updateBtn(); saveSessionMeta(); renderSessionList(); closeSidebar(); scrollBottom();
  }

  function deleteSession(id, evt) {
    if (evt) { evt.stopPropagation(); evt.preventDefault(); }
    sessionsMeta = sessionsMeta.filter(function(s){ return s.id !== id; });
    sessionDom.delete(id);
    historyLoaded.delete(id);
    if (id === currentSessionId) {
      while (msgs.firstChild) msgs.removeChild(msgs.firstChild);
      activeTools.clear(); agentContainers.clear(); toolContainer = null;
      if (!sessionsMeta.length) { createNewChat(); return; }
      currentSessionId = sessionsMeta[0].id;
      var saved = sessionDom.get(currentSessionId);
      if (saved) { msgs.appendChild(saved); sessionDom.delete(currentSessionId); hideWelcome(); }
      else { loadHistory(currentSessionId); }
    }
    saveSessionMeta(); renderSessionList();
    fetch("/api/sessions?sessionId=" + encodeURIComponent(id), { method: "DELETE", credentials: "same-origin" }).catch(function() {});
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
      var icon = document.createElement("span");
      icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
      icon.style.cssText = "flex-shrink:0;color:var(--fg-quaternary);display:flex";
      var title = document.createElement("span");
      title.className = "s-title";
      title.textContent = (!s.title || s.title === "New Chat") ? tt("new_chat_title") : s.title;
      var del = document.createElement("button");
      del.className = "s-del";
      del.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      del.title = tt("delete_title");
      del.onclick = function(e) { deleteSession(s.id, e); };
      el.appendChild(icon);
      el.appendChild(title);
      el.appendChild(del);
      el.onclick = function() { switchSession(s.id); };
      sessionListEl.appendChild(el);
    });
  }

  function openSidebar() { sidebar.classList.add("open"); sidebarOverlay.classList.add("show"); loadSessionList(); }
  function closeSidebar() { sidebar.classList.remove("open"); sidebarOverlay.classList.remove("show"); }
  menuBtn.addEventListener("click", function() { sidebar.classList.contains("open") ? closeSidebar() : openSidebar(); });
  sidebarOverlay.addEventListener("click", closeSidebar);
  newChatBtn.addEventListener("click", createNewChat);

  var pendingFiles = [];

  input.addEventListener("input", function(){
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 200) + "px";
    updateBtn();
  });

  var ws = null;
  var reconnectAttempt = 0;
  var historyLoaded = new Set();

  async function loadHistory(sessionId) {
    if (historyLoaded.has(sessionId)) return;
    historyLoaded.add(sessionId);
    try {
      var res = await fetch("/api/history?sessionId=" + encodeURIComponent(sessionId), { credentials: "same-origin" });
      if (!res.ok) { historyLoaded.delete(sessionId); return; }
      var data = await res.json();
      if (!data.messages || !data.messages.length) {
        if (sessionId === currentSessionId) showWelcome();
        return;
      }
      if (sessionId !== currentSessionId) return;
      hideWelcome();
      data.messages.forEach(function(m) {
        appendMsg(m.role === "user" ? "user" : "assistant", m.content);
      });
    } catch(e) {
      historyLoaded.delete(sessionId);
      console.warn("Failed to load history:", e);
    }
  }

  function connectWs() {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(proto + "//" + location.host + "/api/ws");
    ws.onopen = function() {
      reconnectAttempt = 0;
      statusEl.textContent = tt("connected");
      statusEl.setAttribute("data-i18n", "connected");
      statusEl.className = "";
      if (!msgs.firstChild && !sessionDom.has(currentSessionId)) {
        loadHistory(currentSessionId);
      }
    };
    ws.onclose = function() {
      ws = null;
      statusEl.textContent = tt("reconnecting");
      statusEl.setAttribute("data-i18n", "reconnecting");
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
      if (data.type === "config_updated") { showConfigNotification(); return; }
      if (data.sessionId && data.sessionId !== currentSessionId) return;
      if (data.type === "permission") { showPermissionBanner(data.data); return; }
      if (data.type === "tool") { handleToolEvent(data.data); return; }
      if (data.type === "file") { appendFileCard(data.name, data.url); return; }
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

  attachBtn.addEventListener("click", function() { fileInput.click(); });
  fileInput.addEventListener("change", function() {
    if (fileInput.files) addFiles(Array.from(fileInput.files));
    fileInput.value = "";
  });

  function addFiles(files) {
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (f.size > 10 * 1024 * 1024) { appendErrorMsg(tt("file_too_large") + f.name); continue; }
      var entry = { file: f, objectUrl: null, uploadId: null, uploading: true };
      if (f.type.startsWith("image/")) entry.objectUrl = URL.createObjectURL(f);
      pendingFiles.push(entry);
      uploadFile(entry);
    }
    renderPreviews();
    updateBtn();
  }

  async function uploadFile(entry) {
    try {
      var res = await fetch("/api/upload?name=" + encodeURIComponent(entry.file.name), {
        method: "POST",
        headers: { "Content-Type": entry.file.type || "application/octet-stream" },
        body: entry.file
      });
      if (!res.ok) throw new Error("Upload failed");
      var data = await res.json();
      entry.uploadId = data.id;
    } catch(err) {
      appendErrorMsg(tt("upload_failed") + entry.file.name);
      var idx = pendingFiles.indexOf(entry);
      if (idx >= 0) pendingFiles.splice(idx, 1);
    }
    entry.uploading = false;
    renderPreviews();
    updateBtn();
  }

  function removeFile(idx) {
    var entry = pendingFiles[idx];
    if (entry && entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    pendingFiles.splice(idx, 1);
    renderPreviews();
    updateBtn();
  }

  function renderPreviews() {
    previewsEl.innerHTML = "";
    pendingFiles.forEach(function(entry, i) {
      var wrap = document.createElement("div");
      wrap.className = "preview-item";
      if (entry.objectUrl) {
        var img = document.createElement("img");
        img.src = entry.objectUrl;
        wrap.appendChild(img);
      } else {
        var info = document.createElement("div");
        info.className = "file-info";
        info.textContent = (entry.uploading ? tt("uploading") : "") + entry.file.name;
        wrap.appendChild(info);
      }
      var rm = document.createElement("button");
      rm.className = "remove";
      rm.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      rm.onclick = function() { removeFile(i); };
      wrap.appendChild(rm);
      previewsEl.appendChild(wrap);
    });
  }

  var dragCount = 0;
  var dropOverlay = null;
  document.addEventListener("dragenter", function(e) {
    e.preventDefault();
    dragCount++;
    if (dragCount === 1) showDropOverlay();
  });
  document.addEventListener("dragleave", function(e) {
    e.preventDefault();
    dragCount--;
    if (dragCount <= 0) { dragCount = 0; hideDropOverlay(); }
  });
  document.addEventListener("dragover", function(e) { e.preventDefault(); });
  document.addEventListener("drop", function(e) {
    e.preventDefault();
    dragCount = 0;
    hideDropOverlay();
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files));
  });
  function showDropOverlay() {
    if (dropOverlay) return;
    dropOverlay = document.createElement("div");
    dropOverlay.className = "drop-overlay";
    dropOverlay.innerHTML = '<svg class="drop-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>' + tt("drop_files");
    document.body.appendChild(dropOverlay);
  }
  function hideDropOverlay() {
    if (dropOverlay) { dropOverlay.remove(); dropOverlay = null; }
  }

  input.addEventListener("paste", function(e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var files = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        var f = items[i].getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) { e.preventDefault(); addFiles(files); }
  });

  async function send() {
    var text = input.value.trim();
    var hasFiles = pendingFiles.length > 0;
    if ((!text && !hasFiles) || busy) return;
    if (pendingFiles.some(function(e) { return e.uploading; })) return;

    hideWelcome();

    var imageUrls = pendingFiles.filter(function(e) { return e.objectUrl; }).map(function(e) { return e.objectUrl; });
    var nonImageFiles = pendingFiles.filter(function(e) { return !e.objectUrl; }).map(function(e) { return e.file.name; });

    if (isSlashCommand(text)) {
      appendSystemCmd(text);
    } else {
      appendUserMsg(text, imageUrls, nonImageFiles);
    }

    var fileIds = pendingFiles.map(function(e) { return e.uploadId; }).filter(Boolean);
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
      appendErrorMsg(tt("not_connected")); removeThinking(); busy = false; updateBtn();
    }
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault(); send();
    }
  });

  function updateBtn() {
    var uploading = pendingFiles.some(function(e) { return e.uploading; });
    var text = input.value.trim();
    var hasFiles = pendingFiles.length > 0;
    sendBtn.disabled = busy || uploading || (!text && !hasFiles);
  }

  function showThinking() {
    if (document.getElementById("thinking-container")) return;
    var el = document.createElement("div");
    el.className = "thinking-indicator";
    el.id = "thinking-container";
    el.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div><span>' + tt("thinking") + '</span>';
    msgs.appendChild(el); scrollBottom();
  }

  function removeThinking() {
    var el = document.getElementById("thinking-container");
    if (el) el.remove();
  }

  var activeTools = new Map();
  var agentContainers = new Map();
  var toolContainer = null;

  var toolIcons = {
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
    var thinking = document.getElementById("thinking-container");
    if (thinking) {
      msgs.insertBefore(toolContainer, thinking);
    } else {
      msgs.appendChild(toolContainer);
    }
    return toolContainer;
  }

  function clearToolContainer() {
    var tc = document.getElementById("active-tools");
    if (tc) tc.remove();
    toolContainer = null;
    activeTools.clear();
    agentContainers.clear();
  }

  function createAgentContainer(te, parentContainer) {
    var agentWrap = document.createElement("div");
    agentWrap.className = "agent-container";
    var header = document.createElement("div");
    header.className = "agent-header";
    var iconHtml = toolIcons.agent || "";
    header.innerHTML = '<span class="agent-toggle">&#9660;</span>' + iconHtml
      + '<span class="tool-label">' + escHtml(te.display.label) + '</span>'
      + (te.display.value ? '<span class="tool-value">' + escHtml(te.display.value) + '</span>' : '')
      + '<span class="tool-dot"></span>';
    header.onclick = function() {
      var toggle = header.querySelector(".agent-toggle");
      var children = agentWrap.querySelector(".agent-children");
      if (!toggle || !children) return;
      if (children.classList.contains("collapsed")) {
        children.classList.remove("collapsed");
        toggle.classList.remove("collapsed");
      } else {
        children.classList.add("collapsed");
        toggle.classList.add("collapsed");
      }
    };
    var childrenEl = document.createElement("div");
    childrenEl.className = "agent-children";
    agentWrap.appendChild(header);
    agentWrap.appendChild(childrenEl);
    parentContainer.appendChild(agentWrap);
    agentContainers.set(te.toolUseId, { container: agentWrap, childrenEl: childrenEl, headerEl: header });
    activeTools.set(te.toolUseId, { element: header, toolName: te.toolName, isAgent: true });
    scrollBottom();
  }

  function createToolItem(te, parentContainer) {
    var el = document.createElement("div");
    el.className = "tool-item " + (te.display.style || "default");
    el.id = "tool-" + te.toolUseId;
    var iconKey = Object.prototype.hasOwnProperty.call(toolIcons, te.display.icon) ? te.display.icon : "tool";
    var html = toolIcons[iconKey];
    html += '<span class="tool-label">' + escHtml(te.display.label) + '</span>';
    if (te.display.value) {
      var cls = te.display.style === "terminal" ? "tool-value terminal-cmd" : "tool-value";
      var prefix = te.display.style === "terminal" ? "$ " : "";
      html += '<span class="' + cls + '">' + prefix + escHtml(te.display.value) + '</span>';
    }
    if (te.display.secondary) {
      html += '<span class="tool-secondary">' + escHtml(te.display.secondary) + '</span>';
    }
    html += '<span class="tool-dot"></span>';
    el.innerHTML = html;
    parentContainer.appendChild(el);
    activeTools.set(te.toolUseId, { element: el, toolName: te.toolName });
    scrollBottom();
  }

  function handleToolResult(te) {
    var tracked = activeTools.get(te.toolUseId);
    if (!tracked) return;
    var dot = tracked.element.querySelector(".tool-dot");
    if (dot) dot.remove();
    if (te.isError) {
      tracked.element.classList.add("error");
      var errSpan = document.createElement("span");
      errSpan.className = "tool-secondary";
      errSpan.style.color = "#dc2626";
      errSpan.textContent = tt("error");
      tracked.element.appendChild(errSpan);
    } else {
      tracked.element.classList.add("done");
    }
    if (tracked.isAgent) {
      var agentInfo = agentContainers.get(te.toolUseId);
      if (agentInfo) agentInfo.container.classList.add("done");
    }
    activeTools.delete(te.toolUseId);
  }

  function handleToolEvent(te) {
    if (!te) return;
    if (te.type === "tool_start") {
      var parentContainer = (te.parentToolUseId && agentContainers.has(te.parentToolUseId))
        ? agentContainers.get(te.parentToolUseId).childrenEl
        : getOrCreateToolContainer();
      if (te.toolName === "Agent") { createAgentContainer(te, parentContainer); }
      else { createToolItem(te, parentContainer); }
    }
    if (te.type === "tool_result") { handleToolResult(te); }
  }

  var streamBuffer = "";
  var streamFullText = "";
  var streamTimer = null;
  var isStreaming = false;

  function handleStreamChunk(chunk) {
    if (!isStreaming) {
      removeThinking();
      clearToolContainer();
      createStreamingMessage();
      isStreaming = true;
    }
    streamBuffer += chunk;
    streamFullText += chunk;
    if (!streamTimer) {
      streamTimer = setTimeout(flushStreamBuffer, 100);
    }
  }

  function flushStreamBuffer() {
    streamTimer = null;
    if (!streamBuffer) return;
    streamBuffer = "";
    var el = document.getElementById("streaming-msg");
    if (!el) return;
    var msgEl = el.querySelector(".msg");
    if (!msgEl) return;
    var rendered = renderMd(streamFullText);
    msgEl.innerHTML = rendered + '<span class="cursor"></span>';
    scrollBottom();
  }

  function createStreamingMessage() {
    hideWelcome();
    var wrap = document.createElement("div");
    wrap.className = "msg-group assistant";
    wrap.id = "streaming-msg";
    wrap.innerHTML = '<div class="msg-label">' + escHtml(tt("bot_name")) + '</div><div class="msg assistant streaming"><span class="cursor"></span></div>';
    msgs.appendChild(wrap);
    scrollBottom();
  }

  function finalizeStreamingMessage(fullText) {
    if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
    if (streamBuffer) { flushStreamBuffer(); }
    streamBuffer = "";
    streamFullText = "";
    isStreaming = false;
    var el = document.getElementById("streaming-msg");
    if (el) {
      if (fullText) {
        var msgEl = el.querySelector(".msg");
        if (msgEl) { msgEl.className = "msg assistant"; msgEl.innerHTML = renderMd(fullText); postProcessMsg(msgEl); }
      } else {
        var cursor = el.querySelector(".cursor");
        if (cursor) cursor.remove();
        var msgEl2 = el.querySelector(".msg");
        if (msgEl2) msgEl2.classList.remove("streaming");
      }
      el.removeAttribute("id");
    }
    scrollBottom();
  }

  function appendUserMsg(text, imageUrls, nonImageFiles) {
    hideWelcome();
    var wrap = document.createElement("div");
    wrap.className = "msg-group user";

    var el = document.createElement("div");
    el.className = "msg user";

    var html = "";
    if (imageUrls.length) {
      html += imageUrls.map(function(u) { return '<img src="' + escAttr(u) + '">'; }).join("");
    }
    if (nonImageFiles.length) {
      html += nonImageFiles.map(function(n) { return '<span class="file-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>' + escHtml(n) + '</span>'; }).join(" ");
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

  var fileBadgeSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>';
  var imageBadgeSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';

  function renderUserHistory(text) {
    var badges = [];
    var clean = text.replace(/\\[文件: (.+?)\\]/g, function(_, name) {
      badges.push('<span class="file-badge">' + fileBadgeSvg + ' ' + escHtml(name) + '</span>');
      return "";
    });
    clean = clean.replace(/\\[图片: (.+?)\\]/g, function(_, name) {
      badges.push('<span class="file-badge">' + imageBadgeSvg + ' ' + escHtml(name) + '</span>');
      return "";
    });
    clean = clean.replace(/\\[图片\\]/g, function() {
      badges.push('<span class="file-badge">' + imageBadgeSvg + ' 图片</span>');
      return "";
    });
    clean = clean.replace(/\\[语音: "(.+?)"\\]/g, function(_, transcript) {
      badges.push('<span class="file-badge">🎤 ' + escHtml(transcript) + '</span>');
      return "";
    });
    clean = clean.replace(/\\[语音消息\\]/g, function() {
      badges.push('<span class="file-badge">🎤 语音消息</span>');
      return "";
    });
    clean = clean.replace(/\\[视频\\]/g, function() {
      badges.push('<span class="file-badge">🎬 视频</span>');
      return "";
    });
    clean = clean.trim();
    var html = badges.join(" ");
    if (clean) {
      if (html) html += "<br>";
      html += escHtml(clean);
    }
    return html;
  }

  function appendMsg(role, text) {
    hideWelcome();
    var wrap = document.createElement("div");
    wrap.className = "msg-group " + role;

    if (role === "assistant") {
      var label = document.createElement("div");
      label.className = "msg-label";
      label.textContent = tt("bot_name");
      wrap.appendChild(label);
    }

    var el = document.createElement("div");
    el.className = "msg " + role;
    if (role === "user") {
      el.innerHTML = renderUserHistory(text);
    } else {
      el.innerHTML = renderMd(text);
      postProcessMsg(el);
    }

    wrap.appendChild(el);
    msgs.appendChild(wrap);
    scrollBottom();
  }

  function appendErrorMsg(text) {
    hideWelcome();
    var el = document.createElement("div");
    el.className = "msg error";
    el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' + escHtml(text);
    msgs.appendChild(el); scrollBottom();
  }

  var FILE_EXT_LABELS = { pdf: "PDF", json: "JSON", zip: "ZIP", gz: "GZ", txt: "TXT", csv: "CSV", md: "MD", html: "HTML", png: "PNG", jpg: "JPG", jpeg: "JPG", gif: "GIF", webp: "WEBP", svg: "SVG", mp3: "MP3", wav: "WAV", mp4: "MP4", webm: "WEBM", py: "PY", ts: "TS", js: "JS", sh: "SH" };
  function appendFileCard(name, url) {
    hideWelcome();
    var ext = (name.split(".").pop() || "").toLowerCase();
    var label = FILE_EXT_LABELS[ext] || ext.toUpperCase() || "FILE";
    var wrap = document.createElement("div");
    wrap.className = "msg-group assistant";
    var nameLabel = document.createElement("div");
    nameLabel.className = "msg-label";
    nameLabel.textContent = tt("bot_name");
    wrap.appendChild(nameLabel);
    var card = document.createElement("div");
    card.className = "file-card";
    card.innerHTML = '<div class="file-card-icon">' + escHtml(label) + '</div>'
      + '<div class="file-card-info"><div class="file-card-name">' + escHtml(name) + '</div>'
      + '<div class="file-card-hint">' + tt("file_ready") + '</div></div>'
      + '<a class="file-card-dl" href="' + escHtml(url) + '" download="' + escHtml(name) + '">' + tt("download") + '</a>';
    wrap.appendChild(card);
    msgs.appendChild(wrap);
    scrollBottom();
  }

  var SLASH_COMMANDS = ["/new", "/reset", "/clear", "/help", "/session"];
  function isSlashCommand(text) {
    var lower = text.toLowerCase();
    return SLASH_COMMANDS.some(function(cmd) { return lower === cmd || lower.startsWith(cmd + " "); });
  }
  function appendSystemCmd(text) {
    hideWelcome();
    var el = document.createElement("div");
    el.className = "system-cmd";
    el.innerHTML = "<span>" + escHtml(text) + "</span>";
    msgs.appendChild(el); scrollBottom();
  }

  function showConfigNotification() {
    if (document.getElementById("config-banner")) return;
    var banner = document.createElement("div");
    banner.className = "config-banner";
    banner.id = "config-banner";
    banner.innerHTML = '<span style="font-size:16px">&#9888;&#65039;</span><span style="flex:1">' + tt("config_updated") + '</span>';
    var btn = document.createElement("button");
    btn.textContent = "\\u00d7";
    btn.onclick = function() { banner.remove(); };
    banner.appendChild(btn);
    document.body.appendChild(banner);
    setTimeout(function() { var el = document.getElementById("config-banner"); if (el) el.remove(); }, 15000);
  }

  function scrollBottom() { msgs.scrollTop = msgs.scrollHeight; }

  function escHtml(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function escAttr(s) { return s.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  function renderMd(text) {
    if (typeof marked !== "undefined") {
      var html = marked.parse(text);
      var tmp = document.createElement("div");
      tmp.innerHTML = html;
      var SAFE = {P:1,BR:1,STRONG:1,EM:1,CODE:1,PRE:1,OL:1,UL:1,LI:1,BLOCKQUOTE:1,H1:1,H2:1,H3:1,H4:1,A:1,TABLE:1,THEAD:1,TBODY:1,TR:1,TH:1,TD:1,DEL:1,HR:1};
      (function sanitize(parent) {
        var i = parent.childNodes.length;
        while (i--) {
          var node = parent.childNodes[i];
          if (node.nodeType === 1) {
            if (!SAFE[node.tagName]) {
              var span = document.createTextNode(node.textContent || "");
              parent.replaceChild(span, node);
            } else {
              var attrs = node.attributes;
              for (var j = attrs.length - 1; j >= 0; j--) {
                var name = attrs[j].name;
                if (node.tagName === "A" && (name === "href" || name === "target" || name === "rel")) continue;
                node.removeAttribute(name);
              }
              sanitize(node);
            }
          }
        }
      })(tmp);
      return tmp.innerHTML;
    }
    text = escHtml(text);
    text = text.replace(/\\\`\\\`\\\`(\\w*)?\\n([\\s\\S]*?)\\\`\\\`\\\`/g, function(_,lang,code) {
      return "<pre><code>" + code.replace(/\\n$/,"") + "</code></pre>";
    });
    text = text.replace(/\\\`([^\\\`]+)\\\`/g, function(_,c) { return "<code>"+c+"</code>"; });
    text = text.replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");
    text = text.replace(/(?:^|[^*])\\*([^*]+)\\*(?:[^*]|$)/g, function(m,c) {
      return m.replace("*"+c+"*", "<em>"+c+"</em>");
    });
    text = text.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)]+)\\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    var parts = text.split(/(<pre>[\\s\\S]*?<\\/pre>)/g);
    return parts.map(function(p,i) { return i%2===0 ? p.replace(/\\n/g,"<br>") : p; }).join("");
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
    approveBtn.textContent = tt("approve");
    approveBtn.onclick = function() { respondPermission(req.requestId, true); };
    var denyBtn = document.createElement("button");
    denyBtn.className = "perm-btn deny";
    denyBtn.textContent = tt("deny");
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
      btn.textContent = tt("copy");
      btn.onclick = function() {
        navigator.clipboard.writeText(block.textContent).then(function() {
          btn.textContent = tt("copied");
          setTimeout(function() { btn.textContent = tt("copy"); }, 2000);
        }).catch(function() { btn.textContent = tt("copy_failed"); setTimeout(function() { btn.textContent = tt("copy"); }, 2000); });
      };
      wrapper.appendChild(btn);
    });
    container.querySelectorAll("a").forEach(function(a) {
      if (!a.getAttribute("target")) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
    });
  }


  } // end initChat
})();
<\/script>
</body>
</html>`;
}
