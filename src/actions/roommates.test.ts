// src/actions/roommates.test.ts
// Server-action tests for roommate CRUD + per-cycle override management.
// Supabase is mocked via a small fluent query-builder factory so each test
// can program the response per `.from(table)` call.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks -----------------------------------------------------------------

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

// Imported AFTER vi.mock so mocks are wired up.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  saveRoommate,
  addRoommate,
  removeRoommate,
  setOverride,
} from './roommates';

// ---- Fluent query-builder helper ------------------------------------------

/**
 * Build a chainable Supabase-like query builder. Every chainable verb
 * returns `this`; the terminal verbs (`single`, `maybeSingle`) resolve with
 * the configured `terminal` value. Methods that return a plain awaitable
 * (e.g. `update().eq(...)` without `.select()`) also resolve with `terminal`.
 *
 * `terminal` can be either a fixed value or a function that picks a value
 * based on a counter (lets us return different rows for repeated `.from()`
 * lookups in a single action call).
 */
type QBResult = { data: unknown; error: unknown };

function makeQB(terminal: QBResult | (() => QBResult)) {
  const get = () =>
    typeof terminal === 'function' ? (terminal as () => QBResult)() : terminal;

  const qb: Record<string, unknown> = {};
  const verbs = [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'is',
    'order',
    'limit',
  ];
  for (const v of verbs) {
    qb[v] = vi.fn(() => qb);
  }
  qb.single = vi.fn(async () => get());
  qb.maybeSingle = vi.fn(async () => get());
  // Make the builder itself thenable so `await supabase.from(...).update(...).eq(...)`
  // (no terminal verb) also resolves.
  qb.then = (resolve: (v: QBResult) => unknown) => Promise.resolve(get()).then(resolve);
  return qb as unknown as {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  };
}

// ---- Lifecycle -------------------------------------------------------------

beforeEach(() => {
  // Re-wire createClient since resetAllMocks() in afterEach clears its
  // implementation along with the call queues.
  vi.mocked(createClient).mockImplementation(
    async () =>
      ({
        auth: { getUser: mockGetUser },
        from: mockFrom,
      }) as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'me@example.com' } },
    error: null,
  });
});

afterEach(() => {
  // resetAllMocks (not clearAllMocks) also empties any pending
  // mockReturnValueOnce / mockImplementationOnce queues, so leftover stubs
  // from one test can't leak into the next.
  vi.resetAllMocks();
});

// ---- saveRoommate ----------------------------------------------------------

