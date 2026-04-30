/* ═══════════════════════════════════════════════════════════════════════
   we. — fő alkalmazás
   v0.2 · Supabase szinkronnal (visszaesik lokális módba ha nincs konfig)
   ═══════════════════════════════════════════════════════════════════════ */

import { feladatok } from './data/feladatok.js';
import * as sync from './lib/sync.js';

// ─── State ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'we-state-v2';

const defaultState = {
  myMemberId: null,
  paired: false,
  pairId: null,
  pairCode: null,
  partnerMemberId: null,
  isInitiator: null,
  piciName: null,
  piciStage: 'baby',
  piciBornAt: null,
  whisper: null,
  todayTask: null,
  todayTaskDoneAt: null,
  feladatLog: [],
  hasSeenArrival: false,
};

let state = loadState();
let syncReady = false;

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

window.__we = {
  state: () => state,
  reset: resetAll,
  syncReady: () => syncReady,
};

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  state = { ...defaultState };
  navigate('welcome');
}

// ─── Member ID ─────────────────────────────────────────────────────────

function ensureMemberId() {
  if (!state.myMemberId) {
    const id = (crypto.randomUUID && crypto.randomUUID()) ||
               'm-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    setState({ myMemberId: id });
  }
  return state.myMemberId;
}

// ─── Sync callbacks (realtime események) ──────────────────────────────

const syncCallbacks = {
  onConnected() {
    console.log('[sync] csatlakozva');
  },

  onPairUpdate(pair) {
    // member_b megjelent → joiner csatlakozott (initiátor szempontja)
    if (state.isInitiator && pair.member_b && !state.paired) {
      setState({
        paired: true,
        partnerMemberId: pair.member_b,
      });
      toast('csatlakozott ❤');
      navigate('naming');
    }
    // pici_name frissült (a párod nevezte el)
    if (pair.pici_name && pair.pici_name !== state.piciName) {
      setState({
        piciName: pair.pici_name,
        piciBornAt: state.piciBornAt || Date.now(),
      });
      if (currentScreen === 'naming') {
        navigate('arrival');
      }
      if (currentScreen === 'home') {
        const nameEl = app.querySelector('[data-pici-name]');
        if (nameEl) nameEl.textContent = pair.pici_name;
      }
    }
  },

  onWhisper(whisper) {
    const isFromMe = whisper.from_member === state.myMemberId;
    setState({
      whisper: {
        text: whisper.text,
        from: isFromMe ? 'self' : 'partner',
        sentAt: new Date(whisper.sent_at).getTime(),
      },
    });
    if (currentScreen === 'home') renderWhisper();
    if (!isFromMe) toast('új suttogás ❤');
  },

  onFeladatDone(entry) {
    const isFromMe = entry.done_by === state.myMemberId;
    if (!isFromMe) {
      setState({
        feladatLog: [
          ...state.feladatLog,
          {
            taskId: entry.task_id,
            text: entry.task_text,
            doneAt: new Date(entry.done_at).getTime(),
            by: 'partner',
            note: entry.note,
          },
        ],
      });
      toast(`${state.piciName || 'a párod'}: csinált egyet ❤`);
    }
    if (currentScreen === 'journal') renderJournalTab('feladatok');
  },
};

// ─── Inicializáció ─────────────────────────────────────────────────────

async function init() {
  if (sync.isConfigured()) {
    syncReady = await sync.connect();
    if (syncReady && state.pairId) {
      try {
        await hydrateFromServer();
        sync.subscribeToPair(state.pairId, syncCallbacks);
      } catch (err) {
        console.error('[sync] hidratálás hiba:', err);
      }
    }
  }
  if (!sync.isConfigured()) {
    showOfflineBanner();
  }
  navigate(startupScreen());
}

