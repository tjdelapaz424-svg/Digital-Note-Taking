// Fixed admin account - no registration, never stored in the database
const ADMIN_USER = 'ADMIN2026';
const ADMIN_PASS = 'ADMIN2026';

let selectedRole = 'student';
let showingRegister = false;

const roleTabs = document.querySelectorAll('.role-tab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const toRegisterWrap = document.getElementById('toRegisterWrap');
const toLoginWrap = document.getElementById('toLoginWrap');
const errorBox = document.getElementById('errorBox');
const okBox = document.getElementById('okBox');

function setError(msg) {
  errorBox.innerText = msg;
  errorBox.classList.remove('hidden');
  okBox.classList.add('hidden');
}
function setOk(msg) {
  okBox.innerText = msg;
  okBox.classList.remove('hidden');
  errorBox.classList.add('hidden');
}
function clearMsgs() {
  errorBox.classList.add('hidden');
  okBox.classList.add('hidden');
}

roleTabs.forEach(btn => {
  btn.addEventListener('click', () => {
    roleTabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRole = btn.dataset.role;
    clearMsgs();
    showRegisterForm(false);
    if (selectedRole === 'admin') {
      toRegisterWrap.classList.add('hidden');
    } else {
      toRegisterWrap.classList.remove('hidden');
    }
  });
});

function showRegisterForm(show) {
  showingRegister = show;
  registerForm.classList.toggle('hidden', !show);
  loginForm.classList.toggle('hidden', show);
  toRegisterWrap.classList.toggle('hidden', show || selectedRole === 'admin');
  toLoginWrap.classList.toggle('hidden', !show);
}

document.getElementById('toRegister').addEventListener('click', () => { clearMsgs(); showRegisterForm(true); });
document.getElementById('toLogin').addEventListener('click', () => { clearMsgs(); showRegisterForm(false); });

// ---------- LOGIN ----------
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsgs();
  const typedUser = document.getElementById('loginUsername').value.trim();
  const typedPass = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');

  if (selectedRole === 'admin') {
    if (usernameKey(typedUser) === usernameKey(ADMIN_USER) && typedPass === ADMIN_PASS) {
      saveSession({ role: 'admin', username: ADMIN_USER });
      window.location.href = 'admin.html';
    } else {
      setError('Incorrect admin username or password.');
    }
    return;
  }

  btn.disabled = true;
  btn.innerText = 'Checking...';
  try {
    const key = usernameKey(typedUser);
    const doc = await db.collection('users').doc(key).get();
    if (!doc.exists) {
      setError('No account found with that username.');
      return;
    }
    const data = doc.data();
    if (data.role !== selectedRole) {
      setError(`That account is registered as a ${data.role}, not a ${selectedRole}.`);
      return;
    }
    if (data.password !== typedPass) {
      setError('Incorrect password.');
      return;
    }
    saveSession({ role: data.role, username: data.username, usernameKey: key, name: data.name });
    window.location.href = data.role === 'teacher' ? 'teacher.html' : 'student.html';
  } catch (err) {
    console.error(err);
    setError('Could not reach the server. Check your internet connection.');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Log in';
  }
});

// ---------- REGISTER ----------
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsgs();
  const name = document.getElementById('regName').value.trim();
  const age = document.getElementById('regAge').value;
  const sex = document.getElementById('regSex').value;
  const region = document.getElementById('regRegion').value.trim();
  const typedUser = document.getElementById('regUsername').value.trim();
  const typedPass = document.getElementById('regPassword').value;
  const btn = document.getElementById('registerBtn');

  if (usernameKey(typedUser) === usernameKey(ADMIN_USER)) {
    setError('That username is reserved.');
    return;
  }

  btn.disabled = true;
  btn.innerText = 'Creating...';
  try {
    const key = usernameKey(typedUser);
    const existing = await db.collection('users').doc(key).get();
    if (existing.exists) {
      setError('That username is already taken. Please choose another.');
      return;
    }
    await db.collection('users').doc(key).set({
      username: typedUser,
      password: typedPass,
      role: selectedRole,
      name, age: Number(age), sex, region,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    setOk('Account created! You can log in now.');
    registerForm.reset();
    showRegisterForm(false);
  } catch (err) {
    console.error(err);
    setError('Could not create the account. Check your internet connection.');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Create account';
  }
});

// If already logged in, skip straight to the right dashboard
(function redirectIfLoggedIn() {
  const s = getSession();
  if (!s) return;
  if (s.role === 'admin') window.location.href = 'admin.html';
  else if (s.role === 'teacher') window.location.href = 'teacher.html';
  else if (s.role === 'student') window.location.href = 'student.html';
})();
