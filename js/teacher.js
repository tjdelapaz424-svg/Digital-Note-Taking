const session = requireRole('teacher');
document.getElementById('whoLabel').innerText = session ? session.username : '';

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  window.location.href = 'index.html';
});

let myClasses = [];
let selectedClass = null;

async function loadClasses() {
  const grid = document.getElementById('classGrid');
  grid.innerHTML = '<div class="empty-state">Loading...</div>';
  const snap = await db.collection('classes').where('teacherKey', '==', session.usernameKey).get();
  myClasses = [];
  snap.forEach(doc => myClasses.push({ id: doc.id, ...doc.data() }));

  document.getElementById('classEmpty').classList.toggle('hidden', myClasses.length > 0);
  grid.innerHTML = '';
  for (const c of myClasses) {
    const pendingCount = await countPending(c.code);
    const tile = document.createElement('div');
    tile.className = 'class-tile';
    tile.innerHTML = `
      <div>${pendingCount > 0 ? `<span class="tag tag-pending">${pendingCount} pending</span>` : ''}</div>
      <h3 style="margin-bottom:2px;">${escapeHtml(c.className)}</h3>
      <div style="font-size:12.5px;color:#7A8A81;">Join code</div>
      <div class="code-pill">${c.code}</div>
    `;
    tile.addEventListener('click', () => openClassDetail(c));
    grid.appendChild(tile);
  }
}

async function countPending(code) {
  const snap = await db.collection('enrollments').where('classCode', '==', code).where('status', '==', 'pending').get();
  return snap.size;
}

document.getElementById('createClassBtn').addEventListener('click', async () => {
  const className = prompt('Class name (e.g. Grade 8 - Science)');
  if (!className || !className.trim()) return;
  let code;
  let unique = false;
  while (!unique) {
    code = randomCode(6);
    const existing = await db.collection('classes').doc(code).get();
    if (!existing.exists) unique = true;
  }
  await db.collection('classes').doc(code).set({
    code,
    className: className.trim(),
    teacherKey: session.usernameKey,
    teacherUsername: session.username,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  showToast('Class created! Code: ' + code);
  loadClasses();
});

async function openClassDetail(c) {
  selectedClass = c;
  document.getElementById('classDetail').classList.remove('hidden');
  document.getElementById('detailTitle').innerText = c.className;
  document.getElementById('detailCode').innerText = c.code;
  await refreshDetail();
  document.getElementById('classDetail').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('closeDetailBtn').addEventListener('click', () => {
  document.getElementById('classDetail').classList.add('hidden');
  selectedClass = null;
});

async function refreshDetail() {
  if (!selectedClass) return;
  const snap = await db.collection('enrollments').where('classCode', '==', selectedClass.code).get();
  const pending = [];
  const approved = [];
  snap.forEach(doc => {
    const d = { id: doc.id, ...doc.data() };
    if (d.status === 'pending') pending.push(d);
    else if (d.status === 'approved') approved.push(d);
  });

  const pendingBody = document.getElementById('pendingBody');
  pendingBody.innerHTML = '';
  document.getElementById('pendingEmpty').classList.toggle('hidden', pending.length > 0);
  pending.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.studentName || '')}</td>
      <td>${escapeHtml(p.studentUsername)}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn-sage btn-small approve-btn">Approve</button>
        <button class="btn-danger btn-small reject-btn">Reject</button>
      </td>`;
    tr.querySelector('.approve-btn').addEventListener('click', () => decide(p.id, 'approved'));
    tr.querySelector('.reject-btn').addEventListener('click', () => decide(p.id, 'rejected'));
    pendingBody.appendChild(tr);
  });

  const rosterBody = document.getElementById('rosterBody');
  rosterBody.innerHTML = '';
  document.getElementById('rosterEmpty').classList.toggle('hidden', approved.length > 0);
  for (const a of approved) {
    const nbId = `${selectedClass.code}_${a.studentKey}`;
    const nbDoc = await db.collection('notebooks').doc(nbId).get();
    const submitted = nbDoc.exists && nbDoc.data().submitted;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(a.studentName || '')}</td>
      <td>${escapeHtml(a.studentUsername)}</td>
      <td>${submitted ? '<span class="pill" style="background:#DDEEE2;color:#356B4B;">Submitted</span>' : '<span class="pill" style="background:#EFEAD9;color:#7A8A81;">In progress</span>'}</td>
      <td style="text-align:right;">
        <button class="btn-outline btn-small view-btn">${nbDoc.exists ? 'View notebook' : 'No notes yet'}</button>
      </td>`;
    if (nbDoc.exists) {
      tr.querySelector('.view-btn').addEventListener('click', () => {
        window.location.href = `notebook.html?class=${selectedClass.code}&student=${a.studentKey}&mode=view`;
      });
    } else {
      tr.querySelector('.view-btn').disabled = true;
    }
    rosterBody.appendChild(tr);
  }

  loadClasses(); // refresh pending badge counts
}

async function decide(enrollmentId, status) {
  await db.collection('enrollments').doc(enrollmentId).update({ status });
  showToast(status === 'approved' ? 'Student approved.' : 'Request rejected.');
  refreshDetail();
}

document.getElementById('approveAllBtn').addEventListener('click', async () => {
  if (!selectedClass) return;
  const snap = await db.collection('enrollments').where('classCode', '==', selectedClass.code).where('status', '==', 'pending').get();
  const batch = db.batch();
  snap.forEach(doc => batch.update(doc.ref, { status: 'approved' }));
  await batch.commit();
  showToast('All pending requests approved.');
  refreshDetail();
});

loadClasses();
