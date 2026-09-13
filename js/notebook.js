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
let brushSize = 3;
let penOnly = localStorage.getItem('nb_pen_only') === 'true';
let drawing = false;
let currentStroke = null;
let activePointerId = null;
let redoStack = []; // per-notebook-load redo stack of page snapshots, keyed by page index
let dragState = null;

// ---- Text size, notebook theme, focus tracking, text selection ----
let currentTextSize = 20; // px, used for newly created text boxes and as the "Size" slider value while the text tool is active
let notebookTheme = { accent: '#6C4AB6', paper: '#FFFFFF' }; // per-notebook customization, saved with the notebook
let selectedTextId = null; // id of the text box currently showing its mini toolbar
let miniToolbarEl = null;
let focusStats = { tabSwitches: 0, lastAwayAt: null }; // how often the student left the tab while editing
let focusSaveTimer = null;

const TOOL_SETTINGS = {
  pen: { width: 3, alpha: 1, composite: 'source-over' },
  highlighter: { width: 18, alpha: 0.35, composite: 'source-over' },
  eraser: { width: 26, alpha: 1, composite: 'destination-out' }
};

function setConnectionStatus() {
  if (!canEdit || !notebookData) return;
  if (!navigator.onLine) nbStatus.innerText = 'Saved on device — waiting to sync';
  else if (!notebookData.submitted) nbStatus.innerText = 'In progress';
}

window.addEventListener('offline', () => {
  setConnectionStatus();
  showToast('You are offline. Changes are saved on this device and will sync when reconnected.');
});
window.addEventListener('online', () => {
  setConnectionStatus();
  showToast('Back online — syncing your notebook.');
});

function blankPage(template = 'ruled') {
  return { id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6), date: todayLabel(), template, strokes: [], texts: [] };
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
  if (notebookData.theme) notebookTheme = { ...notebookTheme, ...notebookData.theme };
  if (notebookData.focusStats) focusStats = { ...focusStats, ...notebookData.focusStats };
  applyTheme();
  currentPageIndex = 0;
  renderStatus();
  renderDueAndFeedback();
  renderPage();
  if (canEdit) initFocusTracking();
}