async function hydrateFromServer() {
  if (!state.pairId) return;
  const pair = await sync.loadPair(state.pairId);
  if (pair && pair.pici_name) {
    setState({ piciName: pair.pici_name });
  }
  const whisper = await sync.loadCurrentWhisper(state.pairId);
  if (whisper) {
    setState({
      whisper: {
        text: whisper.text,
        from: whisper.from_member === state.myMemberId ? 'self' : 'partner',
        sentAt: new Date(whisper.sent_at).getTime(),
      },
    });
  } else {
    setState({ whisper: null });
  }
  const log = await sync.loadFeladatLog(state.pairId);
  setState({
    feladatLog: log.map(e => ({
      taskId: e.task_id,
      text: e.task_text,
      doneAt: new Date(e.done_at).getTime(),
      by: e.done_by === state.myMemberId ? 'self' : 'partner',
      note: e.note,
    })).reverse(),
  });
}

function showOfflineBanner() {
  let banner = document.getElementById('offline-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.className = 'offline-banner';
    banner.textContent = 'helyileg fut · Supabase nem konfigurálva';
    document.body.appendChild(banner);
  }
}

// ─── Router ────────────────────────────────────────────────────────────

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
  const bind = screenBindings[screenId];
  if (bind) bind(opts);
  window.scrollTo(0, 0);
}

