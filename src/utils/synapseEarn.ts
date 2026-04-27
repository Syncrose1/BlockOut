/**
 * Synapse trickle earn — PR #3b.
 *
 * Awards a small amount of Synapse currency per minute of actively running
 * focus time (any mode: pomodoro work, custom timer, stopwatch). Mode-agnostic
 * by design — stopwatch users earn equally.
 *
 * Anti-cheese for v1 lives client-side: a daily cap mirrored in the BlockOut
 * store and round-tripped through cloud sync. Server-side cap enforcement
 * (a Postgres RPC + per-day ledger) comes when the shop ships and the stakes
 * justify the migration cost. The cap on its own already keeps a 24h-running
 * timer from out-earning an honest 2h focus session.
 *
 * The credit itself is atomic: a `synamon_credit_synapse(p_amount)` RPC does
 * the increment + insert-if-missing in a single statement, so two devices
 * crediting at once won't lose writes the way read-modify-write would.
 */

import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { getSupabaseClient } from './supabase';

export const TRICKLE_PER_MIN = 2;          // Synapse awarded per credited minute.
export const DAILY_CAP = 800;              // Max Synapse per local day from any source.
const MIN_CREDIT_INTERVAL_SEC = 60;        // Don't fire more often than this.

function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Credit `amount` Synapse to the signed-in user, clamped by the daily cap.
 * Returns the actual amount credited (may be less than requested if near cap).
 * Silently no-ops when offline / signed out / Synamon disabled.
 */
export async function creditSynapse(amount: number): Promise<number> {
  if (amount <= 0) return 0;
  const state = useStore.getState();
  if (!state.synamonEnabled) return 0;

  const client = getSupabaseClient();
  if (!client) return 0;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return 0;

  const today = todayLocalStr();
  const sameDay = state.synapseDaily.date === today;
  const todayAmount = sameDay ? state.synapseDaily.todayAmount : 0;
  const remaining = DAILY_CAP - todayAmount;
  if (remaining <= 0) return 0;

  const toCredit = Math.min(amount, remaining);

  const { error } = await client.rpc('synamon_credit_synapse', { p_amount: toCredit });
  if (error) {
    console.warn('[synapseEarn] RPC failed:', error.message);
    return 0;
  }

  state.recordSynapseCredit(today, toCredit);
  return toCredit;
}

/**
 * Hook — drives the trickle. Mounted once at the App root.
 *
 * Watches whether *any* focus mode is currently running, and accumulates a
 * second-level counter while it is. Every full minute of accumulated focus
 * fires one trickle credit. Counter resets on credit (carrying overshoot)
 * and on every state change to keep edges clean.
 */
export function useSynapseTrickle() {
  const synamonEnabled = useStore(s => s.synamonEnabled);
  const isFocusRunning = useStore(s =>
    (s.pomodoro.isRunning && s.pomodoro.mode === 'work') ||
    s.pomodoro.timer.isRunning ||
    s.pomodoro.stopwatch.isRunning
  );

  const accumulatedRef = useRef(0);

  useEffect(() => {
    if (!synamonEnabled || !isFocusRunning) return;

    const interval = setInterval(() => {
      accumulatedRef.current += 1;
      if (accumulatedRef.current >= MIN_CREDIT_INTERVAL_SEC) {
        accumulatedRef.current -= MIN_CREDIT_INTERVAL_SEC;
        creditSynapse(TRICKLE_PER_MIN).catch(e => console.warn('[synapseEarn] credit failed', e));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [synamonEnabled, isFocusRunning]);
}
