/* ═══════════════════════════════════════════════════════════════════════
   we. — fő alkalmazás
   v0.2 · Supabase szinkronnal (visszaesik lokális módba ha nincs konfig)
   ═══════════════════════════════════════════════════════════════════════ */

import { feladatok } from './data/feladatok.js';
import { kerdesek as kerdesPool } from './data/kerdesek.js';
import { mitMondanaPool } from './data/mitmondana.js';
import { meditations } from './data/meditations.js';
import * as sync from './lib/sync.js';

// ─── State ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'we-state-v9';

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
  preferredLevel: 'kozepes',
  todayQuestionDoneAt: null,
  todayQuestionDay: null,
  todayQuestionText: null,
  pendingArchiveQuestion: null,
  kerdesArchive: [],
  vagyak: [],
  whisperArchive: [],
  mmToday: null,
  mmArchive: [],
  themePref: 'auto',
  customPools: {},
  partnerName: null,
  // presence
  partnerOnline: false,
  partnerSeenToday: false,
  // meditáció
  activeMedit: null,
  meditSuggestId: null,         // mai sorsolt meditáció — a Csillám esti javaslatához
  // v0.9 — Csillám-buborék
  activeBubble: null,           // { id, type, payload, deliveryAt, expiresAt }
  pendingBubbleMessages: [],    // jövőbeli kézbesítések (időzítendő)
  moodPickerOpen: false,
  // ölelés (helyi futás)
  olesStartedAt: null,
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

// ─── Téma alkalmazása ──────────────────────────────────────────────────

function applyTheme(pref) {
  if (pref === 'auto' || !pref) {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', pref);
  }
}

// ─── Pool getter-ek (custom > default) ────────────────────────────────

function getMitMondanaPool() {
  const custom = state.customPools?.mitmondana;
  if (Array.isArray(custom) && custom.length > 0) return custom;
  return mitMondanaPool;
}
function getFeladatokPool() {
  const custom = state.customPools?.feladatok;
  if (Array.isArray(custom) && custom.length > 0) return custom;
  return feladatok;
}
function getKerdesekPool() {
  const custom = state.customPools?.kerdesek;
  if (custom && (custom.konnyu?.length || custom.kozepes?.length || custom.mely?.length)) {
    // egyesítjük a defaultokkal: ha valamelyik üres, default
    return {
      konnyu: custom.konnyu?.length ? custom.konnyu : kerdesPool.konnyu,
      kozepes: custom.kozepes?.length ? custom.kozepes : kerdesPool.kozepes,
      mely: custom.mely?.length ? custom.mely : kerdesPool.mely,
    };
  }
  return kerdesPool;
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
    // preferred_level frissült (a párod átváltotta)
    if (pair.preferred_level && pair.preferred_level !== state.preferredLevel) {
      setState({ preferredLevel: pair.preferred_level });
      if (currentScreen === 'home') renderQuestionCard();
    }
    // v0.6: custom_pools frissült (a párod feltöltött vagy visszaállított pool-t)
    if (pair.custom_pools && JSON.stringify(pair.custom_pools) !== JSON.stringify(state.customPools)) {
      setState({ customPools: pair.custom_pools });
      toast('pool frissítve a párodtól ✓');
      if (currentScreen === 'home') {
        renderQuestionCard();
        renderMmCard();
        renderTask();
      }
    }
  },

  onWhisper(whisper) {
    const isFromMe = whisper.from_member === state.myMemberId;
    const archEntry = {
      id: whisper.id,
      text: whisper.text,
      by: isFromMe ? 'self' : 'partner',
      sentAt: new Date(whisper.sent_at).getTime(),
    };
    setState({
      whisper: {
        text: whisper.text,
        from: isFromMe ? 'self' : 'partner',
        sentAt: archEntry.sentAt,
      },
      whisperArchive: [archEntry, ...state.whisperArchive.filter(w => w.id !== whisper.id)],
    });
    // a suttogás (saját VAGY partneré) a Csillám buborékjában jelenik meg
    setBubble({
      id: 'suttogas-' + whisper.id,
      type: 'suttogas',
      payload: { text: whisper.text, fromSelf: isFromMe },
      deliveryAt: Date.now(),
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    });
    if (!isFromMe) {
      toast(`${state.partnerName || 'a párod'}: suttogás ❤`);
    }
    if (currentScreen === 'home') renderWhisper();
    if (currentScreen === 'journal' && currentTab === 'suttogasok') {
      renderJournalTab(currentTab);
    }
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
      toast(`${state.partnerName || 'a párod'}: csinált egyet ❤`);
    }
    if (currentScreen === 'journal') renderJournalTab(currentTab);
  },

  onKerdesArchived(entry) {
    const isFromMe = entry.discussed_by === state.myMemberId;
    setState({
      kerdesArchive: [
        ...state.kerdesArchive,
        {
          id: entry.id,
          question: entry.question,
          questionId: entry.question_id,
          level: entry.level,
          note: entry.note,
          by: isFromMe ? 'self' : 'partner',
          discussedAt: new Date(entry.discussed_at).getTime(),
        },
      ],
      todayQuestionDoneAt: new Date(entry.discussed_at).getTime(),
      todayQuestionDay: todayKey(),
      todayQuestionText: entry.question,
    });
    if (currentScreen === 'home') renderQuestionCard();
    if (currentScreen === 'journal') renderJournalTab(currentTab);
    if (!isFromMe) {
      toast('megbeszéltétek a mai kérdést ❤');
    }
  },

  onVagyakChange(payload) {
    const ev = payload.eventType;
    if (ev === 'INSERT' && payload.new) {
      const v = payload.new;
      if (state.vagyak.some(x => x.id === v.id)) return;
      setState({
        vagyak: [{
          id: v.id,
          text: v.text,
          note: v.note,
          doneAt: v.done_at ? new Date(v.done_at).getTime() : null,
          createdBy: v.created_by,
          createdAt: new Date(v.created_at).getTime(),
          category: v.category || 'egyeb',
          time_tag: v.time_tag || 'anywhen',
          target_date: v.target_date || null,
          lastSurfacedAt: v.last_surfaced_at ? new Date(v.last_surfaced_at).getTime() : null,
        }, ...state.vagyak],
      });
      if (v.created_by !== state.myMemberId) {
        toast(`${state.partnerName || 'a párod'}: új jegyzet ❤`);
      }
    } else if (ev === 'UPDATE' && payload.new) {
      const v = payload.new;
      setState({
        vagyak: state.vagyak.map(x => x.id === v.id ? {
          ...x,
          text: v.text,
          note: v.note,
          doneAt: v.done_at ? new Date(v.done_at).getTime() : null,
          category: v.category || x.category,
          time_tag: v.time_tag || x.time_tag,
          target_date: v.target_date || null,
          lastSurfacedAt: v.last_surfaced_at ? new Date(v.last_surfaced_at).getTime() : null,
        } : x),
      });
    } else if (ev === 'DELETE' && payload.old) {
      setState({ vagyak: state.vagyak.filter(x => x.id !== payload.old.id) });
    }
    if (currentScreen === 'journal' && currentTab === 'vagyak') {
      renderJournalTab(currentTab);
    }
  },

  onMitMondanaSession(payload) {
    const ev = payload.eventType;
    if (ev === 'INSERT' && payload.new) {
      const s = payload.new;
      if (!state.mmToday && s.date === todayKey()) {
        setState({ mmToday: hydrateMmSession(s, []) });
        if (currentScreen === 'home') renderMmCard();
      }
    } else if (ev === 'UPDATE' && payload.new) {
      const s = payload.new;
      if (state.mmToday && state.mmToday.sessionId === s.id) {
        setState({
          mmToday: {
            ...state.mmToday,
            revealedAt: s.revealed_at ? new Date(s.revealed_at).getTime() : null,
            note: s.note,
          },
        });
        if (s.revealed_at) {
          // ROBOSZTUS: ha felfedés történt, MINDIG újrahidratáljuk a teljes adatot
          // a serverről. Így biztos hogy mind a 4 válasz látszik mindkét telefonon.
          refreshMmFromServer().then(() => {
            // archív frissítése a teljes server-state-ből
            const t = state.mmToday;
            if (t && t.revealedAt && !state.mmArchive.some(e => e.sessionId === t.sessionId)) {
              const archEntry = {
                sessionId: t.sessionId,
                questionId: t.questionId,
                question: t.question,
                date: t.date,
                revealedAt: t.revealedAt,
                note: t.note,
                myGuess: t.myResponse?.guess || '',
                myActual: t.myResponse?.actual || '',
                partnerGuess: t.partnerResponse?.guess || '',
                partnerActual: t.partnerResponse?.actual || '',
              };
              setState({ mmArchive: [archEntry, ...state.mmArchive] });
            }
            if (currentScreen === 'home') renderMmCard();
            if (currentScreen === 'mm-status') {
              navigate('mm-reveal');
            } else if (currentScreen === 'mm-reveal') {
              renderMmReveal();
            }
            if (currentScreen === 'journal' && currentTab === 'kerdesek') {
              renderJournalTab('kerdesek');
            }
          });
        }
      }
    }
  },

  onMitMondanaResponse(response) {
    if (!state.mmToday || state.mmToday.sessionId !== response.session_id) return;
    const isFromMe = response.member_id === state.myMemberId;
    const respObj = {
      guess: response.guess,
      actual: response.actual,
      completedAt: new Date(response.completed_at).getTime(),
    };
    setState({
      mmToday: {
        ...state.mmToday,
        ...(isFromMe ? { myResponse: respObj } : { partnerResponse: respObj }),
      },
    });
    if (!isFromMe && !state.partnerMemberId) {
      setState({ partnerMemberId: response.member_id });
    }
    if (currentScreen === 'home') renderMmCard();
    if (currentScreen === 'mm-status') renderMmStatus();
    if (!isFromMe) {
      toast(`${state.partnerName || 'a párod'}: válaszolt ❤`);
    }
    // auto-reveal: ha mindkét válasz megérkezett és még nincs felfedve
    maybeAutoReveal();
  },

  onTeamActivity(payload) {
    const ev = payload.eventType;
    if (ev === 'DELETE') return;
    if (!payload.new) return;
    const ta = payload.new;
    if (ta.date !== todayKey()) return;
    const type = ta.activity_type;
    if (!CSAPAT_TYPES.includes(type)) return;
    const wasState = state.csapatToday[type]?.state || {};
    const newCsapatToday = { ...state.csapatToday, [type]: ta };
    setState({ csapatToday: newCsapatToday });

    const newState = ta.state || {};
    if (type === 'hala' && newState.author_id && !isMyId(newState.author_id) && !wasState.author_id) {
      toast(`${state.partnerName || 'a párod'}: hála-üzenet ❤`);
    } else if (type === 'hangulat') {
      const hadPartnerB = wasState.b_id && !isMyId(wasState.b_id);
      const hasPartnerB = newState.b_id && !isMyId(newState.b_id);
      const hadPartnerA = wasState.a_id && !isMyId(wasState.a_id);
      const hasPartnerA = newState.a_id && !isMyId(newState.a_id);
      if ((hasPartnerB && !hadPartnerB) || (hasPartnerA && !hadPartnerA)) {
        toast(`${state.partnerName || 'a párod'}: hangulat ✓`);
      }
    } else if (type === 'oles') {
      if (newState.started_at && !wasState.started_at) toast('öleljetek 20 mp-ig ❤');
    } else if (type === 'gondolok') {
      const oldPings = (wasState.pings || []).length;
      const newPings = (newState.pings || []).length;
      if (newPings > oldPings) {
        const lastPing = newState.pings[newPings - 1];
        if (!isMyId(lastPing.from)) toast(`${state.partnerName || 'a párod'}: rád gondol ❤`);
      }
    } else if (type === 'hid') {
      if (newState.requester_id && !isMyId(newState.requester_id) && !wasState.requester_id) {
        toast(`${state.partnerName || 'a párod'}: híd-jelzést küldött ❤`);
      } else if (newState.responder_id && !isMyId(newState.responder_id) && !wasState.responder_id) {
        toast(`${state.partnerName || 'a párod'}: hallgat ❤`);
      }
    }
    // v0.9: csapat-detail screen elment, csak a buborékot frissítjük
  },

  // v0.9: Csillám-buborék üzenet érkezett (realtime)
  onCsillamMessage(payload) {
    const ev = payload.eventType;
    if (ev === 'DELETE') return;
    if (!payload.new) return;
    const m = payload.new;
    const msg = {
      id: m.id,
      type: m.type,
      payload: m.payload || {},
      deliveryAt: new Date(m.delivery_at).getTime(),
      expiresAt: m.expires_at ? new Date(m.expires_at).getTime() : null,
    };
    const now = Date.now();
    if (msg.deliveryAt <= now) {
      // azonnal kézbesítendő
      setBubble(msg);
      // toast a partneré
      if (m.author_id !== state.myMemberId) {
        if (msg.type === 'hala') {
          toast(`${state.partnerName || 'a párod'}: hála ❤`);
        } else if (msg.type === 'hangulat') {
          toast(`${state.partnerName || 'a párod'}: ${msg.payload?.emoji || '😊'}`);
        } else if (msg.type === 'gondolok') {
          toast(`${state.partnerName || 'a párod'}: rád gondol ❤`);
        }
      }
    } else {
      // jövőbeli kézbesítés — időzítéshez tárljuk
      const pending = state.pendingBubbleMessages.filter(p => p.id !== msg.id);
      setState({ pendingBubbleMessages: [...pending, msg] });
      schedulePendingBubbles();
    }
  },
};

