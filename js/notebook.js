const session = getSession();
if (!session) window.location.href = 'index.html';

const params = new URLSearchParams(window.location.search);
const classCode = params.get('class');
const studentKey = params.get('student');
const mode = params.get('mode') === 'view' ? 'view' : 'edit';
const notebookId = `${classCode}_${studentKey}`;

// Only the owning student may edit; anyone with the link but wrong role/mode just views
const canEdit = mode === 'edit' && session.role === 'student' && session.usernameKey === studentKey;

if (!canEdit) document.getElementById('editToolbar').classList.add('hidden');
document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = session.role === 'teacher' ? 'teacher.html' : 'student.html';
});

const canvas = document.getElementById('nbCanvas');
const ctx = canvas.getContext('2d');
const nbPage = document.getElementById('nbPage');
const dateStamp = document.getElementById('dateStamp');
const nbStatus = document.getElementById('nbStatus');
const nbTitle = document.getElementById('nbTitle');

let notebookData = null; // { pages: [...], submitted, ... }
let currentPageIndex = 0;
let currentColor = '#1E2A28';
let currentTool = 'pen'; // 'pen' | 'text'
let drawing = false;
let currentStroke = null;
let redoStack = []; // per-notebook-load redo stack of page snapshots, keyed by page index
let dragState = null;

function blankPage() {
  return { id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6), date: todayLabel(), strokes: [], texts: [] };
}

async function init() {
  const classDoc = await db.collection('classes').doc(classCode).get();
  nbTitle.innerText = classDoc.exists ? classDoc.data().className + ' — Notebook' : 'Notebook';

  const doc = await db.collection('notebooks').doc(notebookId).get();
  if (doc.exists) {
    notebookData = doc.data();
    if (!notebookData.pages || notebookData.pages.length === 0) notebookData.pages = [blankPage()];
  } else {
    if (!canEdit) {
      notebookData = { pages: [], submitted: false };
      renderEmptyView();
      return;
    }
    notebookData = { pages: [blankPage()], submitted: false, classCode, studentKey };
    await saveNotebook();
  }
  currentPageIndex = 0;
  renderStatus();
  renderPage();
}

function renderEmptyView() {
  nbStatus.innerText = 'No notes yet';
  document.querySelector('.nb-canvas-wrap').innerHTML = '<div class="empty-state" style="color:#fff;">This student hasn\'t written any notes yet.</div>';
  document.querySelector('.nb-bottombar').classList.add('hidden');
}

function renderStatus() {
  nbStatus.innerText = notebookData.submitted ? 'Submitted ✓' : (canEdit ? 'In progress' : 'Not yet submitted');
}

function currentPage() {
  return notebookData.pages[currentPageIndex];
}

function pushHistory() {
  const page = currentPage();
  if (!page._history) page._history = [];
  page._history.push(JSON.stringify({ strokes: page.strokes, texts: page.texts }));
  if (page._history.length > 40) page._history.shift();
  page._redo = [];
}

function undo() {
  const page = currentPage();
  if (!page._history || page._history.length === 0) return;
  const snapshot = page._history.pop();
  if (!page._redo) page._redo = [];
  page._redo.push(JSON.stringify({ strokes: page.strokes, texts: page.texts }));
  const restored = JSON.parse(snapshot);
  page.strokes = restored.strokes;
  page.texts = restored.texts;
  renderPage(true);
  saveNotebook();
}

function redo() {
  const page = currentPage();
  if (!page._redo || page._redo.length === 0) return;
  const snapshot = page._redo.pop();
  page._history.push(JSON.stringify({ strokes: page.strokes, texts: page.texts }));
  const restored = JSON.parse(snapshot);
  page.strokes = restored.strokes;
  page.texts = restored.texts;
  renderPage(true);
  saveNotebook();
}

function drawRuledBackground() {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#DCE7F0';
  ctx.lineWidth = 1;
  for (let y = 60; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(canvas.width, y + 0.5);
    ctx.stroke();
  }
}

