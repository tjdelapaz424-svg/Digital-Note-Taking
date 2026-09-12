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
let classData = null; // { dueDate, ... }
let currentPageIndex = 0;
let currentColor = '#1E2A28';
let currentTool = 'pen'; // 'pen' | 'highlighter' | 'eraser' | 'text'
let drawing = false;
let currentStroke = null;
let activePointerId = null;
let redoStack = []; // per-notebook-load redo stack of page snapshots, keyed by page index
let dragState = null;

const TOOL_SETTINGS = {
  pen: { width: 3, alpha: 1, composite: 'source-over' },
  highlighter: { width: 18, alpha: 0.35, composite: 'source-over' },
  eraser: { width: 26, alpha: 1, composite: 'destination-out' }
};

function blankPage() {
  return { id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6), date: todayLabel(), strokes: [], texts: [] };
}

async function init() {
  const classDoc = await db.collection('classes').doc(classCode).get();
  classData = classDoc.exists ? classDoc.data() : null;
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
  renderDueAndFeedback();
  renderPage();
}

function renderDueAndFeedback() {
  const dueFlag = document.getElementById('dueFlag');
  const lateFlag = document.getElementById('lateFlag');
  dueFlag.style.display = 'none';
  lateFlag.style.display = 'none';

  if (classData && classData.dueDate) {
    if (notebookData.submitted) {
      const submittedAt = millisFromTimestamp(notebookData.submittedAt);
      if (isSubmissionLate(classData.dueDate, submittedAt)) lateFlag.style.display = 'inline-block';
    } else if (canEdit) {
      const cd = dueCountdown(classData.dueDate);
      if (cd) {
        dueFlag.innerText = cd.label;
        dueFlag.style.background = cd.overdue ? 'rgba(178,58,58,.85)' : 'rgba(255,255,255,.15)';
        dueFlag.style.display = 'inline-block';
      }
    }
  }

  const banner = document.getElementById('feedbackBanner');
  if (notebookData.feedback && notebookData.feedback.text) {
    banner.classList.remove('hidden');
    document.getElementById('feedbackBannerText').innerText = notebookData.feedback.text;
    // Mark as seen once the owning student views it
    if (session.role === 'student' && session.usernameKey === studentKey && notebookData.feedback.seenByStudent === false) {
      db.collection('notebooks').doc(notebookId).set({ feedback: { seenByStudent: true } }, { merge: true });
    }
  } else {
    banner.classList.add('hidden');
  }
}

function renderEmptyView() {
  nbStatus.innerText = 'No notes yet';
  document.querySelector('.nb-canvas-wrap').innerHTML = '<div class="empty-state" style="color:#fff;">This student hasn\'t written any notes yet.</div>';
  document.querySelector('.nb-bottombar').classList.add('hidden');
  document.getElementById('nbThumbs').classList.add('hidden');
  document.getElementById('exportPdfBtn').classList.add('hidden');
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
  const settings = TOOL_SETTINGS[stroke.tool] || TOOL_SETTINGS.pen;
  ctx.save();
  ctx.globalCompositeOperation = settings.composite;
  ctx.globalAlpha = settings.alpha;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  ctx.stroke();
  ctx.restore();
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

  renderThumbs();
}

// ---------- Page thumbnails ----------
function paintStrokesToContext(targetCtx, strokes, scale) {
  strokes.forEach(stroke => {
    if (!stroke.points || stroke.points.length < 1) return;
    const settings = TOOL_SETTINGS[stroke.tool] || TOOL_SETTINGS.pen;
    targetCtx.save();
    targetCtx.globalCompositeOperation = settings.composite;
    targetCtx.globalAlpha = settings.alpha;
    targetCtx.strokeStyle = stroke.color;
    targetCtx.lineWidth = Math.max(1, stroke.width * scale);
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.beginPath();
    targetCtx.moveTo(stroke.points[0].x * scale, stroke.points[0].y * scale);
    for (let i = 1; i < stroke.points.length; i++) targetCtx.lineTo(stroke.points[i].x * scale, stroke.points[i].y * scale);
    targetCtx.stroke();
    targetCtx.restore();
  });
}

function renderThumbs() {
  const wrap = document.getElementById('nbThumbs');
  wrap.innerHTML = '';
  const thumbW = 90, thumbH = Math.round(90 * (canvas.height / canvas.width));
  const scale = thumbW / canvas.width;
  notebookData.pages.forEach((page, idx) => {
    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'nb-thumb' + (idx === currentPageIndex ? ' active' : '');
    const c = document.createElement('canvas');
    c.width = thumbW; c.height = thumbH;
    const tctx = c.getContext('2d');
    tctx.fillStyle = '#fff';
    tctx.fillRect(0, 0, thumbW, thumbH);
    paintStrokesToContext(tctx, page.strokes, scale);
    thumbWrap.appendChild(c);
    const label = document.createElement('div');
    label.className = 'nb-thumb-label';
    label.innerText = idx + 1;
    thumbWrap.appendChild(label);
    thumbWrap.addEventListener('click', () => { currentPageIndex = idx; renderPage(); });
    wrap.appendChild(thumbWrap);
  });
}

