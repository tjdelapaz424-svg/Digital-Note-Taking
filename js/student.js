const session = requireRole('student');
document.getElementById('whoLabel').innerText = session ? session.username : '';

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  window.location.href = 'index.html';
});

const joinModal = document.getElementById('joinModal');
document.getElementById('joinClassBtn').addEventListener('click', () => {
  document.getElementById('joinCodeInput').value = '';
  document.getElementById('joinError').classList.add('hidden');
  joinModal.classList.remove('hidden');
});
document.getElementById('cancelJoinBtn').addEventListener('click', () => joinModal.classList.add('hidden'));

document.getElementById('submitJoinBtn').addEventListener('click', async () => {
  const errBox = document.getElementById('joinError');
  errBox.classList.add('hidden');
  const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
  if (!code) return;

  const btn = document.getElementById('submitJoinBtn');
  btn.disabled = true;
  btn.innerText = 'Checking...';
  try {
    const classDoc = await db.collection('classes').doc(code).get();
    if (!classDoc.exists) {
      errBox.innerText = 'No class found with that code.';
      errBox.classList.remove('hidden');
      return;
    }
    const enrollId = `${code}_${session.usernameKey}`;
    const existing = await db.collection('enrollments').doc(enrollId).get();
    if (existing.exists) {
      errBox.innerText = 'You already requested or joined this class.';
      errBox.classList.remove('hidden');
      return;
    }
    await db.collection('enrollments').doc(enrollId).set({
      classCode: code,
      studentKey: session.usernameKey,
      studentUsername: session.username,
      studentName: session.name || session.username,
      status: 'pending',
      requestedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    joinModal.classList.add('hidden');
    showToast('Request sent! Waiting for teacher approval.');
    loadClasses();
  } catch (err) {
    console.error(err);
    errBox.innerText = 'Something went wrong. Check your connection.';
    errBox.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Request to join';
  }
});

async function loadClasses() {
  const grid = document.getElementById('classGrid');
  grid.innerHTML = '<div class="empty-state">Loading...</div>';
  const snap = await db.collection('enrollments').where('studentKey', '==', session.usernameKey).get();
  const enrollments = [];
  snap.forEach(doc => enrollments.push({ id: doc.id, ...doc.data() }));

  document.getElementById('classEmpty').classList.toggle('hidden', enrollments.length > 0);
  grid.innerHTML = '';

  for (const en of enrollments) {
    const classDoc = await db.collection('classes').doc(en.classCode).get();
    const className = classDoc.exists ? classDoc.data().className : '(class removed)';
    const teacherUsername = classDoc.exists ? classDoc.data().teacherUsername : '';

    const tile = document.createElement('div');
    tile.className = 'class-tile';
    const tagClass = en.status === 'approved' ? 'tag-approved' : en.status === 'rejected' ? 'tag-rejected' : 'tag-pending';
    const tagLabel = en.status === 'approved' ? 'Approved' : en.status === 'rejected' ? 'Rejected' : 'Pending approval';
    tile.innerHTML = `
      <span class="tag ${tagClass}">${tagLabel}</span>
      <h3 style="margin-bottom:2px;">${escapeHtml(className)}</h3>
      <div style="font-size:12.5px;color:#7A8A81;">Teacher: ${escapeHtml(teacherUsername)}</div>
    `;
    if (en.status === 'approved') {
      tile.addEventListener('click', () => {
        window.location.href = `notebook.html?class=${en.classCode}&student=${session.usernameKey}&mode=edit`;
      });
    } else {
      tile.style.cursor = 'default';
      tile.style.opacity = '.85';
    }
    grid.appendChild(tile);
  }
}

loadClasses();
