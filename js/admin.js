const session = requireRole('admin');

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  window.location.href = 'index.html';
});

let currentRole = 'teacher';
let currentRows = [];
let searchQuery = '';

document.getElementById('tabTeachers').addEventListener('click', () => switchTab('teacher'));
document.getElementById('tabStudents').addEventListener('click', () => switchTab('student'));
document.getElementById('searchInput').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim().toLowerCase();
  renderRows();
});

function switchTab(role) {
  currentRole = role;
  document.getElementById('tabTeachers').classList.toggle('active', role === 'teacher');
  document.getElementById('tabStudents').classList.toggle('active', role === 'student');
  document.getElementById('panelTitle').innerText = role === 'teacher' ? 'Teacher accounts' : 'Student accounts';
  loadAccounts();
}

async function loadAccounts() {
  const body = document.getElementById('accountsBody');
  body.innerHTML = '<tr><td colspan="8">Loading...</td></tr>';
  const snap = await db.collection('users').where('role', '==', currentRole).get();
  currentRows = [];
  snap.forEach(doc => currentRows.push({ id: doc.id, ...doc.data() }));
  renderRows();
  loadStats();
}

function renderRows() {
  const body = document.getElementById('accountsBody');
  const rows = currentRows.filter(u => {
    if (!searchQuery) return true;
    const name = (u.name || '').toLowerCase();
    const region = (u.region || '').toLowerCase();
    return name.includes(searchQuery) || region.includes(searchQuery);
  });

  document.getElementById('accountsEmpty').classList.toggle('hidden', rows.length > 0);
  body.innerHTML = '';
  rows.forEach(u => {
    const active = u.active !== false;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(u.name || '')}</td>
      <td>${escapeHtml(u.username || '')}</td>
      <td style="font-family:monospace;">${escapeHtml(u.password || '')}</td>
      <td>${u.age ?? ''}</td>
      <td>${escapeHtml(u.sex || '')}</td>
      <td>${escapeHtml(u.region || '')}</td>
      <td>${active ? '<span class="pill" style="background:#DDEEE2;color:#356B4B;">Active</span>' : '<span class="pill" style="background:#FBE0E0;color:var(--red);">Deactivated</span>'}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn-outline btn-small toggle-btn">${active ? 'Deactivate' : 'Reactivate'}</button>
        <button class="btn-danger btn-small delete-btn">Delete</button>
      </td>
    `;
    tr.querySelector('.toggle-btn').addEventListener('click', () => toggleActive(u.id, !active));
    tr.querySelector('.delete-btn').addEventListener('click', () => deleteAccount(u.id, u.name || u.username));
    body.appendChild(tr);
  });
}

async function toggleActive(userId, makeActive) {
  await db.collection('users').doc(userId).update({ active: makeActive });
  showToast(makeActive ? 'Account reactivated.' : 'Account deactivated.');
  loadAccounts();
}

async function deleteAccount(userId, label) {
  if (!confirm(`Permanently delete the account "${label}"? This cannot be undone.`)) return;
  await db.collection('users').doc(userId).delete();
  showToast('Account deleted.');
  loadAccounts();
}

async function loadStats() {
  const [teachersSnap, studentsSnap, classesSnap, notebooksSnap] = await Promise.all([
    db.collection('users').where('role', '==', 'teacher').get(),
    db.collection('users').where('role', '==', 'student').get(),
    db.collection('classes').get(),
    db.collection('notebooks').get()
  ]);
  document.getElementById('statTotalAccounts').innerText = teachersSnap.size + studentsSnap.size;
  document.getElementById('statTotalClasses').innerText = classesSnap.size;
  let submittedCount = 0;
  notebooksSnap.forEach(doc => { if (doc.data().submitted) submittedCount++; });
  document.getElementById('statTotalSubmitted').innerText = submittedCount;
}

switchTab('teacher');