// ---------- Notebook theme (Customize) ----------
function applyTheme() {
  nbPage.style.setProperty('--nb-accent', notebookTheme.accent || '#6C4AB6');
  nbPage.style.background = notebookTheme.paper && notebookTheme.paper !== '#FFFFFF' ? notebookTheme.paper : '';
  // Re-apply on top of the ruled/grid background image, which is set via CSS classes.
  if (notebookTheme.paper && notebookTheme.paper !== '#FFFFFF') {
    const template = currentPage() ? (currentPage().template || 'ruled') : 'ruled';
    if (template === 'ruled') {
      nbPage.style.background = `repeating-linear-gradient(to bottom, ${notebookTheme.paper} 0, ${notebookTheme.paper} 39px, #DCE7F0 39px, #DCE7F0 40px)`;
    } else if (template === 'grid') {
      nbPage.style.backgroundColor = notebookTheme.paper;
    } else {
      nbPage.style.background = notebookTheme.paper;
    }
  }
  document.getElementById('dateStamp').style.color = notebookTheme.accent || '#5B4570';
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
  setConnectionStatus();
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

function drawPaperBackground(targetCtx, width, height, template = 'ruled') {
  targetCtx.fillStyle = '#FFFFFF';
  targetCtx.fillRect(0, 0, width, height);
  targetCtx.strokeStyle = '#DCE7F0';
  targetCtx.lineWidth = 1;
  if (template === 'grid') {
    for (let x = 0; x < width; x += 32) { targetCtx.beginPath(); targetCtx.moveTo(x + .5, 0); targetCtx.lineTo(x + .5, height); targetCtx.stroke(); }
    for (let y = 0; y < height; y += 32) { targetCtx.beginPath(); targetCtx.moveTo(0, y + .5); targetCtx.lineTo(width, y + .5); targetCtx.stroke(); }
  } else if (template === 'ruled') {
    for (let y = 60; y < height; y += 40) { targetCtx.beginPath(); targetCtx.moveTo(0, y + .5); targetCtx.lineTo(width, y + .5); targetCtx.stroke(); }
    targetCtx.strokeStyle = '#E9B9B9';
    targetCtx.lineWidth = 2;
    targetCtx.beginPath(); targetCtx.moveTo(70, 0); targetCtx.lineTo(70, height); targetCtx.stroke();
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
  // The paper lives behind the transparent ink canvas, so the eraser can never remove it.
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const page = currentPage();
  if (!page) return;
  page.strokes.forEach(drawStroke);
}

function renderPage(keepScroll) {
  const page = currentPage();
  if (!page) return;
  redrawCanvas();
  const template = page.template || 'ruled';
  nbPage.classList.remove('template-blank', 'template-grid', 'template-ruled');
  nbPage.classList.add(`template-${template}`);
  dateStamp.innerText = page.date;
  applyTheme();

  // clear existing text boxes and any open mini toolbar
  clearTextSelection();
  nbPage.querySelectorAll('.nb-text-box').forEach(el => el.remove());
  page.texts.forEach(t => renderTextBox(t));

  document.getElementById('pageIndicator').innerText = `Page ${currentPageIndex + 1} of ${notebookData.pages.length}`;
  document.getElementById('prevPageBtn').disabled = currentPageIndex === 0;
  document.getElementById('nextPageBtn').disabled = currentPageIndex === notebookData.pages.length - 1;

  renderThumbs();
}

// ---------- Page thumbnails ----------
function paintStrokesToContext(targetCtx, strokes, scale) {
  // Draw ink on a transparent layer first. Eraser strokes then erase only ink,
  // never the paper pattern already painted onto targetCtx.
  const inkCanvas = document.createElement('canvas');
  inkCanvas.width = targetCtx.canvas.width;
  inkCanvas.height = targetCtx.canvas.height;
  const inkCtx = inkCanvas.getContext('2d');
  strokes.forEach(stroke => {
    if (!stroke.points || stroke.points.length < 1) return;
    const settings = TOOL_SETTINGS[stroke.tool] || TOOL_SETTINGS.pen;
    inkCtx.save();
    inkCtx.globalCompositeOperation = settings.composite;
    inkCtx.globalAlpha = settings.alpha;
    inkCtx.strokeStyle = stroke.color;
    inkCtx.lineWidth = Math.max(1, stroke.width * scale);
    inkCtx.lineCap = 'round';
    inkCtx.lineJoin = 'round';
    inkCtx.beginPath();
    inkCtx.moveTo(stroke.points[0].x * scale, stroke.points[0].y * scale);
    for (let i = 1; i < stroke.points.length; i++) inkCtx.lineTo(stroke.points[i].x * scale, stroke.points[i].y * scale);
    inkCtx.stroke();
    inkCtx.restore();
  });
  targetCtx.drawImage(inkCanvas, 0, 0);
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
    tctx.save();
    tctx.scale(scale, scale);
    drawPaperBackground(tctx, canvas.width, canvas.height, page.template || 'ruled');
    tctx.restore();
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
      drawPaperBackground(octx, off.width, off.height, page.template || 'ruled');

      paintStrokesToContext(octx, page.strokes, 1);

      page.texts.forEach(t => {
        octx.fillStyle = t.color || '#1E2A28';
        const fs = t.size || 20;
        octx.font = `${fs}px 'Patrick Hand', cursive, sans-serif`;
        octx.fillText(t.text || '', (t.x / 100) * off.width, (t.y / 100) * off.height + fs);
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
  el.className = 'nb-text-box' + (t.id === selectedTextId ? ' selected' : '');
  el.style.left = t.x + '%';
  el.style.top = t.y + '%';
  el.style.color = t.color || '#1E2A28';
  el.style.fontSize = (t.size || 20) + 'px';
  el.innerText = t.text || '';
  el.dataset.id = t.id;

  if (canEdit) {
    el.contentEditable = 'false';
    const delX = document.createElement('span');
    delX.className = 'del-x';
    delX.innerText = '✕';
    delX.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTextBox(t.id);
    });
    el.appendChild(delX);

    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      clearTextSelection();
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
      dragState = { el, id: t.id, startX: e.clientX, startY: e.clientY, origLeft: parseFloat(el.style.left), origTop: parseFloat(el.style.top), rect, moved: false };
    });
  } else {
    el.contentEditable = 'false';
    el.style.cursor = 'default';
  }

  nbPage.appendChild(el);
  if (t.id === selectedTextId) showMiniToolbar(t.id);
}

