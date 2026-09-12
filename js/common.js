// ===== Shared helpers =====

// Session is kept in localStorage so a page refresh keeps you logged in
// on THIS device. The actual account data lives in Firestore, so the
// same account works from any device once you log in there.
function saveSession(userDoc) {
  localStorage.setItem('sn_session', JSON.stringify(userDoc));
}
function getSession() {
  const raw = localStorage.getItem('sn_session');
  return raw ? JSON.parse(raw) : null;
}
function clearSession() {
  localStorage.removeItem('sn_session');
}
function requireRole(role) {
  const s = getSession();
  if (!s || s.role !== role) {
    window.location.href = 'index.html';
    return null;
  }
  return s;
}

// Username is case-insensitive: "Admin2026" and "ADMIN2026" are the
// same account. We store/look-up accounts by this lowercase key, but
// keep the original typed casing too, just for display.
function usernameKey(username) {
  return username.trim().toLowerCase();
}

// Password is case-sensitive and stored exactly as typed - no changes.

function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O/1/I
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function todayLabel() {
  const d = new Date();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.innerText = str;
  return div.innerHTML;
}

function showToast(msg, isError = false) {
  let t = document.getElementById('sn-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'sn-toast';
    t.style.position = 'fixed';
    t.style.bottom = '22px';
    t.style.left = '50%';
    t.style.transform = 'translateX(-50%)';
    t.style.padding = '10px 18px';
    t.style.borderRadius = '10px';
    t.style.fontSize = '13.5px';
    t.style.fontFamily = "'Space Grotesk', sans-serif";
    t.style.zIndex = '999';
    t.style.boxShadow = '0 4px 14px rgba(0,0,0,.2)';
    document.body.appendChild(t);
  }
  t.style.background = isError ? '#B23A3A' : '#2E4034';
  t.style.color = '#fff';
  t.innerText = msg;
  t.style.display = 'block';
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => (t.style.display = 'none'), 2600);
}
