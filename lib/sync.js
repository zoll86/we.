// ═══════════════════════════════════════════════════════════════════════
// we. — sync layer (Supabase)
//
// Minden Supabase-műveletet itt csinálunk. Ha a config nincs kitöltve,
// minden függvény "no-op" — azaz az app lokálisan fut.
// ═══════════════════════════════════════════════════════════════════════

import { config } from '../config.js';

let supabase = null;
let pairChannel = null;

// ─── Konfiguráció-ellenőrzés ──────────────────────────────────────────

export function isConfigured() {
  return config.SUPABASE_URL &&
         config.SUPABASE_ANON_KEY &&
         !config.SUPABASE_URL.includes('YOUR_') &&
         !config.SUPABASE_ANON_KEY.includes('YOUR_');
}

// ─── Csatlakozás ──────────────────────────────────────────────────────

export async function connect() {
  if (!isConfigured()) return false;
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
    supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 5 } },
    });
    return true;
  } catch (err) {
    console.error('[sync] csatlakozás sikertelen:', err);
    return false;
  }
}

export function isConnected() {
  return supabase !== null;
}

// ─── Pár létrehozása / csatlakozás ────────────────────────────────────

export async function createPair(memberId, code) {
  if (!supabase) throw new Error('not connected');
  const { data, error } = await supabase
    .from('pairs')
    .insert({ pair_code: code, member_a: memberId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function joinPair(code, memberId) {
  if (!supabase) throw new Error('not connected');
  // Megkeressük a pair_code alapján
  const { data: pair, error } = await supabase
    .from('pairs')
    .select('*')
    .eq('pair_code', code)
    .maybeSingle();
  if (error) throw error;
  if (!pair) return null;
  if (pair.member_b && pair.member_b !== memberId) {
    // Már párosítva van valaki mással
    return { error: 'already_paired' };
  }
  // Beírjuk magunkat member_b-be
  const { error: updateErr } = await supabase
    .from('pairs')
    .update({ member_b: memberId })
    .eq('id', pair.id);
  if (updateErr) throw updateErr;
  return {
    pair: { ...pair, member_b: memberId },
    partnerMemberId: pair.member_a,
  };
}

export async function loadPair(pairId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pairs')
    .select('*')
    .eq('id', pairId)
    .maybeSingle();
  if (error) {
    console.error('[sync] loadPair hiba:', error);
    return null;
  }
  return data;
}

export async function setPiciName(pairId, name) {
  if (!supabase) return;
  const { error } = await supabase
    .from('pairs')
    .update({ pici_name: name })
    .eq('id', pairId);
  if (error) console.error('[sync] setPiciName hiba:', error);
}

export async function setCustomPools(pairId, pools) {
  if (!supabase) return;
  const { error } = await supabase
    .from('pairs')
    .update({ custom_pools: pools })
    .eq('id', pairId);
  if (error) console.error('[sync] setCustomPools hiba:', error);
}

// ─── Suttogások ───────────────────────────────────────────────────────

export async function sendWhisper(pairId, memberId, text) {
  if (!supabase) return;
  // v0.4 óta NEM töröljük a régieket — archívumba kerülnek
  const { error } = await supabase
    .from('whispers')
    .insert({ pair_id: pairId, text, from_member: memberId });
  if (error) console.error('[sync] sendWhisper hiba:', error);
}

export async function loadCurrentWhisper(pairId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('whispers')
    .select('*')
    .eq('pair_id', pairId)
    .order('sent_at', { ascending: false })
    .limit(1);
  if (error) {
    console.error('[sync] loadCurrentWhisper hiba:', error);
    return null;
  }
  return data && data[0] || null;
}

export async function loadAllWhispers(pairId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('whispers')
    .select('*')
    .eq('pair_id', pairId)
    .order('sent_at', { ascending: false })
    .limit(500);
  if (error) {
    console.error('[sync] loadAllWhispers hiba:', error);
    return [];
  }
  return data || [];
}

// ─── Feladatok ────────────────────────────────────────────────────────

export async function logTaskDone(pairId, memberId, task, note = null) {
  if (!supabase) return;
  const { error } = await supabase
    .from('feladat_log')
    .insert({
      pair_id: pairId,
      task_id: task.id,
      task_text: task.text,
      done_by: memberId,
      note,
    });
  if (error) console.error('[sync] logTaskDone hiba:', error);
}

export async function loadFeladatLog(pairId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('feladat_log')
    .select('*')
    .eq('pair_id', pairId)
    .order('done_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('[sync] loadFeladatLog hiba:', error);
    return [];
  }
  return data || [];
}

// ─── Mai kérdés ───────────────────────────────────────────────────────

export async function setPreferredLevel(pairId, level) {
  if (!supabase) return;
  const { error } = await supabase
    .from('pairs')
    .update({ preferred_level: level })
    .eq('id', pairId);
  if (error) console.error('[sync] setPreferredLevel hiba:', error);
}

export async function archiveQuestion(pairId, memberId, question, level, questionId, note = null) {
  if (!supabase) return;
  const { error } = await supabase
    .from('kerdesek')
    .insert({
      pair_id: pairId,
      question,
      question_id: questionId,
      level,
      discussed_by: memberId,
      note,
    });
  if (error) console.error('[sync] archiveQuestion hiba:', error);
}

export async function loadKerdesek(pairId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('kerdesek')
    .select('*')
    .eq('pair_id', pairId)
    .order('discussed_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('[sync] loadKerdesek hiba:', error);
    return [];
  }
  return data || [];
}

// ─── Vágyak (közös bakancslista) ──────────────────────────────────────

export async function addWish(pairId, memberId, text, note = null) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('vagyak')
    .insert({ pair_id: pairId, text, note, created_by: memberId })
    .select()
    .single();
  if (error) {
    console.error('[sync] addWish hiba:', error);
    return null;
  }
  return data;
}

export async function toggleWishDone(wishId, doneAt) {
  if (!supabase) return;
  const { error } = await supabase
    .from('vagyak')
    .update({ done_at: doneAt })
    .eq('id', wishId);
  if (error) console.error('[sync] toggleWishDone hiba:', error);
}

export async function loadVagyak(pairId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('vagyak')
    .select('*')
    .eq('pair_id', pairId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    console.error('[sync] loadVagyak hiba:', error);
    return [];
  }
  return data || [];
}

// ─── „Mit mondana a másik" ────────────────────────────────────────────

export async function loadTodayMitMondana(pairId, dateKey) {
  if (!supabase) return null;
  const { data: session } = await supabase
    .from('mit_mondana_sessions')
    .select('*')
    .eq('pair_id', pairId)
    .eq('date', dateKey)
    .maybeSingle();
  if (!session) return null;
  const { data: responses } = await supabase
    .from('mit_mondana_responses')
    .select('*')
    .eq('session_id', session.id);
  return { session, responses: responses || [] };
}

export async function loadAllMitMondana(pairId) {
  if (!supabase) return [];
  const { data: sessions } = await supabase
    .from('mit_mondana_sessions')
    .select('*')
    .eq('pair_id', pairId)
    .not('revealed_at', 'is', null)
    .order('revealed_at', { ascending: false })
    .limit(200);
  if (!sessions || sessions.length === 0) return [];
  // Lekérjük a válaszokat is
  const sessionIds = sessions.map(s => s.id);
  const { data: responses } = await supabase
    .from('mit_mondana_responses')
    .select('*')
    .in('session_id', sessionIds);
  return sessions.map(s => ({
    session: s,
    responses: (responses || []).filter(r => r.session_id === s.id),
  }));
}

export async function createMitMondanaSession(pairId, memberId, question) {
  if (!supabase) return null;
  const dateKey = todayKeyForSync();
  // először próbáljuk létrehozni
  const { data, error } = await supabase
    .from('mit_mondana_sessions')
    .insert({
      pair_id: pairId,
      question_id: question.id,
      question: question.text,
      date: dateKey,
      initiator_id: memberId,
    })
    .select()
    .single();
  if (error) {
    // Ha már van mai session (race), töltsük be
    if (error.code === '23505') {
      const existing = await loadTodayMitMondana(pairId, dateKey);
      return existing?.session || null;
    }
    console.error('[sync] createMitMondanaSession hiba:', error);
    return null;
  }
  return data;
}

export async function submitMitMondanaResponse(sessionId, memberId, guess, actual) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('mit_mondana_responses')
    .insert({ session_id: sessionId, member_id: memberId, guess, actual })
    .select()
    .single();
  if (error) {
    console.error('[sync] submitMitMondanaResponse hiba:', error);
    return null;
  }
  return data;
}

export async function revealMitMondana(sessionId, note) {
  if (!supabase) return;
  const { error } = await supabase
    .from('mit_mondana_sessions')
    .update({ revealed_at: new Date().toISOString(), note: note || null })
    .eq('id', sessionId);
  if (error) console.error('[sync] revealMitMondana hiba:', error);
}

function todayKeyForSync() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Csapat-funkciók (team_activities tábla) ──────────────────────────

export async function loadTodayActivity(pairId, type, dateKey) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('team_activities')
    .select('*')
    .eq('pair_id', pairId)
    .eq('activity_type', type)
    .eq('date', dateKey)
    .maybeSingle();
  return data || null;
}

