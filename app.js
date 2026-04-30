/* ═══════════════════════════════════════════════════════════════════════
   we. — fő alkalmazás
   v0.1 · helyi tárolás (localStorage), Supabase később
   ═══════════════════════════════════════════════════════════════════════ */

import { feladatok } from './data/feladatok.js';

// ─── State ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'we-state-v1';

const defaultState = {
  // párosítás
  paired: false,
  pairCode: null,        // a saját 6-jegyű kódom (initiátorként)
  partnerCode: null,     // a párom kódja (joinerként amit beírtam)
  isInitiator: null,     // én generáltam a kódot, vagy beírtam
  // Csillám
  piciName: null,
  piciStage: 'baby',     // baby | gyerek | tini | felnott
  piciBornAt: null,
  // suttogó (csak helyi most, Supabase később)
  whisper: null,         // { text, from, sentAt }
  // mai feladat
  todayTask: null,       // { id, text, kategoria, drawnAt }
  todayTaskDoneAt: null,
  // napló
  feladatLog: [],        // [{taskId, text, doneAt, note?, by}]
  // egyéb
  hasSeenArrival: false,
};

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Mentés sikertelen', e);
  }
}

function setState(patch) {
  state = { ...state, ...patch };
  saveState();
}

// dev: konzolban elérhető a state
window.__we = { state: () => state, reset: resetAll };

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  state = { ...defaultState };
  navigate('welcome');
}

// ─── Router ─────────────────────────────────────────────────────────────

const app = document.getElementById('app');
let currentScreen = null;

function navigate(screenId, opts = {}) {
  const tpl = document.getElementById(`screen-${screenId}`);
  if (!tpl) {
    console.error(`Hiányzó képernyő: ${screenId}`);
    return;
  }
  app.replaceChildren(tpl.content.cloneNode(true));
  currentScreen = screenId;

  // képernyő-specifikus binding-ok
  const bind = screenBindings[screenId];
  if (bind) bind(opts);

  window.scrollTo(0, 0);
}

function back() {
  // egyszerű vissza-logika, később bővíthető
  if (currentScreen === 'pair-create' || currentScreen === 'pair-join') {
    navigate('welcome');
  } else if (currentScreen === 'whisper-compose') {
    navigate('home');
  } else if (currentScreen === 'journal') {
    navigate('home');
  } else {
    navigate('welcome');
  }
}

// ─── Inicializáció: melyik képernyő legyen az első ──────────────────

function startupScreen() {
  if (!state.paired || !state.piciName) {
    return 'welcome';
  }
  if (!state.hasSeenArrival) {
    return 'arrival';
  }
  return 'arrival'; // a kérés szerint MINDEN belépéskor lefut
}

// ─── Pici figure renderelése (SVG inline) ─────────────────────────────

function renderPici(target, size = 64) {
  if (!target) return;
  const svg = `
    <svg width="${size}" height="${size * 76 / 60}" viewBox="-30 -30 60 76" aria-hidden="true">
      <ellipse cx="0" cy="44" rx="22" ry="3.5" fill="rgba(0,0,0,0.10)"/>
      <g class="pici-bob">
        <ellipse cx="0" cy="18" rx="20" ry="27" class="pici-body-fill"/>
        <ellipse cx="-6" cy="10" rx="7" ry="13" fill="#FFF" opacity="0.25"/>
        <ellipse cx="-18" cy="21" rx="5" ry="8" class="pici-body-fill"/>
        <ellipse cx="18" cy="21" rx="5" ry="8" class="pici-body-fill"/>
        <ellipse cx="-7" cy="44" rx="5" ry="3" class="pici-body-fill"/>
        <ellipse cx="7" cy="44" rx="5" ry="3" class="pici-body-fill"/>
        <circle cx="2" cy="16" r="1.5" class="pici-tip-fill" opacity="0.7"/>
        <circle cx="-3" cy="24" r="1" class="pici-tip-fill" opacity="0.6"/>
        <ellipse cx="-7" cy="4" rx="4" ry="4.5" fill="#1A1714"/>
        <ellipse cx="7" cy="4" rx="4" ry="4.5" fill="#1A1714"/>
        <circle cx="-6" cy="2.5" r="1.4" fill="#FFF"/>
        <circle cx="8" cy="2.5" r="1.4" fill="#FFF"/>
        <path d="M -6 18 Q 0 24 6 18" stroke="#1A1714" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <line x1="-7" y1="-12" x2="-12" y2="-23" stroke="#1A1714" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="7" y1="-12" x2="12" y2="-23" stroke="#1A1714" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="-12" cy="-24" r="3.2" class="pici-tip-fill"/>
        <circle cx="12" cy="-24" r="3.2" class="pici-tip-fill"/>
      </g>
      <style>
        .pici-body-fill { fill: var(--pici-body); }
        .pici-tip-fill { fill: var(--pici-tip); }
        @keyframes pici-bob-anim { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        .pici-bob { animation: pici-bob-anim 2.5s ease-in-out infinite; transform-origin: center; }
      </style>
    </svg>
  `;
  target.innerHTML = svg;
}

