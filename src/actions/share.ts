'use server';

// src/actions/share.ts
// Generate per-roommate share links for a cycle. Each non-archived roommate
// gets a fresh 8-char token, expires_at = now + 5 days, and a unique animal
// persisted on cycle_splits for the share page to render.

import { revalidatePath } from 'next/cache';

import type { AnimalKey, ShareLinkOutput, UUID } from '@/lib/types';
import { POOL, pickAnimals } from '@/lib/animals';
import { createClient } from '@/lib/supabase/server';
import { expiryFromNow, mintToken } from '@/lib/tokens';

/**
 * Generate one share link per active roommate of the cycle. Replaces any
 * existing tokens for the cycle (delete + insert) and assigns each roommate
 * a unique animal which is upserted onto cycle_splits.
 */
export async function generateShareLinks(
  cycleId: UUID,
): Promise<ShareLinkOutput[]> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('Not authenticated');

  // Confirm ownership + that the cycle exists.
  const { data: cycle, error: cycleErr } = await supabase
    .from('cycles')
    .select('id, user_id')
    .eq('id', cycleId)
    .single();

  if (cycleErr || !cycle) {
    throw new Error(cycleErr?.message ?? 'Cycle not found');
  }

  // Active roommates only.
  const { data: roommates, error: roommatesErr } = await supabase
    .from('roommates')
    .select('id, name, position')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('position', { ascending: true });

  if (roommatesErr) throw new Error(roommatesErr.message);
  const list = roommates ?? [];
  if (list.length === 0) return [];

  // Existing splits — preserve animals where already set so links stay
  // visually stable across re-generation.
  const { data: existingSplits, error: splitsErr } = await supabase
    .from('cycle_splits')
    .select('roommate_id, animal, override_cents, override_percent')
    .eq('cycle_id', cycleId);

  if (splitsErr) throw new Error(splitsErr.message);

  const existingByRoommate = new Map(
    (existingSplits ?? []).map((s) => [s.roommate_id as UUID, s]),
  );

  // Reserved animals = those already assigned to a roommate in this cycle.
  const reserved = new Set<AnimalKey>();
  for (const s of existingSplits ?? []) {
    if (s.animal) reserved.add(s.animal as AnimalKey);
  }

  // Roommates that still need an animal.
  const needAnimals = list.filter(
    (r) => !existingByRoommate.get(r.id as UUID)?.animal,
  );

  // Pick from the unreserved subset to keep animals unique within the cycle.
  const availablePool = POOL.filter((a) => !reserved.has(a));
  // pickAnimals randomizes; if we somehow ran out (>POOL.length roommates) we
  // fall back to allowing repeats from the full pool.
  let nextAnimals: AnimalKey[] =
    availablePool.length >= needAnimals.length
      ? shuffle(availablePool).slice(0, needAnimals.length)
      : pickAnimals(needAnimals.length);
  if (nextAnimals.length < needAnimals.length) {
    // Pad if pickAnimals returned fewer than requested (pool smaller than n).
    const extra = pickAnimals(needAnimals.length - nextAnimals.length);
    nextAnimals = nextAnimals.concat(extra);
  }

  // Build the upsert payload for cycle_splits — one row per roommate, each
  // with a definite animal.
  const splitsUpsert = list.map((r, i) => {
    const existing = existingByRoommate.get(r.id as UUID);
    let animal: AnimalKey;
    if (existing?.animal) {
      animal = existing.animal as AnimalKey;
    } else {
      const idx = needAnimals.findIndex((n) => n.id === r.id);
      animal = (nextAnimals[idx] ?? POOL[i % POOL.length]) as AnimalKey;
    }
    return {
      cycle_id: cycleId,
      roommate_id: r.id as UUID,
      override_cents: existing?.override_cents ?? null,
      override_percent: existing?.override_percent ?? null,
      animal,
    };
  });

  const { data: upsertedSplits, error: upsertErr } = await supabase
    .from('cycle_splits')
    .upsert(splitsUpsert, { onConflict: 'cycle_id,roommate_id' })
    .select('*');

  if (upsertErr) throw new Error(upsertErr.message);

  const animalByRoommate = new Map<UUID, AnimalKey>();
  for (const s of upsertedSplits ?? []) {
    animalByRoommate.set(s.roommate_id as UUID, s.animal as AnimalKey);
  }

  // Wipe any existing tokens for this cycle, then mint fresh ones.
  const { error: deleteErr } = await supabase
    .from('share_tokens')
    .delete()
    .eq('cycle_id', cycleId);
  if (deleteErr) throw new Error(deleteErr.message);

  const expires_at = expiryFromNow(5);
  const tokenRows = list.map((r) => ({
    token: mintToken(),
    cycle_id: cycleId,
    roommate_id: r.id as UUID,
    expires_at,
  }));

  const { data: insertedTokens, error: insertErr } = await supabase
    .from('share_tokens')
    .insert(tokenRows)
    .select('*');

  if (insertErr) throw new Error(insertErr.message);

  const tokenByRoommate = new Map<UUID, string>();
  for (const t of insertedTokens ?? []) {
    tokenByRoommate.set(t.roommate_id as UUID, t.token as string);
  }

  const baseUrl = resolveBaseUrl();

  const result: ShareLinkOutput[] = list.map((r) => {
    const token = tokenByRoommate.get(r.id as UUID) ?? '';
    const animal = (animalByRoommate.get(r.id as UUID) ?? POOL[0]!) as AnimalKey;
    const existing = existingByRoommate.get(r.id as UUID);
    const isDiscounted =
      (existing?.override_percent ?? null) !== null &&
      (existing?.override_percent ?? 0) > 0;
    return {
      roommateId: r.id as UUID,
      name: r.name,
      token,
      url: `${baseUrl}/share/${token}`,
      animal,
      // amount_cents is computed by the editor's split — actions don't have
      // the bills total here. Callers that need it (e.g. ShareLinksModal)
      // already know the total and overlay it. Default to 0 for now.
      amount_cents: 0,
      is_discounted: isDiscounted,
    };
  });

  revalidatePath(`/cycle/${cycleId}`);
  return result;
}

/** Delete every share token for this cycle. Owner-only via RLS. */
export async function revokeShareLinks(cycleId: UUID): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('share_tokens')
    .delete()
    .eq('cycle_id', cycleId);

  if (error) throw new Error(error.message);

  revalidatePath(`/cycle/${cycleId}`);
}

// ---- helpers ----------------------------------------------------------------

function resolveBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return stripTrailingSlash(explicit);

  const vercel = process.env.VERCEL_URL;
  if (vercel) {
    return vercel.startsWith('http') ? stripTrailingSlash(vercel) : `https://${vercel}`;
  }
  return 'http://localhost:3000';
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
