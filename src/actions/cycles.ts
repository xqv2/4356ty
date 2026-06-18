'use server';

// src/actions/cycles.ts
// Cycle CRUD + idempotent "current cycle" resolver. All calls go through the
// cookie-bound server client so RLS enforces ownership.

import { revalidatePath } from 'next/cache';

import type { Bill, Cycle, Roommate } from '@/lib/types';
import { currentYearMonth, formatCycleLabel } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_LABEL = 'Utilities';

const DEFAULT_BILLS: Array<Pick<Bill, 'vendor' | 'kind'> & { recurring: boolean }> = [
  { vendor: 'Electricity', kind: 'electricity', recurring: true },
  { vendor: 'Water', kind: 'water', recurring: true },
  { vendor: 'Trash', kind: 'trash', recurring: true },
  { vendor: 'Internet', kind: 'internet', recurring: true },
];

/**
 * Create a new cycle for the signed-in user. Throws if a cycle already exists
 * for the given (year, month) — the unique index in Postgres enforces this.
 */
export async function createCycle(
  year: number,
  month: number,
  label?: string,
): Promise<Cycle> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('Not authenticated');

  const finalLabel = (label ?? DEFAULT_LABEL).trim() || DEFAULT_LABEL;

  const { data, error } = await supabase
    .from('cycles')
    .insert({
      user_id: user.id,
      year: Math.trunc(year),
      month: Math.trunc(month),
      label: finalLabel,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create cycle');
  }

  revalidatePath('/cycle/current');
  revalidatePath(`/cycle/${data.id}`);
  return data as Cycle;
}

/**
 * Idempotently resolve the cycle for "now". If one already exists for the
 * current (year, month), return it untouched. Otherwise create a fresh cycle
 * and seed it with:
 *   - the most recent prior cycle's roommates (carried as-is), or no
 *     roommates if this is the user's very first cycle;
 *   - the most recent prior cycle's bills (vendor/provider/kind/recurring,
 *     amount reset to 0, pdf_path dropped), or the four default bills if
 *     this is the user's very first cycle.
 */
export async function ensureCurrentCycle(): Promise<Cycle> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('Not authenticated');

  const { year, month } = currentYearMonth();

  const { data: existing, error: existingErr } = await supabase
    .from('cycles')
    .select('*')
    .eq('user_id', user.id)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);
  if (existing) return existing as Cycle;

  // Find the most recent prior cycle (any year/month) so we can carry forward.
  const { data: priors, error: priorErr } = await supabase
    .from('cycles')
    .select('*')
    .eq('user_id', user.id)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1);

  if (priorErr) throw new Error(priorErr.message);
  const prior = priors && priors.length > 0 ? (priors[0] as Cycle) : null;

  const label = prior?.label ?? formatCycleLabel(year, month);

  const { data: created, error: createErr } = await supabase
    .from('cycles')
    .insert({
      user_id: user.id,
      year,
      month,
      label,
    })
    .select('*')
    .single();

  if (createErr || !created) {
    throw new Error(createErr?.message ?? 'Failed to create current cycle');
  }
  const newCycle = created as Cycle;

  // Seed bills.
  if (prior) {
    const { data: priorBills, error: priorBillsErr } = await supabase
      .from('bills')
      .select('vendor, provider, kind, recurring, position')
      .eq('cycle_id', prior.id)
      .order('position', { ascending: true });

    if (priorBillsErr) throw new Error(priorBillsErr.message);

    const seedBills = (priorBills ?? []).map((b, i) => ({
      cycle_id: newCycle.id,
      vendor: b.vendor,
      provider: b.provider ?? null,
      kind: b.kind ?? null,
      recurring: b.recurring ?? false,
      amount_cents: 0,
      position: typeof b.position === 'number' ? b.position : i,
    }));

    if (seedBills.length > 0) {
      const { error: insertBillsErr } = await supabase
        .from('bills')
        .insert(seedBills);
      if (insertBillsErr) throw new Error(insertBillsErr.message);
    }
  } else {
    const seedDefaults = DEFAULT_BILLS.map((b, i) => ({
      cycle_id: newCycle.id,
      vendor: b.vendor,
      provider: null,
      kind: b.kind,
      recurring: b.recurring,
      amount_cents: 0,
      position: i,
    }));
    const { error: insertDefaultsErr } = await supabase
      .from('bills')
      .insert(seedDefaults);
    if (insertDefaultsErr) throw new Error(insertDefaultsErr.message);
  }

  // Roommates: carried at the user level (not per-cycle), so nothing to copy
  // — they show up automatically. We just confirm they exist for the seeded
  // splits to attach to (no-op if there are none yet).
  const { data: existingRoommates, error: roommatesErr } = await supabase
    .from('roommates')
    .select('id')
    .eq('user_id', user.id)
    .is('archived_at', null);

  if (roommatesErr) throw new Error(roommatesErr.message);
  void (existingRoommates as Pick<Roommate, 'id'>[] | null);

  revalidatePath('/cycle/current');
  revalidatePath(`/cycle/${newCycle.id}`);
  return newCycle;
}

/** All cycles for the signed-in user, newest first. */
export async function listCycles(): Promise<Cycle[]> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('cycles')
    .select('*')
    .eq('user_id', user.id)
    .order('year', { ascending: false })
    .order('month', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Cycle[];
}