// ─── Csillagok érkezés-képernyőhöz ────────────────────────────────────

function renderStars(container, count = 14) {
  if (!container) return;
  const html = Array.from({ length: count }, () => {
    const top = Math.random() * 100;
    const left = Math.random() * 100;
    const delay = Math.random() * 3;
    return `<div class="star" style="top:${top}%;left:${left}%;animation-delay:${delay}s"></div>`;
  }).join('');
  container.innerHTML = html;
}

// ─── 6-jegyű kód generálása ───────────────────────────────────────────

function generatePairCode() {
  // kerüljük az ismétléseket és a 0-kal kezdődést
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
}

function formatCode(code) {
  // 472931 → "4 7 2  9 3 1" (vizuális szóközzel középen)
  if (!code || code.length !== 6) return '';
  const parts = code.split('');
  return parts.slice(0, 3).join('<span class="gap"></span>') +
         '<span class="gap" style="width:0.7em;"></span>' +
         parts.slice(3).join('<span class="gap"></span>');
}

// ─── Mai feladat sorsolás ─────────────────────────────────────────────

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function ensureTodayTask() {
  if (!state.todayTask || state.todayTask.day !== todayKey()) {
    drawNewTask();
  }
}

function drawNewTask(excludeId = null) {
  const pool = excludeId
    ? feladatok.filter(f => f.id !== excludeId)
    : feladatok;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  setState({
    todayTask: { ...pick, day: todayKey() },
    todayTaskDoneAt: null,
  });
}

function metaForTask(task) {
  const parts = [];
  if (task.ido && task.ido !== 'barmikor') {
    const map = { reggel: 'reggel', este: 'este', hazaerkezes: 'hazafelé' };
    parts.push(map[task.ido] || task.ido);
  } else {
    parts.push('bármikor');
  }
  parts.push(task.koltseg === 'ingyenes' ? 'ingyenes' : task.koltseg);
  return parts.join(' · ');
}

// ─── Toast ──────────────────────────────────────────────────────────────

let toastTimer;
function toast(msg, ms = 2400) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => { el.hidden = true; }, 300);
  }, ms);
}

// ═══════════════════════════════════════════════════════════════════════
// KÉPERNYŐ-BINDINGOK
// ═══════════════════════════════════════════════════════════════════════

