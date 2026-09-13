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

// Populate the security question dropdown on the register form
const regSecQuestionSel = document.getElementById('regSecQuestion');
SECURITY_QUESTIONS.forEach(q => {
  const opt = document.createElement('option');
  opt.value = q;
  opt.innerText = q;
  regSecQuestionSel.appendChild(opt);
});

const loginUsernameLabel = document.getElementById('loginUsernameLabel');
const googleOnboardForm = document.getElementById('googleOnboardForm');

roleTabs.forEach(btn => {
  btn.addEventListener('click', () => {
    roleTabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRole = btn.dataset.role;
    clearMsgs();
    showRegisterForm(false);
    hideGoogleOnboarding();
    updateGoogleSignIn();
    loginUsernameLabel.innerText = selectedRole === 'admin' ? 'Admin username' : 'Gmail address';
    document.getElementById('loginUsername').placeholder = selectedRole === 'admin' ? '' : 'you@gmail.com';
    const forgotWrap = document.getElementById('forgotWrap');
    if (selectedRole === 'admin') {
      toRegisterWrap.classList.add('hidden');
      forgotWrap.classList.add('hidden');
    } else {
      toRegisterWrap.classList.remove('hidden');
      forgotWrap.classList.remove('hidden');
    }
  });
});

function showRegisterForm(show) {
  showingRegister = show;
  registerForm.classList.toggle('hidden', !show);
  loginForm.classList.toggle('hidden', show);
  toRegisterWrap.classList.toggle('hidden', show || selectedRole === 'admin');
  toLoginWrap.classList.toggle('hidden', !show);
  document.getElementById('googleSignInWrap').classList.toggle('hidden', show || selectedRole === 'admin');
}

document.getElementById('toRegister').addEventListener('click', () => { clearMsgs(); showRegisterForm(true); });
document.getElementById('toLogin').addEventListener('click', () => { clearMsgs(); showRegisterForm(false); });

// ---------- GOOGLE SIGN-IN ----------
const googleSignInBtn = document.getElementById('googleSignInBtn');
const googleSignInLabel = document.getElementById('googleSignInLabel');
const googleRoleNote = document.getElementById('googleRoleNote');

function updateGoogleSignIn() {
  const roleName = selectedRole === 'teacher' ? 'teacher' : 'student';
  googleSignInLabel.innerText = `Continue with Google as ${roleName}`;
  googleRoleNote.innerText = `Your Google account will be set up as a ${roleName} the first time you sign in.`;
}

// Pending info about a Google account that isn't registered yet, kept only
// in memory until the onboarding form below is submitted.
let pendingGoogleUser = null; // { uid, email, displayName }

function hideGoogleOnboarding() {
  googleOnboardForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
  document.getElementById('googleSignInWrap').classList.remove('hidden');
  toRegisterWrap.classList.toggle('hidden', selectedRole === 'admin');
  const forgotWrap = document.getElementById('forgotWrap');
  forgotWrap.classList.toggle('hidden', selectedRole === 'admin');
  pendingGoogleUser = null;
}

function showGoogleOnboarding(googleUser) {
  pendingGoogleUser = { uid: googleUser.uid, email: googleUser.email || '', displayName: googleUser.displayName || '' };
  clearMsgs();
  loginForm.classList.add('hidden');
  registerForm.classList.add('hidden');
  toRegisterWrap.classList.add('hidden');
  toLoginWrap.classList.add('hidden');
  document.getElementById('googleSignInWrap').classList.add('hidden');
  document.getElementById('forgotWrap').classList.add('hidden');
  document.getElementById('onboardEmailLabel').innerText = pendingGoogleUser.email || '(no email)';
  document.getElementById('onboardName').value = pendingGoogleUser.displayName || '';
  document.getElementById('onboardAge').value = '';
  document.getElementById('onboardSex').value = '';
  document.getElementById('onboardRegion').value = '';
  document.getElementById('onboardPhone').value = '';
  googleOnboardForm.classList.remove('hidden');
}

