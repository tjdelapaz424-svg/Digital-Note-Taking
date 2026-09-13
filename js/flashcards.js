const session = requireRole('student');
document.getElementById('whoLabel').innerText = session ? session.username : '';

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  window.location.href = 'index.html';
});

let myDecks = [];
let activeDeck = null; // { id, ...data }
let reviewQueue = [];
let reviewIndex = 0;
let reviewedAny = false;

const deckListView = document.getElementById('deckListView');
const reviewView = document.getElementById('reviewView');

async function loadDecks() {
  const grid = document.getElementById('deckGrid');
  grid.innerHTML = '<div class="empty-state">Loading...</div>';
  const snap = await db.collection('flashcardDecks').where('studentKey', '==', session.usernameKey).get();
  myDecks = [];
  snap.forEach(doc => myDecks.push({ id: doc.id, ...doc.data() }));
  myDecks.sort((a, b) => (millisFromTimestamp(b.createdAt) || 0) - (millisFromTimestamp(a.createdAt) || 0));

  document.getElementById('deckEmpty').classList.toggle('hidden', myDecks.length > 0);
  grid.innerHTML = '';
  myDecks.forEach(deck => {
    const dueCount = (deck.cards || []).filter(isCardDue).length;
    const tile = document.createElement('div');
    tile.className = 'class-tile';
    tile.innerHTML = `
      <button class="tile-delete-btn" title="Delete deck" aria-label="Delete deck">✕</button>
      <h3 style="margin-bottom:2px;">${escapeHtml(deck.title || 'Untitled deck')}</h3>
      <div style="font-size:12.5px;color:#7A8A81;">${(deck.cards || []).length} cards</div>
      ${dueCount > 0
        ? `<span class="tag tag-pending" style="margin-top:8px;display:inline-block;">${dueCount} due</span>`
        : '<span class="tag tag-approved" style="margin-top:8px;display:inline-block;">All caught up</span>'}
    `;
    tile.querySelector('.tile-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDeck(deck);
    });
    tile.addEventListener('click', () => openReview(deck));
    grid.appendChild(tile);
  });
}

async function deleteDeck(deck) {
  if (!confirm(`Delete the deck "${deck.title || 'Untitled deck'}"? This cannot be undone.`)) return;
  await db.collection('flashcardDecks').doc(deck.id).delete();
  showToast('Deck deleted.');
  loadDecks();
}

function openReview(deck) {
  activeDeck = deck;
  reviewQueue = (deck.cards || []).filter(isCardDue);
  reviewIndex = 0;
  reviewedAny = false;
  document.getElementById('reviewDeckTitle').innerText = deck.title || 'Untitled deck';
  deckListView.classList.add('hidden');
  reviewView.classList.remove('hidden');
  showNextCard();
}

document.getElementById('backToDecksBtn').addEventListener('click', () => {
  reviewView.classList.add('hidden');
  deckListView.classList.remove('hidden');
  if (reviewedAny) recordStudyActivity(session.usernameKey, 'flashcards');
  loadDecks();
});

function showNextCard() {
  const doneBox = document.getElementById('reviewDone');
  const cardWrap = document.getElementById('reviewCardWrap');
  const rateRow = document.getElementById('reviewRateRow');
  const reviewCard = document.getElementById('reviewCard');

  if (reviewIndex >= reviewQueue.length) {
    doneBox.classList.remove('hidden');
    cardWrap.classList.add('hidden');
    if (reviewedAny) recordStudyActivity(session.usernameKey, 'flashcards');
    return;
  }
  doneBox.classList.add('hidden');
  cardWrap.classList.remove('hidden');
  rateRow.classList.add('hidden');

  const card = reviewQueue[reviewIndex];
  document.getElementById('reviewProgress').innerText = `Card ${reviewIndex + 1} of ${reviewQueue.length}`;
  reviewCard.dataset.showing = 'front';
  renderCardFace(card, true);
}

function renderCardFace(card, showingFront) {
  const reviewCard = document.getElementById('reviewCard');
  const text = showingFront ? card.front : card.back;
  reviewCard.innerHTML = `<div>${escapeHtml(text || '')}<span class="flash-hint">${showingFront ? 'Tap to reveal answer' : 'Tap to flip back'}</span></div>`;
  const speaker = document.createElement('button');
  speaker.type = 'button';
  speaker.className = 'speaker-btn';
  speaker.title = 'Read aloud';
  speaker.innerText = '🔊';
  speaker.addEventListener('click', (e) => { e.stopPropagation(); speakText(text || ''); });
  reviewCard.appendChild(speaker);
}

document.getElementById('reviewCard').addEventListener('click', () => {
  const reviewCard = document.getElementById('reviewCard');
  const showingFront = reviewCard.dataset.showing === 'front';
  reviewCard.dataset.showing = showingFront ? 'back' : 'front';
  const card = reviewQueue[reviewIndex];
  renderCardFace(card, !showingFront);
  // Show rating buttons once the answer side is revealed
  if (reviewCard.dataset.showing === 'back') {
    document.getElementById('reviewRateRow').classList.remove('hidden');
  } else {
    document.getElementById('reviewRateRow').classList.add('hidden');
  }
});

document.querySelectorAll('.rate-btn').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const rating = btn.dataset.rating;
    const card = reviewQueue[reviewIndex];
    const updated = nextCardSchedule(card, rating);
    Object.assign(card, updated);
    reviewedAny = true;

    // Persist the updated schedule back onto the full deck
    const allCards = (activeDeck.cards || []).map(c => (c.id === card.id ? { ...c, ...updated } : c));
    activeDeck.cards = allCards;
    try {
      await db.collection('flashcardDecks').doc(activeDeck.id).update({ cards: allCards });
    } catch (err) {
      console.error('Could not save card progress', err);
    }

    reviewIndex++;
    showNextCard();
  });
});

loadDecks();