const screenBindings = {

  welcome() {
    // semmi extra — a delegált click handler kezeli a gombokat
  },

  'pair-create'() {
    // generáljunk egy új kódot, ha még nincs
    if (!state.pairCode) {
      setState({ pairCode: generatePairCode(), isInitiator: true });
    }
    const codeEl = app.querySelector('[data-code]');
    if (codeEl) codeEl.innerHTML = formatCode(state.pairCode);

    // DEV: gyors-skip — duplán tappolva a kódra párosítva folytat
    codeEl.addEventListener('dblclick', () => {
      setState({ paired: true });
      navigate('naming');
    });
  },

  'pair-join'() {
    const inputs = app.querySelectorAll('[data-code-input] .code-box');
    inputs[0].focus();

    inputs.forEach((input, i) => {
      input.addEventListener('input', e => {
        // csak számokat
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
        if (e.target.value && i < inputs.length - 1) {
          inputs[i + 1].focus();
        }
        // ha mind 6 megvan, próbáljuk meg
        const code = Array.from(inputs).map(x => x.value).join('');
        if (code.length === 6) {
          handleJoinAttempt(code);
        }
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !e.target.value && i > 0) {
          inputs[i - 1].focus();
        }
      });
    });
  },

  naming() {
    const input = app.querySelector('[data-name]');
    if (state.piciName) input.value = state.piciName;
    setTimeout(() => input.focus(), 200);
  },

  arrival() {
    // csillagok
    renderStars(app.querySelector('.stars'));
    // név megjelenítése
    const nameEl = app.querySelector('[data-pici-name]');
    if (nameEl) nameEl.textContent = state.piciName || 'Csillám';
    // automatikus átmenet, ha nem skippelt
    const autoTimer = setTimeout(() => {
      if (currentScreen === 'arrival') {
        finishArrival();
      }
    }, 5400);
    // skip threshold: 0.4s után tappolva ugorhat
    let canSkip = false;
    setTimeout(() => { canSkip = true; }, 400);
    const screen = app.querySelector('.screen-arrival');
    screen.addEventListener('click', () => {
      if (canSkip && currentScreen === 'arrival') {
        clearTimeout(autoTimer);
        finishArrival();
      }
    });
  },

  home() {
    // Csillám figura
    renderPici(app.querySelector('[data-pici-figure]'));
    // név
    app.querySelector('[data-pici-name]').textContent = state.piciName || 'Csillám';
    // mai feladat
    ensureTodayTask();
    renderTask();
    // suttogó
    renderWhisper();
  },

  'whisper-compose'() {
    const input = app.querySelector('[data-whisper-input]');
    const counter = app.querySelector('[data-counter]');
    if (state.whisper && state.whisper.from === 'self') {
      input.value = state.whisper.text;
    }
    counter.textContent = 80 - input.value.length;
    setTimeout(() => input.focus(), 200);
    input.addEventListener('input', () => {
      counter.textContent = 80 - input.value.length;
    });
  },

  journal() {
    renderJournalTab('feladatok');
    // tab váltás
    app.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        app.querySelectorAll('[data-tab]').forEach(t => t.classList.toggle('is-active', t === tab));
        renderJournalTab(tabId);
      });
    });
  },

};

// ═══════════════════════════════════════════════════════════════════════
// KISEGÍTŐ FÜGGVÉNYEK
// ═══════════════════════════════════════════════════════════════════════

function handleJoinAttempt(code) {
  // v0.1: nincs valódi backend, simán elfogadjuk a kódot
  // v0.2-ben: ellenőrizzük Supabase-ben, hogy létezik-e
  setState({
    paired: true,
    partnerCode: code,
    isInitiator: false,
  });
  toast('összekapcsolódtatok ✓');
  setTimeout(() => navigate('naming'), 600);
}

function finishArrival() {
  setState({ hasSeenArrival: true });
  navigate('home');
}

function renderTask() {
  if (!state.todayTask) return;
  const card = app.querySelector('.card-task');
  const textEl = app.querySelector('[data-task-text]');
  const metaEl = app.querySelector('[data-task-meta]');
  if (textEl) textEl.textContent = state.todayTask.text;
  if (metaEl) metaEl.textContent = metaForTask(state.todayTask);
  if (card) card.classList.toggle('is-done', !!state.todayTaskDoneAt);
}