describe('saveRoommate', () => {
  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(saveRoommate('rm-1', { name: 'Ada' })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('updates name (trimmed) and returns the updated row', async () => {
    const row = {
      id: 'rm-1',
      user_id: 'user-1',
      name: 'Ada',
      position: 0,
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
    };
    const qb = makeQB({ data: row, error: null });
    mockFrom.mockReturnValueOnce(qb);

    const result = await saveRoommate('rm-1', { name: '  Ada  ' });

    expect(mockFrom).toHaveBeenCalledWith('roommates');
    expect(qb.update).toHaveBeenCalledWith({ name: 'Ada' });
    expect(qb.eq).toHaveBeenCalledWith('id', 'rm-1');
    expect(qb.select).toHaveBeenCalledWith('*');
    expect(qb.single).toHaveBeenCalled();
    expect(result).toEqual(row);
    expect(revalidatePath).toHaveBeenCalledWith('/cycle/current');
  });

  it('clamps position to a non-negative integer', async () => {
    const row = { id: 'rm-1', position: 0 };
    const qb = makeQB({ data: row, error: null });
    mockFrom.mockReturnValueOnce(qb);

    await saveRoommate('rm-1', { position: -3.7 });

    expect(qb.update).toHaveBeenCalledWith({ position: 0 });
  });

  it('truncates fractional positions', async () => {
    const row = { id: 'rm-1', position: 4 };
    const qb = makeQB({ data: row, error: null });
    mockFrom.mockReturnValueOnce(qb);

    await saveRoommate('rm-1', { position: 4.9 });

    expect(qb.update).toHaveBeenCalledWith({ position: 4 });
  });

  it('updates name and position together', async () => {
    const row = { id: 'rm-1', name: 'Bo', position: 2 };
    const qb = makeQB({ data: row, error: null });
    mockFrom.mockReturnValueOnce(qb);

    await saveRoommate('rm-1', { name: 'Bo', position: 2 });

    expect(qb.update).toHaveBeenCalledWith({ name: 'Bo', position: 2 });
  });

  it('does NOT issue an UPDATE when patch is empty (returns current row)', async () => {
    const row = { id: 'rm-1', name: 'unchanged' };
    const qb = makeQB({ data: row, error: null });
    mockFrom.mockReturnValueOnce(qb);

    const result = await saveRoommate('rm-1', {});

    expect(qb.update).not.toHaveBeenCalled();
    expect(qb.select).toHaveBeenCalledWith('*');
    expect(qb.eq).toHaveBeenCalledWith('id', 'rm-1');
    expect(qb.single).toHaveBeenCalled();
    expect(result).toEqual(row);
    // No-op path doesn't revalidate.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('throws on update error', async () => {
    const qb = makeQB({ data: null, error: { message: 'rls denied' } });
    mockFrom.mockReturnValueOnce(qb);
    await expect(saveRoommate('rm-1', { name: 'x' })).rejects.toThrow('rls denied');
  });
});

// ---- addRoommate -----------------------------------------------------------

describe('addRoommate', () => {
  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'no session' },
    });
    await expect(addRoommate('Ada')).rejects.toThrow('Not authenticated');
  });

  it('inserts at position 0 when there are no existing roommates', async () => {
    // First .from() call: tail lookup → empty array
    const tailQB = makeQB({ data: [], error: null });
    // Second .from() call: insert → new row
    const inserted = {
      id: 'rm-new',
      user_id: 'user-1',
      name: 'Ada',
      position: 0,
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
    };
    const insertQB = makeQB({ data: inserted, error: null });

    mockFrom.mockReturnValueOnce(tailQB).mockReturnValueOnce(insertQB);

    // The tail lookup uses .order().limit() and is awaited directly (no .single).
    // makeQB's then() handles that.
    tailQB.limit.mockImplementation(async () => ({ data: [], error: null }));

    const result = await addRoommate('  Ada  ');

    expect(mockFrom).toHaveBeenNthCalledWith(1, 'roommates');
    expect(tailQB.select).toHaveBeenCalledWith('position');
    expect(tailQB.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(tailQB.is).toHaveBeenCalledWith('archived_at', null);
    expect(tailQB.order).toHaveBeenCalledWith('position', { ascending: false });
    expect(tailQB.limit).toHaveBeenCalledWith(1);

    expect(mockFrom).toHaveBeenNthCalledWith(2, 'roommates');
    expect(insertQB.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'Ada',
      position: 0,
    });
    expect(result).toEqual(inserted);
    expect(revalidatePath).toHaveBeenCalledWith('/cycle/current');
  });

  it('inserts at next position (max+1) when others exist', async () => {
    const tailQB = makeQB({ data: [{ position: 4 }], error: null });
    tailQB.limit.mockImplementation(async () => ({
      data: [{ position: 4 }],
      error: null,
    }));
    const inserted = { id: 'rm-new', name: 'Bo', position: 5 };
    const insertQB = makeQB({ data: inserted, error: null });

    mockFrom.mockReturnValueOnce(tailQB).mockReturnValueOnce(insertQB);

    await addRoommate('Bo');

    expect(insertQB.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'Bo',
      position: 5,
    });
  });

  it('handles a tail row with null position by treating it as 0+1', async () => {
    const tailQB = makeQB({ data: [{ position: null }], error: null });
    tailQB.limit.mockImplementation(async () => ({
      data: [{ position: null }],
      error: null,
    }));
    const insertQB = makeQB({ data: { id: 'rm-new', position: 1 }, error: null });

    mockFrom.mockReturnValueOnce(tailQB).mockReturnValueOnce(insertQB);

    await addRoommate('Cy');

    expect(insertQB.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'Cy',
      position: 1,
    });
  });

  it('throws when the tail lookup fails', async () => {
    const tailQB = makeQB({ data: null, error: { message: 'tail boom' } });
    tailQB.limit.mockImplementation(async () => ({
      data: null,
      error: { message: 'tail boom' },
    }));
    mockFrom.mockReturnValueOnce(tailQB);

    await expect(addRoommate('Ada')).rejects.toThrow('tail boom');
  });

  it('throws on insert error', async () => {
    const tailQB = makeQB({ data: [], error: null });
    tailQB.limit.mockImplementation(async () => ({ data: [], error: null }));
    const insertQB = makeQB({ data: null, error: { message: 'insert boom' } });
    mockFrom.mockReturnValueOnce(tailQB).mockReturnValueOnce(insertQB);

    await expect(addRoommate('Ada')).rejects.toThrow('insert boom');
  });
});