function drawStroke(stroke) {
  if (stroke.points.length < 1) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  ctx.stroke();
}

function redrawCanvas() {
  drawRuledBackground();
  const page = currentPage();
  if (!page) return;
  page.strokes.forEach(drawStroke);
}

function renderPage(keepScroll) {
  const page = currentPage();
  if (!page) return;
  redrawCanvas();
  dateStamp.innerText = page.date;

  // clear existing text boxes
  nbPage.querySelectorAll('.nb-text-box').forEach(el => el.remove());
  page.texts.forEach(t => renderTextBox(t));

  document.getElementById('pageIndicator').innerText = `Page ${currentPageIndex + 1} of ${notebookData.pages.length}`;
  document.getElementById('prevPageBtn').disabled = currentPageIndex === 0;
  document.getElementById('nextPageBtn').disabled = currentPageIndex === notebookData.pages.length - 1;
}

function renderTextBox(t) {
  const el = document.createElement('div');
  el.className = 'nb-text-box';
  el.style.left = t.x + '%';
  el.style.top = t.y + '%';
  el.style.color = t.color || '#1E2A28';
  el.innerText = t.text || '';
  el.dataset.id = t.id;

  if (canEdit) {
    el.contentEditable = 'false';
    const delX = document.createElement('span');
    delX.className = 'del-x';
    delX.innerText = '✕';
    delX.addEventListener('click', (e) => {
      e.stopPropagation();
      pushHistory();
      const page = currentPage();
      page.texts = page.texts.filter(x => x.id !== t.id);
      renderPage(true);
      saveNotebook();
    });
    el.appendChild(delX);

    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      el.contentEditable = 'true';
      el.classList.add('editing');
      el.focus();
    });
    el.addEventListener('blur', () => {
      el.contentEditable = 'false';
      el.classList.remove('editing');
      const page = currentPage();
      const target = page.texts.find(x => x.id === t.id);
      if (target) {
        pushHistory();
        target.text = el.innerText.replace(delX.innerText, '').trim();
        saveNotebook();
      }
    });
    el.addEventListener('pointerdown', (e) => {
      if (el.classList.contains('editing')) return;
      e.preventDefault();
      const rect = nbPage.getBoundingClientRect();
      dragState = { el, id: t.id, startX: e.clientX, startY: e.clientY, origLeft: parseFloat(el.style.left), origTop: parseFloat(el.style.top), rect };
    });
  } else {
    el.contentEditable = 'false';
    el.style.cursor = 'default';
  }

  nbPage.appendChild(el);
}

document.addEventListener('pointermove', (e) => {
  if (!dragState) return;
  const dxPct = ((e.clientX - dragState.startX) / dragState.rect.width) * 100;
  const dyPct = ((e.clientY - dragState.startY) / dragState.rect.height) * 100;
  const newLeft = Math.max(0, Math.min(96, dragState.origLeft + dxPct));
  const newTop = Math.max(0, Math.min(96, dragState.origTop + dyPct));
  dragState.el.style.left = newLeft + '%';
  dragState.el.style.top = newTop + '%';
});
document.addEventListener('pointerup', () => {
  if (!dragState) return;
  const page = currentPage();
  const target = page.texts.find(x => x.id === dragState.id);
  if (target) {
    target.x = parseFloat(dragState.el.style.left);
    target.y = parseFloat(dragState.el.style.top);
    saveNotebook();
  }
  dragState = null;
});

// ---------- Drawing ----------
function canvasPointFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