// ─── Inicializáció ─────────────────────────────────────────────────────

async function init() {
  // azonnal alkalmazzuk a téma-preferenciát (még a sync előtt)
  applyTheme(state.themePref);

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
  if (pair) {
    if (pair.pici_name) setState({ piciName: pair.pici_name });
    if (pair.preferred_level) setState({ preferredLevel: pair.preferred_level });
    if (pair.pici_born_at) setState({ piciBornAt: new Date(pair.pici_born_at).getTime() });
    if (pair.custom_pools && typeof pair.custom_pools === 'object') {
      setState({ customPools: pair.custom_pools });
    }
    // partner azonosítása a pair member listából
    if (pair.member_a && pair.member_b) {
      const other = pair.member_a === state.myMemberId ? pair.member_b : pair.member_a;
      if (other && !state.partnerMemberId) setState({ partnerMemberId: other });
    }
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
  // teljes suttogás-archív
  const allWhispers = await sync.loadAllWhispers(state.pairId);
  setState({
    whisperArchive: allWhispers.map(w => ({
      id: w.id,
      text: w.text,
      by: w.from_member === state.myMemberId ? 'self' : 'partner',
      sentAt: new Date(w.sent_at).getTime(),
    })),
  });
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
  const archiv = await sync.loadKerdesek(state.pairId);
  setState({
    kerdesArchive: archiv.map(e => ({
      id: e.id,
      question: e.question,
      questionId: e.question_id,
      level: e.level,
      note: e.note,
      by: e.discussed_by === state.myMemberId ? 'self' : 'partner',
      discussedAt: new Date(e.discussed_at).getTime(),
    })).reverse(),
  });
  const today = todayKey();
  const todayDiscussed = archiv.find(e => {
    const d = new Date(e.discussed_at);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` === today;
  });
  if (todayDiscussed) {
    setState({
      todayQuestionDoneAt: new Date(todayDiscussed.discussed_at).getTime(),
      todayQuestionDay: today,
      todayQuestionText: todayDiscussed.question,
    });
  } else {
    setState({
      todayQuestionDoneAt: null,
      todayQuestionDay: null,
      todayQuestionText: null,
    });
  }
  // vágyak
  const vagyak = await sync.loadVagyak(state.pairId);
  setState({
    vagyak: vagyak.map(v => ({
      id: v.id,
      text: v.text,
      note: v.note,
      doneAt: v.done_at ? new Date(v.done_at).getTime() : null,
      createdBy: v.created_by,
      createdAt: new Date(v.created_at).getTime(),
      category: v.category || 'egyeb',
      time_tag: v.time_tag || 'anywhen',
      target_date: v.target_date || null,
      lastSurfacedAt: v.last_surfaced_at ? new Date(v.last_surfaced_at).getTime() : null,
    })),
  });
  // mit mondana — mai session + felfedett archív
  const mmTodayData = await sync.loadTodayMitMondana(state.pairId, todayKey());
  if (mmTodayData) {
    setState({ mmToday: hydrateMmSession(mmTodayData.session, mmTodayData.responses) });
  } else {
    setState({ mmToday: null });
  }
  const mmAll = await sync.loadAllMitMondana(state.pairId);
  setState({
    mmArchive: mmAll.map(({ session, responses }) => hydrateMmArchiveEntry(session, responses)),
  });

  // v0.9: aktív + pending Csillám-buborék üzenetek
  const activeMsg = await sync.loadActiveCsillamMessage(state.pairId);
  if (activeMsg) {
    setState({
      activeBubble: {
        id: activeMsg.id,
        type: activeMsg.type,
        payload: activeMsg.payload || {},
        deliveryAt: new Date(activeMsg.delivery_at).getTime(),
        expiresAt: activeMsg.expires_at ? new Date(activeMsg.expires_at).getTime() : null,
      },
    });
  }
  const pendingMsgs = await sync.loadPendingCsillamMessages(state.pairId);
  setState({
    pendingBubbleMessages: pendingMsgs.map(m => ({
      id: m.id,
      type: m.type,
      payload: m.payload || {},
      deliveryAt: new Date(m.delivery_at).getTime(),
      expiresAt: m.expires_at ? new Date(m.expires_at).getTime() : null,
    })),
  });

  // v0.8: presence — ma volt itt jelölés (last_seen)
  if (pair?.last_seen && state.partnerMemberId) {
    const partnerLast = pair.last_seen[state.partnerMemberId];
    if (partnerLast) {
      const partnerLastDate = new Date(partnerLast);
      const isToday = partnerLastDate.toDateString() === new Date().toDateString();
      setState({ partnerSeenToday: isToday });
    }
  }
  // saját last_seen frissítése
  await sync.updateLastSeen(state.pairId, state.myMemberId);
  // presence csatorna join
  sync.joinPresence(state.pairId, state.myMemberId, {
    onPresenceSync: onlineMembers => {
      const partnerOnline = onlineMembers.some(m => m !== state.myMemberId);
      setState({ partnerOnline });
      if (currentScreen === 'home') renderPresence();
    },
  });
}

function hydrateMmSession(session, responses) {
  const mine = responses.find(r => r.member_id === state.myMemberId);
  const theirs = responses.find(r => r.member_id !== state.myMemberId);
  return {
    sessionId: session.id,
    questionId: session.question_id,
    question: session.question,
    date: session.date,
    initiatorId: session.initiator_id,
    revealedAt: session.revealed_at ? new Date(session.revealed_at).getTime() : null,
    note: session.note,
    myResponse: mine ? { guess: mine.guess, actual: mine.actual, completedAt: new Date(mine.completed_at).getTime() } : null,
    partnerResponse: theirs ? { guess: theirs.guess, actual: theirs.actual, completedAt: new Date(theirs.completed_at).getTime() } : null,
  };
}

function hydrateMmArchiveEntry(session, responses) {
  const mine = responses.find(r => r.member_id === state.myMemberId);
  const theirs = responses.find(r => r.member_id !== state.myMemberId);
  return {
    sessionId: session.id,
    questionId: session.question_id,
    question: session.question,
    date: session.date,
    revealedAt: session.revealed_at ? new Date(session.revealed_at).getTime() : null,
    note: session.note,
    myGuess: mine?.guess || '',
    myActual: mine?.actual || '',
    partnerGuess: theirs?.guess || '',
    partnerActual: theirs?.actual || '',
  };
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
let currentTab = 'feladatok';

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
  } else if (currentScreen === 'question-note') {
    setState({ pendingArchiveQuestion: null });
    navigate('home');
  } else if (currentScreen === 'wish-add') {
    navigate('journal');
  } else if (currentScreen === 'settings') {
    navigate('journal');
  } else if (currentScreen === 'mm-input' || currentScreen === 'mm-status' || currentScreen === 'mm-reveal') {
    navigate('home');
  } else if (currentScreen === 'hala-write' || currentScreen === 'oles-run') {
    stopOlesTimer();
    navigate('home');
  } else if (currentScreen === 'meditation-suggest' || currentScreen === 'meditation-picker') {
    navigate('home');
  } else if (currentScreen === 'meditation-run') {
    stopMeditationTick();
    setState({ activeMedit: null });
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

// ─── Pici evolúciós szakaszok ──────────────────────────────────────────

function getPiciStage(bornAt) {
  if (!bornAt) return 'baby';
  const days = (Date.now() - bornAt) / (1000 * 60 * 60 * 24);
  if (days < 15) return 'baby';
  if (days < 30) return 'gyerek';
  if (days < 90) return 'tini';
  return 'felnott';
}

function piciAgeText(bornAt) {
  if (!bornAt) return '';
  const days = Math.floor((Date.now() - bornAt) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'épp most érkezett';
  if (days === 1) return '1 napos';
  if (days < 30) return `${days} napos`;
  if (days < 90) return `${Math.floor(days / 7)} hetes`;
  return `${Math.floor(days / 30)} hónapos`;
}

const STAGE_LABEL = {
  baby: 'baba',
  gyerek: 'gyerek',
  tini: 'tini',
  felnott: 'felnőtt',
};

// ─── Pool parserek + prompt sablonok ──────────────────────────────────

function parseMitMondanaPool(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (lines.length === 0) throw new Error('üres pool');
  return lines.map((t, i) => ({ id: `custom_${String(i).padStart(3,'0')}`, text: t }));
}

function parseFeladatokPool(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (lines.length === 0) throw new Error('üres pool');
  const validIdo = new Set(['reggel', 'este', 'hazaerkezes', 'barmikor']);
  const validKoltseg = new Set(['ingyenes', 'kicsi', 'kozepes']);
  return lines.map((line, i) => {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length !== 3) throw new Error(`hibás sor (3 részből kell állnia): ${line.slice(0, 60)}…`);
    const [t, ido, koltseg] = parts;
    if (!validIdo.has(ido)) throw new Error(`hibás időpont „${ido}" — érvényes: reggel, este, hazaerkezes, barmikor`);
    if (!validKoltseg.has(koltseg)) throw new Error(`hibás költség „${koltseg}" — érvényes: ingyenes, kicsi, kozepes`);
    return { id: i + 1, text: t, ido, koltseg };
  });
}

function parseKerdesekPool(text) {
  const result = { konnyu: [], kozepes: [], mely: [] };
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^\[(KONNYU|KOZEPES|MELY)\]$/);
    if (m) { current = m[1].toLowerCase(); continue; }
    if (current) result[current].push(line);
  }
  const total = result.konnyu.length + result.kozepes.length + result.mely.length;
  if (total === 0) throw new Error('nincs kérdés egyik szinten sem — ellenőrizd a [KONNYU] / [KOZEPES] / [MELY] jelölőket');
  return result;
}