// ---- removeRoommate --------------------------------------------------------

describe('removeRoommate', () => {
  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(removeRoommate('rm-1')).rejects.toThrow('Not authenticated');
  });

  it('soft-deletes by setting archived_at (NOT a hard delete)', async () => {
    const qb = makeQB({ data: null, error: null });
    // The terminal here is `.eq()` awaited directly (no select/single). The
    // builder's then() handles that.
    qb.eq.mockImplementation(async () => ({ data: null, error: null }));
    mockFrom.mockReturnValueOnce(qb);

    const before = Date.now();
    await removeRoommate('rm-1');
    const after = Date.now();

    expect(mockFrom).toHaveBeenCalledWith('roommates');
    expect(qb.delete).not.toHaveBeenCalled();
    expect(qb.update).toHaveBeenCalledTimes(1);

    const updateArg = qb.update.mock.calls[0][0] as { archived_at: string };
    expect(updateArg).toHaveProperty('archived_at');
    expect(typeof updateArg.archived_at).toBe('string');
    const ts = Date.parse(updateArg.archived_at);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);

    expect(qb.eq).toHaveBeenCalledWith('id', 'rm-1');
    expect(revalidatePath).toHaveBeenCalledWith('/cycle/current');
  });

  it('throws on update error', async () => {
    const qb = makeQB({ data: null, error: null });
    qb.eq.mockImplementation(async () => ({
      data: null,
      error: { message: 'archive boom' },
    }));
    mockFrom.mockReturnValueOnce(qb);
    await expect(removeRoommate('rm-1')).rejects.toThrow('archive boom');
  });
});

// ---- setOverride -----------------------------------------------------------

