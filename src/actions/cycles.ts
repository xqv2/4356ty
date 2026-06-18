'use server';

// src/actions/cycles.ts

import { revalidatePath } from 'next/cache';
import type { Bill, Cycle } from '@/lib/types';
import { currentYearMonth, formatCycleLabel } from '@/lib/format';
import { createServiceClient, getAdminUserId } from '@/lib/supabase/service';

const DEFAULT_LABEL = 'Utilities';

const DEFAULT_BILLS: Array<Pick<Bill, 'vendor' | 'kind'> & { recurring: boolean }> = [
  { vendor: 'Electricity', kind: 'electricity', recurring: true },
  { vendor: 'Water',       kind: 'water',       recurring: true },
  { vendor: 'Trash',       kind: 'trash',       recurring: true },
  { vendor: 'Internet',    kind: 'internet',    recurring: true },
];

// Sample past-month amounts (cents) shown before the user fills in real numbers.
const SAMPLE_MONTHS: Array<{
  monthOffset: number; // months before current
  bills: Array<{ vendor: string; kind: Bill['kind']; amount_cents: number }>;
}> = [
  {
    monthOffset: 2, // two months ago
    bills: [
      { vendor: 'Electricity', kind: 'electricity', amount_cents: 11800 },
      { vendor: 'Water',       kind: 'water',       amount_cents: 4200  },
      { vendor: 'Trash',       kind: 'trash',       amount_cents: 2800  },
      { vendor: 'Internet',    kind: 'internet',    amount_cents: 6000  },
    ],
  },
  {
    monthOffset: 1, // last month
    bills: [
      { vendor: 'Electricity', kind: 'electricity', amount_cents: 13000 },
      { vendor: 'Water',       kind: 'water',       amount_cents: 4800  },
      { vendor: 'Trash',       kind: 'trash',       amount_cents: 2800  },
      { vendor: 'Internet',    kind: 'internet',    amount_cents: 6000  },
    ],
  },
];

function offsetMonth(year: number, month: number, offset: number) {
  let m = month - offset;
  let y = year;
  while (m < 1) { m += 12; y -= 1; }
  return { year: y, month: m };
}

export async function ensureCurrentCycle(): Promise<Cycle> {
  const supabase = createServiceClient();
  const userId = getAdminUserId();
  const { year, month } = currentYearMonth();

  // ── 1. Seed roommates on first run ──────────────────────────────────────
  const { data: existingRoommates } = await supabase
    .from('roommates')
    .select('id')
    .eq('user_id', userId)
    .is('archived_at', null)
    .limit(1);

  if (!existingRoommates || existingRoommates.length === 0) {
    await supabase.from('roommates').insert([
      { user_id: userId, name: 'Lokesh',  position: 0 },
      { user_id: userId, name: 'Astitva', position: 1 },
      { user_id: userId, name: 'Bob',     position: 2 },
    ]);
  }

  // ── 2. Seed past months if they don't exist ─────────────────────────────
  for (const sample of SAMPLE_MONTHS) {
    const { year: sy, month: sm } = offsetMonth(year, month, sample.monthOffset);
    const { data: existing } = await supabase
      .from('cycles')
      .select('id')
      .eq('user_id', userId)
      .eq('year', sy)
      .eq('month', sm)
      .maybeSingle();

    if (existing) continue;

    const label = `${formatCycleLabel(sy, sm)} · ${DEFAULT_LABEL}`;
    const { data: created } = await supabase
      .from('cycles')
      .insert({ user_id: userId, year: sy, month: sm, label })
      .select('id')
      .single();

    if (created) {
      await supabase.from('bills').insert(
        sample.bills.map((b, i) => ({
          cycle_id: created.id,
          vendor: b.vendor,
          provider: null,
          kind: b.kind,
          recurring: true,
          amount_cents: b.amount_cents,
          position: i,
        })),
      );
    }
  }

  // ── 3. Get or create current cycle ──────────────────────────────────────
  const { data: existing, error: existingErr } = await supabase
    .from('cycles')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);

  if (existing) {
    // Cycle may have been created empty by the old page — seed bills if so.
    const { count } = await supabase
      .from('bills')
      .select('id', { count: 'exact', head: true })
      .eq('cycle_id', existing.id);

    if (!count) {
      await supabase.from('bills').insert(
        DEFAULT_BILLS.map((b, i) => ({
          cycle_id: existing.id,
          vendor: b.vendor,
          provider: null,
          kind: b.kind,
          recurring: b.recurring,
          amount_cents: 0,
          position: i,
        })),
      );
    }

    revalidatePath('/cycle/current');
    revalidatePath(`/cycle/${existing.id}`);
    return existing as Cycle;
  }

  // ── 4. Create current cycle, carry forward from prior if possible ────────
  const { data: priors } = await supabase
    .from('cycles')
    .select('*')
    .eq('user_id', userId)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1);

  const prior = priors?.[0] as Cycle | undefined;
  const label = prior?.label ?? `${formatCycleLabel(year, month)} · ${DEFAULT_LABEL}`;

  const { data: created, error: createErr } = await supabase
    .from('cycles')
    .insert({ user_id: userId, year, month, label })
    .select('*')
    .single();

  if (createErr || !created) throw new Error(createErr?.message ?? 'Failed to create current cycle');
  const newCycle = created as Cycle;

  if (prior) {
    const { data: priorBills } = await supabase
      .from('bills')
      .select('vendor, provider, kind, recurring, position')
      .eq('cycle_id', prior.id)
      .order('position', { ascending: true });

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
      await supabase.from('bills').insert(seedBills);
    }
  } else {
    await supabase.from('bills').insert(
      DEFAULT_BILLS.map((b, i) => ({
        cycle_id: newCycle.id,
        vendor: b.vendor,
        provider: null,
        kind: b.kind,
        recurring: b.recurring,
        amount_cents: 0,
        position: i,
      })),
    );
  }

  revalidatePath('/cycle/current');
  revalidatePath(`/cycle/${newCycle.id}`);
  return newCycle;
}

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