const POOL_PROMPTS = {
  mitmondana: `Készíts nekem 50 új „Mit mondana a másik?" kérdést egy páros játékhoz.

A kérdések olyanok legyenek, amikre nem tudom biztosan a párom válaszát — érdekes tippelni, érdekes megtudni. Mix legyen JÁTÉKOS / KÉPZELETBELI (pl. szuperhősök, varázspálca, mesebeli helyek, tárgy ami titokban él) és KOMOLYABB / ÖNREFLEXÍV (érzések, emlékek, mit hiányolsz). Magyar nyelven, természetesen.

A formátum legyen pontosan ez (egy kérdés / sor, csak a sorokat add vissza, semmi mást):

# we. mit mondana pool
# Egy kérdés / sor.

Mit kérnél most a hold-istennőtől?
Ha most teleportálhatnál egy hétre, hova mennél?
[stb. 50-ig]

Mentsd .txt fájlba, feltöltöm.`,
  feladatok: `Készíts nekem 80 új mai apró feladatot egy páros alkalmazáshoz.

Minden feladat egy kis konkrét cselekvés legyen, amit egyikőtök egyedül megtehet aznap a párjáért — gesztus, figyelmesség, érintkezés. Konkrét és könnyen megtehető legyen, ne homályos. Magyar nyelven, természetesen.

A formátum pontosan ez (egy feladat / sor, három részre osztva | jellel), csak a sorokat add vissza:

# we. mai feladat pool
# Formátum: szöveg | időpont | költség
# időpont: reggel | este | hazaerkezes | barmikor
# költség: ingyenes | kicsi | kozepes

Vegyél egy szál virágot hazafelé jövet | hazaerkezes | kicsi
Mondj egy konkrét köszönöm-öt a párodnak | barmikor | ingyenes
Készíts neki kávét reggel | reggel | ingyenes
[stb. 80-ig]

Mentsd .txt fájlba, feltöltöm.`,
  kerdesek: `Készíts nekem 100 új páros beszélgető-kérdést, három szintbe rendezve: 30 KÖNNYŰ + 40 KÖZEPES + 30 MÉLY.

KÖNNYŰ: kedvenc dolgok, álmok, napi apróságok — kockázat nélküli.
KÖZEPES: érzelmek, kapcsolat, „mit szeretnél, ha többet hallanám tőled?" típus — kicsit sebezhető.
MÉLY: alapfélelmek, gyermekkori mintázatok, sebezhetőséget engedő — finomak de őszinték.

Magyar nyelven, természetesen. A formátum pontosan ez, csak a sorokat add vissza:

# we. mai kérdés pool — 30 + 40 + 30 = 100
# Szintek: [KONNYU] / [KOZEPES] / [MELY]

[KONNYU]
Mi volt ma a legjobb pillanatod?
[stb. 30-ig]

[KOZEPES]
Mit szerettél bennem amikor először találkoztunk?
[stb. 40-ig]

[MELY]
Mitől félsz leginkább velem kapcsolatban?
[stb. 30-ig]

Mentsd .txt fájlba, feltöltöm.`,
};

function poolStatusText(type) {
  const c = state.customPools?.[type];
  if (!c) {
    if (type === 'mitmondana') return `alap pool · ${mitMondanaPool.length} kérdés`;
    if (type === 'feladatok') return `alap pool · ${feladatok.length} feladat`;
    if (type === 'kerdesek') return `alap pool · ${kerdesPool.konnyu.length}+${kerdesPool.kozepes.length}+${kerdesPool.mely.length} kérdés`;
  }
  if (type === 'kerdesek') {
    return `saját pool · ${(c.konnyu?.length||0)}+${(c.kozepes?.length||0)}+${(c.mely?.length||0)} kérdés`;
  }
  return `saját pool · ${c.length} elem`;
}

function refreshPoolStatuses() {
  ['mitmondana', 'feladatok', 'kerdesek'].forEach(type => {
    const statusEl = app.querySelector(`[data-pool-status="${type}"]`);
    if (statusEl) {
      statusEl.textContent = poolStatusText(type);
      statusEl.classList.toggle('is-custom', !!state.customPools?.[type]);
    }
    const resetBtn = app.querySelector(`[data-action="reset-pool"][data-pool-type="${type}"]`);
    if (resetBtn) resetBtn.hidden = !state.customPools?.[type];
  });
}

async function handlePoolUpload(type, file) {
  let text;
  try { text = await file.text(); }
  catch { toast('nem sikerült beolvasni a fájlt'); return; }
  let parsed;
  try {
    if (type === 'mitmondana') parsed = parseMitMondanaPool(text);
    else if (type === 'feladatok') parsed = parseFeladatokPool(text);
    else if (type === 'kerdesek') parsed = parseKerdesekPool(text);
  } catch (e) {
    toast('hibás formátum: ' + e.message, 4500);
    return;
  }
  const newCustomPools = { ...state.customPools, [type]: parsed };
  setState({ customPools: newCustomPools });
  if (syncReady && state.pairId) {
    await sync.setCustomPools(state.pairId, newCustomPools);
  }
  toast(`${type} pool feltöltve ✓`);
  refreshPoolStatuses();
}

async function resetPool(type) {
  if (!confirm(`Visszaállítod a ${type} pool-t az eredetire?`)) return;
  const newCustomPools = { ...state.customPools };
  delete newCustomPools[type];
  setState({ customPools: newCustomPools });
  if (syncReady && state.pairId) {
    await sync.setCustomPools(state.pairId, newCustomPools);
  }
  toast(`${type} pool visszaállítva ✓`);
  refreshPoolStatuses();
}

async function copyPoolPrompt(type) {
  const prompt = POOL_PROMPTS[type];
  if (!prompt) return;
  try {
    await navigator.clipboard.writeText(prompt);
    toast('prompt másolva ✓');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = prompt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('prompt másolva ✓'); }
    catch { toast('másolás sikertelen — másold ki kézzel'); }
    document.body.removeChild(ta);
  }
}

// ─── Pici figura SVG-k szakaszonként ──────────────────────────────────