// ---------- Click-to-select mini toolbar for text boxes ----------
function deleteTextBox(id) {
  pushHistory();
  const page = currentPage();
  page.texts = page.texts.filter(x => x.id !== id);
  clearTextSelection();
  renderPage(true);
  saveNotebook();
}

function clearTextSelection() {
  selectedTextId = null;
  if (miniToolbarEl) { miniToolbarEl.remove(); miniToolbarEl = null; }
  nbPage.querySelectorAll('.nb-text-box.selected').forEach(el => el.classList.remove('selected'));
}

function showMiniToolbar(textId) {
  const page = currentPage();
  const t = page.texts.find(x => x.id === textId);
  const box = nbPage.querySelector(`[data-id="${textId}"]`);
  if (!t || !box) return;

  if (miniToolbarEl) miniToolbarEl.remove();
  const bar = document.createElement('div');
  bar.className = 'text-mini-toolbar';
  bar.style.left = box.style.left;
  bar.style.top = box.style.top;

  const colors = ['#1E2A28', '#B23A3A', '#2255A4', '#33234A'];
  colors.forEach(c => {
    const dot = document.createElement('span');
    dot.className = 'mini-color' + (t.color === c ? ' active' : '');
    dot.style.background = c;
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      pushHistory();
      t.color = c;
      renderPage(true);
      selectedTextId = textId;
      showMiniToolbar(textId);
      saveNotebook();
    });
    bar.appendChild(dot);
  });

  const sizeInput = document.createElement('input');
  sizeInput.type = 'range';
  sizeInput.min = '12';
  sizeInput.max = '48';
  sizeInput.value = t.size || 20;
  sizeInput.title = 'Text size';
  sizeInput.addEventListener('input', () => {
    box.style.fontSize = sizeInput.value + 'px';
  });
  sizeInput.addEventListener('change', () => {
    pushHistory();
    t.size = Number(sizeInput.value);
    currentTextSize = t.size;
    saveNotebook();
  });
  bar.appendChild(sizeInput);

  const del = document.createElement('span');
  del.className = 'mini-del';
  del.innerText = 'Delete';
  del.addEventListener('click', (e) => { e.stopPropagation(); deleteTextBox(textId); });
  bar.appendChild(del);

  nbPage.appendChild(bar);
  miniToolbarEl = bar;
}

