/**
 * Admin panel HTML template with vertical tab navigation.
 *
 * Tabs:
 *  - Settings: general, web, session, transcripts, cron global
 *  - Users: user stats → sessions → conversation history (drill-down)
 *  - Invites: invite code CRUD
 *  - Cron: task list with CRUD + scheduler status
 */

export function getAdminHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Klaus Admin</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg: #ffffff; --fg: #0f172a; --border: #e2e8f0;
  --card-bg: #f8fafc; --accent: #020617; --accent-text: #ffffff;
  --accent-hover: #334155; --danger: #dc2626; --danger-hover: #b91c1c;
  --success: #16a34a; --muted: #64748b; --user-bg: #f1f5f9; --bot-bg: #ffffff;
  --bg-hover: #f1f5f9;
  --font-main: 'Plus Jakarta Sans', -apple-system, sans-serif;
  --font-mono: 'SF Mono', 'Consolas', 'Monaco', monospace;
}
@media(prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a; --fg: #f8fafc; --border: #334155;
    --card-bg: #1e293b; --accent: #f8fafc; --accent-text: #0f172a;
    --accent-hover: #e2e8f0; --danger: #ef4444; --danger-hover: #dc2626;
    --success: #22c55e; --muted: #94a3b8; --user-bg: #1e293b; --bot-bg: #0f172a;
    --bg-hover: #334155;
  }
}
html, body { height: 100%; font-family: var(--font-main); background: var(--bg); color: var(--fg); -webkit-font-smoothing: antialiased; }
#app { display: flex; max-width: 960px; margin: 0 auto; min-height: 100vh; padding: 48px 24px; }

/* Sidebar nav */
#sidebar {
  width: 200px; min-width: 200px; padding-right: 32px;
  position: sticky; top: 48px; align-self: flex-start;
}
.sidebar-brand {
  font-size: 24px; font-weight: 600; margin-bottom: 20px;
}
.sidebar-brand img { display: none; }
.sidebar-nav { display: flex; flex-direction: column; gap: 2px; }
.nav-item {
  display: block; width: 100%; padding: 8px 12px; border-radius: 8px;
  font-size: 14px; font-weight: 500; color: var(--muted);
  cursor: pointer; transition: all 0.15s; text-decoration: none;
  border: none; background: none; text-align: left; font-family: var(--font-main);
}
.nav-item:hover { background: var(--bg-hover); color: var(--fg); }
.nav-item.active { background: var(--bg-hover); color: var(--fg); font-weight: 600; }
.nav-item svg { display: none; }
.sidebar-footer {
  margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--border);
}
.sidebar-footer a {
  font-size: 13px; color: var(--muted); text-decoration: none;
  display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px;
  transition: all 0.15s;
}
.sidebar-footer a:hover { color: var(--fg); background: var(--bg-hover); }

/* Content area */
#content { flex: 1; overflow-y: visible; min-width: 0; }
#content-inner { max-width: 720px; }
@media(max-width: 900px) { #app { padding: 24px 16px; } }

.nav-back {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 14px; color: var(--muted); text-decoration: none;
  margin-bottom: 24px; padding: 4px 0; transition: color 0.15s;
}
.nav-back:hover { color: var(--fg); }
.nav-back svg { width: 16px; height: 16px; }
.page-title { display: none; }

/* Section cards */
.section { margin-bottom: 32px; }
.section-header {
  font-size: 18px; font-weight: 600; margin-bottom: 16px; padding-bottom: 12px;
  border-bottom: 1px solid var(--border); color: var(--fg);
  text-transform: none; letter-spacing: 0;
}
.card {
  background: var(--card-bg); border: 1px solid var(--border);
  border-radius: 10px; overflow: hidden;
}
.card-row {
  display: flex; align-items: flex-start; gap: 16px;
  padding: 14px 20px; border-bottom: 1px solid var(--border);
}
.card-row:last-child { border-bottom: none; }
.card-label { font-size: 14px; font-weight: 500; min-width: 160px; padding-top: 7px; }
.card-hint { font-size: 12px; color: var(--muted); margin-top: 2px; font-weight: 400; }
.card-control { flex: 1; }
.card-footer { display: flex; align-items: center; gap: 10px; padding: 12px 20px; justify-content: flex-end; }

/* Form elements */
.f-select {
  width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px;
  font-size: 14px; font-family: var(--font-main); background: var(--bg); color: var(--fg); outline: none;
}
.f-select:focus { border-color: var(--accent); }
.f-input {
  width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px;
  font-size: 14px; font-family: var(--font-main); background: var(--bg); color: var(--fg); outline: none;
}
.f-input:focus { border-color: var(--accent); }
.f-input-sm { width: 100px; }
.f-textarea {
  width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px;
  font-size: 14px; font-family: var(--font-main); background: var(--bg); color: var(--fg); outline: none; resize: vertical;
}
.f-textarea:focus { border-color: var(--accent); }

/* Toggle */
.toggle-wrap { display: flex; align-items: center; gap: 10px; padding-top: 4px; }
.toggle { position: relative; width: 44px; height: 24px; cursor: pointer; }
.toggle input { display: none; }
.toggle-track { position: absolute; inset: 0; background: var(--border); border-radius: 12px; transition: background 0.2s; }
.toggle input:checked + .toggle-track { background: var(--success); }
.toggle-thumb { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.toggle input:checked ~ .toggle-thumb { transform: translateX(20px); }
.toggle-status { font-size: 13px; color: var(--muted); }

/* Buttons */
.btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; font-family: var(--font-main); transition: all 0.15s; }
.btn-primary { background: var(--accent); color: var(--accent-text); }
.btn-primary:hover { background: var(--accent-hover); }
.btn-sm { padding: 6px 12px; font-size: 13px; }
.btn-copy { background: var(--card-bg); color: var(--fg); border: 1px solid var(--border); }
.btn-copy:hover { background: var(--border); }
.btn-danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); }
.btn-danger:hover { background: var(--danger); color: white; }
.btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
.btn-ghost:hover { color: var(--fg); background: var(--card-bg); }
.save-status { font-size: 13px; color: var(--success); opacity: 0; transition: opacity 0.3s; }