describe('setOverride', () => {
  // Helper: prime the two .from('cycle_splits') calls — the existing-row
  // lookup via maybeSingle, then the upsert via single.
  function primeSplit({
    existing,
    upserted,
    upsertError = null,
    existingError = null,
  }: {
    existing: unknown;
    upserted: unknown;
    upsertError?: unknown;
    existingError?: unknown;
  }) {
    const lookupQB = makeQB({ data: existing, error: existingError });
    const upsertQB = makeQB({ data: upserted, error: upsertError });
    mockFrom.mockReturnValueOnce(lookupQB).mockReturnValueOnce(upsertQB);
    return { lookupQB, upsertQB };
  }

  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(
      setOverride('cyc-1', 'rm-1', { override_cents: 1000 }),
    ).rejects.toThrow('Not authenticated');
  });

  it('upserts override_cents and clears override_percent (preserves existing animal)', async () => {
    const existing = {
      cycle_id: 'cyc-1',
      roommate_id: 'rm-1',
      override_cents: null,
      override_percent: null,
      animal: 'panda',
    };
    const upserted = { ...existing, override_cents: 2500, override_percent: null };
    const { lookupQB, upsertQB } = primeSplit({ existing, upserted });

    const result = await setOverride('cyc-1', 'rm-1', { override_cents: 2500 });

    // Lookup chain
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'cycle_splits');
    expect(lookupQB.select).toHaveBeenCalledWith('*');
    expect(lookupQB.eq).toHaveBeenCalledWith('cycle_id', 'cyc-1');
    expect(lookupQB.eq).toHaveBeenCalledWith('roommate_id', 'rm-1');
    expect(lookupQB.maybeSingle).toHaveBeenCalled();

    // Upsert chain
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'cycle_splits');
    expect(upsertQB.upsert).toHaveBeenCalledWith(
      {
        cycle_id: 'cyc-1',
        roommate_id: 'rm-1',
        override_cents: 2500,
        override_percent: null,
        animal: 'panda', // preserved
      },
      { onConflict: 'cycle_id,roommate_id' },
    );
    expect(result).toEqual(upserted);
    expect(revalidatePath).toHaveBeenCalledWith('/cycle/cyc-1');
  });

  it('upserts override_percent and clears override_cents', async () => {
    const upserted = {
      cycle_id: 'cyc-1',
      roommate_id: 'rm-1',
      override_cents: null,
      override_percent: 20,
      animal: 'bichon',
    };
    const { upsertQB } = primeSplit({ existing: null, upserted });

    await setOverride('cyc-1', 'rm-1', { override_percent: 20 });

    expect(upsertQB.upsert).toHaveBeenCalledWith(
      {
        cycle_id: 'cyc-1',
        roommate_id: 'rm-1',
        override_cents: null,
        override_percent: 20,
        animal: 'bichon', // POOL[0] default when no existing row
      },
      { onConflict: 'cycle_id,roommate_id' },
    );
  });

  it('passes both nulls through (clears any existing override)', async () => {
    const upserted = {
      cycle_id: 'cyc-1',
      roommate_id: 'rm-1',
      override_cents: null,
      override_percent: null,
      animal: 'doodle',
    };
    const { upsertQB } = primeSplit({
      existing: { animal: 'doodle' },
      upserted,
    });

    await setOverride('cyc-1', 'rm-1', {
      override_cents: null,
      override_percent: null,
    });

    expect(upsertQB.upsert).toHaveBeenCalledWith(
      {
        cycle_id: 'cyc-1',
        roommate_id: 'rm-1',
        override_cents: null,
        override_percent: null,
        animal: 'doodle',
      },
      { onConflict: 'cycle_id,roommate_id' },
    );
  });

  it('treats omitted override fields as null (also clears)', async () => {
    const upserted = {
      cycle_id: 'cyc-1',
      roommate_id: 'rm-1',
      override_cents: null,
      override_percent: null,
      animal: 'bichon',
    };
    const { upsertQB } = primeSplit({ existing: null, upserted });

    await setOverride('cyc-1', 'rm-1', {});

    expect(upsertQB.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        override_cents: null,
        override_percent: null,
      }),
      { onConflict: 'cycle_id,roommate_id' },
    );
  });

  it('throws when BOTH override_cents and override_percent are non-null', async () => {
    // No supabase calls past auth should happen — but the impl does call
    // .from() lazily; either way this throws synchronously after validation.
    await expect(
      setOverride('cyc-1', 'rm-1', { override_cents: 1000, override_percent: 20 }),
    ).rejects.toThrow('Only one of override_cents or override_percent can be set');

    expect(mockFrom).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([0, 100, -5, 150])(
    'throws when override_percent (%i) is out of 1..99 range',
    async (pct) => {
      await expect(
        setOverride('cyc-1', 'rm-1', { override_percent: pct }),
      ).rejects.toThrow('override_percent must be between 1 and 99');
      expect(mockFrom).not.toHaveBeenCalled();
    },
  );

  it('throws when override_cents is negative', async () => {
    await expect(
      setOverride('cyc-1', 'rm-1', { override_cents: -1 }),
    ).rejects.toThrow('override_cents must be non-negative');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('normalizes non-integer cents (truncates)', async () => {
    const upserted = {
      cycle_id: 'cyc-1',
      roommate_id: 'rm-1',
      override_cents: 1234,
      override_percent: null,
      animal: 'bichon',
    };
    const { upsertQB } = primeSplit({ existing: null, upserted });

    await setOverride('cyc-1', 'rm-1', { override_cents: 1234.9 });

    expect(upsertQB.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ override_cents: 1234 }),
      expect.anything(),
    );
  });

  it('normalizes Infinity / NaN to null (treated as "clear")', async () => {
    const upserted = {
      cycle_id: 'cyc-1',
      roommate_id: 'rm-1',
      override_cents: null,
      override_percent: null,
      animal: 'bichon',
    };
    const { upsertQB } = primeSplit({ existing: null, upserted });

    await setOverride('cyc-1', 'rm-1', {
      override_cents: Number.POSITIVE_INFINITY,
      override_percent: Number.NaN,
    });

    expect(upsertQB.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        override_cents: null,
        override_percent: null,
      }),
      expect.anything(),
    );
  });

  it('throws when the existing-row lookup errors', async () => {
    primeSplit({
      existing: null,
      upserted: null,
      existingError: { message: 'lookup boom' },
    });

    await expect(
      setOverride('cyc-1', 'rm-1', { override_cents: 100 }),
    ).rejects.toThrow('lookup boom');
  });

  it('throws on upsert error', async () => {
    primeSplit({
      existing: null,
      upserted: null,
      upsertError: { message: 'upsert boom' },
    });

    await expect(
      setOverride('cyc-1', 'rm-1', { override_cents: 100 }),
    ).rejects.toThrow('upsert boom');
  });
});