document.addEventListener('pointermove', (e) => {
  if (!dragState) return;
  const dxPx = e.clientX - dragState.startX;
  const dyPx = e.clientY - dragState.startY;
  if (Math.abs(dxPx) > 4 || Math.abs(dyPx) > 4) dragState.moved = true;
  const dxPct = (dxPx / dragState.rect.width) * 100;
  const dyPct = (dyPx / dragState.rect.height) * 100;
  const newLeft = Math.max(0, Math.min(96, dragState.origLeft + dxPct));
  const newTop = Math.max(0, Math.min(96, dragState.origTop + dyPct));
  dragState.el.style.left = newLeft + '%';
  dragState.el.style.top = newTop + '%';
  if (miniToolbarEl && dragState.id === selectedTextId) {
    miniToolbarEl.style.left = newLeft + '%';
    miniToolbarEl.style.top = newTop + '%';
  }
});
document.addEventListener('pointerup', () => {
  if (!dragState) return;
  const page = currentPage();
  const target = page.texts.find(x => x.id === dragState.id);
  if (target) {
    target.x = parseFloat(dragState.el.style.left);
    target.y = parseFloat(dragState.el.style.top);
    if (dragState.moved) {
      saveNotebook();
    } else {
      // A tap rather than a drag — toggle the mini toolbar for this text box.
      if (selectedTextId === dragState.id) clearTextSelection();
      else { clearTextSelection(); selectedTextId = dragState.id; showMiniToolbar(dragState.id); }
    }
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
  clearTextSelection();
  if (penOnly && e.pointerType !== 'pen' && currentTool !== 'text') {
    showToast('Pen-only mode is on. Use a stylus, or turn off Pen only.');
    return;
  }
  // Ignore a second finger while writing. This prevents most accidental palm marks.
  if (drawing || (e.pointerType === 'touch' && activePointerId !== null)) return;
  if (currentTool === 'text') {
    const rect = nbPage.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    pushHistory();
    const page = currentPage();
    const t = { id: 't' + Date.now(), x: xPct, y: yPct, text: '', color: currentColor, size: currentTextSize };
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
  const baseWidth = currentTool === 'pen' ? brushSize : (currentTool === 'highlighter' ? brushSize * 6 : brushSize * 7);
  const pressureWidth = currentTool === 'pen' ? baseWidth * (0.55 + p.pressure * 0.9) : baseWidth;
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

const brushSizeInput = document.getElementById('brushSize');
const brushSizeValue = document.getElementById('brushSizeValue');
const brushSizeLabel = document.getElementById('brushSizeLabel');

function syncSizeSliderToTool() {
  if (currentTool === 'text') {
    brushSizeLabel.innerText = 'Text size';
    brushSizeInput.min = '12';
    brushSizeInput.max = '48';
    brushSizeInput.value = currentTextSize;
    brushSizeValue.innerText = currentTextSize;
  } else {
    brushSizeLabel.innerText = 'Size';
    brushSizeInput.min = '1';
    brushSizeInput.max = '12';
    brushSizeInput.value = brushSize;
    brushSizeValue.innerText = brushSize;
  }
}

function setTool(tool) {
  currentTool = tool;
  document.getElementById('penToolBtn').classList.toggle('active', tool === 'pen');
  document.getElementById('highlighterToolBtn').classList.toggle('active', tool === 'highlighter');
  document.getElementById('eraserToolBtn').classList.toggle('active', tool === 'eraser');
  document.getElementById('textToolBtn').classList.toggle('active', tool === 'text');
  syncSizeSliderToTool();
}
document.getElementById('penToolBtn').addEventListener('click', () => setTool('pen'));
document.getElementById('highlighterToolBtn').addEventListener('click', () => setTool('highlighter'));
document.getElementById('eraserToolBtn').addEventListener('click', () => setTool('eraser'));
document.getElementById('textToolBtn').addEventListener('click', () => setTool('text'));

brushSizeInput.addEventListener('input', () => {
  const val = Number(brushSizeInput.value);
  if (currentTool === 'text') {
    currentTextSize = val;
    brushSizeValue.innerText = val;
    // Live-update the size of a currently-selected text box, if any.
    if (selectedTextId) {
      const page = currentPage();
      const target = page.texts.find(x => x.id === selectedTextId);
      if (target) {
        target.size = val;
        const box = nbPage.querySelector(`[data-id="${selectedTextId}"]`);
        if (box) box.style.fontSize = val + 'px';
      }
    }
  } else {
    brushSize = val;
    brushSizeValue.value = brushSize;
    brushSizeValue.innerText = brushSize;
  }
});
brushSizeInput.addEventListener('change', () => {
  if (currentTool === 'text' && selectedTextId) saveNotebook();
});
syncSizeSliderToTool();

const penOnlyBtn = document.getElementById('penOnlyBtn');
function renderPenOnly() {
  penOnlyBtn.classList.toggle('active', penOnly);
  penOnlyBtn.setAttribute('aria-pressed', String(penOnly));
  penOnlyBtn.innerText = penOnly ? '✒️ Pen only: on' : '✒️ Pen only';
}
penOnlyBtn.addEventListener('click', () => {
  penOnly = !penOnly;
  localStorage.setItem('nb_pen_only', String(penOnly));
  renderPenOnly();
  showToast(penOnly ? 'Pen-only mode is on.' : 'Pen-only mode is off.');
});
renderPenOnly();

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

const pageTypeModal = document.getElementById('pageTypeModal');
document.getElementById('addPageBtn').addEventListener('click', () => pageTypeModal.classList.remove('hidden'));
document.getElementById('cancelPageTypeBtn').addEventListener('click', () => pageTypeModal.classList.add('hidden'));
document.querySelectorAll('.page-type-option').forEach(option => option.addEventListener('click', () => {
  notebookData.pages.push(blankPage(option.dataset.template));
  currentPageIndex = notebookData.pages.length - 1;
  pageTypeModal.classList.add('hidden');
  renderPage();
  saveNotebook();
}));

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

// ---------- Customize notebook (theme) ----------
const customizeModal = document.getElementById('customizeModal');
document.getElementById('customizeBtn').addEventListener('click', () => {
  document.querySelectorAll('#accentSwatches .swatch-dot').forEach(d => d.classList.toggle('active', d.dataset.accent.toLowerCase() === (notebookTheme.accent || '').toLowerCase()));
  document.querySelectorAll('#paperSwatches .swatch-dot').forEach(d => d.classList.toggle('active', d.dataset.paper.toLowerCase() === (notebookTheme.paper || '').toLowerCase()));
  customizeModal.classList.remove('hidden');
});
document.getElementById('cancelCustomizeBtn').addEventListener('click', () => customizeModal.classList.add('hidden'));

let draftTheme = null;
document.querySelectorAll('#accentSwatches .swatch-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    document.querySelectorAll('#accentSwatches .swatch-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    draftTheme = draftTheme || { ...notebookTheme };
    draftTheme.accent = dot.dataset.accent;
  });
});
document.querySelectorAll('#paperSwatches .swatch-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    document.querySelectorAll('#paperSwatches .swatch-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    draftTheme = draftTheme || { ...notebookTheme };
    draftTheme.paper = dot.dataset.paper;
  });
});
document.getElementById('saveCustomizeBtn').addEventListener('click', () => {
  if (draftTheme) notebookTheme = { ...notebookTheme, ...draftTheme };
  draftTheme = null;
  applyTheme();
  saveNotebook();
  customizeModal.classList.add('hidden');
  showToast('Notebook look updated.');
});

