const session = requireRole('admin');

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  window.location.href = 'index.html';
});

let currentRole = 'teacher';

document.getElementById('tabTeachers').addEventListener('click', () => switchTab('teacher'));
document.getElementById('tabStudents').addEventListener('click', () => switchTab('student'));

function switchTab(role) {
  currentRole = role;
  document.getElementById('tabTeachers').classList.toggle('active', role === 'teacher');
  document.getElementById('tabStudents').classList.toggle('active', role === 'student');
  document.getElementById('panelTitle').innerText = role === 'teacher' ? 'Teacher accounts' : 'Student accounts';
  loadAccounts();
}

async function loadAccounts() {
  const body = document.getElementById('accountsBody');
  body.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
  const snap = await db.collection('users').where('role', '==', currentRole).get();
  const rows = [];
  snap.forEach(doc => rows.push(doc.data()));

  document.getElementById('accountsEmpty').classList.toggle('hidden', rows.length > 0);
  body.innerHTML = '';
  rows.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(u.name || '')}</td>
      <td>${escapeHtml(u.username || '')}</td>
      <td style="font-family:monospace;">${escapeHtml(u.password || '')}</td>
      <td>${u.age ?? ''}</td>
      <td>${escapeHtml(u.sex || '')}</td>
      <td>${escapeHtml(u.region || '')}</td>
    `;
    body.appendChild(tr);
  });
}

switchTab('teacher');
