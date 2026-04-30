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

// ─── Suttogások ───────────────────────────────────────────────────────

export async function sendWhisper(pairId, memberId, text) {
  if (!supabase) return;
  // Töröljük az előzőt — egyszerre csak egy aktív suttogás
  await supabase.from('whispers').delete().eq('pair_id', pairId);
  // Beillesztjük az újat
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
