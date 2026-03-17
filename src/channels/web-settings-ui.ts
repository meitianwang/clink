/**
 * User settings page HTML template.
 * Layout: left sidebar nav + right content area (inspired by claude.ai settings).
 */

import type { User } from "../user-store.js";

export function getSettingsHtml(user: User): string {
  const u = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    avatarUrl: user.avatarUrl,
  };
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Klaus Settings</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#ffffff;--fg:#0f172a;--fg-secondary:#475569;--fg-tertiary:#94a3b8;
  --border:#e2e8f0;--bg-elevated:#ffffff;--bg-hover:#f1f5f9;
  --accent:#020617;--accent-text:#ffffff;
  --radius:8px;--radius-lg:12px;
  --font:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;
  --shadow:0 1px 3px rgba(0,0,0,0.08);
}
@media(prefers-color-scheme:dark){
  :root{
    --bg:#0f172a;--fg:#f8fafc;--fg-secondary:#94a3b8;--fg-tertiary:#64748b;
    --border:#334155;--bg-elevated:#1e293b;--bg-hover:#334155;
    --accent:#f8fafc;--accent-text:#0f172a;
    --shadow:0 1px 3px rgba(0,0,0,0.3);
  }
}
html,body{height:100%;font-family:var(--font);background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased}

/* Layout */
.settings-layout{display:flex;max-width:960px;margin:0 auto;min-height:100vh;padding:48px 24px}
.settings-nav{width:200px;min-width:200px;padding-right:32px;position:sticky;top:48px;align-self:flex-start}
.settings-content{flex:1;min-width:0}

/* Nav */
.settings-title{font-size:24px;font-weight:600;margin-bottom:20px}
.nav-item{
  display:block;width:100%;padding:8px 12px;border-radius:var(--radius);
  font-size:14px;font-weight:500;color:var(--fg-secondary);
  cursor:pointer;border:none;background:transparent;font-family:var(--font);
  text-align:left;transition:all 0.15s;
}
.nav-item:hover{background:var(--bg-hover);color:var(--fg)}
.nav-item.active{background:var(--bg-hover);color:var(--fg);font-weight:600}
.nav-back{
  display:inline-flex;align-items:center;gap:6px;
  font-size:14px;color:var(--fg-tertiary);text-decoration:none;
  margin-bottom:24px;padding:4px 0;transition:color 0.15s;
}
.nav-back:hover{color:var(--fg)}
.nav-back svg{width:16px;height:16px}

/* Sections */
.section{margin-bottom:40px}
.section-title{font-size:18px;font-weight:600;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid var(--border)}
.section-subtitle{font-size:13px;color:var(--fg-tertiary);margin-top:4px;font-weight:400}

/* Form fields */
.field{margin-bottom:24px}
.field-row{display:flex;gap:24px}
.field-row .field{flex:1}
.field-label{display:block;font-size:13px;font-weight:500;color:var(--fg-secondary);margin-bottom:6px}
.field-input{
  width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius);
  font-size:14px;font-family:var(--font);background:var(--bg);color:var(--fg);
  transition:border-color 0.15s;outline:none;
}
.field-input:focus{border-color:var(--accent)}
.field-input:disabled{opacity:0.5;cursor:not-allowed}
textarea.field-input{min-height:80px;resize:vertical}

/* Profile avatar */
.profile-header{display:flex;align-items:center;gap:16px;margin-bottom:24px}
.profile-avatar{
  width:56px;height:56px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:22px;font-weight:600;color:var(--accent-text);background:var(--accent);
  flex-shrink:0;
}
.profile-avatar img{width:100%;height:100%;border-radius:50%;object-fit:cover}
.profile-info{flex:1}
.profile-name{font-size:16px;font-weight:600}
.profile-email{font-size:13px;color:var(--fg-tertiary);margin-top:2px}

