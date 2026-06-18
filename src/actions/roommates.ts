'use server';

// src/actions/roommates.ts
// Roommate CRUD + per-cycle override management. Roommates live at the user
// level (not per-cycle) so they auto-carry across months; overrides live in
// `cycle_splits` so they're scoped to a single cycle.

import { revalidatePath } from 'next/cache';

import type { CycleSplit, Roommate, UUID } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';
import { POOL } from '@/lib/animals';

/** Patch shape for saveRoommate. */
export interface RoommatePatch {
  name?: string;
  position?: number;
}

/**
 * Update a roommate's mutable fields. RLS scopes the row to the auth user.
 */
export async function saveRoommate(
  roommateId: UUID,
  patch: RoommatePatch,
): Promise<Roommate> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('Not authenticated');

  const update: Record<string, unknown> = {};
  if (typeof patch.name === 'string') update.name = patch.name.trim();
  if (typeof patch.position === 'number') {
    update.position = Math.max(0, Math.trunc(patch.position));
  }

  if (Object.keys(update).length === 0) {
    // Nothing to update — return the current row.
    const { data, error } = await supabase
      .from('roommates')
      .select('*')
      .eq('id', roommateId)
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? 'Roommate not found');
    }
    return data as Roommate;
  }

  const { data, error } = await supabase
    .from('roommates')
    .update(update)
    .eq('id', roommateId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to update roommate');
  }

  revalidatePath('/cycle/current');
  return data as Roommate;
}

/**
 * Add a new roommate at the end of the list. Position is the next slot after
 * the highest existing position for this user.
 */
export async function addRoommate(name: string): Promise<Roommate> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('Not authenticated');

  // Compute the next position. RLS already scopes by user_id, but we add the
  // explicit eq() so the query plan stays obvious.
  const { data: tail, error: tailErr } = await supabase
    .from('roommates')
    .select('position')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('position', { ascending: false })
    .limit(1);

  if (tailErr) throw new Error(tailErr.message);
  const head = tail?.[0];
  const nextPosition =
    head ? Math.max(0, Math.trunc(head.position ?? 0)) + 1 : 0;

  const { data, error } = await supabase
    .from('roommates')
    .insert({
      user_id: user.id,
      name: name.trim(),
      position: nextPosition,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to add roommate');
  }

  revalidatePath('/cycle/current');
  return data as Roommate;
}

/**
 * Soft-delete: set archived_at instead of removing the row. This preserves
 * historical cycle_splits so prior cycles still render correctly.
 */
export async function removeRoommate(roommateId: UUID): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('roommates')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', roommateId);

  if (error) throw new Error(error.message);

  revalidatePath('/cycle/current');
}

export interface OverridePatch {
  override_cents?: number | null;
  override_percent?: number | null;
}

/**
 * Set or clear an override for a (cycle, roommate) pair. Pass `null` for both
 * fields (or omit them) to clear any existing override.
 *
 * Enforces the "at most one active override" rule — passing both as numbers
 * throws. The DB has a CHECK constraint as a backstop.
 *
 * Upserts the cycle_splits row, picking a default animal if missing.
 */
export async function setOverride(
  cycleId: UUID,
  roommateId: UUID,
  patch: OverridePatch,
): Promise<CycleSplit> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('Not authenticated');

  const cents = normalizeNullableInt(patch.override_cents);
  const percent = normalizeNullableInt(patch.override_percent);

  if (cents !== null && percent !== null) {
    throw new Error('Only one of override_cents or override_percent can be set');
  }
  if (percent !== null && (percent < 1 || percent > 99)) {
    throw new Error('override_percent must be between 1 and 99');
  }
  if (cents !== null && cents < 0) {
    throw new Error('override_cents must be non-negative');
  }

  // Look for an existing split row so we can preserve its animal.
  const { data: existing, error: existingErr } = await supabase
    .from('cycle_splits')
    .select('*')
    .eq('cycle_id', cycleId)
    .eq('roommate_id', roommateId)
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);

  const animal = existing?.animal ?? POOL[0];

  const { data, error } = await supabase
    .from('cycle_splits')
    .upsert(
      {
        cycle_id: cycleId,
        roommate_id: roommateId,
        override_cents: cents,
        override_percent: percent,
        animal,
      },
      { onConflict: 'cycle_id,roommate_id' },
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to save override');
  }

  revalidatePath(`/cycle/${cycleId}`);
  return data as CycleSplit;
}

// ---- helpers ----------------------------------------------------------------

function normalizeNullableInt(n: number | null | undefined): number | null {
  if (n == null) return null;
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}