function back() {
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

function startupScreen() {
  if (!state.paired || !state.piciName) return 'welcome';
  return 'arrival';
}

// ─── Pici figura renderelés ────────────────────────────────────────────

function renderPici(target, size = 64) {
  if (!target) return;
  target.innerHTML = `
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
}

function renderStars(container, count = 14) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, () =>
    `<div class="star" style="top:${Math.random()*100}%;left:${Math.random()*100}%;animation-delay:${Math.random()*3}s"></div>`
  ).join('');
}

// ─── Pair code utils ───────────────────────────────────────────────────

function generatePairCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
  return code;
}

function formatCode(code) {
  if (!code || code.length !== 6) return '';
  const parts = code.split('');
  return parts.slice(0, 3).join('<span class="gap"></span>') +
         '<span class="gap" style="width:0.7em;"></span>' +
         parts.slice(3).join('<span class="gap"></span>');
}

// ─── Mai feladat ───────────────────────────────────────────────────────

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
  const pool = excludeId ? feladatok.filter(f => f.id !== excludeId) : feladatok;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  setState({
    todayTask: { ...pick, day: todayKey() },
    todayTaskDoneAt: null,
  });
}

function metaForTask(task) {
  const map = { reggel: 'reggel', este: 'este', hazaerkezes: 'hazafelé', barmikor: 'bármikor' };
  return [map[task.ido] || 'bármikor', task.koltseg === 'ingyenes' ? 'ingyenes' : task.koltseg].join(' · ');
}

// ─── Toast ─────────────────────────────────────────────────────────────

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

  welcome() {},

  async ['pair-create']() {
    ensureMemberId();
    if (!state.pairId) {
      const code = generatePairCode();
      if (syncReady) {
        try {
          const pair = await sync.createPair(state.myMemberId, code);
          setState({
            pairId: pair.id,
            pairCode: pair.pair_code,
            isInitiator: true,
          });
          sync.subscribeToPair(pair.id, syncCallbacks);
        } catch (err) {
          console.error('[create] hiba:', err);
          toast('párkód készítése sikertelen — ellenőrizd a Supabase-t');
          setState({ pairCode: code, isInitiator: true });
        }
      } else {
        setState({ pairCode: code, isInitiator: true });
      }
    }
    const codeEl = app.querySelector('[data-code]');
    if (codeEl) codeEl.innerHTML = formatCode(state.pairCode);
  },

  ['pair-join']() {
    ensureMemberId();
    const inputs = app.querySelectorAll('[data-code-input] .code-box');
    const errorEl = app.querySelector('[data-error]');
    inputs[0].focus();

    inputs.forEach((input, i) => {
      input.addEventListener('input', e => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
        if (e.target.value && i < inputs.length - 1) {
          inputs[i + 1].focus();
        }
        const code = Array.from(inputs).map(x => x.value).join('');
        if (code.length === 6) {
          tryJoin(code, errorEl, inputs);
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
    renderStars(app.querySelector('.stars'));
    const nameEl = app.querySelector('[data-pici-name]');
    if (nameEl) nameEl.textContent = state.piciName || 'Csillám';

    const autoTimer = setTimeout(() => {
      if (currentScreen === 'arrival') finishArrival();
    }, 5400);

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
    renderPici(app.querySelector('[data-pici-figure]'));
    app.querySelector('[data-pici-name]').textContent = state.piciName || 'Csillám';
    ensureTodayTask();
    renderTask();
    renderWhisper();
  },

  ['whisper-compose']() {
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
    app.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        app.querySelectorAll('[data-tab]').forEach(t => t.classList.toggle('is-active', t === tab));
        renderJournalTab(tab.dataset.tab);
      });
    });
  },
};

// ═══════════════════════════════════════════════════════════════════════
// KISEGÍTŐ FÜGGVÉNYEK
// ═══════════════════════════════════════════════════════════════════════

async function tryJoin(code, errorEl, inputs) {
  if (errorEl) errorEl.hidden = true;

  if (syncReady) {
    try {
      const result = await sync.joinPair(code, state.myMemberId);
      if (!result) {
        showJoinError('Ez a kód nem stimmel.', errorEl, inputs);
        return;
      }
      if (result.error === 'already_paired') {
        showJoinError('Ez a páros már össze van kapcsolva valakivel.', errorEl, inputs);
        return;
      }
      setState({
        paired: true,
        pairId: result.pair.id,
        partnerMemberId: result.partnerMemberId,
        isInitiator: false,
        piciName: result.pair.pici_name || null,
      });
      sync.subscribeToPair(result.pair.id, syncCallbacks);
      toast('összekapcsolódtatok ✓');
      setTimeout(() => navigate('naming'), 600);
    } catch (err) {
      console.error('[join] hiba:', err);
      showJoinError('Hiba történt. Próbáld újra.', errorEl, inputs);
    }
  } else {
    setState({
      paired: true,
      pairCode: code,
      isInitiator: false,
    });
    toast('összekapcsolódtatok ✓');
    setTimeout(() => navigate('naming'), 600);
  }
}

function showJoinError(msg, errorEl, inputs) {
  if (errorEl) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  inputs.forEach(i => { i.value = ''; });
  inputs[0].focus();
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
  const fromLabel = state.whisper.from === 'self' ? 'Te' : 'ő';
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
    ['MA', today], ['TEGNAP', yesterday], ['A HÉTEN', thisWeek], ['KORÁBBAN', earlier],
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
              <span class="${entry.by === 'self' ? 'log-from-self' : 'log-from-partner'}">${entry.by === 'self' ? 'Te' : 'ő'}</span>
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

document.addEventListener('click', async e => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  switch (action) {
    case 'pair-create': navigate('pair-create'); break;
    case 'pair-join': navigate('pair-join'); break;
    case 'back': back(); break;

    case 'naming-confirm': {
      const input = app.querySelector('[data-name]');
      const name = input.value.trim();
      if (!name) {
        toast('adj nevet');
        input.focus();
        return;
      }
      setState({ piciName: name, piciBornAt: state.piciBornAt || Date.now() });
      if (syncReady && state.pairId) {
        await sync.setPiciName(state.pairId, name);
      }
      navigate('arrival');
      break;
    }

    case 'arrival-skip': break;
    case 'open-journal': navigate('journal'); break;
    case 'compose-whisper': navigate('whisper-compose'); break;

    case 'send-whisper': {
      const input = app.querySelector('[data-whisper-input]');
      const text = input.value.trim();
      if (!text) {
        toast('írj valamit');
        return;
      }
      setState({
        whisper: { text, from: 'self', sentAt: Date.now() },
      });
      if (syncReady && state.pairId) {
        await sync.sendWhisper(state.pairId, state.myMemberId, text);
      }
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
      const task = state.todayTask;
      setState({
        todayTaskDoneAt: now,
        feladatLog: [
          ...state.feladatLog,
          { taskId: task.id, text: task.text, doneAt: now, by: 'self' },
        ],
      });
      renderTask();
      if (syncReady && state.pairId) {
        await sync.logTaskDone(state.pairId, state.myMemberId, task);
      }
      toast('szép vagy ❤');
      break;
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════
// INDÍTÁS
// ═══════════════════════════════════════════════════════════════════════

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.log('Service worker regisztráció sikertelen', err);
    });
  });
}