canvas.addEventListener('pointerdown', (e) => {
  if (!canEdit) return;
  if (currentTool === 'text') {
    const rect = nbPage.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    pushHistory();
    const page = currentPage();
    const t = { id: 't' + Date.now(), x: xPct, y: yPct, text: '', color: currentColor };
    page.texts.push(t);
    renderPage(true);
    saveNotebook();
    const box = nbPage.querySelector(`[data-id="${t.id}"]`);
    if (box) { box.contentEditable = 'true'; box.classList.add('editing'); box.focus(); }
    setTool('pen');
    return;
  }
  drawing = true;
  pushHistory();
  const p = canvasPointFromEvent(e);
  currentStroke = { color: currentColor, width: 3, points: [p] };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drawing || !currentStroke) return;
  const p = canvasPointFromEvent(e);
  currentStroke.points.push(p);
  drawStroke({ ...currentStroke, points: currentStroke.points.slice(-2).length > 1 ? currentStroke.points.slice(-2) : currentStroke.points });
});
canvas.addEventListener('pointerup', () => {
  if (!drawing || !currentStroke) return;
  drawing = false;
  if (currentStroke.points.length > 1) currentPage().strokes.push(currentStroke);
  currentStroke = null;
  renderPage(true);
  saveNotebook();
});
canvas.addEventListener('pointerleave', () => {
  if (drawing && currentStroke && currentStroke.points.length > 1) {
    currentPage().strokes.push(currentStroke);
  }
  drawing = false;
  currentStroke = null;
});

// ---------- Toolbar ----------
document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    currentColor = dot.dataset.color;
  });
});

function setTool(tool) {
  currentTool = tool;
  document.getElementById('penToolBtn').classList.toggle('active', tool === 'pen');
  document.getElementById('textToolBtn').classList.toggle('active', tool === 'text');
}
document.getElementById('penToolBtn').addEventListener('click', () => setTool('pen'));
document.getElementById('textToolBtn').addEventListener('click', () => setTool('text'));

document.getElementById('undoBtn').addEventListener('click', undo);
document.getElementById('redoBtn').addEventListener('click', redo);

document.getElementById('clearBtn').addEventListener('click', () => {
  if (!confirm('Clear everything on this page?')) return;
  pushHistory();
  const page = currentPage();
  page.strokes = [];
  page.texts = [];
  renderPage(true);
  saveNotebook();
});

document.getElementById('addPageBtn').addEventListener('click', () => {
  notebookData.pages.push(blankPage());
  currentPageIndex = notebookData.pages.length - 1;
  renderPage();
  saveNotebook();
});

document.getElementById('removePageBtn').addEventListener('click', () => {
  if (notebookData.pages.length <= 1) { showToast('You need at least one page.', true); return; }
  if (!confirm('Remove this page? This cannot be undone.')) return;
  notebookData.pages.splice(currentPageIndex, 1);
  currentPageIndex = Math.max(0, currentPageIndex - 1);
  renderPage();
  saveNotebook();
});

document.getElementById('prevPageBtn').addEventListener('click', () => {
  if (currentPageIndex > 0) { currentPageIndex--; renderPage(); }
});
document.getElementById('nextPageBtn').addEventListener('click', () => {
  if (currentPageIndex < notebookData.pages.length - 1) { currentPageIndex++; renderPage(); }
});

document.getElementById('submitBtn').addEventListener('click', async () => {
  if (!confirm('Submit this notebook to your teacher?')) return;
  notebookData.submitted = true;
  await saveNotebook(true);
  renderStatus();
  showToast('Notebook submitted to your teacher.');
});

// ---------- Persistence ----------
async function saveNotebook(withTimestamp) {
  const cleanPages = notebookData.pages.map(p => ({
    id: p.id, date: p.date, strokes: p.strokes, texts: p.texts.map(t => ({ id: t.id, x: t.x, y: t.y, text: t.text, color: t.color }))
  }));
  const payload = {
    classCode, studentKey,
    pages: cleanPages,
    submitted: !!notebookData.submitted,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (withTimestamp) payload.submittedAt = firebase.firestore.FieldValue.serverTimestamp();
  try {
    await db.collection('notebooks').doc(notebookId).set(payload, { merge: true });
  } catch (err) {
    console.error('save failed', err);
    showToast('Could not save — check your connection.', true);
  }
}

init();