document.getElementById('onboardCancelBtn').addEventListener('click', () => {
  hideGoogleOnboarding();
  showRegisterForm(false);
});

googleOnboardForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!pendingGoogleUser) return;
  clearMsgs();

  const name = document.getElementById('onboardName').value.trim();
  const age = document.getElementById('onboardAge').value;
  const sex = document.getElementById('onboardSex').value;
  const region = document.getElementById('onboardRegion').value.trim();
  const phone = document.getElementById('onboardPhone').value.trim();

  if (!isLikelyPhone(phone)) { setError('Enter a valid phone number.'); return; }
  if (!pendingGoogleUser.email || !isGmailAddress(pendingGoogleUser.email)) {
    setError('This Google account does not have a @gmail.com address on file, so it can\'t be used to sign up.');
    return;
  }

  const btn = document.getElementById('onboardBtn');
  btn.disabled = true;
  btn.innerText = 'Creating...';
  try {
    const userKey = `google_${pendingGoogleUser.uid}`;
    const emailKey = normalizeGmail(pendingGoogleUser.email);
    const profile = {
      username: pendingGoogleUser.email,
      usernameKey: userKey,
      email: pendingGoogleUser.email,
      emailKey,
      phone,
      googleUid: pendingGoogleUser.uid,
      authProvider: 'google',
      role: selectedRole,
      name: name || pendingGoogleUser.email,
      age: Number(age), sex, region,
      active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('users').doc(userKey).set(profile);
    saveSession({ role: profile.role, username: profile.username, usernameKey: userKey, name: profile.name, authProvider: 'google' });
    window.location.href = profile.role === 'teacher' ? 'teacher.html' : 'student.html';
  } catch (err) {
    console.error(err);
    setError('Could not create the account. Check your internet connection.');
    btn.disabled = false;
    btn.innerText = 'Finish creating account';
  }
});

async function finishGoogleSignIn(result) {
  const googleUser = result.user;
  const userKey = `google_${googleUser.uid}`;
  const doc = await db.collection('users').doc(userKey).get();

  if (!doc.exists) {
    // First time this Gmail account has ever signed in — collect the same
    // details a normal sign-up would ask for before creating anything.
    showGoogleOnboarding(googleUser);
    return;
  }

  const profile = doc.data();
  if (profile.active === false) throw new Error('This account has been deactivated. Contact your admin.');
  if (profile.role !== selectedRole) {
    throw new Error(`This Google account is registered as a ${profile.role}. Select the ${profile.role} tab to continue.`);
  }

  saveSession({ role: profile.role, username: profile.username, usernameKey: userKey, name: profile.name, authProvider: 'google' });
  window.location.href = profile.role === 'teacher' ? 'teacher.html' : 'student.html';
}

