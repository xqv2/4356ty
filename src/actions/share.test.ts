// src/actions/share.test.ts
// Tests for generateShareLinks + revokeShareLinks. The Supabase client and
// next/cache are mocked at the module level — each test rebuilds a fresh
// chainable query stub so per-table behavior can be customized.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POOL } from '@/lib/animals';

// ---- mocks ------------------------------------------------------------------

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { generateShareLinks, revokeShareLinks } from './share';

// ---- supabase stub builder --------------------------------------------------

type Roommate = { id: string; name: string; position: number };
type ExistingSplit = {
  roommate_id: string;
  animal: string | null;
  override_cents: number | null;
  override_percent: number | null;
};
type Cycle = { id: string; user_id: string };

interface ShareStubOptions {
  user?: { id: string } | null;
  userError?: { message: string } | null;
  cycle?: Cycle | null;
  cycleError?: { message: string } | null;
  roommates?: Roommate[];
  roommatesError?: { message: string } | null;
  existingSplits?: ExistingSplit[];
  existingSplitsError?: { message: string } | null;
  upsertedSplitsOverride?: Array<{ roommate_id: string; animal: string }>;
  upsertError?: { message: string } | null;
  deleteError?: { message: string } | null;
  insertError?: { message: string } | null;
}

interface Recorded {
  upsertCalls: Array<{
    payload: Array<{
      cycle_id: string;
      roommate_id: string;
      override_cents: number | null;
      override_percent: number | null;
      animal: string;
    }>;
    onConflict: string | undefined;
  }>;
  insertedTokenRows: Array<{
    token: string;
    cycle_id: string;
    roommate_id: string;
    expires_at: string;
  }>;
  shareTokensDeletedFor: string[];
  cycleSelectedById: string[];
}

function makeSupabaseStub(opts: ShareStubOptions = {}): {
  client: ReturnType<typeof createClient> extends Promise<infer T> ? T : never;
  recorded: Recorded;
} {
  const recorded: Recorded = {
    upsertCalls: [],
    insertedTokenRows: [],
    shareTokensDeletedFor: [],
    cycleSelectedById: [],
  };

  const user = opts.user === undefined ? { id: 'user-1' } : opts.user;
  const cycle = opts.cycle === undefined ? { id: 'cycle-1', user_id: 'user-1' } : opts.cycle;
  const roommates = opts.roommates ?? [];
  const existingSplits = opts.existingSplits ?? [];

  const auth = {
    getUser: vi.fn().mockResolvedValue({
      data: { user },
      error: opts.userError ?? null,
    }),
  };

  function fromCycles() {
    // .select('id, user_id').eq('id', cycleId).single()
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn((_col: string, val: string) => {
      recorded.cycleSelectedById.push(val);
      return chain;
    });
    chain.single = vi.fn().mockResolvedValue({
      data: cycle,
      error: opts.cycleError ?? (cycle ? null : { message: 'Cycle not found' }),
    });
    return chain;
  }

  function fromRoommates() {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockResolvedValue({
      data: roommates,
      error: opts.roommatesError ?? null,
    });
    return chain;
  }

  function fromCycleSplits() {
    // Two flows: select-existing (.select(...).eq('cycle_id', ...))
    // and upsert (.upsert(payload, opts).select('*'))
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockImplementation(() => {
      // After upsert: returns awaitable resolving to { data, error }.
      // Before upsert: returns chain with .eq() that resolves.
      // We disambiguate via a flag set in upsert below.
      if ((chain as { _upsertPending?: boolean })._upsertPending) {
        (chain as { _upsertPending?: boolean })._upsertPending = false;
        const lastPayload = recorded.upsertCalls.at(-1)?.payload ?? [];
        const data =
          opts.upsertedSplitsOverride ??
          lastPayload.map((row) => ({
            cycle_id: row.cycle_id,
            roommate_id: row.roommate_id,
            override_cents: row.override_cents,
            override_percent: row.override_percent,
            animal: row.animal,
          }));
        return Promise.resolve({
          data: opts.upsertError ? null : data,
          error: opts.upsertError ?? null,
        });
      }
      return chain;
    });
    chain.eq = vi.fn().mockResolvedValue({
      data: existingSplits,
      error: opts.existingSplitsError ?? null,
    });
    chain.upsert = vi.fn(
      (
        payload: Array<{
          cycle_id: string;
          roommate_id: string;
          override_cents: number | null;
          override_percent: number | null;
          animal: string;
        }>,
        upsertOpts?: { onConflict?: string },
      ) => {
        recorded.upsertCalls.push({
          payload,
          onConflict: upsertOpts?.onConflict,
        });
        (chain as { _upsertPending?: boolean })._upsertPending = true;
        return chain;
      },
    );
    return chain;
  }

  function fromShareTokens() {
    // Two flows: delete (.delete().eq('cycle_id', ...))
    // and insert (.insert(rows).select('*'))
    let pendingInsertRows:
      | Array<{ token: string; cycle_id: string; roommate_id: string; expires_at: string }>
      | null = null;

    const chain: Record<string, unknown> = {};
    chain.delete = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn((_col: string, val: string) => {
      recorded.shareTokensDeletedFor.push(val);
      return Promise.resolve({ error: opts.deleteError ?? null });
    });
    chain.insert = vi.fn(
      (
        rows: Array<{
          token: string;
          cycle_id: string;
          roommate_id: string;
          expires_at: string;
        }>,
      ) => {
        pendingInsertRows = rows;
        recorded.insertedTokenRows.push(...rows);
        return chain;
      },
    );
    chain.select = vi.fn().mockImplementation(() => {
      if (pendingInsertRows) {
        const rows = pendingInsertRows;
        pendingInsertRows = null;
        return Promise.resolve({
          data: opts.insertError ? null : rows,
          error: opts.insertError ?? null,
        });
      }
      return chain;
    });
    return chain;
  }

  const from = vi.fn((table: string) => {
    switch (table) {
      case 'cycles':
        return fromCycles();
      case 'roommates':
        return fromRoommates();
      case 'cycle_splits':
        return fromCycleSplits();
      case 'share_tokens':
        return fromShareTokens();
      default:
        throw new Error(`unexpected table: ${table}`);
    }
  });

  return {
    client: { auth, from } as unknown as ReturnType<typeof createClient> extends Promise<
      infer T
    >
      ? T
      : never,
    recorded,
  };
}

