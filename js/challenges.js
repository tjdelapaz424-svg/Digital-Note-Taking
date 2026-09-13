const session = requireRole('student');
document.getElementById('whoLabel').innerText = session ? session.username : '';

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  window.location.href = 'index.html';
});

const challengeListView = document.getElementById('challengeListView');
const attemptView = document.getElementById('attemptView');
const resultView = document.getElementById('resultView');

let myClassCodes = [];
let activeChallenge = null; // { id, ...data }
let attemptAnswers = []; // selected choice index per question, or null

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function loadChallenges() {
  const grid = document.getElementById('challengeGrid');
  grid.innerHTML = '<div class="empty-state">Loading...</div>';

  const enrollSnap = await db.collection('enrollments')
    .where('studentKey', '==', session.usernameKey)
    .where('status', '==', 'approved')
    .get();
  myClassCodes = enrollSnap.docs.map(d => d.data().classCode);

  if (myClassCodes.length === 0) {
    grid.innerHTML = '';
    document.getElementById('challengeEmpty').classList.remove('hidden');
    return;
  }

  const batches = chunk(myClassCodes, 10); // Firestore 'in' supports up to 10
  const challenges = [];
  for (const batch of batches) {
    const snap = await db.collection('challenges').where('classCode', 'in', batch).get();
    snap.forEach(doc => challenges.push({ id: doc.id, ...doc.data() }));
  }
  challenges.sort((a, b) => (millisFromTimestamp(b.createdAt) || 0) - (millisFromTimestamp(a.createdAt) || 0));

  document.getElementById('challengeEmpty').classList.toggle('hidden', challenges.length > 0);
  grid.innerHTML = '';

  for (const ch of challenges) {
    const classDoc = await db.collection('classes').doc(ch.classCode).get();
    const className = classDoc.exists ? classDoc.data().className : '(class removed)';
    const attemptDoc = await db.collection('challengeAttempts').doc(`${ch.id}_${session.usernameKey}`).get();
    const already = attemptDoc.exists ? attemptDoc.data() : null;

    const tile = document.createElement('div');
    tile.className = 'class-tile';
    tile.innerHTML = `
      <h3 style="margin-bottom:2px;">${escapeHtml(ch.title || 'Class challenge')}</h3>
      <div style="font-size:12.5px;color:#7A8A81;">${escapeHtml(className)} · by ${escapeHtml(ch.createdByName || 'a classmate')}</div>
      <div style="font-size:12.5px;color:#7A8A81;margin-top:4px;">${(ch.items || []).length} questions</div>
      ${already
        ? `<span class="tag tag-approved" style="margin-top:8px;display:inline-block;">Your score: ${already.score}/${already.total}</span>`
        : '<span class="tag tag-pending" style="margin-top:8px;display:inline-block;">Not attempted</span>'}
    `;
    tile.addEventListener('click', () => {
      if (already) openResults(ch, already);
      else openAttempt(ch);
    });
    grid.appendChild(tile);
  }
}

function openAttempt(challenge) {
  activeChallenge = challenge;
  attemptAnswers = new Array((challenge.items || []).length).fill(null);
  document.getElementById('attemptTitle').innerText = challenge.title || 'Challenge';

  const wrap = document.getElementById('attemptQuestions');
  wrap.innerHTML = '';
  (challenge.items || []).forEach((q, qi) => {
    const card = document.createElement('div');
    card.className = 'study-card';
    card.innerHTML = `<div class="q-num">Question ${qi + 1}</div><div class="q-text">${escapeHtml(q.question || '')}</div>`;
    (q.choices || []).forEach((choice, ci) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'study-choice';
      btn.innerText = choice;
      btn.addEventListener('click', () => {
        attemptAnswers[qi] = ci;
        card.querySelectorAll('.study-choice').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
      card.appendChild(btn);
    });
    wrap.appendChild(card);
  });

  challengeListView.classList.add('hidden');
  resultView.classList.add('hidden');
  attemptView.classList.remove('hidden');
}

document.getElementById('finishAttemptBtn').addEventListener('click', async () => {
  if (!activeChallenge) return;
  const items = activeChallenge.items || [];
  let score = 0;
  items.forEach((q, qi) => { if (attemptAnswers[qi] === q.correctIndex) score++; });

  const attempt = {
    challengeId: activeChallenge.id,
    classCode: activeChallenge.classCode,
    studentKey: session.usernameKey,
    studentName: session.name || session.username,
    score,
    total: items.length,
    completedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    await db.collection('challengeAttempts').doc(`${activeChallenge.id}_${session.usernameKey}`).set(attempt);
    recordStudyActivity(session.usernameKey, 'quiz');
    openResults(activeChallenge, { ...attempt, completedAt: { seconds: Math.floor(Date.now() / 1000) } });
  } catch (err) {
    console.error(err);
    showToast('Could not save your attempt. Check your connection.', true);
  }
});

async function openResults(challenge, attempt) {
  activeChallenge = challenge;
  attemptView.classList.add('hidden');
  challengeListView.classList.add('hidden');
  resultView.classList.remove('hidden');
  document.getElementById('resultScore').innerText = `${attempt.score}/${attempt.total}`;

  const snap = await db.collection('challengeAttempts').where('challengeId', '==', challenge.id).get();
  const attempts = [];
  snap.forEach(doc => attempts.push(doc.data()));
  attempts.sort((a, b) => {
    const pctB = b.total ? b.score / b.total : 0;
    const pctA = a.total ? a.score / a.total : 0;
    if (pctB !== pctA) return pctB - pctA;
    return (millisFromTimestamp(a.completedAt) || 0) - (millisFromTimestamp(b.completedAt) || 0);
  });

  const body = document.getElementById('leaderboardBody');
  body.innerHTML = '';
  attempts.forEach((a, i) => {
    const isMe = a.studentKey === session.usernameKey;
    const tr = document.createElement('tr');
    if (isMe) tr.style.background = '#F1E9F8';
    const when = millisFromTimestamp(a.completedAt);
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(a.studentName || '')}${isMe ? ' (you)' : ''}</td>
      <td>${a.score}/${a.total}</td>
      <td>${when ? new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</td>
    `;
    body.appendChild(tr);
  });
}

function backToList() {
  attemptView.classList.add('hidden');
  resultView.classList.add('hidden');
  challengeListView.classList.remove('hidden');
  loadChallenges();
}
document.getElementById('backToChallengesBtn').addEventListener('click', backToList);
document.getElementById('backToChallengesBtn2').addEventListener('click', backToList);

loadChallenges();