function piciSVG(stage) {
  if (stage === 'meditate') {
    // Lótusz-pozíció a régi Pici alapján — behunyt szem, mosoly, kéz a térden
    return `
      <svg width="130" height="130" viewBox="0 0 100 110" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <radialGradient id="aura-grad" cx="50%" cy="55%" r="50%">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.22"/>
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="50" cy="55" r="44" fill="url(#aura-grad)" class="medit-aura"/>
        <g transform="translate(50, 55)">
          <g class="pici-meditate-bob">
            <ellipse cx="0" cy="32" rx="26" ry="6" class="pici-body-fill" opacity="0.85"/>
            <ellipse cx="0" cy="0" rx="20" ry="27" class="pici-body-fill"/>
            <ellipse cx="-6" cy="-8" rx="7" ry="13" fill="#FFF" opacity="0.22"/>
            <ellipse cx="-14" cy="28" rx="5" ry="3.5" class="pici-body-fill"/>
            <ellipse cx="14" cy="28" rx="5" ry="3.5" class="pici-body-fill"/>
            <path d="M -11 7 Q -7 11 -3 7" stroke="#1A1714" stroke-width="1.6" fill="none" stroke-linecap="round"/>
            <path d="M 3 7 Q 7 11 11 7" stroke="#1A1714" stroke-width="1.6" fill="none" stroke-linecap="round"/>
            <path d="M -4 22 Q 0 25 4 22" stroke="#1A1714" stroke-width="1.5" fill="none" stroke-linecap="round"/>
            <line x1="-6" y1="-25" x2="-9" y2="-44" stroke="#1A1714" stroke-width="1.8" stroke-linecap="round"/>
            <line x1="6" y1="-25" x2="9" y2="-44" stroke="#1A1714" stroke-width="1.8" stroke-linecap="round"/>
            <circle cx="-9" cy="-45" r="3.2" class="pici-tip-fill"/>
            <circle cx="9" cy="-45" r="3.2" class="pici-tip-fill"/>
          </g>
        </g>
        <style>
          .pici-body-fill { fill: var(--pici-body); }
          .pici-tip-fill { fill: var(--pici-tip); }
          .pici-meditate-bob { animation: pici-meditate-bob-anim 4s ease-in-out infinite; transform-origin: center; }
          @keyframes pici-meditate-bob-anim { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
          .medit-aura { animation: pici-aura-anim 4s ease-in-out infinite; transform-origin: center; }
          @keyframes pici-aura-anim { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        </style>
      </svg>
    `;
  }
  if (stage === 'baby') {
    // Kicsi, nincs kar/láb, antenna csak két pötty a fején
    return `
      <svg width="48" height="58" viewBox="-30 -20 60 60" aria-hidden="true">
        <ellipse cx="0" cy="32" rx="16" ry="2.5" fill="rgba(0,0,0,0.10)"/>
        <g class="pici-bob">
          <ellipse cx="0" cy="14" rx="16" ry="20" class="pici-body-fill"/>
          <ellipse cx="-5" cy="8" rx="5" ry="9" fill="#FFF" opacity="0.3"/>
          <circle cx="0" cy="14" r="1.5" class="pici-tip-fill" opacity="0.7"/>
          <circle cx="-7" cy="0" r="3.8" fill="#1A1714"/>
          <circle cx="7" cy="0" r="3.8" fill="#1A1714"/>
          <circle cx="-6" cy="-1.5" r="1.4" fill="#FFF"/>
          <circle cx="8" cy="-1.5" r="1.4" fill="#FFF"/>
          <ellipse cx="0" cy="13" rx="2.5" ry="1.5" fill="#1A1714"/>
          <circle cx="-7" cy="-15" r="2.5" class="pici-tip-fill"/>
          <circle cx="7" cy="-15" r="2.5" class="pici-tip-fill"/>
        </g>
        <style>
          .pici-body-fill { fill: var(--pici-body); }
          .pici-tip-fill { fill: var(--pici-tip); }
          @keyframes pici-bob-anim { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
          .pici-bob { animation: pici-bob-anim 2.2s ease-in-out infinite; transform-origin: center; }
        </style>
      </svg>
    `;
  }
  if (stage === 'gyerek') {
    // Kis lábak, rövid antennák
    return `
      <svg width="56" height="68" viewBox="-30 -25 60 70" aria-hidden="true">
        <ellipse cx="0" cy="38" rx="19" ry="3" fill="rgba(0,0,0,0.10)"/>
        <g class="pici-bob">
          <ellipse cx="0" cy="16" rx="18" ry="23" class="pici-body-fill"/>
          <ellipse cx="-5" cy="9" rx="6" ry="11" fill="#FFF" opacity="0.27"/>
          <ellipse cx="-6" cy="38" rx="4" ry="2.5" class="pici-body-fill"/>
          <ellipse cx="6" cy="38" rx="4" ry="2.5" class="pici-body-fill"/>
          <circle cx="2" cy="14" r="1.5" class="pici-tip-fill" opacity="0.7"/>
          <circle cx="-3" cy="22" r="1" class="pici-tip-fill" opacity="0.6"/>
          <ellipse cx="-7" cy="2" rx="4" ry="4.7" fill="#1A1714"/>
          <ellipse cx="7" cy="2" rx="4" ry="4.7" fill="#1A1714"/>
          <circle cx="-6" cy="0.5" r="1.4" fill="#FFF"/>
          <circle cx="8" cy="0.5" r="1.4" fill="#FFF"/>
          <path d="M -5 16 Q 0 21 5 16" stroke="#1A1714" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <line x1="-7" y1="-13" x2="-9" y2="-19" stroke="#1A1714" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="7" y1="-13" x2="9" y2="-19" stroke="#1A1714" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="-9" cy="-20" r="2.6" class="pici-tip-fill"/>
          <circle cx="9" cy="-20" r="2.6" class="pici-tip-fill"/>
        </g>
        <style>
          .pici-body-fill { fill: var(--pici-body); }
          .pici-tip-fill { fill: var(--pici-tip); }
          @keyframes pici-bob-anim { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
          .pici-bob { animation: pici-bob-anim 2.4s ease-in-out infinite; transform-origin: center; }
        </style>
      </svg>
    `;
  }
  if (stage === 'tini') {
    // Karok, lábak, normál antennák de rövidebbek
    return `
      <svg width="60" height="74" viewBox="-30 -28 60 74" aria-hidden="true">
        <ellipse cx="0" cy="42" rx="21" ry="3.2" fill="rgba(0,0,0,0.10)"/>
        <g class="pici-bob">
          <ellipse cx="0" cy="17" rx="19" ry="25" class="pici-body-fill"/>
          <ellipse cx="-6" cy="10" rx="6.5" ry="12" fill="#FFF" opacity="0.26"/>
          <ellipse cx="-17" cy="20" rx="4.5" ry="7" class="pici-body-fill"/>
          <ellipse cx="17" cy="20" rx="4.5" ry="7" class="pici-body-fill"/>
          <ellipse cx="-7" cy="42" rx="4.5" ry="2.8" class="pici-body-fill"/>
          <ellipse cx="7" cy="42" rx="4.5" ry="2.8" class="pici-body-fill"/>
          <circle cx="2" cy="15" r="1.5" class="pici-tip-fill" opacity="0.7"/>
          <circle cx="-3" cy="23" r="1" class="pici-tip-fill" opacity="0.6"/>
          <ellipse cx="-7" cy="3" rx="4" ry="4.6" fill="#1A1714"/>
          <ellipse cx="7" cy="3" rx="4" ry="4.6" fill="#1A1714"/>
          <circle cx="-6" cy="1.5" r="1.4" fill="#FFF"/>
          <circle cx="8" cy="1.5" r="1.4" fill="#FFF"/>
          <path d="M -6 17 Q 0 23 6 17" stroke="#1A1714" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <line x1="-7" y1="-12" x2="-10" y2="-21" stroke="#1A1714" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="7" y1="-12" x2="10" y2="-21" stroke="#1A1714" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="-10" cy="-22" r="2.9" class="pici-tip-fill"/>
          <circle cx="10" cy="-22" r="2.9" class="pici-tip-fill"/>
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
  // felnott — eredeti
  return `
    <svg width="60" height="76" viewBox="-30 -30 60 76" aria-hidden="true">
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

// ─── Pici figura renderelés (stage-aware) ─────────────────────────────

function renderPici(target, forceStage = null) {
  if (!target) return;
  const stage = forceStage || getPiciStage(state.piciBornAt);
  target.innerHTML = piciSVG(stage);
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
  const pool = excludeId ? getFeladatokPool().filter(f => f.id !== excludeId) : getFeladatokPool();
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

// ─── Mai kérdés (sorsolás + szint címkék) ─────────────────────────────

const LEVEL_LABELS = { konnyu: 'könnyű', kozepes: 'közepes', mely: 'mély' };

function pickTodayQuestion() {
  const level = state.preferredLevel || 'kozepes';
  const allKerdesek = getKerdesekPool();
  const pool = allKerdesek[level] || allKerdesek.kozepes;
  const archivedIds = new Set(
    (state.kerdesArchive || [])
      .filter(e => e.level === level)
      .map(e => e.questionId)
      .filter(Boolean)
  );
  for (let i = 0; i < pool.length; i++) {
    const id = `${level}_${i}`;
    if (!archivedIds.has(id)) {
      return { id, text: pool[i], level, index: i };
    }
  }
  return { id: `${level}_0`, text: pool[0], level, index: 0 };
}

function isTodayQuestionDone() {
  return state.todayQuestionDoneAt && state.todayQuestionDay === todayKey();
}

// ─── Mit mondana — pool válogatás + state-számítás ────────────────────

function pickTodayMitMondana() {
  const usedIds = new Set(
    (state.mmArchive || []).map(s => s.questionId).filter(Boolean)
  );
  const pool = getMitMondanaPool();
  for (const q of pool) {
    if (!usedIds.has(q.id)) return q;
  }
  return pool[0];
}

function mmStatus() {
  // visszaadja: 'none' | 'i-submitted' | 'partner-submitted' | 'both' | 'revealed'
  const t = state.mmToday;
  if (!t) return 'none';
  if (t.revealedAt) return 'revealed';
  const mine = !!t.myResponse;
  const theirs = !!t.partnerResponse;
  if (mine && theirs) return 'both';
  if (mine) return 'i-submitted';
  if (theirs) return 'partner-submitted';
  return 'none';
}

function todayHasMmRevealed() {
  return mmStatus() === 'revealed' && state.mmToday?.date === todayKey();
}

// auto-felfedés: ha mindkét válasz megérkezett és még nincs felfedve
async function maybeAutoReveal() {
  const t = state.mmToday;
  if (!t) return;
  if (t.revealedAt) return;
  if (!t.myResponse || !t.partnerResponse) return;
  // helyileg azonnal: revealedAt
  setState({ mmToday: { ...t, revealedAt: Date.now() } });
  // szerveren is
  if (syncReady && !t.sessionId.startsWith('local-')) {
    await sync.revealMitMondana(t.sessionId, null);
  }
  // a megfelelő képernyő frissítése
  if (currentScreen === 'home') renderMmCard();
  else if (currentScreen === 'mm-input' || currentScreen === 'mm-status') {
    navigate('mm-reveal');
  } else if (currentScreen === 'mm-reveal') {
    renderMmReveal();
  }
}

// erőteljes újrahidratálás server-ről — biztosítja hogy a 4 válasz megjelenjen
async function refreshMmFromServer() {
  if (!state.pairId) return;
  if (!syncReady) return;
  const data = await sync.loadTodayMitMondana(state.pairId, todayKey());
  if (data) {
    setState({ mmToday: hydrateMmSession(data.session, data.responses) });
  }
}

// ─── Csapat-funkciók (v0.8 — modal, típus szerint, nem napi rotáció) ──

const CSAPAT_TYPES = ['hala', 'hangulat', 'oles', 'gondolok', 'hid'];
const CSAPAT_LABELS = {
  hala: 'Hála-üzenet',
  hangulat: 'Hangulat-megosztás',
  oles: '20 másodperces ölelés',
  gondolok: 'Rád gondolok',
  hid: 'Híd-jelzés',
};
const MOODS = [
  { emoji: '😊', label: 'jól' },
  { emoji: '😐', label: 'közepes' },
  { emoji: '😔', label: 'nehéz' },
  { emoji: '😴', label: 'fáradt' },
  { emoji: '🌟', label: 'csillogós' },
];

function getCsapatState(type) {
  return state.csapatToday?.[type]?.state || {};
}

function isMyId(id) {
  return id && id === state.myMemberId;
}

// ─── Meditáció — esti óra (19-22) detektálás ──────────────────────────

function isEveningMeditationHour() {
  const h = new Date().getHours();
  return h >= 19 && h < 22;
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
    renderQuestionCard();
    renderMmCard();
    renderPresence();
    renderCsillamBubble();
    maybeShowEveningMeditationSuggestion();
    maybeSurfaceJegyzet();
    schedulePendingBubbles();
    const popover = app.querySelector('[data-mood-popover]');
    if (popover) popover.hidden = true;
    if (syncReady && state.pairId) {
      refreshMmFromServer().then(() => {
        renderMmCard();
        maybeAutoReveal();
      });
    }
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

  ['question-note']() {
    const q = state.pendingArchiveQuestion;
    if (!q) {
      back();
      return;
    }
    const qEl = app.querySelector('[data-discussed-question]');
    if (qEl) qEl.textContent = q.text;
    setTimeout(() => app.querySelector('[data-note-input]')?.focus(), 200);
  },

  ['wish-add']() {
    setTimeout(() => app.querySelector('[data-wish-text-input]')?.focus(), 200);
    // pirulák kattinthatóság: a csoporton belül egy aktív
    const setupPills = (groupSel) => {
      const group = app.querySelector(groupSel);
      if (!group) return;
      group.addEventListener('click', e => {
        const btn = e.target.closest('.wish-cat-pill');
        if (!btn) return;
        e.preventDefault();
        group.querySelectorAll('.wish-cat-pill').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
      });
    };
    setupPills('[data-wish-cat]');
    setupPills('[data-wish-time]');
  },

  settings() {
    const renameInput = app.querySelector('[data-rename-input]');
    if (renameInput && state.piciName) renameInput.value = state.piciName;
    const partnerInput = app.querySelector('[data-partner-name-input]');
    if (partnerInput && state.partnerName) partnerInput.value = state.partnerName;
    const ageEl = app.querySelector('[data-pici-age]');
    if (ageEl) {
      const stage = getPiciStage(state.piciBornAt);
      const age = piciAgeText(state.piciBornAt);
      ageEl.textContent = `${age} · ${STAGE_LABEL[stage]}`;
    }
    // téma pirulák
    app.querySelectorAll('[data-theme-pick]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.themePick === (state.themePref || 'auto'));
    });
    // pool státuszok
    refreshPoolStatuses();
    // file input change → upload
    app.querySelectorAll('[data-pool-upload]').forEach(input => {
      input.addEventListener('change', async e => {
        const type = e.target.dataset.poolUpload;
        const file = e.target.files?.[0];
        if (!file) return;
        await handlePoolUpload(type, file);
        e.target.value = '';  // reset
      });
    });
  },

  ['mm-input']() {
    const t = state.mmToday;
    if (!t) {
      back();
      return;
    }
    const qEl = app.querySelector('[data-mm-question]');
    if (qEl) qEl.textContent = t.question;
    setTimeout(() => app.querySelector('[data-mm-guess]')?.focus(), 200);
  },

  ['mm-status']() {
    renderMmStatus();
    // server-ről frissítsük — hátha közben a partner is válaszolt és nem ért át a realtime
    refreshMmFromServer().then(() => {
      renderMmStatus();
      // ha közben mindkettő válaszolt, auto-reveal
      maybeAutoReveal();
    });
  },

  ['mm-reveal']() {
    // mindig server-ről hidratálj, hogy mind a 4 válasz biztosan meglegyen
    refreshMmFromServer().then(() => renderMmReveal());
    renderMmReveal();
  },

  ['hala-write']() {
    const promptEl = app.querySelector('[data-hala-prompt]');
    if (promptEl) promptEl.textContent = state.todayTask?.text || 'Egy konkrét dolog amit a párodnál értékelsz.';
    setTimeout(() => app.querySelector('[data-hala-input]')?.focus(), 200);
  },

  ['oles-run']() {
    const promptEl = app.querySelector('[data-oles-prompt]');
    if (promptEl) promptEl.textContent = state.todayTask?.text || 'Egy hosszú, csendes ölelés.';
    const startBtn = app.querySelector('[data-oles-start]');
    const doneBtn = app.querySelector('[data-oles-done]');
    const timerEl = app.querySelector('[data-oles-timer]');
    if (timerEl) timerEl.textContent = '20';
    if (startBtn) startBtn.hidden = false;
    if (doneBtn) doneBtn.hidden = true;
  },

  ['meditation-suggest']() {
    const id = state.meditSuggestId || (meditations[0] && meditations[0].id);
    if (!id) { back(); return; }
    const med = meditations.find(m => m.id === id);
    if (!med) { back(); return; }
    const titleEl = app.querySelector('[data-medit-suggest-title]');
    const sourceEl = app.querySelector('[data-medit-suggest-source]');
    const introEl = app.querySelector('[data-medit-suggest-intro]');
    const figureEl = app.querySelector('[data-medit-suggest-figure]');
    if (titleEl) titleEl.textContent = med.title;
    if (sourceEl) sourceEl.textContent = `// közös · ${med.duration} perc · ${med.source}`;
    if (introEl) introEl.textContent = med.intro;
    if (figureEl) renderPici(figureEl, 'meditate');
  },

  ['meditation-picker']() {
    const list = app.querySelector('[data-meditation-list]');
    if (!list) return;
    list.innerHTML = meditations.map(m => `
      <button class="medit-tile" data-action="open-meditation" data-medit-id="${m.id}">
        <span>
          <div class="medit-tile-title">${escapeHtml(m.title)}</div>
          <div class="medit-tile-source">${escapeHtml(m.source)}</div>
        </span>
        <span class="medit-tile-duration">${m.duration} perc</span>
      </button>
    `).join('');
  },

  ['meditation-run']() {
    const figureEl = app.querySelector('[data-medit-run-figure]');
    if (figureEl) renderPici(figureEl, 'meditate');
    if (state.activeMedit) {
      // automatikusan startoljuk (a suggest-ből jön a "Kipróbáltuk" után)
      if (!state.activeMedit.startedAt) {
        startMeditation(state.activeMedit.id);
      } else {
        renderMeditationRunning();
      }
    }
  },

  journal() {
    currentTab = 'feladatok';
    renderJournalTab(currentTab);
    app.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        currentTab = tab.dataset.tab;
        app.querySelectorAll('[data-tab]').forEach(t => t.classList.toggle('is-active', t === tab));
        renderJournalTab(currentTab);
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
  const btnEl = app.querySelector('.task-done-btn');
  if (textEl) textEl.textContent = state.todayTask.text;
  if (metaEl) metaEl.textContent = metaForTask(state.todayTask);
  if (card) card.classList.toggle('is-done', !!state.todayTaskDoneAt);
  // v0.9: gomb-szöveg és akció a típus alapján
  if (btnEl) {
    const type = state.todayTask.type || 'simple';
    if (type === 'hala') {
      btnEl.textContent = 'írok →';
      btnEl.dataset.action = 'open-hala-write';
    } else if (type === 'oles') {
      btnEl.textContent = 'indítom →';
      btnEl.dataset.action = 'open-oles-run';
    } else {
      btnEl.textContent = 'megcsináltam';
      btnEl.dataset.action = 'task-done';
    }
  }
}

function renderQuestionCard() {
  const card = app.querySelector('[data-question-card]');
  const doneCard = app.querySelector('[data-question-done]');
  if (!card || !doneCard) return;

  if (isTodayQuestionDone()) {
    card.hidden = true;
    doneCard.hidden = false;
    const t = app.querySelector('[data-question-done-text]');
    if (t) t.textContent = `„${state.todayQuestionText || ''}"`;
    return;
  }

  // még nem beszéltétek meg ma — render a választható kártyát
  card.hidden = false;
  doneCard.hidden = true;

  const q = pickTodayQuestion();
  const labelEl = app.querySelector('[data-question-label]');
  const textEl = app.querySelector('[data-question-text]');
  if (labelEl) labelEl.textContent = `Mai kérdés · ${LEVEL_LABELS[q.level]}`;
  if (textEl) textEl.textContent = q.text;

  // szint-pirulák — aktív bejelölve
  app.querySelectorAll('[data-level]').forEach(p => {
    p.classList.toggle('is-active', p.dataset.level === state.preferredLevel);
  });
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

// ─── v0.8 render: Mit mondana napi kártya (visszaáll a v0.5 mintára) ──

function renderMmCard() {
  const card = app.querySelector('[data-mm-card]');
  const doneCard = app.querySelector('[data-mm-card-done]');
  if (!card || !doneCard) return;

  const status = mmStatus();
  if (status === 'revealed' && state.mmToday?.date === todayKey()) {
    card.hidden = true;
    doneCard.hidden = false;
    const t = app.querySelector('[data-mm-card-done-text]');
    if (t) t.textContent = `„${state.mmToday.question}"`;
    return;
  }

  card.hidden = false;
  doneCard.hidden = true;

  const q = state.mmToday
    ? { id: state.mmToday.questionId, text: state.mmToday.question }
    : pickTodayMitMondana();
  const qEl = app.querySelector('[data-mm-card-question]');
  if (qEl) qEl.textContent = q.text;

  const statusEl = app.querySelector('[data-mm-card-status]');
  const ctaEl = app.querySelector('[data-mm-card-cta]');
  if (!statusEl || !ctaEl) return;

  if (status === 'none') {
    statusEl.textContent = '';
    ctaEl.textContent = 'megnyitom →';
  } else if (status === 'i-submitted') {
    statusEl.textContent = `elküldted ✓ · várunk a párodra`;
    ctaEl.textContent = 'státusz →';
  } else if (status === 'partner-submitted') {
    statusEl.textContent = 'ő már válaszolt — most te';
    ctaEl.textContent = 'megnyitom →';
  } else if (status === 'both') {
    statusEl.textContent = 'mindketten kész';
    ctaEl.textContent = 'felfedem →';
  }
}

// ─── v0.8 render: presence pöttyök (saját + partner) ──────────────────

function renderPresence() {
  const selfDot = app.querySelector('[data-dot-self]');
  const partnerDot = app.querySelector('[data-dot-partner]');
  const text = app.querySelector('[data-status-text]');
  if (!selfDot || !partnerDot) return;
  // én mindig "épp most" vagyok
  selfDot.classList.add('is-online');
  selfDot.classList.add('is-today');
  // partner: élénk = épp most, halvány = ma volt
  partnerDot.classList.toggle('is-online', !!state.partnerOnline);
  partnerDot.classList.toggle('is-today', !!(state.partnerOnline || state.partnerSeenToday));
  // szöveg
  if (text) {
    if (state.partnerOnline) text.textContent = 'épp itt vagytok mindketten';
    else if (state.partnerSeenToday) text.textContent = 'ma mindketten itt';
    else text.textContent = 'csak te vagy itt ma';
  }
}

// ─── v0.8 render: esti meditáció-buborék (19-22h) ─────────────────────

function renderEveningBubble() {
  const bubble = app.querySelector('[data-medit-bubble]');
  if (!bubble) return;
  bubble.hidden = !isEveningMeditationHour();
}

// ─── v0.9: Csillám-buborék rendszer ────────────────────────────────────

// renderelés: csak akkor jelenik meg, ha van aktív bubble és nem expirált
function renderCsillamBubble() {
  const bubble = app.querySelector('[data-csillam-bubble]');
  const content = app.querySelector('[data-csillam-bubble-content]');
  if (!bubble || !content) return;
  const b = state.activeBubble;
  if (!b) {
    bubble.hidden = true;
    return;
  }
  // ellenőrzés: érvényes-e még?
  const now = Date.now();
  if (b.expiresAt && now > b.expiresAt) {
    setState({ activeBubble: null });
    bubble.hidden = true;
    return;
  }
  if (now < b.deliveryAt) {
    bubble.hidden = true;
    return;
  }
  bubble.hidden = false;
  content.classList.remove('is-emoji', 'is-suggest');
  if (b.type === 'hangulat' || b.type === 'gondolok') {
    content.classList.add('is-emoji');
    content.textContent = b.payload?.emoji || (b.type === 'gondolok' ? '❤' : '😊');
    bubble.dataset.bubbleAction = '';
  } else if (b.type === 'hala') {
    content.textContent = `„${b.payload?.text || ''}"`;
    bubble.dataset.bubbleAction = '';
  } else if (b.type === 'suttogas') {
    content.textContent = `„${b.payload?.text || ''}"`;
    bubble.dataset.bubbleAction = '';
  } else if (b.type === 'meditation-suggest') {
    content.classList.add('is-suggest');
    const med = meditations.find(m => m.id === b.payload?.meditationId);
    content.textContent = med ? `ma a ${med.title.toLowerCase()}-et javaslom` : 'elcsendesedünk?';
    bubble.dataset.bubbleAction = 'open-meditation-suggest';
  } else if (b.type === 'jegyzet') {
    content.classList.add('is-suggest');
    const cat = b.payload?.category;
    const prefix = cat === 'szulinap' ? 'eszedbe jutott — '
                 : cat === 'film' ? 'jut eszedbe a film — '
                 : cat === 'ajandek' ? 'eszedbe jutott — '
                 : cat === 'terv' ? 'a közös tervetek — '
                 : cat === 'igeret' ? 'megígértétek — '
                 : cat === 'konyv' ? 'a könyv — '
                 : 'eszedbe jut — ';
    content.textContent = `${prefix}„${b.payload?.text || ''}"`;
    bubble.dataset.bubbleAction = 'open-jegyzet';
    bubble.dataset.vagyId = b.payload?.vagyId || '';
  }
}

function setBubble(message) {
  // beállít egy aktív buborékot, frissíti a UI-t
  setState({ activeBubble: message });
  if (currentScreen === 'home') renderCsillamBubble();
}

// időzített kézbesítések feldolgozása (jövőbeli üzenetek)
let bubbleSchedulerTimeout = null;
function schedulePendingBubbles() {
  if (bubbleSchedulerTimeout) { clearTimeout(bubbleSchedulerTimeout); bubbleSchedulerTimeout = null; }
  const now = Date.now();
  const pending = state.pendingBubbleMessages || [];
  // a soron következő esedékes
  const next = pending.find(m => m.deliveryAt > now);
  if (!next) return;
  const delay = Math.max(0, next.deliveryAt - now);
  bubbleSchedulerTimeout = setTimeout(() => {
    // promotal: aktív lesz, levesszük a pendingről
    setState({
      activeBubble: next,
      pendingBubbleMessages: pending.filter(m => m.id !== next.id),
    });
    if (currentScreen === 'home') renderCsillamBubble();
    schedulePendingBubbles();
  }, delay);
}

// esti meditáció-javaslat (21h)
function maybeShowEveningMeditationSuggestion() {
  const now = new Date();
  const h = now.getHours();
  // 21 és 22 között
  if (h < 21 || h >= 22) return;
  // ha már van aktív buborék a meditációhoz, skip
  if (state.activeBubble?.type === 'meditation-suggest') return;
  // ha a mai napra már elindítottunk meditációt, skip
  const todayMedit = state.feladatLog?.find(e => e.taskId?.toString().startsWith('medit-') && (now.getTime() - e.doneAt) < 86400000);
  if (todayMedit) return;
  // sorsoljunk egy meditációt mára (deterministic, dátum alapján)
  if (!state.meditSuggestId) {
    const seed = todayKey().split('-').reduce((a, b) => a + parseInt(b, 10), 0);
    const med = meditations[seed % meditations.length];
    setState({ meditSuggestId: med.id });
  }
  setBubble({
    id: 'medit-suggest-' + todayKey(),
    type: 'meditation-suggest',
    payload: { meditationId: state.meditSuggestId },
    deliveryAt: Date.now(),
    expiresAt: null,
  });
}

// ─── v0.10: Csillám "eszedbe juttatja" a jegyzeteket a buborékban ─────
// Súlyozás:
//  - 7 napon belüli dátumos: nagyon valószínű (mai = még valószínűbb)
//  - daily: gyakran (nagy súly)
//  - weekly: közepesen
//  - monthly: néha
//  - yearly: ritkán
//  - fiveyear: nagyon ritkán
//  - anywhen: alapértelmezett kicsi súly
//  - 14 napnál régebben felszínre került jegyzet kihagyva (nem ismétel egymás után)
//  - már beteljesült (doneAt): kihagyva

function pickJegyzetForBubble() {
  if (!state.vagyak || state.vagyak.length === 0) return null;
  const now = Date.now();
  const COOLDOWN_MS = 24 * 60 * 60 * 1000; // egy napig nem ismétel
  const candidates = [];
  for (const v of state.vagyak) {
    if (v.doneAt) continue;
    if (v.lastSurfacedAt && (now - v.lastSurfacedAt) < COOLDOWN_MS) continue;
    let weight = 1;
    // dátum-alapú súlyozás (7 napon belüli)
    if (v.target_date) {
      const tgt = new Date(v.target_date);
      const days = Math.ceil((tgt.getTime() - now) / (1000 * 60 * 60 * 24));
      if (days >= 0 && days <= 7) weight = 100 + (8 - days) * 10;        // ma/holnap/holnapután mind kiemelt
      else if (days < 0 && days > -3) weight = 30;                        // tegnapelőtt-tegnap is még
      else if (days <= 30) weight = 5;
    } else {
      // időhorizont-alapú súlyozás
      switch (v.time_tag) {
        case 'daily': weight = 25; break;
        case 'weekly': weight = 15; break;
        case 'monthly': weight = 6; break;
        case 'yearly': weight = 3; break;
        case 'fiveyear': weight = 1; break;
        default: weight = 4;
      }
    }
    candidates.push({ v, weight });
  }
  if (candidates.length === 0) return null;
  // súlyozott sorsolás
  const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * totalWeight;
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) return c.v;
  }
  return candidates[0].v;
}

async function maybeSurfaceJegyzet() {
  // csak akkor, ha nincs aktív "fontos" buborék (hála/hangulat/meditáció)
  if (state.activeBubble) {
    const t = state.activeBubble.type;
    if (t === 'hala' || t === 'hangulat' || t === 'gondolok' || t === 'meditation-suggest') return;
  }
  // a nap során max 1× próbáljon (lokálisan)
  const lastTry = parseInt(localStorage.getItem('we-jegyzet-last-try') || '0', 10);
  const sameDay = lastTry && (new Date(lastTry).toDateString() === new Date().toDateString());
  // ne próbáljon minden home-belépésnél — kb. 30%-os valószínűség nap egyszer
  if (sameDay) return;
  if (Math.random() > 0.5) {
    localStorage.setItem('we-jegyzet-last-try', Date.now().toString());
    return; // nem most
  }
  const v = pickJegyzetForBubble();
  if (!v) {
    localStorage.setItem('we-jegyzet-last-try', Date.now().toString());
    return;
  }
  // beállítjuk a buborékba
  setBubble({
    id: 'jegyzet-' + v.id,
    type: 'jegyzet',
    payload: { vagyId: v.id, text: v.text, category: v.category, target_date: v.target_date },
    deliveryAt: Date.now(),
    expiresAt: Date.now() + 4 * 60 * 60 * 1000,
  });
  localStorage.setItem('we-jegyzet-last-try', Date.now().toString());
  // szerveren is jelöljük a felszínre kerülést (cooldown a partneren is)
  if (syncReady) {
    try { await sync.markVagySurfaced(v.id); } catch(e) {}
  }
}

// ─── v0.9: Mood popover ────────────────────────────────────────────────

function toggleMoodPicker(open) {
  const popover = app.querySelector('[data-mood-popover]');
  if (!popover) return;
  const willOpen = open !== undefined ? open : popover.hidden;
  popover.hidden = !willOpen;
  setState({ moodPickerOpen: willOpen });
}

// ─── v0.9: Ölelés (helyi 20 mp countdown) ─────────────────────────────

let olesInterval = null;
function startOlesTimer() {
  setState({ olesStartedAt: Date.now() });
  // gomb átváltások
  const startBtn = app.querySelector('[data-oles-start]');
  if (startBtn) startBtn.hidden = true;
  if (olesInterval) clearInterval(olesInterval);
  olesInterval = setInterval(() => {
    if (currentScreen !== 'oles-run') { stopOlesTimer(); return; }
    const elapsed = Math.floor((Date.now() - state.olesStartedAt) / 1000);
    const remaining = Math.max(0, 20 - elapsed);
    const timerEl = app.querySelector('[data-oles-timer]');
    if (timerEl) timerEl.textContent = remaining;
    if (remaining === 0) {
      stopOlesTimer();
      const doneBtn = app.querySelector('[data-oles-done]');
      if (doneBtn) doneBtn.hidden = false;
      // bell hang
      try { playBell(); } catch(e) {}
    }
  }, 250);
}
function stopOlesTimer() {
  if (olesInterval) { clearInterval(olesInterval); olesInterval = null; }
}

// ─── Meditáció — bell + futtatás ──────────────────────────────────────

let meditAudioCtx = null;
function playBell() {
  try {
    if (!meditAudioCtx) {
      meditAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = meditAudioCtx;
    const now = ctx.currentTime;
    // két frekvencia rétege (mély bowl-szerű hang)
    const freqs = [528, 264];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 4);
    });
  } catch (e) {
    console.warn('[medit] bell hiba:', e);
  }
}

