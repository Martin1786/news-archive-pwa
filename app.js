'use strict';

/* ────────────────────────────────────────────────────────────
   State
   ──────────────────────────────────────────────────────────── */
const state = {
  rows: [],          // normalized event records
  filtered: [],
  selectedId: null,
  filters: { text: '', surname: '', yearFrom: '', yearTo: '', category: '' },
  sort: 'date-desc'
};

/* ────────────────────────────────────────────────────────────
   IndexedDB cache — mirrors the approach used in the St John's
   burials app, so the index can open and be browsed offline.
   ──────────────────────────────────────────────────────────── */
const DB_NAME = 'NewsArchiveDB';
const DB_VERSION = 1;
const CACHE_KEY = 'events';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveToCache(key, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readwrite');
    tx.objectStore('cache').put({ key, data, savedAt: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function loadFromCache(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readonly');
    const req = tx.objectStore('cache').get(key);
    req.onsuccess = (e) => resolve(e.target.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

function isFresh(savedAt) {
  return (Date.now() - savedAt) < CONFIG.CACHE_HOURS * 60 * 60 * 1000;
}

function formatSyncTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    + ' at ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/* ────────────────────────────────────────────────────────────
   Field mapping — matches your sheet's headers to canonical keys.
   Add aliases here if your column names differ.
   ──────────────────────────────────────────────────────────── */
const FIELD_ALIASES = {
  id: ['id'],
  surname: ['surname'],
  forename: ['forename', 'first name', 'firstname'],
  date: ['date'],
  newspaper: ['newspaper'],
  notes: ['notes'],
  image: ['image'],
  imageUrl: ['pwa_image_url', 'pwa image url', 'pwaimageurl'],
  category: ['category'],
  submittedDate: ['submitted date', 'submitteddate'],
  submittedBy: ['submitted by', 'submittedby']
};

/* ────────────────────────────────────────────────────────────
   Newspaper colour-coding — each distinct newspaper name gets a
   consistent colour from this palette (same paper = same colour
   every time, no matter the order entries load in).
   ──────────────────────────────────────────────────────────── */
const NEWSPAPER_COLORS = [
  '#a12b2b', // brick red
  '#2b7a4b', // green
  '#2b4ba1', // blue
  '#a1792b', // amber / gold
  '#6b2ba1', // purple
  '#2ba19a', // teal
  '#a15a2b', // burnt orange
  '#a12b7a', // magenta / pink
  '#4b2ba1', // indigo
  '#2b6ba1', // sky blue
  '#6a7a2b', // olive
  '#7a2b4b'  // wine
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function colorForNewspaper(name) {
  if (!name) return null;
  const idx = hashString(name.trim().toLowerCase()) % NEWSPAPER_COLORS.length;
  return NEWSPAPER_COLORS[idx];
}

/* ────────────────────────────────────────────────────────────
   DOM refs
   ──────────────────────────────────────────────────────────── */
const el = (id) => document.getElementById(id);
const statusText = el('statusText');
const refreshBtn = el('refreshBtn');
const cardList = el('cardList');
const emptyState = el('emptyState');
const emptyClearBtn = el('emptyClearBtn');
const resultCount = el('resultCount');
const categoryChips = el('categoryChips');
const toast = el('toast');

const searchInput = el('searchInput');
const surnameInput = el('surnameInput');
const yearFrom = el('yearFrom');
const yearTo = el('yearTo');
const sortSelect = el('sortSelect');
const clearFiltersBtn = el('clearFiltersBtn');

const detailPane = el('detailPane');
const detailPlaceholder = el('detailPlaceholder');
const recordCard = el('recordCard');
const closeDetailBtn = el('closeDetailBtn');

/* ────────────────────────────────────────────────────────────
   Init
   ──────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEvents();
  registerServiceWorker();

  let cached = null;
  try {
    cached = await loadFromCache(CACHE_KEY);
  } catch (e) {
    console.warn('Cache read failed:', e);
  }

  if (cached && cached.data) {
    state.rows = cached.data;
    buildCategoryChips();
    applyFiltersAndRender();
    setStatus(`Showing ${state.rows.length} entries · synced ${formatSyncTime(cached.savedAt)}`);
  }

  const canUseCacheOnly = cached && (isFresh(cached.savedAt) || !navigator.onLine);

  if (!cached) {
    await refreshData(true);
  } else if (!canUseCacheOnly) {
    refreshData(false); // silent background refresh
  }
}

function bindEvents() {
  refreshBtn?.addEventListener('click', () => refreshData(true));

  searchInput?.addEventListener('input', debounce(() => {
    state.filters.text = searchInput.value.trim().toLowerCase();
    applyFiltersAndRender();
  }, 150));

  surnameInput?.addEventListener('input', debounce(() => {
    state.filters.surname = surnameInput.value.trim().toLowerCase();
    applyFiltersAndRender();
  }, 150));

  yearFrom?.addEventListener('input', debounce(() => {
    state.filters.yearFrom = yearFrom.value ? parseInt(yearFrom.value, 10) : '';
    applyFiltersAndRender();
  }, 150));
  yearTo?.addEventListener('input', debounce(() => {
    state.filters.yearTo = yearTo.value ? parseInt(yearTo.value, 10) : '';
    applyFiltersAndRender();
  }, 150));

  sortSelect?.addEventListener('change', () => {
    state.sort = sortSelect.value;
    applyFiltersAndRender();
  });

  clearFiltersBtn?.addEventListener('click', clearFilters);
  emptyClearBtn?.addEventListener('click', clearFilters);

  closeDetailBtn?.addEventListener('click', () => {
    detailPane.classList.remove('is-open');
  });

  window.addEventListener('online', () => setStatus(`Back online · ${state.rows.length} entries`));
  window.addEventListener('offline', () => setStatus(`Offline · showing last saved ${state.rows.length} entries`));
}

function clearFilters() {
  state.filters = { text: '', surname: '', yearFrom: '', yearTo: '', category: '' };
  if (searchInput) searchInput.value = '';
  if (surnameInput) surnameInput.value = '';
  if (yearFrom) yearFrom.value = '';
  if (yearTo) yearTo.value = '';
  [...categoryChips.children].forEach(c => c.classList.toggle('is-active', c.dataset.category === ''));
  applyFiltersAndRender();
}

/* ────────────────────────────────────────────────────────────
   Data fetching
   ──────────────────────────────────────────────────────────── */
async function refreshData(showSpinner) {
  if (showSpinner) {
    refreshBtn.classList.add('is-spinning');
    setStatus('Refreshing from spreadsheet…');
  }
  try {
    const rows = await fetchSheetRows();
    state.rows = rows;
    try {
      await saveToCache(CACHE_KEY, rows);
    } catch (e) {
      console.warn('Cache write failed:', e);
    }
    buildCategoryChips();
    applyFiltersAndRender();
    setStatus(`Showing ${state.rows.length} entries · synced ${formatSyncTime(Date.now())}`);
  } catch (err) {
    console.error(err);
    if (state.rows.length) {
      setStatus(`Could not refresh — showing last saved ${state.rows.length} entries.`);
    } else {
      setStatus('Could not reach the spreadsheet.');
    }
    showToast('Refresh failed — check your connection or CONFIG settings.');
  } finally {
    refreshBtn.classList.remove('is-spinning');
  }
}

async function fetchSheetRows() {
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&gid=${CONFIG.SHEET_GID}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Sheet fetch failed: ' + res.status);
  const text = await res.text();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  const data = JSON.parse(text.substring(jsonStart, jsonEnd + 1));

  const cols = data.table.cols.map(c => (c.label || c.id || '').trim());
  const colIndexFor = (aliases) =>
    cols.findIndex(c => aliases.includes(c.trim().toLowerCase()));

  const fieldColIndex = {};
  for (const key in FIELD_ALIASES) {
    fieldColIndex[key] = colIndexFor(FIELD_ALIASES[key]);
  }

  const rows = (data.table.rows || []).map((r, rowIdx) => {
    const record = { _rowIndex: rowIdx };
    for (const key in fieldColIndex) {
      const idx = fieldColIndex[key];
      if (idx === -1) { record[key] = ''; continue; }
      const cell = r.c && r.c[idx];
      if (!cell) { record[key] = ''; continue; }
      if (key === 'date' || key === 'submittedDate') {
        record[key] = gvizCellToDate(cell);
      } else {
        record[key] = (cell.f !== undefined && cell.f !== null ? cell.f : cell.v ?? '').toString().trim();
      }
    }
    if (!record.id) record.id = 'row-' + rowIdx;
    return record;
  }).filter(r => r.surname || r.forename || r.notes); // drop fully blank rows

  return rows;
}

// gviz encodes date cells either as a Date(y,m,d[,h,mi,s]) string in v,
// or gives a nicely formatted string in f. Prefer f for display,
// but always compute an ISO string for sorting/filtering.
function gvizCellToDate(cell) {
  const display = (cell.f !== undefined && cell.f !== null) ? cell.f.toString().trim() : '';
  let iso = '';
  const raw = cell.v;
  if (typeof raw === 'string' && raw.startsWith('Date(')) {
    const parts = raw.substring(5, raw.length - 1).split(',').map(Number);
    const [y, m, d] = parts;
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      iso = `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  } else if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (!isNaN(parsed)) iso = new Date(parsed).toISOString().slice(0, 10);
  }
  return { display: display || raw || '', iso };
}

/* ────────────────────────────────────────────────────────────
   Image resolution.
   Prefers the PWA_Image_URL column (a ready-to-use link you add
   per row) and falls back to parsing a Drive share link/ID out of
   the legacy Image column. Any plain https URL is used as-is;
   Drive links/IDs are turned into a reliable thumbnail URL.
   No API key needed — each file just needs to be shared
   "Anyone with the link".
   ──────────────────────────────────────────────────────────── */
function extractDriveId(val) {
  let m = val.match(/\/file\/d\/([^/]+)/);       // .../file/d/ID/view
  if (!m) m = val.match(/[?&]id=([^&]+)/);        // open?id=ID or uc?id=ID
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(val) && !val.includes('/')) return val; // bare file ID
  return null;
}

function resolveImage(record) {
  const candidates = [record.imageUrl, record.image].filter(Boolean);
  for (const raw of candidates) {
    const val = raw.trim();
    if (!val) continue;
    const id = extractDriveId(val);
    if (id) {
      return {
        thumb: `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
        view: `https://drive.google.com/uc?export=view&id=${id}`
      };
    }
    if (/^https?:\/\//i.test(val)) {
      return { thumb: val, view: val }; // already a usable, hosted image URL
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────
   Filtering / sorting
   ──────────────────────────────────────────────────────────── */
function applyFiltersAndRender() {
  const f = state.filters;
  let rows = state.rows.filter(r => {
    if (f.category && r.category !== f.category) return false;
    if (f.surname && !r.surname.toLowerCase().includes(f.surname)) return false;
    if (f.text) {
      const hay = [r.surname, r.forename, r.newspaper, r.notes, r.category]
        .join(' ').toLowerCase();
      if (!hay.includes(f.text)) return false;
    }
    const entryYear = r.date.iso ? parseInt(r.date.iso.slice(0, 4), 10) : null;
    if (f.yearFrom && (!entryYear || entryYear < f.yearFrom)) return false;
    if (f.yearTo && (!entryYear || entryYear > f.yearTo)) return false;
    return true;
  });

  rows = sortRows(rows, state.sort);
  state.filtered = rows;
  renderList();
}

function sortRows(rows, mode) {
  const copy = [...rows];
  switch (mode) {
    case 'date-asc':
      return copy.sort((a, b) => (a.date.iso || '9999').localeCompare(b.date.iso || '9999'));
    case 'date-desc':
      return copy.sort((a, b) => (b.date.iso || '0000').localeCompare(a.date.iso || '0000'));
    case 'surname-asc':
      return copy.sort((a, b) => a.surname.localeCompare(b.surname));
    case 'surname-desc':
      return copy.sort((a, b) => b.surname.localeCompare(a.surname));
    default:
      return copy;
  }
}

/* ────────────────────────────────────────────────────────────
   Rendering
   ──────────────────────────────────────────────────────────── */
function buildCategoryChips() {
  const cats = [...new Set(state.rows.map(r => r.category).filter(Boolean))].sort();
  categoryChips.innerHTML = '';
  const allChip = makeChip('All', '');
  categoryChips.appendChild(allChip);
  cats.forEach(c => categoryChips.appendChild(makeChip(c, c)));
}

function makeChip(label, value) {
  const btn = document.createElement('button');
  btn.className = 'chip' + (value === state.filters.category ? ' is-active' : '');
  btn.textContent = label;
  btn.dataset.category = value;
  if (value === '') btn.classList.toggle('is-active', !state.filters.category);
  btn.addEventListener('click', () => {
    state.filters.category = value;
    [...categoryChips.children].forEach(c => c.classList.toggle('is-active', c === btn));
    applyFiltersAndRender();
  });
  return btn;
}

function renderList() {
  cardList.innerHTML = '';
  resultCount.textContent = `${state.filtered.length} of ${state.rows.length} entries`;

  if (state.filtered.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  const frag = document.createDocumentFragment();
  for (const r of state.filtered) {
    frag.appendChild(buildIndexCard(r));
  }
  cardList.appendChild(frag);
}

function buildIndexCard(r) {
  const card = document.createElement('button');
  card.className = 'index-card' + (r.id === state.selectedId ? ' is-selected' : '');
  card.setAttribute('type', 'button');

  const name = [r.surname, r.forename].filter(Boolean).join(', ') || '(name not recorded)';

  card.innerHTML = `
    <div class="index-card-top">
      <span class="index-card-name">${escapeHtml(name)}</span>
      <span class="index-card-date">${escapeHtml(r.date.display || '—')}</span>
    </div>
    <div class="index-card-sub">
      ${r.category ? `<span class="category-tag">${escapeHtml(r.category)}</span>` : ''}
      ${r.newspaper ? `<span class="newspaper-name" style="color:${colorForNewspaper(r.newspaper)}">${escapeHtml(r.newspaper)}</span>` : ''}
    </div>
    ${r.notes ? `<div class="index-card-notes">${escapeHtml(r.notes)}</div>` : ''}
  `;

  card.addEventListener('click', () => selectEntry(r.id));
  return card;
}

function selectEntry(id) {
  state.selectedId = id;
  renderList(); // to update is-selected highlight
  const r = state.rows.find(row => row.id === id);
  if (!r) return;
  renderDetail(r);
  if (window.matchMedia('(max-width: 980px)').matches) {
    detailPane.classList.add('is-open');
  }
}

function renderDetail(r) {
  detailPlaceholder.hidden = true;
  recordCard.hidden = false;

  el('recordCategory').textContent = r.category || 'Uncategorised';
  el('recordName').textContent = [r.surname, r.forename].filter(Boolean).join(', ') || '(name not recorded)';
  el('recordDate').textContent = r.date.display || '—';
  el('recordNewspaper').textContent = r.newspaper || '—';
  el('recordNewspaper').style.color = r.newspaper ? colorForNewspaper(r.newspaper) : '';
  el('recordNewspaper').style.fontWeight = r.newspaper ? '600' : '';
  el('recordId').textContent = r.id;

  const notesWrap = el('recordNotesWrap');
  if (r.notes) {
    notesWrap.hidden = false;
    el('recordNotes').textContent = r.notes;
  } else {
    notesWrap.hidden = true;
  }

  const imgWrap = el('recordImageWrap');
  const imgEl = el('recordImage');
  const resolved = resolveImage(r);
  if (resolved) {
    imgWrap.hidden = false;
    imgEl.src = resolved.thumb;
    imgEl.alt = `Image for ${r.surname || 'entry'}`;
    imgEl.onerror = () => { imgWrap.hidden = true; };
  } else {
    imgWrap.hidden = true;
  }

  const submittedBits = [];
  if (r.submittedBy) submittedBits.push(`Submitted by ${r.submittedBy}`);
  if (r.submittedDate && r.submittedDate.display) submittedBits.push(`on ${r.submittedDate.display}`);
  el('recordSubmitted').textContent = submittedBits.join(' ');
}

/* ────────────────────────────────────────────────────────────
   Small utilities
   ──────────────────────────────────────────────────────────── */
function setStatus(msg) { statusText.textContent = msg; }

function showToast(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 4000);
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(str) {
  return (str || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  }
}