/* Theme cards */
.theme-options{display:flex;gap:16px;flex-wrap:wrap}
.theme-card{
  cursor:pointer;border:2px solid var(--border);border-radius:var(--radius-lg);
  padding:4px;transition:border-color 0.15s;width:120px;
}
.theme-card:hover{border-color:var(--fg-tertiary)}
.theme-card.active{border-color:var(--accent)}
.theme-preview{
  width:100%;aspect-ratio:4/3;border-radius:var(--radius);overflow:hidden;
  position:relative;
}
.theme-preview-light{background:#f8fafc;border:1px solid #e2e8f0}
.theme-preview-light::after{content:'';position:absolute;bottom:8px;left:8px;right:8px;height:12px;background:#020617;border-radius:4px}
.theme-preview-dark{background:#1e293b;border:1px solid #334155}
.theme-preview-dark::after{content:'';position:absolute;bottom:8px;left:8px;right:8px;height:12px;background:#f8fafc;border-radius:4px}
.theme-preview-auto{background:linear-gradient(135deg,#f8fafc 50%,#1e293b 50%);border:1px solid #e2e8f0}
.theme-preview-auto::after{content:'';position:absolute;bottom:8px;left:8px;right:8px;height:12px;background:linear-gradient(90deg,#020617 50%,#f8fafc 50%);border-radius:4px}
.theme-label{text-align:center;font-size:13px;color:var(--fg-secondary);margin-top:8px;padding-bottom:4px}

/* Language select */
.lang-options{display:flex;gap:8px}
.lang-option{
  padding:8px 16px;border:1px solid var(--border);border-radius:var(--radius);
  font-size:14px;font-family:var(--font);cursor:pointer;
  background:transparent;color:var(--fg);transition:all 0.15s;
}
.lang-option:hover{border-color:var(--fg-tertiary)}
.lang-option.active{border-color:var(--accent);background:var(--accent);color:var(--accent-text)}

/* Save button */
.btn-save{
  padding:10px 20px;border:none;border-radius:var(--radius);
  font-size:14px;font-weight:500;font-family:var(--font);
  background:var(--accent);color:var(--accent-text);cursor:pointer;
  transition:opacity 0.15s;
}
.btn-save:hover{opacity:0.85}
.btn-save:disabled{opacity:0.5;cursor:not-allowed}
.save-status{display:inline-block;margin-left:12px;font-size:13px;color:var(--fg-tertiary)}

/* Hidden tab content */
.tab-content{display:none}
.tab-content.active{display:block}

/* Responsive */
@media(max-width:640px){
  .settings-layout{flex-direction:column;padding:24px 16px}
  .settings-nav{width:100%;min-width:0;padding-right:0;position:static;margin-bottom:24px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .settings-title{margin-bottom:0;margin-right:auto}
  .field-row{flex-direction:column;gap:0}
  .theme-card{width:100px}
}
</style>
</head>
<body>
<div class="settings-layout">
  <nav class="settings-nav">
    <div class="settings-title" data-i18n="settings_title">Settings</div>
    <button class="nav-item active" data-tab="general" data-i18n="settings_general">General</button>
  </nav>
  <main class="settings-content">
    <a href="/" class="nav-back">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      <span data-i18n="settings_back">Back to Klaus</span>
    </a>

    <div class="tab-content active" id="tab-general">
      <!-- Profile -->
      <div class="section">
        <div class="section-title" data-i18n="settings_profile">Profile</div>
        <div class="profile-header">
          <div class="profile-avatar" id="avatar"></div>
          <div class="profile-info">
            <div class="profile-name" id="profile-name"></div>
            <div class="profile-email" id="profile-email"></div>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="field-label" data-i18n="settings_display_name">Display name</label>
            <input class="field-input" type="text" id="input-name" maxlength="50">
          </div>
        </div>
        <button class="btn-save" id="btn-save-profile" data-i18n="settings_save">Save</button>
        <span class="save-status" id="save-status"></span>
      </div>

      <!-- Appearance -->
      <div class="section">
        <div class="section-title" data-i18n="settings_appearance">Appearance</div>
        <div class="field">
          <label class="field-label" data-i18n="settings_color_mode">Color mode</label>
          <div class="theme-options" id="theme-options">
            <div class="theme-card" data-theme="light">
              <div class="theme-preview theme-preview-light"></div>
              <div class="theme-label" data-i18n="settings_theme_light">Light</div>
            </div>
            <div class="theme-card" data-theme="dark">
              <div class="theme-preview theme-preview-dark"></div>
              <div class="theme-label" data-i18n="settings_theme_dark">Dark</div>
            </div>
            <div class="theme-card active" data-theme="auto">
              <div class="theme-preview theme-preview-auto"></div>
              <div class="theme-label" data-i18n="settings_theme_auto">System</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Language -->
      <div class="section">
        <div class="section-title" data-i18n="settings_language">Language</div>
        <div class="lang-options" id="lang-options">
          <button class="lang-option" data-lang="en">English</button>
          <button class="lang-option" data-lang="zh">中文</button>
        </div>
      </div>
    </div>
  </main>
</div>

<script>
(function() {
  var currentUser = ${JSON.stringify(u)};

  // --- i18n ---
  var I18N = {
    en: {
      settings_title: "Settings",
      settings_general: "General",
      settings_back: "Back to Klaus",
      settings_profile: "Profile",
      settings_display_name: "Display name",
      settings_save: "Save",
      settings_saved: "Saved",
      settings_appearance: "Appearance",
      settings_color_mode: "Color mode",
      settings_theme_light: "Light",
      settings_theme_dark: "Dark",
      settings_theme_auto: "System",
      settings_language: "Language",
    },
    zh: {
      settings_title: "设置",
      settings_general: "通用",
      settings_back: "返回 Klaus",
      settings_profile: "个人资料",
      settings_display_name: "显示名称",
      settings_save: "保存",
      settings_saved: "已保存",
      settings_appearance: "外观",
      settings_color_mode: "颜色模式",
      settings_theme_light: "浅色",
      settings_theme_dark: "深色",
      settings_theme_auto: "跟随系统",
      settings_language: "语言",
    }
  };
  var currentLang = localStorage.getItem("klaus_lang") || "en";
  function tt(key) { return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key; }
  function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach(function(el) {
      el.textContent = tt(el.getAttribute("data-i18n"));
    });
  }

  // --- Profile ---
  var avatarEl = document.getElementById("avatar");
  var initial = (currentUser.displayName || currentUser.email || "U").charAt(0).toUpperCase();
  if (currentUser.avatarUrl) {
    avatarEl.innerHTML = '<img src="' + currentUser.avatarUrl + '" alt="">';
  } else {
    avatarEl.textContent = initial;
  }
  document.getElementById("profile-name").textContent = currentUser.displayName || currentUser.email;
  document.getElementById("profile-email").textContent = currentUser.email;
  document.getElementById("input-name").value = currentUser.displayName || "";

  // --- Save profile ---
  var saveBtn = document.getElementById("btn-save-profile");
  var saveStatus = document.getElementById("save-status");
  saveBtn.addEventListener("click", function() {
    var name = document.getElementById("input-name").value.trim();
    saveBtn.disabled = true;
    saveStatus.textContent = "";
    fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ displayName: name })
    }).then(function(r) {
      if (!r.ok) throw new Error("Failed");
      saveStatus.textContent = tt("settings_saved");
      document.getElementById("profile-name").textContent = name || currentUser.email;
      setTimeout(function() { saveStatus.textContent = ""; }, 2000);
    }).catch(function() {
      saveStatus.textContent = "Error";
      saveStatus.style.color = "#dc2626";
      setTimeout(function() { saveStatus.textContent = ""; saveStatus.style.color = ""; }, 2000);
    }).finally(function() { saveBtn.disabled = false; });
  });

  // --- Theme ---
  var currentTheme = localStorage.getItem("klaus_theme") || "auto";
  function applyTheme(theme) {
    currentTheme = theme;
    localStorage.setItem("klaus_theme", theme);
    document.querySelectorAll(".theme-card").forEach(function(c) {
      c.classList.toggle("active", c.getAttribute("data-theme") === theme);
    });
    // Apply theme to document
    if (theme === "dark") {
      document.documentElement.style.colorScheme = "dark";
    } else if (theme === "light") {
      document.documentElement.style.colorScheme = "light";
    } else {
      document.documentElement.style.colorScheme = "";
    }
  }
  applyTheme(currentTheme);
  document.getElementById("theme-options").addEventListener("click", function(e) {
    var card = e.target.closest(".theme-card");
    if (card) applyTheme(card.getAttribute("data-theme"));
  });

  // --- Language ---
  function applyLangUI() {
    document.querySelectorAll(".lang-option").forEach(function(el) {
      el.classList.toggle("active", el.getAttribute("data-lang") === currentLang);
    });
    applyI18n();
  }
  applyLangUI();
  document.getElementById("lang-options").addEventListener("click", function(e) {
    var btn = e.target.closest(".lang-option");
    if (!btn) return;
    currentLang = btn.getAttribute("data-lang");
    localStorage.setItem("klaus_lang", currentLang);
    applyLangUI();
  });
})();
</script>
</body>
</html>`;
}