let meditInterval = null;
function startMeditation(meditId) {
  const med = meditations.find(m => m.id === meditId);
  if (!med) return;
  const totalSec = med.phases.reduce((sum, p) => sum + p.duration_sec, 0);
  const startedAt = Date.now();
  setState({
    activeMedit: {
      id: med.id,
      title: med.title,
      source: med.source,
      intro: med.intro,
      outro: med.outro,
      phases: med.phases,
      totalSec,
      startedAt,
      currentPhaseIdx: 0,
    },
  });
  playBell();
  renderMeditationRunning();
  if (meditInterval) clearInterval(meditInterval);
  meditInterval = setInterval(tickMeditation, 250);
}

function tickMeditation() {
  if (!state.activeMedit) { stopMeditationTick(); return; }
  const m = state.activeMedit;
  const elapsed = (Date.now() - m.startedAt) / 1000;
  // melyik fázisban vagyunk?
  let cum = 0;
  let phaseIdx = m.phases.length;
  for (let i = 0; i < m.phases.length; i++) {
    if (elapsed < cum + m.phases[i].duration_sec) {
      phaseIdx = i;
      break;
    }
    cum += m.phases[i].duration_sec;
  }
  if (phaseIdx >= m.phases.length) {
    // vége
    playBell();
    stopMeditationTick();
    setState({ activeMedit: { ...m, currentPhaseIdx: -1 } });
    renderMeditationFinished();
    return;
  }
  if (phaseIdx !== m.currentPhaseIdx) {
    setState({ activeMedit: { ...m, currentPhaseIdx: phaseIdx } });
    if (phaseIdx > 0) playBell();  // fázis-átmenet bell (nem az elején)
    renderMeditationRunning();
  }
  // óra frissítése
  const remaining = Math.max(0, Math.ceil(m.totalSec - elapsed));
  const timeEl = app.querySelector('[data-medit-time]');
  if (timeEl) {
    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    timeEl.textContent = `${min}:${String(sec).padStart(2, '0')}`;
  }
}