// ---------- Focus / tab-switch tracking (teachers can see this on the roster) ----------
function initFocusTracking() {
  let lastRecordedAt = 0;
  function recordAway() {
    const now = Date.now();
    // visibilitychange and window blur often fire together for the same
    // tab-switch — collapse anything within half a second into one event.
    if (now - lastRecordedAt < 500) return;
    lastRecordedAt = now;
    focusStats.tabSwitches = (focusStats.tabSwitches || 0) + 1;
    focusStats.lastAwayAt = now;
    // Debounce the actual write so quick alt-tabbing doesn't spam Firestore.
    clearTimeout(focusSaveTimer);
    focusSaveTimer = setTimeout(() => saveNotebook(), 1500);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) recordAway();
  });
  window.addEventListener('blur', recordAway);
}

// ---------- AI Study Tools (quiz / flashcards generated from typed notes) ----------
// Calls a Firebase Cloud Function (see /functions) that talks to the Anthropic API
// server-side, so no API key is ever exposed in the browser. Update this URL after
// you deploy the function (see README "AI Study Tools setup").
const AI_STUDY_FUNCTION_URL = 'https://REGION-PROJECT_ID.cloudfunctions.net/generateStudyTools';

function collectNotebookText() {
  return notebookData.pages
    .map((p, i) => (p.texts || []).map(t => t.text).filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}

const aiStudyModal = document.getElementById('aiStudyModal');
const aiStudySetup = document.getElementById('aiStudySetup');
const aiStudyLoading = document.getElementById('aiStudyLoading');
const aiStudyResults = document.getElementById('aiStudyResults');
const aiStudyError = document.getElementById('aiStudyError');

document.getElementById('aiStudyBtn').addEventListener('click', () => {
  aiStudyError.classList.add('hidden');
  aiStudySetup.classList.remove('hidden');
  aiStudyLoading.classList.add('hidden');
  aiStudyResults.classList.add('hidden');
  aiStudyResults.innerHTML = '';
  aiStudyModal.classList.remove('hidden');
});
document.getElementById('cancelAiStudyBtn').addEventListener('click', () => aiStudyModal.classList.add('hidden'));

document.getElementById('generateAiStudyBtn').addEventListener('click', async () => {
  const notesText = collectNotebookText();
  if (!notesText || notesText.trim().length < 20) {
    aiStudyError.innerText = 'Add a bit more typed text to your notes first — there\'s not enough here yet to work with.';
    aiStudyError.classList.remove('hidden');
    return;
  }
  const mode = document.getElementById('aiStudyMode').value;
  const count = Number(document.getElementById('aiStudyCount').value);

  aiStudyError.classList.add('hidden');
  aiStudySetup.classList.add('hidden');
  aiStudyLoading.classList.remove('hidden');

  try {
    const res = await fetch(AI_STUDY_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notesText, mode, count })
    });
    if (!res.ok) throw new Error('Server returned ' + res.status);
    const data = await res.json();
    lastStudyMode = mode;
    lastStudyItems = data.items || [];
    renderStudyResults(mode, lastStudyItems);
    recordStudyActivity(session.usernameKey);
  } catch (err) {
    console.error(err);
    aiStudyLoading.classList.add('hidden');
    aiStudySetup.classList.remove('hidden');
    aiStudyError.innerText = 'Could not generate study material right now. Please try again in a moment.';
    aiStudyError.classList.remove('hidden');
  }
});