googleSignInBtn.addEventListener('click', async () => {
  if (selectedRole === 'admin') return;
  clearMsgs();
  googleSignInBtn.disabled = true;
  googleSignInLabel.innerText = 'Connecting to Google...';
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await firebase.auth().signInWithPopup(provider);
    await finishGoogleSignIn(result);
  } catch (err) {
    console.error(err);
    const message = err.code === 'auth/popup-closed-by-user'
      ? 'Google sign-in was cancelled.'
      : err.message || 'Could not sign in with Google. Please try again.';
    setError(message);
  } finally {
    googleSignInBtn.disabled = false;
    updateGoogleSignIn();
  }
});
updateGoogleSignIn();

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
    if (data.active === false) {
      setError('This account has been deactivated. Contact your admin.');
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
  const phone = document.getElementById('regPhone').value.trim();
  const typedUser = document.getElementById('regUsername').value.trim();
  const typedPass = document.getElementById('regPassword').value;
  const secQuestion = document.getElementById('regSecQuestion').value;
  const secAnswer = document.getElementById('regSecAnswer').value.trim();
  const btn = document.getElementById('registerBtn');

  if (!isGmailAddress(typedUser)) {
    setError('Please sign up with a Gmail address ending in @gmail.com.');
    return;
  }
  if (!isLikelyPhone(phone)) {
    setError('Enter a valid phone number.');
    return;
  }
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
      setError('That Gmail address is already registered. Please log in instead.');
      return;
    }
    await db.collection('users').doc(key).set({
      username: typedUser,
      email: typedUser,
      emailKey: normalizeGmail(typedUser),
      phone,
      password: typedPass,
      role: selectedRole,
      name, age: Number(age), sex, region,
      active: true,
      secQuestion,
      secAnswerKey: usernameKey(secAnswer),
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

// ---------- FORGOT PASSWORD ----------
const forgotModal = document.getElementById('forgotModal');
const forgotStep1 = document.getElementById('forgotStep1');
const forgotStep2 = document.getElementById('forgotStep2');
const forgotError = document.getElementById('forgotError');
const forgotOk = document.getElementById('forgotOk');
let forgotUserKey = null;

function forgotSetError(msg) {
  forgotError.innerText = msg;
  forgotError.classList.remove('hidden');
  forgotOk.classList.add('hidden');
}
function forgotReset() {
  forgotUserKey = null;
  document.getElementById('forgotUsername').value = '';
  document.getElementById('forgotAnswer').value = '';
  document.getElementById('forgotNewPassword').value = '';
  forgotError.classList.add('hidden');
  forgotOk.classList.add('hidden');
  forgotStep1.classList.remove('hidden');
  forgotStep2.classList.add('hidden');
}

document.getElementById('toForgot').addEventListener('click', () => {
  forgotReset();
  forgotModal.classList.remove('hidden');
});
document.getElementById('forgotCancelBtn1').addEventListener('click', () => forgotModal.classList.add('hidden'));
document.getElementById('forgotCancelBtn2').addEventListener('click', () => forgotModal.classList.add('hidden'));

document.getElementById('forgotNextBtn').addEventListener('click', async () => {
  const typedUser = document.getElementById('forgotUsername').value.trim();
  if (!typedUser) { forgotSetError('Enter your username.'); return; }
  const key = usernameKey(typedUser);
  try {
    const doc = await db.collection('users').doc(key).get();
    if (!doc.exists) { forgotSetError('No account found with that username.'); return; }
    const data = doc.data();
    if (!data.secQuestion || !data.secAnswerKey) {
      forgotSetError('This account has no security question on file. Ask your admin for help.');
      return;
    }
    forgotUserKey = key;
    document.getElementById('forgotQuestionLabel').innerText = data.secQuestion;
    forgotStep1.classList.add('hidden');
    forgotStep2.classList.remove('hidden');
    forgotError.classList.add('hidden');
  } catch (err) {
    console.error(err);
    forgotSetError('Could not reach the server. Check your internet connection.');
  }
});

document.getElementById('forgotSubmitBtn').addEventListener('click', async () => {
  const answer = document.getElementById('forgotAnswer').value.trim();
  const newPassword = document.getElementById('forgotNewPassword').value;
  if (!answer || !newPassword) { forgotSetError('Fill in both fields.'); return; }
  try {
    const doc = await db.collection('users').doc(forgotUserKey).get();
    const data = doc.data();
    if (usernameKey(answer) !== data.secAnswerKey) {
      forgotSetError('That answer doesn\'t match.');
      return;
    }
    await db.collection('users').doc(forgotUserKey).update({ password: newPassword });
    forgotError.classList.add('hidden');
    forgotOk.innerText = 'Password reset! You can log in now.';
    forgotOk.classList.remove('hidden');
    setTimeout(() => forgotModal.classList.add('hidden'), 1800);
  } catch (err) {
    console.error(err);
    forgotSetError('Could not reach the server. Check your internet connection.');
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