function stopMeditationTick() {
  if (meditInterval) { clearInterval(meditInterval); meditInterval = null; }
}

function renderMeditationIntro() {
  const m = state.activeMedit;
  if (!m) return;
  const titleEl = app.querySelector('[data-medit-title]');
  const sourceEl = app.querySelector('[data-medit-source]');
  const introEl = app.querySelector('[data-medit-intro]');
  const runningEl = app.querySelector('[data-medit-running]');
  const finishedEl = app.querySelector('[data-medit-finished]');
  const startBtn = app.querySelector('[data-medit-start-btn]');
  if (titleEl) titleEl.textContent = m.title;
  if (sourceEl) sourceEl.textContent = `${m.source} · ${m.totalSec / 60} perc`;
  if (introEl) { introEl.textContent = m.intro; introEl.hidden = false; }
  if (runningEl) runningEl.hidden = true;
  if (finishedEl) finishedEl.hidden = true;
  if (startBtn) startBtn.hidden = false;
}

function renderMeditationRunning() {
  const m = state.activeMedit;
  if (!m) return;
  const introEl = app.querySelector('[data-medit-intro]');
  const runningEl = app.querySelector('[data-medit-running]');
  const finishedEl = app.querySelector('[data-medit-finished]');
  const startBtn = app.querySelector('[data-medit-start-btn]');
  const phaseEl = app.querySelector('[data-medit-phase]');
  if (introEl) introEl.hidden = true;
  if (runningEl) runningEl.hidden = false;
  if (finishedEl) finishedEl.hidden = true;
  if (startBtn) startBtn.hidden = true;
  if (phaseEl && m.phases[m.currentPhaseIdx]) {
    phaseEl.textContent = m.phases[m.currentPhaseIdx].text;
  }
}

function renderMeditationFinished() {
  const m = state.activeMedit;
  if (!m) return;
  const introEl = app.querySelector('[data-medit-intro]');
  const runningEl = app.querySelector('[data-medit-running]');
  const finishedEl = app.querySelector('[data-medit-finished]');
  const startBtn = app.querySelector('[data-medit-start-btn]');
  const outroEl = app.querySelector('[data-medit-outro]');
  if (introEl) introEl.hidden = true;
  if (runningEl) runningEl.hidden = true;
  if (finishedEl) finishedEl.hidden = false;
  if (startBtn) startBtn.hidden = true;
  if (outroEl) outroEl.textContent = m.outro || '';
}

function renderMmStatus() {
  const t = state.mmToday;
  if (!t) return;
  const qEl = app.querySelector('[data-mm-question]');
  if (qEl) qEl.textContent = t.question;

  const partnerDot = app.querySelector('[data-mm-partner-dot]');
  const partnerStatus = app.querySelector('[data-mm-partner-status]');
  const revealBtn = app.querySelector('[data-mm-reveal-btn]');

  if (t.partnerResponse) {
    partnerDot?.classList.add('is-done');
    if (partnerStatus) partnerStatus.textContent = `${state.partnerName || 'a párod'}: válaszolt ✓`;
    if (revealBtn) revealBtn.disabled = false;
  } else {
    partnerDot?.classList.remove('is-done');
    if (partnerStatus) partnerStatus.textContent = `várunk a párodra…`;
    if (revealBtn) revealBtn.disabled = true;
  }
}

function renderMmReveal() {
  const t = state.mmToday;
  if (!t) return;
  const qEl = app.querySelector('[data-mm-question]');
  if (qEl) qEl.textContent = t.question;

  const setText = (sel, val) => {
    const el = app.querySelector(sel);
    if (el) el.textContent = val ? `„${val}"` : '—';
  };
  setText('[data-mm-partner-guess]', t.partnerResponse?.guess);
  setText('[data-mm-self-actual]', t.myResponse?.actual);
  setText('[data-mm-self-guess]', t.myResponse?.guess);
  setText('[data-mm-partner-actual]', t.partnerResponse?.actual);

  // státusz-banner: ha hiányzik a partner válasza, mutassuk meg
  const statusEl = app.querySelector('[data-mm-reveal-status]');
  const statusTextEl = app.querySelector('[data-mm-reveal-status-text]');
  if (statusEl && statusTextEl) {
    if (!t.partnerResponse) {
      statusEl.hidden = false;
      statusTextEl.textContent = `${state.partnerName || 'a párod'} válasza még nem érkezett meg — frissítsd vagy próbáld később`;
    } else if (!t.myResponse) {
      statusEl.hidden = false;
      statusTextEl.textContent = 'a saját válaszod nem érkezett meg — frissítsd';
    } else {
      statusEl.hidden = true;
    }
  }

  const noteSection = app.querySelector('[data-mm-note-section]');
  const noteSaved = app.querySelector('[data-mm-note-saved]');
  if (t.note && noteSection && noteSaved) {
    noteSection.hidden = true;
    noteSaved.hidden = false;
    const noteText = app.querySelector('[data-mm-saved-note-text]');
    if (noteText) noteText.textContent = `„${t.note}"`;
  }
}

function renderJournalTab(tabId) {
  const container = app.querySelector('[data-tab-content]');
  if (!container) return;
  if (tabId === 'feladatok') {
    container.innerHTML = renderFeladatokTab();
  } else if (tabId === 'suttogasok') {
    container.innerHTML = renderSuttogasokTab();
  } else if (tabId === 'vagyak') {
    container.innerHTML = renderVagyakTab();
  } else if (tabId === 'kerdesek') {
    container.innerHTML = renderKerdesekTab();
  }
}