let lastStudyMode = null;
let lastStudyItems = [];

function speakerButton(text) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'speaker-btn';
  btn.title = 'Read aloud';
  btn.innerText = '🔊';
  btn.addEventListener('click', (e) => { e.stopPropagation(); speakText(text); });
  return btn;
}

function renderStudyResults(mode, items) {
  aiStudyLoading.classList.add('hidden');
  aiStudyResults.classList.remove('hidden');
  aiStudyResults.innerHTML = '';

  if (!items.length) {
    aiStudyResults.innerHTML = '<p style="font-size:13px;color:#7A6B90;">No study material could be generated from these notes.</p>';
  } else if (mode === 'quiz') {
    items.forEach((q, i) => {
      const card = document.createElement('div');
      card.className = 'study-card';
      card.innerHTML = `<div class="q-num">Question ${i + 1}</div><div class="q-text">${escapeHtml(q.question || '')}</div>`;
      card.querySelector('.q-text').appendChild(speakerButton(q.question || ''));
      (q.choices || []).forEach((choice, ci) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'study-choice';
        btn.innerText = choice;
        btn.addEventListener('click', () => {
          card.querySelectorAll('.study-choice').forEach(b => b.disabled = true);
          const isCorrect = ci === q.correctIndex;
          btn.classList.add(isCorrect ? 'correct' : 'incorrect');
          if (!isCorrect && q.correctIndex != null && card.querySelectorAll('.study-choice')[q.correctIndex]) {
            card.querySelectorAll('.study-choice')[q.correctIndex].classList.add('correct');
          }
        });
        card.appendChild(btn);
      });
      aiStudyResults.appendChild(card);
    });
  } else {
    items.forEach((f, i) => {
      const card = document.createElement('div');
      card.className = 'flash-card';
      card.dataset.showing = 'front';
      card.innerHTML = `<div>${escapeHtml(f.front || '')}<span class="flash-hint">Tap to flip</span></div>`;
      card.appendChild(speakerButton(f.front || ''));
      card.addEventListener('click', () => {
        const showingFront = card.dataset.showing === 'front';
        card.dataset.showing = showingFront ? 'back' : 'front';
        const shownText = showingFront ? (f.back || '') : (f.front || '');
        card.innerHTML = `<div>${escapeHtml(shownText)}<span class="flash-hint">Tap to flip</span></div>`;
        card.appendChild(speakerButton(shownText));
      });
      aiStudyResults.appendChild(card);
    });
  }

  // ----- Gamification actions -----
  const actionRow = document.createElement('div');
  actionRow.className = 'study-action-row';

  const saveDeckBtn = document.createElement('button');
  saveDeckBtn.className = 'btn-sage btn-small';
  saveDeckBtn.innerText = '💾 Save as flashcard deck';
  saveDeckBtn.addEventListener('click', saveLastResultsAsDeck);
  actionRow.appendChild(saveDeckBtn);

  if (mode === 'quiz' && classCode && session.role === 'student') {
    const challengeBtn = document.createElement('button');
    challengeBtn.className = 'btn-sage btn-small';
    challengeBtn.innerText = '🏆 Challenge my class';
    challengeBtn.addEventListener('click', publishChallenge);
    actionRow.appendChild(challengeBtn);
  }
  aiStudyResults.appendChild(actionRow);

  const doneBtn = document.createElement('button');
  doneBtn.className = 'btn-outline';
  doneBtn.style.width = '100%';
  doneBtn.style.marginTop = '10px';
  doneBtn.innerText = 'Close';
  doneBtn.addEventListener('click', () => aiStudyModal.classList.add('hidden'));
  aiStudyResults.appendChild(doneBtn);
}

