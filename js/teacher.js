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

  let totalStudents = 0, totalPending = 0, totalSubmitted = 0;

  for (const c of myClasses) {
    const enrollSnap = await db.collection('enrollments').where('classCode', '==', c.code).get();
    let pendingCount = 0, approvedCount = 0;
    const approvedKeys = [];
    enrollSnap.forEach(doc => {
      const d = doc.data();
      if (d.status === 'pending') pendingCount++;
      else if (d.status === 'approved') { approvedCount++; approvedKeys.push(d.studentKey); }
    });
    totalStudents += approvedCount;
    totalPending += pendingCount;
    for (const key of approvedKeys) {
      const nbDoc = await db.collection('notebooks').doc(`${c.code}_${key}`).get();
      if (nbDoc.exists && nbDoc.data().submitted) totalSubmitted++;
    }

    const tile = document.createElement('div');
    tile.className = 'class-tile';
    const dueBadge = c.dueDate ? `<div style="font-size:12px;color:#7A6B90;margin-top:6px;">Due ${dueDateLabel(c.dueDate)}</div>` : '';
    tile.innerHTML = `
      <div>${pendingCount > 0 ? `<span class="tag tag-pending">${pendingCount} pending</span>` : ''}</div>
      <h3 style="margin-bottom:2px;">${escapeHtml(c.className)}</h3>
      <div style="font-size:12.5px;color:#7A8A81;">Join code</div>
      <div class="code-pill">${c.code}</div>
      ${dueBadge}
    `;
    tile.addEventListener('click', () => openClassDetail(c));
    grid.appendChild(tile);
  }

  document.getElementById('statClasses').innerText = myClasses.length;
  document.getElementById('statStudents').innerText = totalStudents;
  document.getElementById('statPending').innerText = totalPending;
  document.getElementById('statSubmitted').innerText = totalSubmitted;
}

// ---------- Create class (with optional due date) ----------
const createClassModal = document.getElementById('createClassModal');
document.getElementById('createClassBtn').addEventListener('click', () => {
  document.getElementById('newClassName').value = '';
  document.getElementById('newClassDueDate').value = '';
  document.getElementById('createClassError').classList.add('hidden');
  createClassModal.classList.remove('hidden');
});
document.getElementById('cancelCreateClassBtn').addEventListener('click', () => createClassModal.classList.add('hidden'));