/* Table */
table { width: 100%; border-collapse: collapse; }
th { text-align: left; padding: 10px 12px; font-size: 12px; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border); }
td { padding: 12px; border-bottom: 1px solid var(--border); font-size: 14px; vertical-align: middle; }
tr.clickable { cursor: pointer; }
tr.clickable:hover { background: var(--card-bg); }
.code-text { font-family: var(--font-mono); font-size: 13px; background: var(--card-bg); padding: 3px 8px; border-radius: 4px; }
.stat { font-family: var(--font-mono); font-size: 13px; }
.stat-muted { color: var(--muted); font-size: 13px; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.empty { text-align: center; padding: 48px 24px; color: var(--muted); font-size: 14px; }

/* Stats grid */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; cursor: pointer; transition: border-color 0.15s; }
.stat-card:hover { border-color: var(--accent); }
.stat-card .stat-label { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
.stat-card .stat-value { font-size: 20px; font-weight: 600; }
.stat-card .stat-detail { font-size: 12px; color: var(--muted); margin-top: 4px; }

/* Create row */
.create-row { display: flex; gap: 10px; margin-bottom: 20px; }
.create-row input { flex: 1; }

/* Breadcrumb */
.breadcrumb { font-size: 13px; color: var(--muted); margin-bottom: 16px; }
.breadcrumb a { color: var(--muted); text-decoration: none; }
.breadcrumb a:hover { color: var(--fg); }

/* Chat history */
.chat-wrap { border: 1px solid var(--border); border-radius: 10px; max-height: 65vh; overflow-y: auto; padding: 16px; background: var(--card-bg); }
.chat-msg { margin-bottom: 12px; padding: 10px 14px; border-radius: 10px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.chat-msg.user { background: var(--user-bg); margin-left: 40px; }
.chat-msg.assistant { background: var(--bot-bg); border: 1px solid var(--border); margin-right: 40px; }
.chat-role { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; letter-spacing: 0.5px; }

/* Badge */
.badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
.badge-green { background: #dcfce7; color: #166534; }
.badge-red { background: #fee2e2; color: #991b1b; }
.badge-gray { background: var(--card-bg); color: var(--muted); border: 1px solid var(--border); }
@media(prefers-color-scheme: dark) {
  .badge-green { background: #14532d; color: #86efac; }
  .badge-red { background: #450a0a; color: #fca5a5; }
}

/* Scheduler status bar */
.scheduler-bar { display: flex; align-items: center; gap: 16px; padding: 12px 16px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 20px; font-size: 13px; color: var(--muted); flex-wrap: wrap; }
.scheduler-bar .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot-green { background: var(--success); }
.dot-red { background: var(--danger); }

/* Cron task form (inline modal) */
.task-form { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.task-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
.task-form-full { grid-column: 1 / -1; }
.task-form label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; color: var(--muted); }

/* Tab panels & sub-views */
.tab-panel { display: none; }
.tab-panel.active { display: block; }
.sub-view { display: none; }
.sub-view.active { display: block; }

/* Toast */
.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--fg); color: var(--bg); padding: 10px 20px; border-radius: 8px; font-size: 14px; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 100; }
.toast.show { opacity: 1; }

/* Mobile */
@media(max-width: 640px) {
  #app { flex-direction: column; padding: 24px 16px; }
  #sidebar { width: 100%; min-width: 0; padding-right: 0; position: static; margin-bottom: 24px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .sidebar-brand { margin-bottom: 0; margin-right: auto; font-size: 20px; }
  .sidebar-nav { flex-direction: row; flex-wrap: wrap; gap: 4px; }
  .sidebar-footer { display: none; }
  .nav-item svg { width: 20px; height: 20px; }
  #content { padding: 20px 16px; }
  .task-form-grid { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<div id="app">
  <nav id="sidebar">
    <div class="sidebar-brand" data-i18n="admin_title">Admin</div>
    <div class="sidebar-nav">
      <button class="nav-item active" data-tab="settings">
        <span data-i18n="tab_settings">Settings</span>
      </button>
      <button class="nav-item" data-tab="claude">
        <span data-i18n="tab_claude">Model Config</span>
      </button>
      <button class="nav-item" data-tab="users">
        <span data-i18n="tab_users">Users</span>
      </button>
      <button class="nav-item" data-tab="invites">
        <span data-i18n="tab_invites">Invites</span>
      </button>
      <button class="nav-item" data-tab="cron">
        <span data-i18n="tab_cron">Cron</span>
      </button>
    </div>
    <div class="sidebar-footer">
      <a href="/">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        <span data-i18n="back_chat">Back to Chat</span>
      </a>
    </div>
  </nav>

  <main id="content"><div id="content-inner">
    <a href="/" class="nav-back">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      <span data-i18n="back_klaus">Back to Klaus</span>
    </a>

    <!-- ============ Settings Tab ============ -->
    <div id="tab-settings" class="tab-panel active">
      <h1 class="page-title" data-i18n="tab_settings">Settings</h1>

      <!-- General -->
      <div class="section">
        <div class="section-header" data-i18n="sec_general">General</div>
        <div class="card">
          <div class="card-row">
            <div class="card-label">
              <div data-i18n="lbl_persona">System Prompt</div>
            </div>
            <div class="card-control">
              <textarea id="s-persona" class="f-textarea" rows="3" placeholder="Optional persona / system prompt"></textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- Web -->
      <div class="section">
        <div class="section-header" data-i18n="sec_web">Web Server</div>
        <div class="card">
          <div class="card-row">
            <div class="card-label">
              <div data-i18n="lbl_port">Port</div>
              <div class="card-hint" data-i18n="hint_restart">Restart required</div>
            </div>
            <div class="card-control"><input id="s-port" type="number" class="f-input f-input-sm" min="1" max="65535"></div>
          </div>
          <div class="card-row">
            <div class="card-label">
              <div data-i18n="lbl_permissions">Tool Permissions</div>
              <div class="card-hint" data-i18n="hint_permissions">Require user approval for write operations</div>
            </div>
            <div class="card-control">
              <div class="toggle-wrap">
                <label class="toggle"><input type="checkbox" id="s-permissions"><div class="toggle-track"></div><div class="toggle-thumb"></div></label>
                <span class="toggle-status" id="s-permissions-label"></span>
              </div>
            </div>
          </div>
          <div class="card-row">
            <div class="card-label">
              <div data-i18n="lbl_auth_expire">Auth Session Expiry</div>
              <div class="card-hint" data-i18n="hint_auth_expire">Days before login sessions expire</div>
            </div>
            <div class="card-control">
              <div style="display:flex;align-items:center;gap:8px">
                <input id="s-web-session-age" type="number" class="f-input f-input-sm" min="1">
                <span class="stat-muted" data-i18n="unit_days">days</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Session -->
      <div class="section">
        <div class="section-header" data-i18n="sec_session">Chat Sessions</div>
        <div class="card">
          <div class="card-row">
            <div class="card-label">
              <div data-i18n="lbl_idle">Idle Timeout</div>
              <div class="card-hint" data-i18n="hint_idle">New session after inactivity</div>
            </div>
            <div class="card-control">
              <div style="display:flex;align-items:center;gap:8px">
                <input id="s-ses-idle" type="number" class="f-input f-input-sm" min="1">
                <span class="stat-muted" data-i18n="unit_minutes">min</span>
              </div>
            </div>
          </div>
          <div class="card-row">
            <div class="card-label" data-i18n="lbl_max_sessions">Max Stored Sessions</div>
            <div class="card-control"><input id="s-ses-max" type="number" class="f-input f-input-sm" min="1"></div>
          </div>
          <div class="card-row">
            <div class="card-label">
              <div data-i18n="lbl_ses_age">Session Retention</div>
            </div>
            <div class="card-control">
              <div style="display:flex;align-items:center;gap:8px">
                <input id="s-ses-age" type="number" class="f-input f-input-sm" min="1">
                <span class="stat-muted" data-i18n="unit_days">days</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Transcripts -->
      <div class="section">
        <div class="section-header" data-i18n="sec_transcripts">Transcripts</div>
        <div class="card">
          <div class="card-row">
            <div class="card-label" data-i18n="lbl_tx_max_files">Max Files</div>
            <div class="card-control"><input id="s-tx-files" type="number" class="f-input f-input-sm" min="1"></div>
          </div>
          <div class="card-row">
            <div class="card-label">
              <div data-i18n="lbl_tx_age">Retention</div>
            </div>
            <div class="card-control">
              <div style="display:flex;align-items:center;gap:8px">
                <input id="s-tx-age" type="number" class="f-input f-input-sm" min="1">
                <span class="stat-muted" data-i18n="unit_days">days</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Save button -->
      <div style="display:flex;align-items:center;gap:10px;justify-content:flex-end;margin-top:4px">
        <span class="save-status" id="settings-status"></span>
        <button class="btn btn-primary" id="save-settings-btn" data-i18n="btn_save">Save</button>
      </div>
    </div>

    <!-- ============ Claude Model Config Tab ============ -->
    <div id="tab-claude" class="tab-panel">
      <h1 class="page-title" data-i18n="tab_claude">Model Config</h1>

      <!-- Auth Status -->
      <div class="section">
        <div class="section-header" data-i18n="sec_auth">Authentication</div>
        <div class="card">
          <div class="card-row">
            <span class="card-label" data-i18n="lbl_auth_status">Status</span>
            <span class="card-control" id="claude-auth-status">—</span>
          </div>
          <div class="card-row" id="claude-login-row" style="display:none">
            <span class="card-label"></span>
            <span class="card-control"><button class="btn btn-primary btn-sm" id="claude-login-btn" data-i18n="btn_login">Login</button></span>
          </div>
        </div>
      </div>

      <!-- Mode -->
      <div class="section">
        <div class="section-header" data-i18n="sec_mode">Mode</div>
        <div class="card">
          <div class="card-row">
            <span class="card-label" data-i18n="lbl_mode">Mode</span>
            <span class="card-control">
              <select class="f-select" id="claude-mode">
                <option value="official">Official Subscription</option>
                <option value="thirdparty">Third-party API</option>
              </select>
            </span>
          </div>
          <div class="card-row">
            <span class="card-label" data-i18n="lbl_default_model">Default Model</span>
            <span class="card-control">
              <select class="f-select" id="claude-model">
                <option value="opus">opus</option>
                <option value="sonnet">sonnet</option>
                <option value="haiku">haiku</option>
              </select>
            </span>
          </div>
        </div>
      </div>

      <!-- Third-party settings -->
      <div class="section" id="claude-thirdparty-section" style="display:none">
        <div class="section-header" data-i18n="sec_thirdparty">Third-party API</div>
        <div class="card">
          <div class="card-row">
            <span class="card-label" data-i18n="lbl_base_url">API Base URL</span>
            <span class="card-control"><input class="f-input" id="claude-base-url" placeholder="http://localhost:9000" /></span>
          </div>
          <div class="card-row">
            <span class="card-label" data-i18n="lbl_auth_token">Auth Token</span>
            <span class="card-control"><input class="f-input" id="claude-auth-token" type="password" placeholder="sk-..." /></span>
          </div>
        </div>
        <div class="section-header" data-i18n="sec_model_map">Model Mapping</div>
        <div class="card">
          <div class="card-row">
            <span class="card-label">haiku →</span>
            <span class="card-control"><input class="f-input" id="claude-map-haiku" placeholder="claude-haiku-4-5-20251001" /></span>
          </div>
          <div class="card-row">
            <span class="card-label">sonnet →</span>
            <span class="card-control"><input class="f-input" id="claude-map-sonnet" placeholder="claude-sonnet-4-6" /></span>
          </div>
          <div class="card-row">
            <span class="card-label">opus →</span>
            <span class="card-control"><input class="f-input" id="claude-map-opus" placeholder="claude-opus-4-6" /></span>
          </div>
          <div class="card-row">
            <span class="card-label" data-i18n="lbl_api_timeout">API Timeout (ms)</span>
            <span class="card-control"><input class="f-input" id="claude-api-timeout" type="number" placeholder="3000000" /></span>
          </div>
        </div>
      </div>

      <button class="btn btn-primary" id="claude-save-btn" data-i18n="btn_save">Save</button>
      <span id="claude-save-status" style="margin-left:12px;color:var(--color-success)"></span>
    </div>

    <!-- ============ Users Tab ============ -->
    <div id="tab-users" class="tab-panel">
      <div id="users-list" class="sub-view active">
        <h1 class="page-title" data-i18n="tab_users">Users</h1>
        <div id="admin-stats" class="stats-grid"></div>
      </div>
      <div id="users-sessions" class="sub-view">
        <div class="breadcrumb"><a href="#" id="bc-users" data-i18n="tab_users">Users</a> &rsaquo; <span id="bc-username"></span></div>
        <h1 class="page-title" id="sessions-title"></h1>
        <div id="sessions-wrap"></div>
      </div>
      <div id="users-history" class="sub-view">
        <div class="breadcrumb">
          <a href="#" id="bc-users2" data-i18n="tab_users">Users</a> &rsaquo;
          <a href="#" id="bc-sessions-back"></a> &rsaquo;
          <span id="bc-session-name"></span>
        </div>
        <h1 class="page-title" id="history-title"></h1>
        <div id="history-wrap" class="chat-wrap"></div>
      </div>
    </div>

    <!-- ============ Invites Tab ============ -->
    <div id="tab-invites" class="tab-panel">
      <h1 class="page-title" data-i18n="tab_invites">Invite Codes</h1>
      <div class="create-row">
        <input id="label-input" class="f-input" placeholder="Label (optional)" maxlength="100">
        <button class="btn btn-primary" id="create-btn" data-i18n="btn_create">Create</button>
      </div>
      <div id="invites-table-wrap"></div>
      <div id="invites-empty" class="empty" style="display:none" data-i18n="no_invites">No invite codes yet.</div>
    </div>

    <!-- ============ Cron Tab ============ -->
    <div id="tab-cron" class="tab-panel">
      <h1 class="page-title" data-i18n="tab_cron">Scheduled Tasks</h1>
      <div id="cron-scheduler-bar" class="scheduler-bar"></div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
        <button class="btn btn-primary btn-sm" id="cron-add-btn" data-i18n="btn_add_task">+ Add Task</button>
      </div>
      <div id="cron-task-form" class="task-form" style="display:none">
        <div class="task-form-grid">
          <div><label data-i18n="lbl_task_id">Task ID</label><input id="cf-id" class="f-input" placeholder="e.g. daily-summary"></div>
          <div><label data-i18n="lbl_task_name">Name</label><input id="cf-name" class="f-input" placeholder="Optional display name"></div>
          <div><label data-i18n="lbl_task_schedule">Schedule</label><input id="cf-schedule" class="f-input" placeholder="e.g. 0 9 * * *"></div>
          <div class="task-form-full"><label data-i18n="lbl_task_prompt">Prompt</label><textarea id="cf-prompt" class="f-textarea" rows="3" placeholder="Prompt to send to Claude"></textarea></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" id="cf-cancel" data-i18n="btn_cancel">Cancel</button>
          <button class="btn btn-primary btn-sm" id="cf-save" data-i18n="btn_save">Save</button>
        </div>
      </div>
      <div id="cron-tasks-wrap"></div>
      <div id="cron-empty" class="empty" style="display:none" data-i18n="no_tasks">No scheduled tasks.</div>
    </div>

  </div></main>
</div>
<div class="toast" id="toast"></div>

<script>
(function(){
  fetch("/api/auth/me", { credentials: "same-origin" })
    .then(function(r) {
      if (!r.ok) { location.href = "/login"; throw new Error("not auth"); }
      return r.json();
    })
    .then(function(data) {
      if (data.user.role !== "admin") { location.href = "/"; return; }
      initAdmin();
    })
    .catch(function() {});
  return;

  function initAdmin() {

  // --- i18n ---
  var I18N = {
    en: {
      admin_title: "Admin",
      tab_settings: "Settings", tab_users: "Users", tab_invites: "Invites", tab_cron: "Scheduled Tasks",
      back_chat: "Back to Chat", back_klaus: "Back to Klaus",
      sec_general: "General", sec_web: "Web Server", sec_session: "Chat Sessions", sec_transcripts: "Transcripts",
      lbl_persona: "System Prompt",
      lbl_port: "Port", lbl_permissions: "Tool Permissions", lbl_auth_expire: "Auth Session Expiry",
      hint_restart: "Restart required", hint_permissions: "Require user approval for write operations", hint_auth_expire: "Days before login sessions expire", hint_idle: "New session after inactivity",
      lbl_idle: "Idle Timeout", lbl_max_sessions: "Max Stored Sessions", lbl_ses_age: "Session Retention",
      lbl_tx_max_files: "Max Files", lbl_tx_age: "Retention",
      unit_days: "days", unit_minutes: "min",
      btn_save: "Save", btn_create: "Create", btn_cancel: "Cancel", btn_add_task: "+ Add Task",
      on: "On", off: "Off",
      saved: "Saved!", failed: "Failed",
      no_invites: "No invite codes yet.", no_tasks: "No scheduled tasks.",
      lbl_task_id: "Task ID", lbl_task_name: "Name", lbl_task_schedule: "Schedule", lbl_task_prompt: "Prompt",
      code: "Code", label: "Label", created: "Created", actions: "Actions",
      copy_code: "Copy", delete: "Delete", used_codes: "Used Codes", used_by: "Used By", used_at: "Used At",
      code_copied: "Code copied!", confirm_delete: "Delete this?", deleted: "Deleted",
      created_copied: "Created! Code copied", created_ok: "Created!",
      sessions_label: "sessions", msgs_label: "msgs",
      no_sessions: "No sessions found", no_messages: "No messages in this session",
      scheduler_running: "Running", scheduler_stopped: "Stopped",
      tasks_label: "tasks", active_label: "active", next_label: "Next",
      confirm_delete_task: "Delete this task?",
      tab_claude: "Model Config",
      sec_auth: "Authentication", sec_mode: "Mode", sec_thirdparty: "Third-party API", sec_model_map: "Model Mapping",
      lbl_auth_status: "Status", lbl_mode: "Mode", lbl_default_model: "Default Model",
      lbl_base_url: "API Base URL", lbl_auth_token: "Auth Token", lbl_api_timeout: "API Timeout (ms)",
      btn_login: "Login", login_pending: "Waiting for login...", login_failed: "Login failed",
      logged_in_as: "Logged in as", logged_in: "Logged in", not_logged_in: "Not logged in",
    },
    zh: {
      admin_title: "管理面板",
      tab_settings: "设置", tab_users: "用户", tab_invites: "邀请码", tab_cron: "定时任务",
      back_chat: "返回对话", back_klaus: "返回 Klaus",
      sec_general: "通用", sec_web: "Web 服务器", sec_session: "对话会话", sec_transcripts: "历史记录",
      lbl_persona: "系统提示词",
      lbl_port: "端口", lbl_permissions: "工具权限", lbl_auth_expire: "登录过期时间",
      hint_restart: "需要重启", hint_permissions: "写操作需要用户在浏览器中确认", hint_auth_expire: "登录会话过期天数", hint_idle: "空闲后自动创建新会话",
      lbl_idle: "空闲超时", lbl_max_sessions: "最大存储会话数", lbl_ses_age: "会话保留时间",
      lbl_tx_max_files: "最大文件数", lbl_tx_age: "保留时间",
      unit_days: "天", unit_minutes: "分钟",
      btn_save: "保存", btn_create: "创建", btn_cancel: "取消", btn_add_task: "+ 添加任务",
      on: "开启", off: "关闭",
      saved: "已保存!", failed: "失败",
      no_invites: "还没有邀请码。", no_tasks: "没有定时任务。",
      lbl_task_id: "任务 ID", lbl_task_name: "名称", lbl_task_schedule: "调度表达式", lbl_task_prompt: "提示词",
      code: "代码", label: "标签", created: "创建时间", actions: "操作",
      copy_code: "复制", delete: "删除", used_codes: "已使用", used_by: "使用者", used_at: "使用时间",
      code_copied: "已复制!", confirm_delete: "确定删除？", deleted: "已删除",
      created_copied: "已创建并复制!", created_ok: "已创建!",
      sessions_label: "会话", msgs_label: "消息",
      no_sessions: "暂无会话", no_messages: "该会话暂无消息",
      scheduler_running: "运行中", scheduler_stopped: "已停止",
      tasks_label: "个任务", active_label: "活跃", next_label: "下次",
      confirm_delete_task: "确定删除此任务？",
      tab_claude: "模型配置",
      sec_auth: "认证", sec_mode: "模式", sec_thirdparty: "第三方 API", sec_model_map: "模型映射",
      lbl_auth_status: "状态", lbl_mode: "模式", lbl_default_model: "默认模型",
      lbl_base_url: "API 地址", lbl_auth_token: "认证令牌", lbl_api_timeout: "API 超时 (ms)",
      btn_login: "登录", login_pending: "等待登录...", login_failed: "登录失败",
      logged_in_as: "已登录：", logged_in: "已登录", not_logged_in: "未登录",
    }
  };
  var lang = localStorage.getItem("klaus_lang") || "en";
  function tt(k) { return (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k; }
  document.querySelectorAll("[data-i18n]").forEach(function(el) { el.textContent = tt(el.getAttribute("data-i18n")); });

  // --- Helpers ---
  function esc(s) { if (s == null) return ""; return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  var toastEl = document.getElementById("toast"), toastTimer;
  function showToast(msg) { toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function() { toastEl.classList.remove("show"); }, 2000); }
  function fmtRel(ts) { if (!ts) return "-"; var d = Date.now() - ts; if (d < 60000) return "just now"; if (d < 3600000) return Math.floor(d/60000) + "m ago"; if (d < 86400000) return Math.floor(d/3600000) + "h ago"; return Math.floor(d/86400000) + "d ago"; }

  function api(path, method, params) {
    var qs = "";
    var opts = { method: method || "GET", credentials: "same-origin" };
    if (method === "POST" || method === "PATCH") {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(params || {});
    } else if (params) {
      var pairs = [];
      Object.keys(params).forEach(function(k) { pairs.push(k + "=" + encodeURIComponent(params[k])); });
      qs = pairs.join("&");
    }
    var url = "/api/admin/" + path + (qs ? "?" + qs : "");
    return fetch(url, opts).then(function(r) { return r.json(); });
  }

  // --- Tab Navigation ---
  var navItems = document.querySelectorAll(".nav-item[data-tab]");
  var tabPanels = document.querySelectorAll(".tab-panel");
  function switchTab(id) {
    navItems.forEach(function(n) { n.classList.toggle("active", n.dataset.tab === id); });
    tabPanels.forEach(function(p) { p.classList.toggle("active", p.id === "tab-" + id); });
    if (id === "users") showSubView("users-list");
    if (id === "cron") loadCronTasks();
    if (id === "claude") loadClaude();
  }
  navItems.forEach(function(b) { b.addEventListener("click", function() { switchTab(b.dataset.tab); }); });

  // =====================================================
  // SETTINGS TAB
  // =====================================================
  var sPersona = document.getElementById("s-persona");
  var sPort = document.getElementById("s-port");
  var sPerm = document.getElementById("s-permissions");
  var sPermLabel = document.getElementById("s-permissions-label");
  var sWebSesAge = document.getElementById("s-web-session-age");
  var sSesIdle = document.getElementById("s-ses-idle");
  var sSesMax = document.getElementById("s-ses-max");
  var sSesAge = document.getElementById("s-ses-age");
  var sTxFiles = document.getElementById("s-tx-files");
  var sTxAge = document.getElementById("s-tx-age");
  var saveBtn = document.getElementById("save-settings-btn");
  var saveStatus = document.getElementById("settings-status");

  sPerm.addEventListener("change", function() { sPermLabel.textContent = sPerm.checked ? tt("on") : tt("off"); });

  function loadSettings() {
    api("settings", "GET").then(function(d) {
      sPersona.value = d.persona || "";
      // Web
      sPort.value = d.web.port;
      sPerm.checked = d.web.permissions;
      sPermLabel.textContent = d.web.permissions ? tt("on") : tt("off");
      sWebSesAge.value = d.web.session_max_age_days;
      // Session
      sSesIdle.value = d.session.idle_minutes;
      sSesMax.value = d.session.max_entries;
      sSesAge.value = d.session.max_age_days;
      // Transcripts
      sTxFiles.value = d.transcripts.max_files;
      sTxAge.value = d.transcripts.max_age_days;
    });
  }

  saveBtn.onclick = function() {
    saveBtn.disabled = true;
    api("settings", "PATCH", {
      persona: sPersona.value.trim(),
      web: {
        port: parseInt(sPort.value, 10),
        permissions: sPerm.checked,
        session_max_age_days: parseInt(sWebSesAge.value, 10),
      },
      session: {
        idle_minutes: parseInt(sSesIdle.value, 10),
        max_entries: parseInt(sSesMax.value, 10),
        max_age_days: parseInt(sSesAge.value, 10),
      },
      transcripts: {
        max_files: parseInt(sTxFiles.value, 10),
        max_age_days: parseInt(sTxAge.value, 10),
      },
    })
    .then(function() {
      saveStatus.textContent = tt("saved"); saveStatus.style.color = "var(--success)";
      saveStatus.style.opacity = "1";
      setTimeout(function() { saveStatus.style.opacity = "0"; }, 2000);
    })
    .catch(function() {
      saveStatus.textContent = tt("failed"); saveStatus.style.color = "var(--danger)";
      saveStatus.style.opacity = "1";
      setTimeout(function() { saveStatus.style.opacity = "0"; }, 2000);
    })
    .finally(function() { saveBtn.disabled = false; });
  };

  loadSettings();

  // =====================================================
  // CLAUDE MODEL CONFIG TAB
  // =====================================================
  var cMode = document.getElementById("claude-mode");
  var cModel = document.getElementById("claude-model");
  var cBaseUrl = document.getElementById("claude-base-url");
  var cAuthToken = document.getElementById("claude-auth-token");
  var cMapHaiku = document.getElementById("claude-map-haiku");
  var cMapSonnet = document.getElementById("claude-map-sonnet");
  var cMapOpus = document.getElementById("claude-map-opus");
  var cApiTimeout = document.getElementById("claude-api-timeout");
  var cThirdpartySection = document.getElementById("claude-thirdparty-section");
  var cAuthStatus = document.getElementById("claude-auth-status");
  var cLoginRow = document.getElementById("claude-login-row");
  var cLoginBtn = document.getElementById("claude-login-btn");
  var cSaveBtn = document.getElementById("claude-save-btn");
  var cSaveStatus = document.getElementById("claude-save-status");
  function showAuthLoggedIn(email) {
    cAuthStatus.textContent = email ? tt("logged_in_as") + " " + email : tt("logged_in");
    cAuthStatus.style.color = "var(--color-success)";
    cLoginRow.style.display = "none";
  }

  function showAuthNotLoggedIn() {
    cAuthStatus.textContent = tt("not_logged_in");
    cAuthStatus.style.color = "var(--color-danger)";
    if (cMode.value === "official") cLoginRow.style.display = "";
  }

  function toggleThirdparty() {
    cThirdpartySection.style.display = cMode.value === "thirdparty" ? "" : "none";
    cLoginRow.style.display = cMode.value === "official" ? "" : "none";
  }
  cMode.addEventListener("change", toggleThirdparty);

  function loadClaude() {
    api("claude", "GET").then(function(d) {
      if (!d || !d.claude) return;
      var c = d.claude;
      cMode.value = c.mode || "official";
      cModel.value = c.model || "sonnet";
      if (c.baseUrl) cBaseUrl.value = c.baseUrl;
      if (c.authToken) cAuthToken.value = c.authToken;
      if (c.modelMap) {
        if (c.modelMap.haiku) cMapHaiku.value = c.modelMap.haiku;
        if (c.modelMap.sonnet) cMapSonnet.value = c.modelMap.sonnet;
        if (c.modelMap.opus) cMapOpus.value = c.modelMap.opus;
      }
      if (c.apiTimeoutMs) cApiTimeout.value = c.apiTimeoutMs;
      toggleThirdparty();

      if (d.auth) {
        if (d.auth.loggedIn) {
          showAuthLoggedIn(d.auth.email);
        } else {
          showAuthNotLoggedIn();
        }
      }
    });
  }

  // Login flow: click Login → open OAuth URL → poll until auth completes
  var loginPollTimer = null;
  cLoginBtn.addEventListener("click", function() {
    cLoginBtn.disabled = true;
    cLoginBtn.textContent = tt("login_pending");
    api("claude/login", "POST").then(function(d) {
      if (d && d.url) {
        window.open(d.url, "_blank");
        loginPollTimer = setInterval(function() {
          api("claude/auth-status", "GET").then(function(s) {
            if (s && s.loggedIn) {
              clearInterval(loginPollTimer);
              loginPollTimer = null;
              cLoginBtn.disabled = false;
              cLoginBtn.textContent = tt("btn_login");
              showAuthLoggedIn(s.email);
            }
          });
        }, 3000);
        setTimeout(function() {
          if (loginPollTimer) {
            clearInterval(loginPollTimer);
            loginPollTimer = null;
            cLoginBtn.disabled = false;
            cLoginBtn.textContent = tt("btn_login");
          }
        }, 300000);
      } else {
        cLoginBtn.disabled = false;
        cLoginBtn.textContent = tt("btn_login");
        showToast(tt("login_failed"));
      }
    });
  });

  // Save
  cSaveBtn.addEventListener("click", function() {
    var payload = {
      mode: cMode.value,
      model: cModel.value
    };
    if (cMode.value === "thirdparty") {
      payload.base_url = cBaseUrl.value;
      payload.auth_token = cAuthToken.value;
      payload.model_map = {
        haiku: cMapHaiku.value,
        sonnet: cMapSonnet.value,
        opus: cMapOpus.value
      };
      var t = parseInt(cApiTimeout.value, 10);
      if (t > 0) payload.api_timeout_ms = t;
    }
    api("claude", "PATCH", payload).then(function(d) {
      if (d && d.ok) {
        cSaveStatus.textContent = tt("saved");
        setTimeout(function() { cSaveStatus.textContent = ""; }, 2000);
      } else {
        showToast((d && d.error) || tt("failed"));
      }
    });
  });


  // =====================================================
  // USERS TAB
  // =====================================================
  function showSubView(id) {
    document.querySelectorAll("#tab-users .sub-view").forEach(function(v) { v.classList.toggle("active", v.id === id); });
  }
  var sessUserId = "", sessLabel = "";

  function loadUsers() {
    api("users", "GET").then(function(d) {
      var users = d.users || [];
      var el = document.getElementById("admin-stats");
      el.innerHTML = users.map(function(u) {
        return "<div class='stat-card' data-uid='" + esc(u.id) + "'>"
          + "<div class='stat-label'>" + esc(u.displayName) + " <span style='font-size:10px'>(" + esc(u.role) + ")</span></div>"
          + "<div class='stat-value'>" + esc(String(u.sessionCount || 0)) + " <span style='font-size:13px;font-weight:400;color:var(--muted)'>" + tt("sessions_label") + "</span></div>"
          + "<div class='stat-detail'>" + esc(u.email) + " &middot; " + esc(String(u.totalMessages || 0)) + " " + tt("msgs_label") + "</div>"
          + "</div>";
      }).join("");
      el.querySelectorAll(".stat-card[data-uid]").forEach(function(c) {
        c.onclick = function() {
          var u = users.find(function(u) { return u.id === c.dataset.uid; });
          openSessions(c.dataset.uid, u ? u.displayName : "User");
        };
      });
    });
  }

  function openSessions(uid, label) {
    sessUserId = uid; sessLabel = label;
    document.getElementById("bc-username").textContent = label;
    document.getElementById("sessions-title").textContent = label;
    showSubView("users-sessions");
    var wrap = document.getElementById("sessions-wrap");
    wrap.innerHTML = "<div class='empty'>Loading...</div>";
    api("sessions", "GET", { userId: uid }).then(function(d) {
      var s = d.sessions || [];
      if (!s.length) { wrap.innerHTML = "<div class='empty'>" + esc(tt("no_sessions")) + "</div>"; return; }
      var h = "<table><thead><tr><th>Title</th><th>Messages</th><th>Model</th><th>Updated</th></tr></thead><tbody>";
      s.forEach(function(x) {
        h += "<tr class='clickable' data-sid='" + esc(x.sessionId) + "' data-st='" + esc(x.title) + "'>"
          + "<td>" + esc(x.title) + "</td>"
          + "<td class='stat'>" + esc(String(x.messageCount)) + "</td>"
          + "<td>" + (x.model ? "<span class='model-tag'>" + esc(x.model) + "</span>" : "<span class='stat-muted'>-</span>") + "</td>"
          + "<td class='stat-muted'>" + esc(fmtRel(x.updatedAt)) + "</td></tr>";
      });
      h += "</tbody></table>";
      wrap.innerHTML = h;
    });
  }

  document.getElementById("sessions-wrap").addEventListener("click", function(e) {
    var row = e.target.closest("tr[data-sid]");
    if (row) openHistory(row.dataset.sid, row.dataset.st);
  });

  function openHistory(sid, title) {
    document.getElementById("bc-sessions-back").textContent = sessLabel;
    document.getElementById("bc-session-name").textContent = title;
    document.getElementById("history-title").textContent = title;
    showSubView("users-history");
    var wrap = document.getElementById("history-wrap");
    wrap.innerHTML = "<div class='empty'>Loading...</div>";
    api("history", "GET", { userId: sessUserId, sessionId: sid }).then(function(d) {
      var msgs = d.messages || [];
      if (!msgs.length) { wrap.innerHTML = "<div class='empty'>" + esc(tt("no_messages")) + "</div>"; return; }
      wrap.innerHTML = msgs.map(function(m) {
        return "<div class='chat-msg " + esc(m.role) + "'><div class='chat-role'>" + esc(m.role) + "</div>" + renderMd(m.content) + "</div>";
      }).join("");
    });
  }

  function renderMd(text) {
    var s = esc(text);
    s = s.replace(/\`\`\`(\\w*)?\\n([\\s\\S]*?)\`\`\`/g, function(_,l,c) { return "<pre><code>" + c.replace(/\\n$/,"") + "</code></pre>"; });
    s = s.replace(/\`([^\`]+)\`/g, function(_,c) { return "<code>"+c+"</code>"; });
    s = s.replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");
    var parts = s.split(/(<pre>[\\s\\S]*?<\\/pre>)/g);
    return parts.map(function(p,i) { return i%2===0 ? p.replace(/\\n/g,"<br>") : p; }).join("");
  }

  document.getElementById("bc-users").onclick = function(e) { e.preventDefault(); showSubView("users-list"); };
  document.getElementById("bc-users2").onclick = function(e) { e.preventDefault(); showSubView("users-list"); };
  document.getElementById("bc-sessions-back").onclick = function(e) { e.preventDefault(); openSessions(sessUserId, sessLabel); };
  loadUsers();

  // =====================================================
  // INVITES TAB
  // =====================================================
  var invWrap = document.getElementById("invites-table-wrap");
  var invEmpty = document.getElementById("invites-empty");

  function loadInvites() {
    api("invites", "GET").then(function(d) {
      var codes = d.invites || [];
      if (!codes.length) { invWrap.innerHTML = ""; invEmpty.style.display = "block"; return; }
      invEmpty.style.display = "none";
      var active = codes.filter(function(c) { return c.isActive; });
      var used = codes.filter(function(c) { return !c.isActive; });
      var h = "";
      if (active.length) {
        h += "<table><thead><tr><th>" + tt("code") + "</th><th>" + tt("label") + "</th><th>" + tt("created") + "</th><th>" + tt("actions") + "</th></tr></thead><tbody>";
        active.forEach(function(c) {
          h += "<tr><td><span class='code-text'>" + esc(c.code.slice(0,8)) + "...</span></td>"
            + "<td>" + esc(c.label || "-") + "</td><td class='stat-muted'>" + esc(fmtRel(c.createdAt)) + "</td>"
            + "<td><div class='actions'><button class='btn btn-sm btn-copy' data-code='" + esc(c.code) + "'>" + tt("copy_code") + "</button>"
            + "<button class='btn btn-sm btn-danger' data-del='" + esc(c.code) + "'>" + tt("delete") + "</button></div></td></tr>";
        });
        h += "</tbody></table>";
      }
      if (used.length) {
        h += "<div style='margin-top:20px;font-weight:600;font-size:13px;color:var(--muted)'>" + tt("used_codes") + "</div>";
        h += "<table><thead><tr><th>" + tt("code") + "</th><th>" + tt("label") + "</th><th>" + tt("used_by") + "</th><th>" + tt("used_at") + "</th></tr></thead><tbody>";
        used.forEach(function(c) {
          h += "<tr style='opacity:0.7'><td><span class='code-text'>" + esc(c.code.slice(0,8)) + "...</span></td>"
            + "<td>" + esc(c.label || "-") + "</td><td>" + esc(c.usedBy || "-") + "</td>"
            + "<td class='stat-muted'>" + (c.usedAt ? esc(fmtRel(c.usedAt)) : "-") + "</td></tr>";
        });
        h += "</tbody></table>";
      }
      invWrap.innerHTML = h;
    });
  }

  invWrap.addEventListener("click", function(e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    e.stopPropagation();
    if (btn.dataset.code) navigator.clipboard.writeText(btn.dataset.code).then(function() { showToast(tt("code_copied")); });
    else if (btn.dataset.del) { if (!confirm(tt("confirm_delete"))) return; api("invites", "DELETE", { code: btn.dataset.del }).then(function() { loadInvites(); showToast(tt("deleted")); }); }
  });

  var createBtn = document.getElementById("create-btn");
  var labelInput = document.getElementById("label-input");
  createBtn.onclick = function() {
    api("invites", "POST", { label: labelInput.value.trim() }).then(function(d) {
      labelInput.value = "";
      if (d.invite) navigator.clipboard.writeText(d.invite.code).then(function() { showToast(tt("created_copied")); }).catch(function() { showToast(tt("created_ok")); });
      loadInvites();
    });
  };
  labelInput.addEventListener("keydown", function(e) { if (e.key === "Enter") createBtn.onclick(); });
  loadInvites();

  // =====================================================
  // CRON TAB
  // =====================================================
  var cronBar = document.getElementById("cron-scheduler-bar");
  var cronWrap = document.getElementById("cron-tasks-wrap");
  var cronEmpty = document.getElementById("cron-empty");
  var cronForm = document.getElementById("cron-task-form");
  var cronAddBtn = document.getElementById("cron-add-btn");
  var cfId = document.getElementById("cf-id");
  var cfName = document.getElementById("cf-name");
  var cfSchedule = document.getElementById("cf-schedule");
  var cfPrompt = document.getElementById("cf-prompt");
  var cfSave = document.getElementById("cf-save");
  var cfCancel = document.getElementById("cf-cancel");
  var editingTaskId = null;

  function loadCronTasks() {
    api("cron/tasks", "GET").then(function(d) {
      var tasks = d.tasks || [];
      var sched = d.scheduler || {};

      // Scheduler bar
      var running = sched.running;
      cronBar.innerHTML = "<span class='dot " + (running ? "dot-green" : "dot-red") + "'></span> "
        + "<strong>" + (running ? tt("scheduler_running") : tt("scheduler_stopped")) + "</strong>"
        + "<span>" + sched.taskCount + " " + tt("tasks_label") + "</span>"
        + "<span>" + sched.activeJobs + " " + tt("active_label") + "</span>"
        + (sched.nextWakeAt ? "<span>" + tt("next_label") + ": " + new Date(sched.nextWakeAt).toLocaleString() + "</span>" : "");

      if (!tasks.length) { cronWrap.innerHTML = ""; cronEmpty.style.display = "block"; return; }
      cronEmpty.style.display = "none";

      var h = "<table><thead><tr><th>ID</th><th>" + tt("lbl_task_name") + "</th><th>" + tt("lbl_task_schedule") + "</th><th>Status</th><th>" + tt("next_label") + "</th><th>" + tt("actions") + "</th></tr></thead><tbody>";
      tasks.forEach(function(t) {
        var badge = t.enabled
          ? "<span class='badge badge-green'>" + tt("on") + "</span>"
          : "<span class='badge badge-gray'>" + tt("off") + "</span>";
        if (t.lastRun && t.lastRun.error) badge = "<span class='badge badge-red'>Error</span>";
        h += "<tr>"
          + "<td><span class='code-text'>" + esc(t.id) + "</span></td>"
          + "<td>" + esc(t.name || "-") + "</td>"
          + "<td class='stat-muted'>" + esc(t.schedule) + "</td>"
          + "<td>" + badge + "</td>"
          + "<td class='stat-muted'>" + (t.nextRun ? new Date(t.nextRun).toLocaleString() : "-") + "</td>"
          + "<td><div class='actions'>"
          + "<button class='btn btn-sm btn-ghost' data-toggle='" + esc(t.id) + "' data-enabled='" + (t.enabled ? "1" : "0") + "'>" + (t.enabled ? "Disable" : "Enable") + "</button>"
          + "<button class='btn btn-sm btn-danger' data-deltask='" + esc(t.id) + "'>" + tt("delete") + "</button>"
          + "</div></td></tr>";
      });
      h += "</tbody></table>";
      cronWrap.innerHTML = h;
    });
  }

  cronAddBtn.onclick = function() {
    editingTaskId = null;
    cfId.value = ""; cfName.value = ""; cfSchedule.value = ""; cfPrompt.value = "";
    cfId.disabled = false;
    cronForm.style.display = "block";
    cfId.focus();
  };

  cfCancel.onclick = function() { cronForm.style.display = "none"; };

  cfSave.onclick = function() {
    var id = cfId.value.trim();
    var schedule = cfSchedule.value.trim();
    var prompt = cfPrompt.value.trim();
    if (!id || !schedule || !prompt) return;

    cfSave.disabled = true;
    var payload = { id: id, schedule: schedule, prompt: prompt, name: cfName.value.trim() || undefined, enabled: true };

    api("cron/tasks", "POST", payload)
      .then(function() {
        cronForm.style.display = "none";
        showToast(tt("saved"));
        loadCronTasks();
      })
      .catch(function() { showToast(tt("failed")); })
      .finally(function() { cfSave.disabled = false; });
  };

  cronWrap.addEventListener("click", function(e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    e.stopPropagation();
    if (btn.dataset.toggle) {
      var enabled = btn.dataset.enabled === "1";
      api("cron/tasks?id=" + encodeURIComponent(btn.dataset.toggle), "PATCH", { enabled: !enabled })
        .then(function() { loadCronTasks(); });
    } else if (btn.dataset.deltask) {
      if (!confirm(tt("confirm_delete_task"))) return;
      api("cron/tasks?id=" + encodeURIComponent(btn.dataset.deltask), "DELETE")
        .then(function() { loadCronTasks(); showToast(tt("deleted")); });
    }
  });

  } // end initAdmin
})();
<\/script>
</body>
</html>`;
}
