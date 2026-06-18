'use server';

// src/actions/cycles.ts

import { redirect } from 'next/navigation';
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

// Historical sample data — Jan through Apr. May onwards the user fills in.
const SAMPLE_MONTHS: Array<{
  year: number;
  month: number;
  bills: Array<{ vendor: string; kind: Bill['kind']; amount_cents: number }>;
}> = [
  {
    year: 2026, month: 1,
    bills: [
      { vendor: 'Electricity', kind: 'electricity', amount_cents: 14500 },
      { vendor: 'Water',       kind: 'water',       amount_cents: 3800  },
      { vendor: 'Trash',       kind: 'trash',       amount_cents: 2800  },
      { vendor: 'Internet',    kind: 'internet',    amount_cents: 6000  },
    ],
  },
  {
    year: 2026, month: 2,
    bills: [
      { vendor: 'Electricity', kind: 'electricity', amount_cents: 15200 },
      { vendor: 'Water',       kind: 'water',       amount_cents: 3500  },
      { vendor: 'Trash',       kind: 'trash',       amount_cents: 2800  },
      { vendor: 'Internet',    kind: 'internet',    amount_cents: 6000  },
    ],
  },
  {
    year: 2026, month: 3,
    bills: [
      { vendor: 'Electricity', kind: 'electricity', amount_cents: 11800 },
      { vendor: 'Water',       kind: 'water',       amount_cents: 4200  },
      { vendor: 'Trash',       kind: 'trash',       amount_cents: 2800  },
      { vendor: 'Internet',    kind: 'internet',    amount_cents: 6000  },
    ],
  },
  {
    year: 2026, month: 4,
    bills: [
      { vendor: 'Electricity', kind: 'electricity', amount_cents: 9800  },
      { vendor: 'Water',       kind: 'water',       amount_cents: 4500  },
      { vendor: 'Trash',       kind: 'trash',       amount_cents: 2800  },
      { vendor: 'Internet',    kind: 'internet',    amount_cents: 6000  },
    ],
  },
];

async function seedLokeshDiscount(
  supabase: ReturnType<typeof createServiceClient>,
  cycleId: string,
  lokeshId: string,
) {
  await supabase.from('cycle_splits').upsert(
    { cycle_id: cycleId, roommate_id: lokeshId, override_percent: 20, override_cents: null, animal: 'duck' },
    { onConflict: 'cycle_id,roommate_id' },
  );
}

/**
 * Bootstrap roommates + Jan–Apr history on first run, then return the most
 * recent cycle that has bills. Never auto-creates the current month —
 * the user controls that via the "+" button.
 */
export async function ensureCurrentCycle(): Promise<Cycle> {
  const supabase = createServiceClient();
  const userId = getAdminUserId();

  // ── 1. Seed roommates on first run ──────────────────────────────────────
  const { data: existingRoommates } = await supabase
    .from('roommates')
    .select('id, name')
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

  // Resolve Lokesh's id for discount seeding.
  const { data: allRoommates } = await supabase
    .from('roommates')
    .select('id, name')
    .eq('user_id', userId)
    .is('archived_at', null);

  const lokeshId = allRoommates?.find((r) => r.name === 'Lokesh')?.id ?? null;

  // ── 2. Seed historical months if missing ────────────────────────────────
  for (const sample of SAMPLE_MONTHS) {
    const { data: existing } = await supabase
      .from('cycles')
      .select('id')
      .eq('user_id', userId)
      .eq('year', sample.year)
      .eq('month', sample.month)
      .maybeSingle();

    if (existing) continue;

    const label = `${formatCycleLabel(sample.year, sample.month)} · ${DEFAULT_LABEL}`;
    const { data: created } = await supabase
      .from('cycles')
      .insert({ user_id: userId, year: sample.year, month: sample.month, label })
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
      if (lokeshId) await seedLokeshDiscount(supabase, created.id, lokeshId);
    }
  }

  // ── 3. Return the latest cycle that has bills ────────────────────────────
  const { data: cycles } = await supabase
    .from('cycles')
    .select('*')
    .eq('user_id', userId)
    .order('year', { ascending: false })
    .order('month', { ascending: false });

  for (const cycle of cycles ?? []) {
    const { count } = await supabase
      .from('bills')
      .select('id', { count: 'exact', head: true })
      .eq('cycle_id', cycle.id);
    if (count && count > 0) return cycle as Cycle;
  }

  // Fallback: create current month if the user has nothing at all.
  const { year, month } = currentYearMonth();
  const { data: created, error } = await supabase
    .from('cycles')
    .insert({ user_id: userId, year, month, label: `${formatCycleLabel(year, month)} · ${DEFAULT_LABEL}` })
    .select('*')
    .single();

  if (error || !created) throw new Error(error?.message ?? 'Failed to create cycle');

  await supabase.from('bills').insert(
    DEFAULT_BILLS.map((b, i) => ({
      cycle_id: created.id, vendor: b.vendor, provider: null,
      kind: b.kind, recurring: b.recurring, amount_cents: 0, position: i,
    })),
  );

  return created as Cycle;
}