document.getElementById('confirmCreateClassBtn').addEventListener('click', async () => {
  const errBox = document.getElementById('createClassError');
  const className = document.getElementById('newClassName').value.trim();
  const dueDate = document.getElementById('newClassDueDate').value || null;
  if (!className) {
    errBox.innerText = 'Enter a class name.';
    errBox.classList.remove('hidden');
    return;
  }
  const btn = document.getElementById('confirmCreateClassBtn');
  btn.disabled = true;
  btn.innerText = 'Creating...';
  try {
    let code;
    let unique = false;
    while (!unique) {
      code = randomCode(6);
      const existing = await db.collection('classes').doc(code).get();
      if (!existing.exists) unique = true;
    }
    await db.collection('classes').doc(code).set({
      code,
      className,
      dueDate,
      teacherKey: session.usernameKey,
      teacherUsername: session.username,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    createClassModal.classList.add('hidden');
    showToast('Class created! Code: ' + code);
    loadClasses();
  } finally {
    btn.disabled = false;
    btn.innerText = 'Create class';
  }
});

async function openClassDetail(c) {
  selectedClass = c;
  document.getElementById('classDetail').classList.remove('hidden');
  document.getElementById('detailTitle').innerText = c.className;
  document.getElementById('detailCode').innerText = c.code;
  const dueWrap = document.getElementById('detailDueWrap');
  if (c.dueDate) {
    dueWrap.classList.remove('hidden');
    document.getElementById('detailDue').innerText = dueDateLabel(c.dueDate);
  } else {
    dueWrap.classList.add('hidden');
  }
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
    let statusHtml = '<span class="pill" style="background:#EFEAD9;color:#7A8A81;">In progress</span>';
    if (submitted) {
      const submittedAt = millisFromTimestamp(nbDoc.data().submittedAt);
      const late = isSubmissionLate(selectedClass.dueDate, submittedAt);
      statusHtml = late
        ? '<span class="pill" style="background:#FBE0E0;color:var(--red);">Submitted (late)</span>'
        : '<span class="pill" style="background:#DDEEE2;color:#356B4B;">Submitted</span>';
    }
    const hasFeedback = nbDoc.exists && nbDoc.data().feedback && nbDoc.data().feedback.text;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(a.studentName || '')}</td>
      <td>${escapeHtml(a.studentUsername)}</td>
      <td>${statusHtml}</td>
      <td>${hasFeedback ? '<span class="pill" style="background:#E3D6ED;color:var(--green-dark);">Given</span>' : '<span style="color:#B7A9C7;font-size:12.5px;">None</span>'}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn-outline btn-small view-btn">${nbDoc.exists ? 'View notebook' : 'No notes yet'}</button>
        <button class="btn-outline btn-small feedback-btn">Feedback</button>
        <button class="btn-danger btn-small remove-btn">Remove</button>
      </td>`;
    if (nbDoc.exists) {
      tr.querySelector('.view-btn').addEventListener('click', () => {
        window.location.href = `notebook.html?class=${selectedClass.code}&student=${a.studentKey}&mode=view`;
      });
    } else {
      tr.querySelector('.view-btn').disabled = true;
    }
    tr.querySelector('.feedback-btn').addEventListener('click', () => openFeedbackModal(a, nbId, nbDoc.exists ? nbDoc.data().feedback : null));
    tr.querySelector('.remove-btn').addEventListener('click', () => removeStudent(a));
    rosterBody.appendChild(tr);
  }

  loadClasses(); // refresh pending badge counts
}

async function decide(enrollmentId, status) {
  await db.collection('enrollments').doc(enrollmentId).update({ status, studentSeen: false });
  showToast(status === 'approved' ? 'Student approved.' : 'Request rejected.');
  refreshDetail();
}

async function removeStudent(enrollment) {
  if (!confirm(`Remove ${enrollment.studentName || enrollment.studentUsername} from this class? They'll need to request to join again.`)) return;
  await db.collection('enrollments').doc(enrollment.id).delete();
  showToast('Student removed from class.');
  refreshDetail();
}

// ---------- Feedback modal ----------
const feedbackModal = document.getElementById('feedbackModal');
let feedbackTarget = null; // { nbId, enrollment }

function openFeedbackModal(enrollment, nbId, existingFeedback) {
  feedbackTarget = { nbId, enrollment };
  document.getElementById('feedbackStudentName').innerText = enrollment.studentName || enrollment.studentUsername;
  document.getElementById('feedbackText').value = existingFeedback ? existingFeedback.text : '';
  feedbackModal.classList.remove('hidden');
}
document.getElementById('cancelFeedbackBtn').addEventListener('click', () => feedbackModal.classList.add('hidden'));
document.getElementById('saveFeedbackBtn').addEventListener('click', async () => {
  if (!feedbackTarget) return;
  const text = document.getElementById('feedbackText').value.trim();
  await db.collection('notebooks').doc(feedbackTarget.nbId).set({
    feedback: { text, at: firebase.firestore.FieldValue.serverTimestamp(), seenByStudent: false }
  }, { merge: true });
  feedbackModal.classList.add('hidden');
  showToast('Feedback saved.');
  refreshDetail();
});

document.getElementById('approveAllBtn').addEventListener('click', async () => {
  if (!selectedClass) return;
  const snap = await db.collection('enrollments').where('classCode', '==', selectedClass.code).where('status', '==', 'pending').get();
  const batch = db.batch();
  snap.forEach(doc => batch.update(doc.ref, { status: 'approved', studentSeen: false }));
  await batch.commit();
  showToast('All pending requests approved.');
  refreshDetail();
});

loadClasses();
