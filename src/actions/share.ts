'use server';

// src/actions/share.ts

import { revalidatePath } from 'next/cache';
import type { AnimalKey, ShareLinkOutput, UUID } from '@/lib/types';
import { POOL, pickAnimals } from '@/lib/animals';
import { createServiceClient, getAdminUserId } from '@/lib/supabase/service';
import { expiryFromNow, mintToken } from '@/lib/tokens';
import { shortenUrl } from '@/lib/tinyurl';

export async function generateShareLinks(cycleId: UUID): Promise<ShareLinkOutput[]> {
  const supabase = createServiceClient();
  const userId = getAdminUserId();

  const { data: cycle, error: cycleErr } = await supabase
    .from('cycles')
    .select('id, user_id')
    .eq('id', cycleId)
    .single();

  if (cycleErr || !cycle) throw new Error(cycleErr?.message ?? 'Cycle not found');

  const { data: roommates, error: roommatesErr } = await supabase
    .from('roommates')
    .select('id, name, position')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('position', { ascending: true });

  if (roommatesErr) throw new Error(roommatesErr.message);
  const list = roommates ?? [];
  if (list.length === 0) return [];

  const { data: existingSplits, error: splitsErr } = await supabase
    .from('cycle_splits')
    .select('roommate_id, animal, override_cents, override_percent')
    .eq('cycle_id', cycleId);

  if (splitsErr) throw new Error(splitsErr.message);

  const existingByRoommate = new Map(
    (existingSplits ?? []).map((s) => [s.roommate_id as UUID, s]),
  );

  const reserved = new Set<AnimalKey>();
  for (const s of existingSplits ?? []) {
    if (s.animal) reserved.add(s.animal as AnimalKey);
  }

  const needAnimals = list.filter((r) => !existingByRoommate.get(r.id as UUID)?.animal);
  const availablePool = POOL.filter((a) => !reserved.has(a));
  let nextAnimals: AnimalKey[] =
    availablePool.length >= needAnimals.length
      ? shuffle(availablePool).slice(0, needAnimals.length)
      : pickAnimals(needAnimals.length);
  if (nextAnimals.length < needAnimals.length) {
    nextAnimals = nextAnimals.concat(pickAnimals(needAnimals.length - nextAnimals.length));
  }

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

  const rawResults = list.map((r) => {
    const token = tokenByRoommate.get(r.id as UUID) ?? '';
    const animal = (animalByRoommate.get(r.id as UUID) ?? POOL[0]!) as AnimalKey;
    const existing = existingByRoommate.get(r.id as UUID);
    const isDiscounted =
      (existing?.override_percent ?? null) !== null && (existing?.override_percent ?? 0) > 0;
    return {
      roommateId: r.id as UUID,
      name: r.name,
      token,
      longUrl: `${baseUrl}/share/${token}`,
      animal,
      amount_cents: 0,
      is_discounted: isDiscounted,
    };
  });

  const shortUrls = await Promise.all(rawResults.map((r) => shortenUrl(r.longUrl)));

  return rawResults.map((r, i) => ({
    roommateId: r.roommateId,
    name: r.name,
    token: r.token,
    url: shortUrls[i] ?? r.longUrl,
    animal: r.animal,
    amount_cents: r.amount_cents,
    is_discounted: r.is_discounted,
  }));
}

export async function revokeShareLinks(cycleId: UUID): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase.from('share_tokens').delete().eq('cycle_id', cycleId);
  if (error) throw new Error(error.message);

  revalidatePath(`/cycle/${cycleId}`);
}

function resolveBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.endsWith('/') ? explicit.slice(0, -1) : explicit;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return vercel.startsWith('http') ? vercel : `https://${vercel}`;
  return 'http://localhost:3000';
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