/**
 * Create the next month after the user's latest cycle, carry bills forward
 * with amounts reset to 0, then redirect there.
 */
export async function createNextCycle(): Promise<void> {
  const supabase = createServiceClient();
  const userId = getAdminUserId();

  const { data: latest } = await supabase
    .from('cycles')
    .select('*')
    .eq('user_id', userId)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1);

  let year: number;
  let month: number;

  if (latest && latest.length > 0) {
    const l = latest[0] as Cycle;
    month = l.month + 1;
    year = l.year;
    if (month > 12) { month = 1; year += 1; }
  } else {
    const curr = currentYearMonth();
    year = curr.year;
    month = curr.month;
  }

  const label = `${formatCycleLabel(year, month)} · ${DEFAULT_LABEL}`;

  const { data: created, error } = await supabase
    .from('cycles')
    .upsert({ user_id: userId, year, month, label }, { onConflict: 'user_id,year,month' })
    .select('*')
    .single();

  if (error || !created) throw new Error(error?.message ?? 'Failed to create next cycle');
  const newCycle = created as Cycle;

  // Carry bills from prior cycle, amounts reset to 0.
  if (latest && latest.length > 0) {
    const { data: priorBills } = await supabase
      .from('bills')
      .select('vendor, provider, kind, recurring, position')
      .eq('cycle_id', (latest[0] as Cycle).id)
      .order('position', { ascending: true });

    if (priorBills && priorBills.length > 0) {
      await supabase.from('bills').insert(
        priorBills.map((b, i) => ({
          cycle_id: newCycle.id, vendor: b.vendor, provider: b.provider ?? null,
          kind: b.kind ?? null, recurring: b.recurring ?? false,
          amount_cents: 0, position: typeof b.position === 'number' ? b.position : i,
        })),
      );
    }
  } else {
    await supabase.from('bills').insert(
      DEFAULT_BILLS.map((b, i) => ({
        cycle_id: newCycle.id, vendor: b.vendor, provider: null,
        kind: b.kind, recurring: b.recurring, amount_cents: 0, position: i,
      })),
    );
  }

  // Seed Lokesh's discount on the new cycle.
  const { data: roommates } = await supabase
    .from('roommates').select('id, name').eq('user_id', userId).is('archived_at', null);
  const lokeshId = roommates?.find((r) => r.name === 'Lokesh')?.id ?? null;
  if (lokeshId) await seedLokeshDiscount(supabase, newCycle.id, lokeshId);

  revalidatePath('/cycle/current');
  revalidatePath(`/cycle/${newCycle.id}`);
  redirect(`/cycle/${newCycle.id}`);
}

export async function createCycle(year: number, month: number, label?: string): Promise<Cycle> {
  const supabase = createServiceClient();
  const userId = getAdminUserId();
  const finalLabel = (label ?? DEFAULT_LABEL).trim() || DEFAULT_LABEL;

  const { data, error } = await supabase
    .from('cycles')
    .insert({ user_id: userId, year: Math.trunc(year), month: Math.trunc(month), label: finalLabel })
    .select('*').single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to create cycle');
  revalidatePath('/cycle/current');
  revalidatePath(`/cycle/${data.id}`);
  return data as Cycle;
}

export async function listCycles(): Promise<Cycle[]> {
  const supabase = createServiceClient();
  const userId = getAdminUserId();

  const { data, error } = await supabase
    .from('cycles').select('*').eq('user_id', userId)
    .order('year', { ascending: false }).order('month', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Cycle[];
}
