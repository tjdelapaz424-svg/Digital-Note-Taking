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
      studentSeen: true,
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
    const dueDate = classDoc.exists ? classDoc.data().dueDate : null;

    let feedbackTag = '';
    let dueHtml = '';
    if (en.status === 'approved') {
      const nbDoc = await db.collection('notebooks').doc(`${en.classCode}_${session.usernameKey}`).get();
      const nb = nbDoc.exists ? nbDoc.data() : null;
      if (nb && nb.feedback && nb.feedback.text && !nb.feedback.seenByStudent) {
        feedbackTag = '<span class="tag" style="background:#E3D6ED;color:var(--green-dark);margin-left:6px;">New feedback</span>';
      }
      if (dueDate && !(nb && nb.submitted)) {
        const cd = dueCountdown(dueDate);
        if (cd) dueHtml = `<div style="font-size:12px;margin-top:6px;${cd.overdue ? 'color:var(--red);font-weight:700;' : cd.soon ? 'color:#8A6414;font-weight:700;' : 'color:#7A8A81;'}">${cd.label}</div>`;
      }
    }

    const tile = document.createElement('div');
    tile.className = 'class-tile';
    const tagClass = en.status === 'approved' ? 'tag-approved' : en.status === 'rejected' ? 'tag-rejected' : 'tag-pending';
    const tagLabel = en.status === 'approved' ? 'Approved' : en.status === 'rejected' ? 'Rejected' : 'Pending approval';
    tile.innerHTML = `
      <button class="tile-delete-btn" title="Leave class" aria-label="Leave class">✕</button>
      <span class="tag ${tagClass}">${tagLabel}</span>${feedbackTag}
      <h3 style="margin-bottom:2px;">${escapeHtml(className)}</h3>
      <div style="font-size:12.5px;color:#7A8A81;">Teacher: ${escapeHtml(teacherUsername)}</div>
      ${dueHtml}
    `;
    tile.querySelector('.tile-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      leaveClass(en, className);
    });
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

async function leaveClass(enrollment, className) {
  const msg = enrollment.status === 'approved'
    ? `Leave "${className}"? You'll need a new join code from your teacher to get back in. Your notebook notes for this class are kept in case you rejoin.`
    : `Cancel your request to join "${className}"?`;
  if (!confirm(msg)) return;
  try {
    await db.collection('enrollments').doc(enrollment.id).delete();
    showToast(enrollment.status === 'approved' ? 'You left the class.' : 'Request cancelled.');
    loadClasses();
  } catch (err) {
    console.error(err);
    showToast('Could not do that. Check your connection.', true);
  }
}

// ---------- Notifications ----------
const bellBtn = document.getElementById('bellBtn');
const bellBadge = document.getElementById('bellBadge');
const notifPanel = document.getElementById('notifPanel');
let notifItems = [];

async function refreshNotifications() {
  notifItems = [];
  const enrollSnap = await db.collection('enrollments').where('studentKey', '==', session.usernameKey).get();
  for (const doc of enrollSnap.docs) {
    const en = doc.data();
    if ((en.status === 'approved' || en.status === 'rejected') && en.studentSeen === false) {
      notifItems.push({
        text: en.status === 'approved' ? `You were approved to join a class.` : `Your join request was declined.`,
        markSeen: () => db.collection('enrollments').doc(doc.id).update({ studentSeen: true })
      });
    }
  }
  const nbSnap = await db.collection('notebooks').where('studentKey', '==', session.usernameKey).get();
  for (const doc of nbSnap.docs) {
    const nb = doc.data();
    if (nb.feedback && nb.feedback.text && nb.feedback.seenByStudent === false) {
      notifItems.push({
        text: `Your teacher left feedback on a notebook.`,
        link: `notebook.html?class=${nb.classCode}&student=${nb.studentKey}&mode=edit`,
        markSeen: () => db.collection('notebooks').doc(doc.id).set({ feedback: { seenByStudent: true } }, { merge: true })
      });
    }
  }
  bellBadge.innerText = notifItems.length;
  bellBadge.classList.toggle('hidden', notifItems.length === 0);
  renderNotifPanel();
}

function renderNotifPanel() {
  if (notifItems.length === 0) {
    notifPanel.innerHTML = '<div class="empty-state" style="padding:16px;">No new notifications.</div>';
    return;
  }
  notifPanel.innerHTML = '';
  notifItems.forEach((n, i) => {
    const item = document.createElement('div');
    item.className = 'notif-item';
    item.innerText = n.text;
    item.addEventListener('click', async () => {
      await n.markSeen();
      if (n.link) window.location.href = n.link;
      else { notifPanel.classList.add('hidden'); refreshNotifications(); loadClasses(); }
    });
    notifPanel.appendChild(item);
  });
}

bellBtn.addEventListener('click', () => {
  notifPanel.classList.toggle('hidden');
});

async function loadStreakWidget() {
  try {
    const doc = await db.collection('users').doc(session.usernameKey).get();
    const stats = (doc.exists && doc.data().studyStats) || {};
    document.getElementById('statStreak').innerText = `${stats.currentStreak || 0} 🔥`;
    document.getElementById('statLongestStreak').innerText = stats.longestStreak || 0;
    document.getElementById('statQuizzes').innerText = stats.quizzesCompleted || 0;
    document.getElementById('statFlashSessions').innerText = stats.flashcardSessions || 0;
  } catch (err) {
    console.error('Could not load streak stats', err);
  }
}

loadClasses();
refreshNotifications();
loadStreakWidget();