async function saveLastResultsAsDeck() {
  if (!lastStudyItems.length) return;
  const title = prompt('Name this flashcard deck:', nbTitle.innerText.replace(' — Notebook', '')) ;
  if (title === null) return;
  const cards = lastStudyMode === 'flashcards'
    ? lastStudyItems.map((f, i) => ({ id: 'c' + i, front: f.front || '', back: f.back || '', ...newCardSchedule() }))
    : lastStudyItems.map((q, i) => ({
        id: 'c' + i,
        front: q.question || '',
        back: (q.choices && q.correctIndex != null) ? (q.choices[q.correctIndex] || '') : '',
        ...newCardSchedule()
      }));
  try {
    const deckId = `${session.usernameKey}__${Date.now()}`;
    await db.collection('flashcardDecks').doc(deckId).set({
      studentKey: session.usernameKey,
      title: title.trim() || 'Untitled deck',
      classCode: classCode || null,
      cards,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Deck saved! Find it under Flashcards.');
  } catch (err) {
    console.error(err);
    showToast('Could not save the deck. Check your connection.', true);
  }
}

async function publishChallenge() {
  if (!lastStudyItems.length || lastStudyMode !== 'quiz') return;
  const title = prompt('Name this challenge for your classmates:', nbTitle.innerText.replace(' — Notebook', ''));
  if (title === null) return;
  try {
    const challengeId = `${classCode}__${Date.now()}`;
    await db.collection('challenges').doc(challengeId).set({
      classCode,
      createdBy: session.usernameKey,
      createdByName: session.name || session.username,
      title: title.trim() || 'Class challenge',
      items: lastStudyItems,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Challenge published! Your classmates can find it under Challenges.');
  } catch (err) {
    console.error(err);
    showToast('Could not publish the challenge. Check your connection.', true);
  }
}

document.getElementById('submitBtn').addEventListener('click', async () => {
  if (!confirm('Submit this notebook to your teacher?')) return;
  notebookData.submitted = true;
  notebookData.submittedAt = { seconds: Math.floor(Date.now() / 1000) }; // optimistic local value until saved
  await saveNotebook(true);
  renderStatus();
  renderDueAndFeedback();
  recordStudyActivity(session.usernameKey);
  showToast('Notebook submitted to your teacher.');
});

// ---------- Persistence ----------
function saveNotebook(withTimestamp) {
  const cleanPages = notebookData.pages.map(p => ({
    id: p.id, date: p.date, template: p.template || 'ruled', strokes: p.strokes,
    texts: p.texts.map(t => ({ id: t.id, x: t.x, y: t.y, text: t.text, color: t.color, size: t.size || 20 }))
  }));
  const payload = {
    classCode, studentKey,
    pages: cleanPages,
    submitted: !!notebookData.submitted,
    theme: notebookTheme,
    focusStats,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (withTimestamp) payload.submittedAt = firebase.firestore.FieldValue.serverTimestamp();
  if (!navigator.onLine) setConnectionStatus();
  db.collection('notebooks').doc(notebookId).set(payload, { merge: true })
    .then(setConnectionStatus)
    .catch(err => {
      console.error('save failed', err);
      showToast('Could not save — changes remain on this device.', true);
    });
}

init();