function renderVagyakTab() {
  if (!state.vagyak || state.vagyak.length === 0) {
    return `
      <div class="empty-state">Még nincs jegyzet.<br>Az alábbi gombbal indítsátok el.</div>
      <button class="add-wish-btn" data-action="open-wish-add">+ új jegyzet</button>
    `;
  }
  const sorted = [...state.vagyak].sort((a, b) => {
    if (!a.doneAt && b.doneAt) return -1;
    if (a.doneAt && !b.doneAt) return 1;
    return b.createdAt - a.createdAt;
  });
  return `
    <div class="wish-list">
      ${sorted.map(w => `
        <div class="wish-item ${w.doneAt ? 'is-done' : ''}" data-wish-id="${w.id}" data-action="toggle-wish-done">
          <div class="wish-mark"><span class="wish-check">✓</span></div>
          <div class="wish-content">
            <div class="wish-title">${escapeHtml(w.text)}</div>
            <div class="wish-meta">${w.doneAt ? `beteljesült · ${formatDate(w.doneAt)}` : formatDate(w.createdAt)}</div>
            <div class="wish-meta">
              ${renderWishTags(w)}
            </div>
            ${w.note ? `<div class="wish-note">„${escapeHtml(w.note)}"</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
    <button class="add-wish-btn" data-action="open-wish-add">+ új jegyzet</button>
  `;
}

const CAT_LABELS = {
  szulinap: '🎂 szülinap', ajandek: '🎁 ajándékötlet', film: '🎬 film',
  konyv: '📖 könyv', terv: '🌍 közös terv', igeret: '🤝 ígéret', egyeb: '💭 egyéb',
};
const TIME_LABELS = {
  anywhen: '✨ bármikor', daily: '🌅 egy nap', weekly: '📅 egy hét',
  monthly: '🗓 hónap', yearly: '📆 idén', fiveyear: '🏔 5 éves álom',
};
function renderWishTags(w) {
  const tags = [];
  if (w.category && w.category !== 'egyeb') tags.push(`<span class="wish-meta-tag">${CAT_LABELS[w.category] || w.category}</span>`);
  if (w.target_date) {
    const d = new Date(w.target_date);
    const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    let dateLabel = w.target_date;
    if (days === 0) dateLabel = '📅 ma';
    else if (days === 1) dateLabel = '📅 holnap';
    else if (days > 0 && days <= 30) dateLabel = `📅 ${days} nap múlva`;
    else if (days < 0) dateLabel = `📅 ${w.target_date}`;
    else dateLabel = `📅 ${w.target_date}`;
    tags.push(`<span class="wish-meta-tag is-date">${dateLabel}</span>`);
  }
  if (w.time_tag && w.time_tag !== 'anywhen') tags.push(`<span class="wish-meta-tag">${TIME_LABELS[w.time_tag] || w.time_tag}</span>`);
  return tags.join('');
}

function renderSuttogasokTab() {
  if (!state.whisperArchive || state.whisperArchive.length === 0) {
    return '<div class="empty-state">Még nincs küldött suttogás. Az első a Mindennapok tetején.</div>';
  }
  const now = Date.now();
  const today = [], yesterday = [], thisWeek = [], earlier = [];
  for (const entry of state.whisperArchive) {
    const days = (now - entry.sentAt) / (1000 * 60 * 60 * 24);
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
        <div class="whisper-archive-row">
          <div class="whisper-archive-text">„${escapeHtml(entry.text)}"</div>
          <div class="whisper-archive-meta">
            <span class="${entry.by === 'self' ? 'log-from-self' : 'log-from-partner'}">${entry.by === 'self' ? 'Te' : 'ő'}</span>
            · ${formatTime(entry.sentAt)}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    const months = ['jan', 'febr', 'márc', 'ápr', 'máj', 'jún', 'júl', 'aug', 'szept', 'okt', 'nov', 'dec'];
    return `${months[d.getMonth()]} ${d.getDate()}.`;
  }
  return d.toLocaleDateString('hu-HU');
}

function renderKerdesekTab() {
  const allEntries = [
    ...state.kerdesArchive.map(e => ({
      kind: 'kerdes',
      question: e.question,
      level: e.level,
      note: e.note,
      by: e.by,
      timestamp: e.discussedAt,
    })),
    ...state.mmArchive.map(e => ({
      kind: 'mm',
      sessionId: e.sessionId,
      question: e.question,
      myGuess: e.myGuess,
      myActual: e.myActual,
      partnerGuess: e.partnerGuess,
      partnerActual: e.partnerActual,
      note: e.note,
      timestamp: e.revealedAt,
    })),
  ];

  if (allEntries.length === 0) {
    return '<div class="empty-state">Még nincs megbeszélt kérdés. Az első „Megbeszéltük" után itt jelenik meg.</div>';
  }

  // sorrend: legfrissebb felül
  allEntries.sort((a, b) => b.timestamp - a.timestamp);

  const now = Date.now();
  const today = [], yesterday = [], thisWeek = [], earlier = [];
  for (const entry of allEntries) {
    const days = (now - entry.timestamp) / (1000 * 60 * 60 * 24);
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
      ${arr.map(entry => entry.kind === 'mm' ? renderMmArchiveRow(entry) : renderKerdesRow(entry)).join('')}
    </div>
  `).join('');
}

function renderKerdesRow(entry) {
  return `
    <div class="log-row is-done">
      <div class="log-content">
        <div class="log-text">${escapeHtml(entry.question)}</div>
        <div class="log-meta">
          <span class="${entry.by === 'self' ? 'log-from-self' : 'log-from-partner'}">${entry.by === 'self' ? 'Te' : 'ő'}</span>
          · ${LEVEL_LABELS[entry.level] || ''}
          · ${formatTime(entry.timestamp)}
        </div>
        ${entry.note ? `<div class="log-note">„${escapeHtml(entry.note)}"</div>` : ''}
      </div>
    </div>
  `;
}

function renderMmArchiveRow(entry) {
  return `
    <div class="log-row is-done mm-archive-row">
      <div class="log-content">
        <div class="log-text">${escapeHtml(entry.question)}</div>
        <div class="log-meta">
          <span class="mm-badge">Mit mondana</span>
          · ${formatTime(entry.timestamp)}
        </div>
        <div class="mm-archive-mini">
          <div class="mm-archive-pair">
            <span class="mm-archive-label">ő rólad:</span>
            <span class="mm-archive-text">„${escapeHtml(entry.partnerGuess || '—')}"</span>
          </div>
          <div class="mm-archive-pair">
            <span class="mm-archive-label">te:</span>
            <span class="mm-archive-text mm-archive-actual">„${escapeHtml(entry.myActual || '—')}"</span>
          </div>
          <div class="mm-archive-pair">
            <span class="mm-archive-label">te róla:</span>
            <span class="mm-archive-text">„${escapeHtml(entry.myGuess || '—')}"</span>
          </div>
          <div class="mm-archive-pair">
            <span class="mm-archive-label">ő:</span>
            <span class="mm-archive-text mm-archive-actual">„${escapeHtml(entry.partnerActual || '—')}"</span>
          </div>
        </div>
        ${entry.note ? `<div class="log-note">„${escapeHtml(entry.note)}"</div>` : ''}
      </div>
    </div>
  `;
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

    case 'open-hala-write': {
      navigate('hala-write');
      break;
    }
    case 'open-oles-run': {
      navigate('oles-run');
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

    case 'discuss-question': {
      // megnyomták a "Megbeszéltük"-et, megnyitjuk a jegyzet-modalt
      const q = pickTodayQuestion();
      setState({ pendingArchiveQuestion: q });
      navigate('question-note');
      break;
    }

    case 'archive-question-skip':
    case 'archive-question-save': {
      const q = state.pendingArchiveQuestion;
      if (!q) { back(); break; }
      const noteEl = app.querySelector('[data-note-input]');
      const note = (action === 'archive-question-save' && noteEl)
        ? noteEl.value.trim() || null
        : null;
      const now = Date.now();
      const today = todayKey();
      // helyi mentés
      setState({
        todayQuestionDoneAt: now,
        todayQuestionDay: today,
        todayQuestionText: q.text,
        kerdesArchive: [
          ...state.kerdesArchive,
          {
            id: 'local-' + now,
            question: q.text,
            questionId: q.id,
            level: q.level,
            note,
            by: 'self',
            discussedAt: now,
          },
        ],
        pendingArchiveQuestion: null,
      });
      // szerver-mentés
      if (syncReady && state.pairId) {
        await sync.archiveQuestion(state.pairId, state.myMemberId, q.text, q.level, q.id, note);
      }
      toast('elmentve ❤');
      navigate('home');
      break;
    }

    case 'open-wish-add': {
      navigate('wish-add');
      break;
    }

    case 'open-jegyzet-from-question': {
      // A jegyzet most a kérdés mellől nyílik. A szöveget üresen hagyjuk —
      // de meg lehetne előtölteni a kérdéssel; jelenleg üres marad, hadd írja ki.
      navigate('wish-add');
      break;
    }

    case 'open-jegyzet-from-mm': {
      navigate('wish-add');
      break;
    }

    case 'save-wish': {
      const textEl = app.querySelector('[data-wish-text-input]');
      const text = textEl?.value.trim();
      if (!text) {
        toast('írj egy jegyzetet');
        textEl?.focus();
        return;
      }
      const catEl = app.querySelector('[data-wish-cat] .wish-cat-pill.is-active');
      const timeEl = app.querySelector('[data-wish-time] .wish-cat-pill.is-active');
      const dateEl = app.querySelector('[data-wish-date]');
      const category = catEl?.dataset.cat || 'egyeb';
      const time_tag = timeEl?.dataset.time || 'anywhen';
      const target_date = dateEl?.value || null;

      const localId = 'local-' + Date.now();
      const now = Date.now();
      setState({
        vagyak: [{
          id: localId, text, note: null, doneAt: null,
          category, time_tag, target_date,
          createdBy: state.myMemberId, createdAt: now,
        }, ...state.vagyak],
      });
      if (syncReady && state.pairId) {
        const inserted = await sync.addWish(state.pairId, state.myMemberId, text, {
          category, time_tag, target_date,
        });
        if (inserted) {
          setState({
            vagyak: state.vagyak.map(v => v.id === localId ? { ...v, id: inserted.id } : v),
          });
        }
      }
      toast('elmentve ❤');
      navigate('journal');
      break;
    }

    case 'toggle-wish-done': {
      const wishEl = e.target.closest('[data-wish-id]');
      if (!wishEl) break;
      const wishId = wishEl.dataset.wishId;
      const wish = state.vagyak.find(v => v.id === wishId);
      if (!wish) break;
      const newDoneAt = wish.doneAt ? null : Date.now();
      // optimista helyi
      setState({
        vagyak: state.vagyak.map(v => v.id === wishId ? { ...v, doneAt: newDoneAt } : v),
      });
      renderJournalTab('vagyak');
      if (syncReady && wishId.indexOf('local-') !== 0) {
        await sync.toggleWishDone(wishId, newDoneAt ? new Date(newDoneAt).toISOString() : null);
      }
      if (newDoneAt) toast('beteljesült ❤');
      break;
    }

    case 'open-settings': {
      navigate('settings');
      break;
    }

    case 'save-pici-name': {
      const input = app.querySelector('[data-rename-input]');
      const name = input?.value.trim();
      if (!name) {
        toast('adj nevet');
        input?.focus();
        return;
      }
      if (name === state.piciName) {
        toast('ugyanaz a név');
        return;
      }
      setState({ piciName: name });
      if (syncReady && state.pairId) {
        await sync.setPiciName(state.pairId, name);
      }
      toast('átnevezve ❤');
      break;
    }

    case 'save-partner-name': {
      const input = app.querySelector('[data-partner-name-input]');
      const name = input?.value.trim();
      if (!name) {
        toast('adj nevet');
        input?.focus();
        return;
      }
      setState({ partnerName: name });
      toast(`${name} ❤`);
      break;
    }

    case 'reset-all': {
      if (!confirm('Biztos? Ezzel törlöd a helyi állapotot és újra kell párosítanotok. (A Supabase adatok érintetlenek maradnak.)')) {
        return;
      }
      resetAll();
      break;
    }

    case 'upload-pool': {
      const type = actionEl.dataset.poolType;
      const fileInput = app.querySelector(`[data-pool-upload="${type}"]`);
      fileInput?.click();
      break;
    }

    case 'reset-pool': {
      const type = actionEl.dataset.poolType;
      await resetPool(type);
      break;
    }

    case 'copy-pool-prompt': {
      const type = actionEl.dataset.poolType;
      await copyPoolPrompt(type);
      break;
    }


    // ═══════════════════════════════════════════════════════════════
    // v0.9 — Csillám-buborék rendszer
    // ═══════════════════════════════════════════════════════════════

    // ❤ — instant "rád gondolok" buborék mindkét félnek
    case 'send-gondolok': {
      const heartBtn = app.querySelector('.csillam-action[data-action="send-gondolok"]');
      if (heartBtn) {
        heartBtn.classList.add('is-pulsing');
        setTimeout(() => heartBtn.classList.remove('is-pulsing'), 600);
      }
      // helyileg azonnal megjelenik a buborékban
      const localMsg = {
        id: 'local-gondolok-' + Date.now(),
        type: 'gondolok',
        payload: { emoji: '❤' },
        deliveryAt: Date.now(),
        expiresAt: Date.now() + 3 * 60 * 60 * 1000, // 3h
      };
      setBubble(localMsg);
      // szerveren is — mindkét fél buborékjába kerül
      if (syncReady && state.pairId) {
        await sync.createCsillamMessage(
          state.pairId, state.myMemberId, 'gondolok',
          { emoji: '❤' },
          new Date(),
          new Date(Date.now() + 3 * 60 * 60 * 1000)
        );
      }
      toast('elküldve ❤');
      break;
    }

    // 😊 → mood popover megnyitás/zárás
    case 'open-mood-picker': {
      toggleMoodPicker();
      break;
    }

    // mood emoji választás → instant buborék
    case 'pick-mood': {
      const emoji = actionEl.dataset.emoji;
      if (!emoji) return;
      toggleMoodPicker(false);
      const localMsg = {
        id: 'local-hangulat-' + Date.now(),
        type: 'hangulat',
        payload: { emoji },
        deliveryAt: Date.now(),
        expiresAt: Date.now() + 12 * 60 * 60 * 1000, // 12h (este→reggel)
      };
      setBubble(localMsg);
      if (syncReady && state.pairId) {
        await sync.createCsillamMessage(
          state.pairId, state.myMemberId, 'hangulat',
          { emoji },
          new Date(),
          new Date(Date.now() + 12 * 60 * 60 * 1000)
        );
      }
      toast(`hangulat ${emoji}`);
      break;
    }

    // ─── Hála-üzenet (a feladat-kártyán keresztül, késleltetett kézbesítés) ──
    case 'send-hala': {
      const input = app.querySelector('[data-hala-input]');
      const text = input?.value.trim();
      if (!text) {
        toast('írj egy köszönetet');
        input?.focus();
        return;
      }
      // random kézbesítési idő: 8-22h közötti, minimum 1 óra múlva, max 12 óra múlva
      const now = new Date();
      let deliveryAt = new Date(now);
      // legalább 1 óra múlva, legfeljebb 12 óra múlva
      const minOffsetMs = 1 * 60 * 60 * 1000;
      const maxOffsetMs = 12 * 60 * 60 * 1000;
      const randomOffsetMs = minOffsetMs + Math.random() * (maxOffsetMs - minOffsetMs);
      deliveryAt = new Date(now.getTime() + randomOffsetMs);
      // ha az eredmény nincs 8-22h ablakban, csúsztassuk be
      const dh = deliveryAt.getHours();
      if (dh < 8) {
        // másnap reggel 8-ig + random a 14h ablakban
        deliveryAt.setHours(8 + Math.floor(Math.random() * 14));
        deliveryAt.setMinutes(Math.floor(Math.random() * 60));
      } else if (dh >= 22) {
        // következő nap 8-22 ablak random
        deliveryAt.setDate(deliveryAt.getDate() + 1);
        deliveryAt.setHours(8 + Math.floor(Math.random() * 14));
        deliveryAt.setMinutes(Math.floor(Math.random() * 60));
      }
      const expiresAt = new Date(deliveryAt.getTime() + 24 * 60 * 60 * 1000);
      if (syncReady && state.pairId) {
        await sync.createCsillamMessage(
          state.pairId, state.myMemberId, 'hala',
          { text },
          deliveryAt,
          expiresAt
        );
      }
      // a feladatot teljesítettnek jelöljük helyileg + a feladat_log-ban
      const t = state.todayTask;
      if (t) {
        const log = [
          { taskId: t.id, text: t.text, doneAt: Date.now(), by: 'self', note: text },
          ...state.feladatLog.filter(e => !(e.taskId === t.id && e.doneAt > Date.now() - 60000)),
        ];
        setState({ todayTaskDoneAt: Date.now(), feladatLog: log });
        if (syncReady && state.pairId) {
          await sync.logTaskDone(state.pairId, state.myMemberId, t, text);
        }
      }
      toast('Csillámra bíztad ❤');
      navigate('home');
      break;
    }

    // ─── 20 mp ölelés (helyi countdown) ─────────────────────────────
    case 'oles-start': {
      startOlesTimer();
      break;
    }
    case 'oles-done': {
      stopOlesTimer();
      const t = state.todayTask;
      if (t) {
        const log = [
          { taskId: t.id, text: t.text, doneAt: Date.now(), by: 'self' },
          ...state.feladatLog,
        ];
        setState({ todayTaskDoneAt: Date.now(), feladatLog: log, olesStartedAt: null });
        if (syncReady && state.pairId) {
          await sync.logTaskDone(state.pairId, state.myMemberId, t);
        }
      }
      toast('szép ❤');
      navigate('home');
      break;
    }

    // ─── Meditáció-javaslat (esti buborékból) ───────────────────────
    case 'open-meditation-suggest': {
      navigate('meditation-suggest');
      break;
    }
    case 'meditation-suggest-other': {
      // új sorsolás
      const cur = state.meditSuggestId;
      const others = meditations.filter(m => m.id !== cur);
      const newMed = others[Math.floor(Math.random() * others.length)];
      setState({ meditSuggestId: newMed.id });
      // re-render
      const titleEl = app.querySelector('[data-medit-suggest-title]');
      const sourceEl = app.querySelector('[data-medit-suggest-source]');
      const introEl = app.querySelector('[data-medit-suggest-intro]');
      if (titleEl) titleEl.textContent = newMed.title;
      if (sourceEl) sourceEl.textContent = `// közös · ${newMed.duration} perc · ${newMed.source}`;
      if (introEl) introEl.textContent = newMed.intro;
      // buborékban is frissítsük
      if (state.activeBubble?.type === 'meditation-suggest') {
        setBubble({
          ...state.activeBubble,
          payload: { meditationId: newMed.id },
        });
      }
      break;
    }

    // klikk a buborékra (delegálás)
    case 'bubble-tap': {
      const bubble = app.querySelector('[data-csillam-bubble]');
      const action = bubble?.dataset.bubbleAction;
      if (action === 'open-meditation-suggest') {
        navigate('meditation-suggest');
      } else if (action === 'open-jegyzet') {
        // Vágyak fülre navigálás
        currentTab = 'vagyak';
        navigate('journal');
      }
      break;
    }


    // ─── Meditáció ──────────────────────────────────────────────────
    case 'open-meditation-picker': {
      navigate('meditation-picker');
      break;
    }
    case 'open-meditation': {
      const id = actionEl.dataset.meditId;
      if (!id) return;
      const med = meditations.find(m => m.id === id);
      if (!med) return;
      const totalSec = med.phases.reduce((sum, p) => sum + p.duration_sec, 0);
      setState({
        activeMedit: {
          id: med.id,
          title: med.title,
          source: med.source,
          intro: med.intro,
          outro: med.outro,
          phases: med.phases,
          totalSec,
          startedAt: null,
          currentPhaseIdx: -1,
        },
      });
      navigate('meditation-run');
      break;
    }
    case 'start-meditation': {
      // a "Kipróbáltuk" gomb a meditation-suggest screen-en
      const id = state.meditSuggestId || (state.activeMedit?.id);
      if (!id) return;
      const med = meditations.find(m => m.id === id);
      if (!med) return;
      const totalSec = med.phases.reduce((sum, p) => sum + p.duration_sec, 0);
      setState({
        activeMedit: {
          id: med.id, title: med.title, source: med.source,
          intro: med.intro, outro: med.outro,
          phases: med.phases, totalSec,
          startedAt: null, currentPhaseIdx: -1,
        },
      });
      // a buborékot levesszük, mert most fut
      if (state.activeBubble?.type === 'meditation-suggest') {
        setState({ activeBubble: null });
        if (syncReady && state.pairId && state.activeBubble?.id?.startsWith('local-') === false) {
          // szerveren is expirálni — overwrite következő hangulattal majd
        }
      }
      navigate('meditation-run');
      break;
    }
    case 'finish-meditation':
    case 'exit-meditation': {
      stopMeditationTick();
      setState({ activeMedit: null });
      navigate('home');
      break;
    }

    case 'open-mitmondana': {
      const status = mmStatus();
      // ha még nincs session: létrehozzuk + input
      if (status === 'none') {
        if (syncReady && state.pairId) {
          const q = pickTodayMitMondana();
          const created = await sync.createMitMondanaSession(state.pairId, state.myMemberId, q);
          if (!created) {
            toast('hiba történt — próbáld újra');
            return;
          }
          setState({ mmToday: hydrateMmSession(created, []) });
        } else {
          // lokális mode — csak helyileg létrehozzuk
          const q = pickTodayMitMondana();
          setState({
            mmToday: {
              sessionId: 'local-' + Date.now(),
              questionId: q.id,
              question: q.text,
              date: todayKey(),
              myResponse: null,
              partnerResponse: null,
              revealedAt: null,
              note: null,
            },
          });
        }
        navigate('mm-input');
      } else if (status === 'i-submitted') {
        navigate('mm-status');
      } else if (status === 'partner-submitted') {
        navigate('mm-input');
      } else if (status === 'both') {
        navigate('mm-status');
      } else if (status === 'revealed') {
        navigate('mm-reveal');
      }
      break;
    }

    case 'submit-mm': {
      const guessEl = app.querySelector('[data-mm-guess]');
      const actualEl = app.querySelector('[data-mm-actual]');
      const guess = guessEl?.value.trim();
      const actual = actualEl?.value.trim();
      if (!guess || !actual) {
        toast('mindkét mezőt töltsd ki');
        if (!guess) guessEl?.focus(); else actualEl?.focus();
        return;
      }
      if (!state.mmToday) return;
      // helyi optimista
      setState({
        mmToday: {
          ...state.mmToday,
          myResponse: { guess, actual, completedAt: Date.now() },
        },
      });
      if (syncReady && !state.mmToday.sessionId.startsWith('local-')) {
        await sync.submitMitMondanaResponse(state.mmToday.sessionId, state.myMemberId, guess, actual);
        // server-ről frissítsük — ha közben a partner is bekuldte, megjelenik
        await refreshMmFromServer();
      }
      toast('beküldted ✓');
      // ha mindkettő válaszolt: auto-reveal; egyébként status
      if (state.mmToday?.myResponse && state.mmToday?.partnerResponse) {
        await maybeAutoReveal();
      } else {
        navigate('mm-status');
      }
      break;
    }

    case 'reveal-mm': {
      if (!state.mmToday) break;
      // ha már felfedve, csak ugorjunk
      if (state.mmToday.revealedAt) {
        navigate('mm-reveal');
        break;
      }
      // helyi optimista
      const now = Date.now();
      setState({
        mmToday: { ...state.mmToday, revealedAt: now },
      });
      if (syncReady && !state.mmToday.sessionId.startsWith('local-')) {
        await sync.revealMitMondana(state.mmToday.sessionId, null);
      }
      navigate('mm-reveal');
      break;
    }

    case 'refresh-mm': {
      if (syncReady && state.pairId) {
        toast('frissítés...');
        await refreshMmFromServer();
        renderMmReveal();
        const t = state.mmToday;
        if (t?.myResponse && t?.partnerResponse) {
          toast('megvan ❤');
        } else if (!t?.partnerResponse) {
          toast(`${state.partnerName || 'a párod'} válasza még hiányzik`);
        }
      }
      break;
    }

    case 'save-mm-note': {
      if (!state.mmToday) break;
      const noteEl = app.querySelector('[data-mm-note]');
      const note = noteEl?.value.trim() || null;
      // helyi mentés
      setState({
        mmToday: { ...state.mmToday, note },
      });
      // archív frissítése
      const existing = state.mmArchive.find(e => e.sessionId === state.mmToday.sessionId);
      if (existing) {
        setState({
          mmArchive: state.mmArchive.map(e => e.sessionId === state.mmToday.sessionId ? { ...e, note } : e),
        });
      } else {
        setState({
          mmArchive: [{
            sessionId: state.mmToday.sessionId,
            questionId: state.mmToday.questionId,
            question: state.mmToday.question,
            date: state.mmToday.date,
            revealedAt: state.mmToday.revealedAt,
            note,
            myGuess: state.mmToday.myResponse?.guess || '',
            myActual: state.mmToday.myResponse?.actual || '',
            partnerGuess: state.mmToday.partnerResponse?.guess || '',
            partnerActual: state.mmToday.partnerResponse?.actual || '',
          }, ...state.mmArchive],
        });
      }
      if (syncReady && !state.mmToday.sessionId.startsWith('local-')) {
        await sync.revealMitMondana(state.mmToday.sessionId, note);
      }
      toast('elmentve ❤');
      navigate('home');
      break;
    }
  }
});

// ─── Szint-pirula tap (külön handler, mert dinamikusan változnak) ─────

document.addEventListener('click', async e => {
  const pill = e.target.closest('[data-level]');
  if (!pill) return;
  const newLevel = pill.dataset.level;
  if (newLevel === state.preferredLevel) return;
  setState({ preferredLevel: newLevel });
  if (syncReady && state.pairId) {
    await sync.setPreferredLevel(state.pairId, newLevel);
  }
  if (currentScreen === 'home') renderQuestionCard();
});

// ─── Téma-pirula tap (settings) ────────────────────────────────────────

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-theme-pick]');
  if (!btn) return;
  const newTheme = btn.dataset.themePick;
  if (newTheme === state.themePref) return;
  setState({ themePref: newTheme });
  applyTheme(newTheme);
  // pirulák frissítése
  app.querySelectorAll('[data-theme-pick]').forEach(b => {
    b.classList.toggle('is-active', b.dataset.themePick === newTheme);
  });
  toast(`téma: ${newTheme === 'auto' ? 'automatikus' : newTheme === 'light' ? 'világos' : 'sötét'}`);
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