// ---- helpers ----------------------------------------------------------------

function setStub(opts: ShareStubOptions = {}): Recorded {
  const { client, recorded } = makeSupabaseStub(opts);
  vi.mocked(createClient).mockResolvedValue(client);
  return recorded;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- tests ------------------------------------------------------------------

describe('generateShareLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T12:00:00.000Z'));
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://bills.example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_URL', '');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('throws when not authenticated', async () => {
    setStub({ user: null });
    await expect(generateShareLinks('cycle-1')).rejects.toThrow('Not authenticated');
  });

  it('throws when the cycle is not found', async () => {
    setStub({ cycle: null, cycleError: { message: 'Cycle not found' } });
    await expect(generateShareLinks('cycle-1')).rejects.toThrow('Cycle not found');
  });

  it('returns [] when no active roommates exist (no token mint, no upsert)', async () => {
    const recorded = setStub({ roommates: [] });

    const result = await generateShareLinks('cycle-1');

    expect(result).toEqual([]);
    expect(recorded.upsertCalls).toHaveLength(0);
    expect(recorded.insertedTokenRows).toHaveLength(0);
    // revalidatePath is only called after the work completes; early-return skips it.
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
  });

  it('happy path: inserts N token rows, picks N unique animals from POOL, returns N outputs', async () => {
    const roommates = [
      { id: 'r1', name: 'Ada', position: 0 },
      { id: 'r2', name: 'Bea', position: 1 },
      { id: 'r3', name: 'Cyd', position: 2 },
    ];
    const recorded = setStub({ roommates });

    const result = await generateShareLinks('cycle-1');

    // One ShareLinkOutput per roommate.
    expect(result).toHaveLength(roommates.length);
    expect(result.map((r) => r.roommateId)).toEqual(['r1', 'r2', 'r3']);
    expect(result.map((r) => r.name)).toEqual(['Ada', 'Bea', 'Cyd']);

    // Token rows: one per roommate, all distinct, each ~5 days out.
    expect(recorded.insertedTokenRows).toHaveLength(roommates.length);
    const expectedExpiry = new Date(Date.now() + 5 * DAY_MS).toISOString();
    for (const row of recorded.insertedTokenRows) {
      expect(row.cycle_id).toBe('cycle-1');
      expect(row.expires_at).toBe(expectedExpiry);
      expect(row.token).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    }
    const tokens = recorded.insertedTokenRows.map((r) => r.token);
    expect(new Set(tokens).size).toBe(tokens.length);

    // Animals: unique, all from POOL, persisted on cycle_splits via upsert.
    const animals = result.map((r) => r.animal);
    expect(new Set(animals).size).toBe(animals.length);
    for (const a of animals) {
      expect(POOL).toContain(a);
    }

    // Upsert payload uses onConflict on (cycle_id, roommate_id) and one row per roommate.
    expect(recorded.upsertCalls).toHaveLength(1);
    expect(recorded.upsertCalls[0]!.onConflict).toBe('cycle_id,roommate_id');
    expect(recorded.upsertCalls[0]!.payload).toHaveLength(roommates.length);
    for (const row of recorded.upsertCalls[0]!.payload) {
      expect(row.cycle_id).toBe('cycle-1');
      expect(POOL).toContain(row.animal);
      expect(row.override_cents).toBeNull();
      expect(row.override_percent).toBeNull();
    }

    // Output URLs use NEXT_PUBLIC_SITE_URL.
    for (const r of result) {
      expect(r.url).toBe(`https://bills.example.com/share/${r.token}`);
    }

    // amount_cents always 0; is_discounted false when no overrides.
    for (const r of result) {
      expect(r.amount_cents).toBe(0);
      expect(r.is_discounted).toBe(false);
    }

    // Revalidates the cycle path.
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/cycle/cycle-1');
  });

  it('preserves animals from existing splits and only assigns new animals to unset ones', async () => {
    const roommates = [
      { id: 'r1', name: 'Ada', position: 0 },
      { id: 'r2', name: 'Bea', position: 1 },
      { id: 'r3', name: 'Cyd', position: 2 },
    ];
    const existingSplits: ExistingSplit[] = [
      { roommate_id: 'r1', animal: 'panda', override_cents: null, override_percent: null },
      { roommate_id: 'r2', animal: null, override_cents: null, override_percent: null },
    ];
    const recorded = setStub({ roommates, existingSplits });

    const result = await generateShareLinks('cycle-1');

    // r1 keeps its panda.
    const r1 = result.find((r) => r.roommateId === 'r1')!;
    expect(r1.animal).toBe('panda');

    // r2 + r3 got fresh animals from the unreserved pool.
    const r2 = result.find((r) => r.roommateId === 'r2')!;
    const r3 = result.find((r) => r.roommateId === 'r3')!;
    expect(r2.animal).not.toBe('panda');
    expect(r3.animal).not.toBe('panda');
    expect(r2.animal).not.toBe(r3.animal);
    expect(POOL).toContain(r2.animal);
    expect(POOL).toContain(r3.animal);

    // Upsert carries forward the panda for r1 specifically.
    const upsertPayload = recorded.upsertCalls[0]!.payload;
    const upsertedR1 = upsertPayload.find((p) => p.roommate_id === 'r1')!;
    expect(upsertedR1.animal).toBe('panda');
  });

  it('preserves override_percent + override_cents from existing splits in upsert', async () => {
    const roommates = [{ id: 'r1', name: 'Ada', position: 0 }];
    const existingSplits: ExistingSplit[] = [
      {
        roommate_id: 'r1',
        animal: 'panda',
        override_cents: null,
        override_percent: 20,
      },
    ];
    const recorded = setStub({ roommates, existingSplits });

    const result = await generateShareLinks('cycle-1');

    expect(recorded.upsertCalls[0]!.payload[0]).toMatchObject({
      roommate_id: 'r1',
      override_percent: 20,
      override_cents: null,
    });
    // is_discounted reflects override_percent > 0.
    expect(result[0]!.is_discounted).toBe(true);
  });

  it('is_discounted is false when only override_cents is set (cents alone is not "discounted")', async () => {
    const roommates = [{ id: 'r1', name: 'Ada', position: 0 }];
    const existingSplits: ExistingSplit[] = [
      {
        roommate_id: 'r1',
        animal: 'panda',
        override_cents: 5000,
        override_percent: null,
      },
    ];
    setStub({ roommates, existingSplits });

    const result = await generateShareLinks('cycle-1');

    expect(result[0]!.is_discounted).toBe(false);
  });

  it('replays cleanly: deletes existing share_tokens for the cycle before inserting fresh ones', async () => {
    const roommates = [
      { id: 'r1', name: 'Ada', position: 0 },
      { id: 'r2', name: 'Bea', position: 1 },
    ];
    const recorded = setStub({ roommates });

    await generateShareLinks('cycle-1');

    // The delete must hit share_tokens for the right cycle, exactly once.
    expect(recorded.shareTokensDeletedFor).toEqual(['cycle-1']);
    // And new tokens were inserted afterwards.
    expect(recorded.insertedTokenRows).toHaveLength(roommates.length);
  });

  it('replay across two calls deletes the previous tokens each time', async () => {
    // First call.
    const roommates = [{ id: 'r1', name: 'Ada', position: 0 }];
    const recorded1 = setStub({ roommates });
    const first = await generateShareLinks('cycle-1');

    expect(recorded1.shareTokensDeletedFor).toEqual(['cycle-1']);
    expect(recorded1.insertedTokenRows).toHaveLength(1);

    // Second call (fresh stub — simulates a separate invocation).
    const recorded2 = setStub({ roommates });
    const second = await generateShareLinks('cycle-1');

    expect(recorded2.shareTokensDeletedFor).toEqual(['cycle-1']);
    expect(recorded2.insertedTokenRows).toHaveLength(1);

    // Tokens are freshly minted each call.
    expect(first[0]!.token).not.toBe(second[0]!.token);
  });

  it('handles >POOL.length roommates by allowing animal repeats from the full pool', async () => {
    const n = POOL.length + 2;
    const roommates = Array.from({ length: n }, (_, i) => ({
      id: `r${i}`,
      name: `Person ${i}`,
      position: i,
    }));
    setStub({ roommates });

    const result = await generateShareLinks('cycle-1');

    expect(result).toHaveLength(n);
    for (const r of result) {
      expect(POOL).toContain(r.animal);
    }
    // Cannot uniquely cover all n, so we expect at least one repeat.
    const uniq = new Set(result.map((r) => r.animal));
    expect(uniq.size).toBeLessThanOrEqual(POOL.length);
  });

  it('falls back to localhost URL when no env vars are set', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_URL', '');

    const roommates = [{ id: 'r1', name: 'Ada', position: 0 }];
    setStub({ roommates });

    const result = await generateShareLinks('cycle-1');
    expect(result[0]!.url).toMatch(/^http:\/\/localhost:3000\/share\/[A-Z0-9]{8}$/);
  });

  it('prefixes VERCEL_URL with https:// when it lacks a scheme', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_URL', 'preview-bills.vercel.app');

    const roommates = [{ id: 'r1', name: 'Ada', position: 0 }];
    setStub({ roommates });

    const result = await generateShareLinks('cycle-1');
    expect(result[0]!.url.startsWith('https://preview-bills.vercel.app/share/')).toBe(true);
  });

  it('strips trailing slash from NEXT_PUBLIC_SITE_URL', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://bills.example.com/');

    const roommates = [{ id: 'r1', name: 'Ada', position: 0 }];
    setStub({ roommates });

    const result = await generateShareLinks('cycle-1');
    expect(result[0]!.url).toBe(`https://bills.example.com/share/${result[0]!.token}`);
  });
});

describe('revokeShareLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when not authenticated', async () => {
    setStub({ user: null });
    await expect(revokeShareLinks('cycle-1')).rejects.toThrow('Not authenticated');
  });

  it('deletes all share_tokens for the cycle and revalidates the cycle path', async () => {
    const recorded = setStub();

    await revokeShareLinks('cycle-1');

    expect(recorded.shareTokensDeletedFor).toEqual(['cycle-1']);
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/cycle/cycle-1');
  });

  it('throws when the delete query errors', async () => {
    setStub({ deleteError: { message: 'rls denied' } });
    await expect(revokeShareLinks('cycle-1')).rejects.toThrow('rls denied');
  });
});
