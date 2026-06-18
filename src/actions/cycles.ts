'use server';

// src/actions/cycles.ts

import { revalidatePath } from 'next/cache';
import type { Bill, Cycle, Roommate } from '@/lib/types';
import { currentYearMonth, formatCycleLabel } from '@/lib/format';
import { createServiceClient, getAdminUserId } from '@/lib/supabase/service';

const DEFAULT_LABEL = 'Utilities';

const DEFAULT_BILLS: Array<Pick<Bill, 'vendor' | 'kind'> & { recurring: boolean }> = [
  { vendor: 'Electricity', kind: 'electricity', recurring: true },
  { vendor: 'Water', kind: 'water', recurring: true },
  { vendor: 'Trash', kind: 'trash', recurring: true },
  { vendor: 'Internet', kind: 'internet', recurring: true },
];

export async function createCycle(
  year: number,
  month: number,
  label?: string,
): Promise<Cycle> {
  const supabase = createServiceClient();
  const userId = getAdminUserId();
  const finalLabel = (label ?? DEFAULT_LABEL).trim() || DEFAULT_LABEL;

  const { data, error } = await supabase
    .from('cycles')
    .insert({ user_id: userId, year: Math.trunc(year), month: Math.trunc(month), label: finalLabel })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to create cycle');

  revalidatePath('/cycle/current');
  revalidatePath(`/cycle/${data.id}`);
  return data as Cycle;
}

export async function ensureCurrentCycle(): Promise<Cycle> {
  const supabase = createServiceClient();
  const userId = getAdminUserId();
  const { year, month } = currentYearMonth();

  const { data: existing, error: existingErr } = await supabase
    .from('cycles')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);
  if (existing) return existing as Cycle;

  const { data: priors, error: priorErr } = await supabase
    .from('cycles')
    .select('*')
    .eq('user_id', userId)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1);

  if (priorErr) throw new Error(priorErr.message);
  const prior = priors && priors.length > 0 ? (priors[0] as Cycle) : null;
  const label = prior?.label ?? formatCycleLabel(year, month);

  const { data: created, error: createErr } = await supabase
    .from('cycles')
    .insert({ user_id: userId, year, month, label })
    .select('*')
    .single();

  if (createErr || !created) throw new Error(createErr?.message ?? 'Failed to create current cycle');
  const newCycle = created as Cycle;

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
      const { error: insertBillsErr } = await supabase.from('bills').insert(seedBills);
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
    const { error: insertDefaultsErr } = await supabase.from('bills').insert(seedDefaults);
    if (insertDefaultsErr) throw new Error(insertDefaultsErr.message);
  }

  const { error: roommatesErr } = await supabase
    .from('roommates')
    .select('id')
    .eq('user_id', userId)
    .is('archived_at', null);

  if (roommatesErr) throw new Error(roommatesErr.message);
  void ([] as Pick<Roommate, 'id'>[]);

  revalidatePath('/cycle/current');
  revalidatePath(`/cycle/${newCycle.id}`);
  return newCycle;
}

export async function listCycles(): Promise<Cycle[]> {
  const supabase = createServiceClient();
  const userId = getAdminUserId();

  const { data, error } = await supabase
    .from('cycles')
    .select('*')
    .eq('user_id', userId)
    .order('year', { ascending: false })
    .order('month', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Cycle[];
}
