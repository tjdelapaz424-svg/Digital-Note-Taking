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
  // Google users must also be signed out of Firebase before another person uses this device.
  if (window.firebase && typeof firebase.auth === 'function') firebase.auth().signOut().catch(() => {});
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

// ----- Gmail-only accounts -----
// New accounts must sign up with a real-looking @gmail.com address. This is
// also what we search on in the admin dashboard, so it's kept simple and
// case-insensitive.
function isGmailAddress(value) {
  return /^[a-z0-9](?:[a-z0-9._%+-]{0,63})@gmail\.com$/i.test((value || '').trim());
}
function normalizeGmail(value) {
  return (value || '').trim().toLowerCase();
}

// ----- Phone number -----
// Loose on purpose (PH mobile numbers, landlines, +country codes all vary) —
// we just want "looks like a phone number", not strict format validation.
function isLikelyPhone(value) {
  const digits = (value || '').replace(/[^\d]/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

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

// ----- Due dates -----
// dueDate is stored as a plain 'YYYY-MM-DD' string (from an <input type="date">).
function dueDateLabel(dueDate) {
  if (!dueDate) return '';
  const d = new Date(dueDate + 'T23:59:59');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function dueCountdown(dueDate) {
  if (!dueDate) return null;
  const due = new Date(dueDate + 'T23:59:59').getTime();
  const now = Date.now();
  const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: 'Past due', overdue: true };
  if (diffDays === 0) return { label: 'Due today', overdue: false, soon: true };
  if (diffDays === 1) return { label: 'Due tomorrow', overdue: false, soon: true };
  return { label: `Due in ${diffDays} days`, overdue: false, soon: diffDays <= 2 };
}
function isSubmissionLate(dueDate, submittedAtMillis) {
  if (!dueDate || !submittedAtMillis) return false;
  const due = new Date(dueDate + 'T23:59:59').getTime();
  return submittedAtMillis > due;
}
function millisFromTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return null;
}

// ----- Forgot-password security questions -----
const SECURITY_QUESTIONS = [
  "What was your first pet's name?",
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was the name of your first school?",
  "What is your favorite teacher's name?"
];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.innerText = str;
  return div.innerHTML;
}

// ----- Study streaks -----
// A student "studies" by generating AI study material, finishing a flashcard
// review session, completing a class challenge, or submitting a notebook.
// This bumps their streak at most once per real calendar day.
async function recordStudyActivity(usernameKey, kind) {
  if (!usernameKey) return;
  try {
    const ref = db.collection('users').doc(usernameKey);
    const doc = await ref.get();
    if (!doc.exists) return;
    const data = doc.data();
    const stats = Object.assign(
      { currentStreak: 0, longestStreak: 0, lastStudyDate: null, quizzesCompleted: 0, flashcardSessions: 0 },
      data.studyStats || {}
    );
    const todayKey = new Date().toISOString().slice(0, 10);
    if (stats.lastStudyDate !== todayKey) {
      const yesterdayKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      stats.currentStreak = stats.lastStudyDate === yesterdayKey ? (stats.currentStreak || 0) + 1 : 1;
      stats.longestStreak = Math.max(stats.longestStreak || 0, stats.currentStreak);
      stats.lastStudyDate = todayKey;
    }
    if (kind === 'quiz') stats.quizzesCompleted = (stats.quizzesCompleted || 0) + 1;
    if (kind === 'flashcards') stats.flashcardSessions = (stats.flashcardSessions || 0) + 1;
    await ref.update({ studyStats: stats });
    return stats;
  } catch (err) {
    console.error('recordStudyActivity failed', err);
  }
}

// ----- Spaced repetition (simplified SM-2) -----
function newCardSchedule() {
  return { interval: 0, ease: 2.5, reps: 0, dueDate: new Date().toISOString().slice(0, 10) };
}
// rating: 'again' | 'hard' | 'good' | 'easy'
function nextCardSchedule(card, rating) {
  let { interval = 0, ease = 2.5 } = card;
  let reps = card.reps || 0;
  if (rating === 'again') {
    reps = 0;
    interval = 0; // due again today
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    if (rating === 'hard') { interval = Math.max(1, Math.round(interval * 1.2)) || 1; ease = Math.max(1.3, ease - 0.15); }
    else if (rating === 'good') { interval = interval === 0 ? 1 : Math.round(interval * ease); }
    else if (rating === 'easy') { interval = interval === 0 ? 3 : Math.round(interval * ease * 1.3); ease += 0.15; }
  }
  const due = new Date();
  due.setDate(due.getDate() + Math.max(0, interval));
  return { interval, ease, reps, dueDate: due.toISOString().slice(0, 10) };
}
function isCardDue(card) {
  return !card.dueDate || card.dueDate <= new Date().toISOString().slice(0, 10);
}

// ----- Text-to-speech (Web Speech API — free, in-browser, Chrome/Edge/Safari support varies) -----
function speakText(text) {
  if (!text) return;
  if (!('speechSynthesis' in window)) {
    showToast('Text-to-speech isn\'t supported in this browser.', true);
    return;
  }
  window.speechSynthesis.cancel(); // stop anything already reading
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.98;
  window.speechSynthesis.speak(utter);
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