function renderWhisper() {
  const container = app.querySelector('[data-whisper]');
  if (!container) return;
  if (!state.whisper) {
    container.innerHTML = '<p class="whisper-empty">még nincs suttogás — küldj egyet</p>';
    return;
  }
  const fromLabel = state.whisper.from === 'self' ? 'Te' : (state.whisper.fromName || 'Virág');
  container.innerHTML = `
    <div class="whisper-display">
      <span class="whisper-from">${fromLabel}</span>
      ${escapeHtml(state.whisper.text)}
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderJournalTab(tabId) {
  const container = app.querySelector('[data-tab-content]');
  if (!container) return;

  if (tabId === 'feladatok') {
    container.innerHTML = renderFeladatokTab();
  } else if (tabId === 'suttogasok') {
    container.innerHTML = '<div class="empty-state">Suttogás-archív hamarosan...</div>';
  } else if (tabId === 'vagyak') {
    container.innerHTML = '<div class="empty-state">Vágy-lista hamarosan...</div>';
  } else if (tabId === 'kerdesek') {
    container.innerHTML = '<div class="empty-state">Kérdés-archív hamarosan...</div>';
  }
}

function renderFeladatokTab() {
  if (!state.feladatLog || state.feladatLog.length === 0) {
    return '<div class="empty-state">Még nincs teljesített feladat. Az első Mai feladat után itt jelenik meg.</div>';
  }
  // időcsoportokba szedjük
  const now = Date.now();
  const today = [], yesterday = [], thisWeek = [], earlier = [];
  for (const entry of [...state.feladatLog].reverse()) {
    const t = new Date(entry.doneAt).getTime();
    const days = (now - t) / (1000 * 60 * 60 * 24);
    if (days < 1) today.push(entry);
    else if (days < 2) yesterday.push(entry);
    else if (days < 7) thisWeek.push(entry);
    else earlier.push(entry);
  }
  const groups = [
    ['MA', today],
    ['TEGNAP', yesterday],
    ['A HÉTEN', thisWeek],
    ['KORÁBBAN', earlier],
  ];
  return groups.filter(([, arr]) => arr.length > 0).map(([label, arr]) => `
    <div class="log-group">
      <div class="log-group-label">${label}</div>
      ${arr.map(entry => `
        <div class="log-row is-done">
          <div class="log-mark"><span class="log-check">✓</span></div>
          <div class="log-content">
            <div class="log-text">${escapeHtml(entry.text)}</div>
            <div class="log-meta">
              <span class="log-from-self">Te</span>
              · ${formatTime(entry.doneAt)}
            </div>
            ${entry.note ? `<div class="log-note">„${escapeHtml(entry.note)}"</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  }
  const days = ['vas', 'hét', 'kedd', 'szer', 'csüt', 'pént', 'szom'];
  return days[d.getDay()];
}

// ═══════════════════════════════════════════════════════════════════════
// AKCIÓK (delegált event handler)
// ═══════════════════════════════════════════════════════════════════════

document.addEventListener('click', e => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  switch (action) {
    case 'pair-create':
      navigate('pair-create');
      break;

    case 'pair-join':
      navigate('pair-join');
      break;

    case 'back':
      back();
      break;

    case 'naming-confirm': {
      const input = app.querySelector('[data-name]');
      const name = input.value.trim();
      if (!name) {
        toast('adj nevet Csillámnak');
        input.focus();
        return;
      }
      setState({
        piciName: name,
        piciBornAt: Date.now(),
      });
      navigate('arrival');
      break;
    }

    case 'arrival-skip':
      // a screen-binding kezeli
      break;

    case 'open-journal':
      navigate('journal');
      break;

    case 'compose-whisper':
      navigate('whisper-compose');
      break;

    case 'send-whisper': {
      const input = app.querySelector('[data-whisper-input]');
      const text = input.value.trim();
      if (!text) {
        toast('írj valamit');
        return;
      }
      setState({
        whisper: {
          text,
          from: 'self',
          fromName: state.piciName ? 'Te' : 'Te',
          sentAt: Date.now(),
        },
      });
      toast('elküldve ✓');
      navigate('home');
      break;
    }

    case 'skip-task': {
      const oldId = state.todayTask?.id;
      drawNewTask(oldId);
      renderTask();
      toast('új feladat ✓');
      break;
    }

    case 'task-done': {
      if (state.todayTaskDoneAt) return;
      const now = Date.now();
      setState({
        todayTaskDoneAt: now,
        feladatLog: [
          ...state.feladatLog,
          {
            taskId: state.todayTask.id,
            text: state.todayTask.text,
            doneAt: now,
            by: 'self',
          },
        ],
      });
      renderTask();
      toast('szép vagy ❤');
      break;
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════
// INDÍTÁS
// ═══════════════════════════════════════════════════════════════════════

navigate(startupScreen());

// Service worker regisztráció (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.log('Service worker regisztráció sikertelen', err);
    });
  });
}
