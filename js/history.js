const session = requireRole('student');
document.getElementById('whoLabel').innerText = session ? session.username : '';

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  window.location.href = 'index.html';
});

async function loadHistory() {
  const body = document.getElementById('historyBody');
  body.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

  const snap = await db.collection('notebooks').where('studentKey', '==', session.usernameKey).get();
  const submitted = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (d.submitted) submitted.push({ id: doc.id, ...d });
  });

  // Most recently submitted first
  submitted.sort((a, b) => (millisFromTimestamp(b.submittedAt) || 0) - (millisFromTimestamp(a.submittedAt) || 0));

  document.getElementById('historyEmpty').classList.toggle('hidden', submitted.length > 0);
  body.innerHTML = '';

  for (const nb of submitted) {
    const classDoc = await db.collection('classes').doc(nb.classCode).get();
    const className = classDoc.exists ? classDoc.data().className : '(class removed)';
    const dueDate = classDoc.exists ? classDoc.data().dueDate : null;
    const submittedAtMillis = millisFromTimestamp(nb.submittedAt);
    const late = isSubmissionLate(dueDate, submittedAtMillis);
    const submittedLabel = submittedAtMillis ? new Date(submittedAtMillis).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const hasFeedback = nb.feedback && nb.feedback.text;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(className)}</td>
      <td>${submittedLabel}</td>
      <td>${late ? '<span class="pill" style="background:#FBE0E0;color:var(--red);">Late</span>' : '<span class="pill" style="background:#DDEEE2;color:#356B4B;">On time</span>'}</td>
      <td>${hasFeedback ? escapeHtml(nb.feedback.text) : '<span style="color:#B7A9C7;font-size:12.5px;">None yet</span>'}</td>
      <td style="text-align:right;">
        <button class="btn-outline btn-small view-btn">View</button>
      </td>
    `;
    tr.querySelector('.view-btn').addEventListener('click', () => {
      window.location.href = `notebook.html?class=${nb.classCode}&student=${session.usernameKey}&mode=view`;
    });
    body.appendChild(tr);
  }
}

loadHistory();