// ---------- PDF export ----------
async function exportPdf() {
  const btn = document.getElementById('exportPdfBtn');
  btn.disabled = true;
  btn.innerText = 'Preparing...';
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [canvas.width, canvas.height] });
    for (let i = 0; i < notebookData.pages.length; i++) {
      const page = notebookData.pages[i];
      const off = document.createElement('canvas');
      off.width = canvas.width; off.height = canvas.height;
      const octx = off.getContext('2d');
      octx.fillStyle = '#FFFFFF';
      octx.fillRect(0, 0, off.width, off.height);
      octx.strokeStyle = '#DCE7F0';
      octx.lineWidth = 1;
      for (let y = 60; y < off.height; y += 40) {
        octx.beginPath(); octx.moveTo(0, y + 0.5); octx.lineTo(off.width, y + 0.5); octx.stroke();
      }
      octx.strokeStyle = '#E9B9B9';
      octx.lineWidth = 2;
      octx.beginPath(); octx.moveTo(70, 0); octx.lineTo(70, off.height); octx.stroke();

      paintStrokesToContext(octx, page.strokes, 1);

      page.texts.forEach(t => {
        octx.fillStyle = t.color || '#1E2A28';
        octx.font = "20px 'Patrick Hand', cursive, sans-serif";
        octx.fillText(t.text || '', (t.x / 100) * off.width, (t.y / 100) * off.height + 20);
      });

      octx.fillStyle = '#5B4570';
      octx.font = "20px 'Patrick Hand', cursive, sans-serif";
      const dateText = page.date || '';
      octx.fillText(dateText, off.width - 20 - octx.measureText(dateText).width, 34);

      if (i > 0) pdf.addPage([off.width, off.height], 'portrait');
      pdf.addImage(off.toDataURL('image/png'), 'PNG', 0, 0, off.width, off.height);
    }
    const fname = `${(classData ? classData.className : 'notebook').replace(/[^a-z0-9]+/gi, '-')}-${studentKey}.pdf`;
    pdf.save(fname);
  } catch (err) {
    console.error(err);
    showToast('Could not export PDF.', true);
  } finally {
    btn.disabled = false;
    btn.innerText = '⬇ PDF';
  }
}
document.getElementById('exportPdfBtn').addEventListener('click', exportPdf);

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
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
    // Pen pressure is available on iPad Pencil, Android styluses, and Windows pens.
    // A neutral value keeps mouse and ordinary touch strokes consistent.
    pressure: e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5
  };
}

canvas.addEventListener('pointerdown', (e) => {
  if (!canEdit) return;
  // Ignore a second finger while writing. This prevents most accidental palm marks.
  if (drawing || (e.pointerType === 'touch' && activePointerId !== null)) return;
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
  activePointerId = e.pointerId;
  pushHistory();
  const p = canvasPointFromEvent(e);
  const settings = TOOL_SETTINGS[currentTool] || TOOL_SETTINGS.pen;
  const pressureWidth = currentTool === 'pen' ? settings.width * (0.55 + p.pressure * 0.9) : settings.width;
  currentStroke = { color: currentTool === 'eraser' ? '#000000' : currentColor, width: pressureWidth, tool: currentTool, points: [p] };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drawing || !currentStroke || e.pointerId !== activePointerId) return;
  // Coalesced events make fast stylus writing smoother where the browser supports them.
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  events.forEach(move => {
    const p = canvasPointFromEvent(move);
    currentStroke.points.push(p);
    drawStroke({ ...currentStroke, points: currentStroke.points.slice(-2) });
  });
});
function finishStroke(e, save = true) {
  if (!drawing || !currentStroke || (e && e.pointerId !== activePointerId)) return;
  drawing = false;
  if (currentStroke.points.length > 1) currentPage().strokes.push(currentStroke);
  currentStroke = null;
  activePointerId = null;
  renderPage(true);
  if (save) saveNotebook();
}
canvas.addEventListener('pointerup', finishStroke);
canvas.addEventListener('pointercancel', e => finishStroke(e));
canvas.addEventListener('lostpointercapture', e => finishStroke(e));

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
  document.getElementById('highlighterToolBtn').classList.toggle('active', tool === 'highlighter');
  document.getElementById('eraserToolBtn').classList.toggle('active', tool === 'eraser');
  document.getElementById('textToolBtn').classList.toggle('active', tool === 'text');
}
document.getElementById('penToolBtn').addEventListener('click', () => setTool('pen'));
document.getElementById('highlighterToolBtn').addEventListener('click', () => setTool('highlighter'));
document.getElementById('eraserToolBtn').addEventListener('click', () => setTool('eraser'));
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
  notebookData.submittedAt = { seconds: Math.floor(Date.now() / 1000) }; // optimistic local value until saved
  await saveNotebook(true);
  renderStatus();
  renderDueAndFeedback();
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
