/**
 * Login/Register page HTML template.
 * Supports email+password and Google OAuth login.
 */

export function getLoginHtml(hasGoogle: boolean, isFirstUser = false): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Klaus AI — Login</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg: #ffffff; --fg: #0f172a; --border: #e2e8f0;
  --card-bg: #f8fafc; --accent: #020617; --accent-text: #ffffff;
  --accent-hover: #334155; --muted: #64748b; --error: #dc2626;
  --font-main: 'Inter', -apple-system, sans-serif;
  --input-bg: #ffffff; --input-border: #cbd5e1;
}
@media(prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a; --fg: #f8fafc; --border: #334155;
    --card-bg: #1e293b; --accent: #f8fafc; --accent-text: #0f172a;
    --accent-hover: #e2e8f0; --muted: #94a3b8; --error: #ef4444;
    --input-bg: #1e293b; --input-border: #475569;
  }
}
html, body { height: 100%; font-family: var(--font-main); background: var(--bg); color: var(--fg); -webkit-font-smoothing: antialiased; }
.container { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.card { width: 100%; max-width: 400px; }
.brand { text-align: center; margin-bottom: 32px; }
.brand-icon { width: 48px; height: 48px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px; }
.brand-icon img { width: 100%; height: 100%; object-fit: contain; border-radius: 12px; }
.brand h1 { font-size: 24px; font-weight: 700; }
.brand p { font-size: 14px; color: var(--muted); margin-top: 4px; }
.tabs { display: flex; gap: 0; margin-bottom: 24px; border-bottom: 1px solid var(--border); }
.tab { flex: 1; padding: 12px; text-align: center; font-size: 14px; font-weight: 500; cursor: pointer; border-bottom: 2px solid transparent; color: var(--muted); transition: all 0.15s; background: none; border-top: none; border-left: none; border-right: none; font-family: var(--font-main); }
.tab.active { color: var(--fg); border-bottom-color: var(--fg); }
.tab:hover { color: var(--fg); }
.form { display: none; }
.form.active { display: block; }
.field { margin-bottom: 16px; }
.field label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--fg); }
.field input { width: 100%; padding: 10px 14px; border: 1px solid var(--input-border); border-radius: 8px; font-size: 14px; font-family: var(--font-main); background: var(--input-bg); color: var(--fg); outline: none; transition: border-color 0.15s; }
.field input:focus { border-color: var(--fg); }
.btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: var(--font-main); transition: all 0.15s; }
.btn-primary { background: var(--accent); color: var(--accent-text); margin-top: 8px; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.divider { display: flex; align-items: center; gap: 12px; margin: 20px 0; color: var(--muted); font-size: 13px; }
.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
.btn-google { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; font-family: var(--font-main); background: var(--card-bg); color: var(--fg); transition: all 0.15s; }
.btn-google:hover { border-color: var(--fg); }
.btn-google svg { width: 18px; height: 18px; }
.error-msg { background: color-mix(in srgb, var(--error) 10%, transparent); color: var(--error); padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; display: none; }
.error-msg.show { display: block; }
.google-section { display: ${hasGoogle ? "block" : "none"}; }
.invite-hint { font-size: 12px; color: var(--muted); margin-top: 4px; }
</style>
</head>
<body>
<div class="container">
<div class="card">
  <div class="brand">
    <div class="brand-icon"><img src="/logo.png" alt="Klaus AI Logo" /></div>
    <h1>Klaus AI</h1>
    <p>Sign in to start chatting</p>
  </div>

  <div class="tabs">
    <button class="tab active" data-tab="login">Sign In</button>
    <button class="tab" data-tab="register">Sign Up</button>
  </div>

  <div id="error" class="error-msg"></div>

  <!-- Login Form -->
  <div id="form-login" class="form active">
    <div class="field">
      <label for="login-email">Email</label>
      <input id="login-email" type="email" autocomplete="email" placeholder="you@example.com">
    </div>
    <div class="field">
      <label for="login-password">Password</label>
      <input id="login-password" type="password" autocomplete="current-password" placeholder="Your password">
    </div>
    <button class="btn btn-primary" id="btn-login">Sign In</button>
    <div class="google-section">
      <div class="divider">or</div>
      <button class="btn-google" id="btn-google-login">
        <svg viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Continue with Google
      </button>
    </div>
  </div>

  <!-- Register Form -->
  <div id="form-register" class="form">
    <div class="field">
      <label for="reg-name">Display Name</label>
      <input id="reg-name" type="text" autocomplete="name" placeholder="Your name">
    </div>
    <div class="field">
      <label for="reg-email">Email</label>
      <input id="reg-email" type="email" autocomplete="email" placeholder="you@example.com">
    </div>
    <div class="field">
      <label for="reg-password">Password</label>
      <input id="reg-password" type="password" autocomplete="new-password" placeholder="At least 8 characters">
    </div>
    <div class="field invite-field" style="display: ${isFirstUser ? "none" : "block"};">
      <label for="reg-invite">Invite Code</label>
      <input id="reg-invite" type="text" placeholder="Enter your invite code">
      <p class="invite-hint">Ask an admin for an invite code to register.</p>
    </div>
    ${isFirstUser ? '<p class="invite-hint" style="margin-bottom:16px;color:var(--accent);">First user will become admin. No invite code needed.</p>' : ""}
    <button class="btn btn-primary" id="btn-register">Create Account</button>
    <div class="google-section">
      <div class="divider">or</div>
      <button class="btn-google" id="btn-google-register">
        <svg viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Continue with Google
      </button>
    </div>
  </div>
</div>
</div>

<script>
(function() {
  const $ = s => document.querySelector(s);
  const errorEl = $('#error');
  const tabs = document.querySelectorAll('.tab');
  const forms = { login: $('#form-login'), register: $('#form-register') };
  const needsInvite = !${isFirstUser};

  // Error messages mapping
  const errorMessages = {
    invalid_email: 'Please enter a valid email address.',
    password_too_short: 'Password must be at least 8 characters.',
    display_name_required: 'Display name is required.',
    invite_code_required: 'Invite code is required.',
    invalid_invite_code: 'Invalid or expired invite code.',
    email_already_registered: 'This email is already registered.',
    invalid_credentials: 'Invalid email or password.',
    registration_failed: 'Registration failed. Please try again.',
    google_denied: 'Google login was cancelled.',
    google_failed: 'Google login failed. Please try again.',
    google_token_failed: 'Google authentication failed.',
    google_userinfo_failed: 'Could not get Google account info.',
    google_no_code: 'Google authentication failed (no code).',
    invite_required: 'New Google accounts require an invite code. Please register first.',
  };

  // Check URL for errors and mode
  const params = new URLSearchParams(location.search);
  const urlError = params.get('error');
  const urlMode = params.get('mode');
  if (urlError) {
    errorEl.textContent = errorMessages[urlError] || urlError;
    errorEl.classList.add('show');
    history.replaceState(null, '', '/login');
  }
  if (urlMode === 'register') {
    switchTab('register');
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('show');
  }
  function hideError() {
    errorEl.classList.remove('show');
  }

  function switchTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    Object.entries(forms).forEach(([k, f]) => f.classList.toggle('active', k === name));
    hideError();
  }

  tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  async function apiCall(url, body) {
    hideError();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(errorMessages[data.error] || data.error || 'An error occurred.');
      return null;
    }
    return data;
  }

  // Login
  $('#btn-login').addEventListener('click', async () => {
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    if (!email || !password) { showError('Please fill in all fields.'); return; }
    const btn = $('#btn-login');
    btn.disabled = true;
    const result = await apiCall('/api/auth/login', { email, password });
    btn.disabled = false;
    if (result) location.href = '/';
  });

  // Register
  $('#btn-register').addEventListener('click', async () => {
    const displayName = $('#reg-name').value.trim();
    const email = $('#reg-email').value.trim();
    const password = $('#reg-password').value;
    const inviteCode = $('#reg-invite').value.trim();
    if (!displayName || !email || !password || (needsInvite && !inviteCode)) { showError('Please fill in all fields.'); return; }
    if (password.length < 8) { showError('Password must be at least 8 characters.'); return; }
    const btn = $('#btn-register');
    btn.disabled = true;
    const result = await apiCall('/api/auth/register', { email, password, displayName, inviteCode });
    btn.disabled = false;
    if (result) location.href = '/';
  });

  // Google OAuth
  const googleLogin = $('#btn-google-login');
  const googleRegister = $('#btn-google-register');
  if (googleLogin) {
    googleLogin.addEventListener('click', () => {
      location.href = '/api/auth/google';
    });
  }
  if (googleRegister) {
    googleRegister.addEventListener('click', () => {
      const inviteCode = $('#reg-invite').value.trim();
      if (needsInvite && !inviteCode) { showError('Please enter an invite code before using Google sign-up.'); return; }
      location.href = inviteCode ? '/api/auth/google?invite=' + encodeURIComponent(inviteCode) : '/api/auth/google';
    });
  }

  // Enter key support
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (forms.login.classList.contains('active')) $('#btn-login').click();
    else $('#btn-register').click();
  });
})();
<\/script>
</body>
</html>`;
}