export async function upsertActivity(pairId, type, dateKey, stateUpdate, mergeFn) {
  // mergeFn: kap egy current state-et, ad vissza új state-et (atomi merge logikához)
  if (!supabase) return null;
  // Próbáljuk insertelni; ha létezik, töltsük be és UPDATE
  const existing = await loadTodayActivity(pairId, type, dateKey);
  if (existing) {
    const merged = mergeFn ? mergeFn(existing.state || {}) : { ...(existing.state || {}), ...stateUpdate };
    const { data, error } = await supabase
      .from('team_activities')
      .update({ state: merged, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) console.error('[sync] upsertActivity update hiba:', error);
    return data || null;
  } else {
    const initial = mergeFn ? mergeFn({}) : stateUpdate;
    const { data, error } = await supabase
      .from('team_activities')
      .insert({ pair_id: pairId, activity_type: type, date: dateKey, state: initial })
      .select()
      .single();
    if (error) {
      // race: már létezik, próbáljuk újra UPDATE-tel
      if (error.code === '23505') {
        return await upsertActivity(pairId, type, dateKey, stateUpdate, mergeFn);
      }
      console.error('[sync] upsertActivity insert hiba:', error);
    }
    return data || null;
  }
}

// ─── Realtime feliratkozás ────────────────────────────────────────────

export function subscribeToPair(pairId, callbacks) {
  if (!supabase) return () => {};
  if (pairChannel) {
    pairChannel.unsubscribe();
    pairChannel = null;
  }

  pairChannel = supabase
    .channel(`pair-${pairId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pairs', filter: `id=eq.${pairId}` },
      payload => {
        if (payload.new) callbacks.onPairUpdate?.(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'whispers', filter: `pair_id=eq.${pairId}` },
      payload => {
        if (payload.new) callbacks.onWhisper?.(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'feladat_log', filter: `pair_id=eq.${pairId}` },
      payload => {
        if (payload.new) callbacks.onFeladatDone?.(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'kerdesek', filter: `pair_id=eq.${pairId}` },
      payload => {
        if (payload.new) callbacks.onKerdesArchived?.(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'vagyak', filter: `pair_id=eq.${pairId}` },
      payload => {
        callbacks.onVagyakChange?.(payload);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'mit_mondana_sessions', filter: `pair_id=eq.${pairId}` },
      payload => {
        callbacks.onMitMondanaSession?.(payload);
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'mit_mondana_responses' },
      payload => {
        if (payload.new) callbacks.onMitMondanaResponse?.(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'team_activities', filter: `pair_id=eq.${pairId}` },
      payload => {
        callbacks.onTeamActivity?.(payload);
      }
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        callbacks.onConnected?.();
      }
    });

  return () => {
    if (pairChannel) {
      pairChannel.unsubscribe();
      pairChannel = null;
    }
  };
}
