// src/actions/bills.test.ts
// Coverage for the bill CRUD + PDF attachment action surface. The Supabase
// server client is replaced with a hand-rolled fake whose chain methods are
// `vi.fn()` so individual tests can assert exact call shapes (e.g. that
// `attachPdf` uploads to `<user_id>/<cycle_id>/<bill_id>.pdf` and writes the
// resulting path back onto the bills row).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Bill } from '@/lib/types';

// ---- Mocks ------------------------------------------------------------------
//
// `vi.mock` calls are hoisted, so `createClient` becomes a vi.fn() before the
// SUT imports the module. Each test then re-points `createClient` at a fresh
// fake supabase instance via `mockResolvedValue`.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

import { addBill, attachPdf, deleteBill, saveBill } from './bills';

// ---- Test helpers -----------------------------------------------------------

const mockedCreateClient = vi.mocked(createClient);
const mockedRevalidatePath = vi.mocked(revalidatePath);

interface FakeUser {
  id: string;
}

interface MakeFakeOpts {
  user?: FakeUser | null;
  userError?: Error | null;
  /** Overrides the chain returned by `from('bills').<method>()`. */
  fromBuilder?: () => unknown;
  /** Overrides the chain returned by `storage.from('bills')`. */
  storageBuilder?: () => unknown;
}

/**
 * Hand-rolled Supabase fake. The default `from()` chain returns a builder
 * that's "smart enough" for most code paths — tests can also pass a custom
 * `fromBuilder` factory to install a fully bespoke chain (used heavily for
 * insert/update/select/maybeSingle assertions).
 */
function makeFakeSupabase(opts: MakeFakeOpts = {}) {
  const {
    user = { id: 'user-1' },
    userError = null,
    fromBuilder,
    storageBuilder,
  } = opts;

  const auth = {
    getUser: vi.fn().mockResolvedValue({
      data: { user },
      error: userError,
    }),
  };

  const from = vi.fn((_table: string) => {
    return fromBuilder ? fromBuilder() : defaultFromBuilder();
  });

  const storageFrom = vi.fn((_bucket: string) => {
    return storageBuilder ? storageBuilder() : defaultStorageBuilder();
  });

  const storage = { from: storageFrom };

  return { auth, from, storage } as const;
}

function defaultFromBuilder() {
  // A chain that resolves to no data so callers must override.
  const builder: any = {};
  builder.select = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn().mockResolvedValue({ data: null, error: null });
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  return builder;
}

function defaultStorageBuilder() {
  return {
    upload: vi.fn().mockResolvedValue({ data: { path: 'unused' }, error: null }),
    remove: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

/**
 * Resolved-value chain: every call resolves to the same `{data,error}`.
 * Useful when a test only cares about the final shape, not intermediates.
 */
function chain<T>(result: { data: T | null; error: Error | { message: string } | null }) {
  const builder: any = {};
  const ret = () => builder;
  builder.select = vi.fn(ret);
  builder.insert = vi.fn(ret);
  builder.update = vi.fn(ret);
  builder.delete = vi.fn(ret);
  builder.eq = vi.fn(ret);
  builder.single = vi.fn().mockResolvedValue(result);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  return builder;
}

const sampleBill: Bill = {
  id: 'bill-1',
  cycle_id: 'cycle-1',
  vendor: 'PG&E',
  provider: null,
  amount_cents: 12345,
  pdf_path: null,
  recurring: true,
  kind: 'electricity',
  position: 0,
  created_at: '2026-04-01T00:00:00.000Z',
};

// Minimal File polyfill — jsdom in older versions lacks `File.arrayBuffer`.
function makeFakeFile(opts: {
  size?: number;
  type?: string;
  name?: string;
} = {}): File {
  const { size = 1024, type = 'application/pdf', name = 'bill.pdf' } = opts;
  const buf = new ArrayBuffer(size);
  const file = {
    name,
    type,
    size,
    arrayBuffer: vi.fn().mockResolvedValue(buf),
  } as unknown as File;
  return file;
}

// ---- Tests ------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saveBill (update path)', () => {
  it('updates the bill row with the patch and revalidates the cycle path', async () => {
    const updated: Bill = { ...sampleBill, vendor: 'New Vendor' };

    let updateCall: { update?: unknown; eqArgs?: unknown[] } = {};
    const builder: any = {};
    builder.update = vi.fn((u: unknown) => {
      updateCall.update = u;
      return builder;
    });
    builder.eq = vi.fn((...args: unknown[]) => {
      updateCall.eqArgs = args;
      return builder;
    });
    builder.select = vi.fn(() => builder);
    builder.single = vi.fn().mockResolvedValue({ data: updated, error: null });

    const fake = makeFakeSupabase({ fromBuilder: () => builder });
    mockedCreateClient.mockResolvedValue(fake as never);

    const result = await saveBill('bill-1', { vendor: 'New Vendor' });

    expect(fake.from).toHaveBeenCalledWith('bills');
    expect(builder.update).toHaveBeenCalledWith({ vendor: 'New Vendor' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'bill-1');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(result).toEqual(updated);
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/cycle/cycle-1');
  });

  it('strips cycle_id from the update payload (cannot move bills across cycles)', async () => {
    const builder: any = {};
    let receivedUpdate: any;
    builder.update = vi.fn((u: any) => {
      receivedUpdate = u;
      return builder;
    });
    builder.eq = vi.fn(() => builder);
    builder.select = vi.fn(() => builder);
    builder.single = vi
      .fn()
      .mockResolvedValue({ data: sampleBill, error: null });

    mockedCreateClient.mockResolvedValue(
      makeFakeSupabase({ fromBuilder: () => builder }) as never,
    );

    await saveBill('bill-1', {
      cycle_id: 'cycle-EVIL',
      vendor: 'V',
      amount_cents: 5,
    });

    expect(receivedUpdate).not.toHaveProperty('cycle_id');
    expect(receivedUpdate).toEqual({ vendor: 'V', amount_cents: 5 });
  });

  it('strips undefined keys from the patch', async () => {
    const builder: any = {};
    let receivedUpdate: any;
    builder.update = vi.fn((u: any) => {
      receivedUpdate = u;
      return builder;
    });
    builder.eq = vi.fn(() => builder);
    builder.select = vi.fn(() => builder);
    builder.single = vi
      .fn()
      .mockResolvedValue({ data: sampleBill, error: null });

    mockedCreateClient.mockResolvedValue(
      makeFakeSupabase({ fromBuilder: () => builder }) as never,
    );

    await saveBill('bill-1', {
      vendor: 'X',
      provider: undefined,
      amount_cents: undefined,
      kind: undefined,
    });

    expect(receivedUpdate).toEqual({ vendor: 'X' });
  });

  it('throws when not authenticated', async () => {
    mockedCreateClient.mockResolvedValue(
      makeFakeSupabase({ user: null }) as never,
    );

    await expect(saveBill('bill-1', { vendor: 'X' })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('throws the supabase error message when update fails', async () => {
    const builder: any = chain({ data: null, error: { message: 'boom' } });
    mockedCreateClient.mockResolvedValue(
      makeFakeSupabase({ fromBuilder: () => builder }) as never,
    );

    await expect(saveBill('bill-1', { vendor: 'X' })).rejects.toThrow('boom');
  });

  it('throws default message when update returns no data and no error', async () => {
    const builder: any = chain({ data: null, error: null });
    mockedCreateClient.mockResolvedValue(
      makeFakeSupabase({ fromBuilder: () => builder }) as never,
    );

    await expect(saveBill('bill-1', { vendor: 'X' })).rejects.toThrow(
      'Failed to update bill',
    );
  });
});

describe('saveBill (insert path)', () => {
  it('inserts with sane defaults when no billId supplied', async () => {
    const inserted: Bill = { ...sampleBill, id: 'bill-new' };

    let receivedInsert: any;
    const builder: any = {};
    builder.insert = vi.fn((row: any) => {
      receivedInsert = row;
      return builder;
    });
    builder.select = vi.fn(() => builder);
    builder.single = vi.fn().mockResolvedValue({ data: inserted, error: null });

    mockedCreateClient.mockResolvedValue(
      makeFakeSupabase({ fromBuilder: () => builder }) as never,
    );

    const result = await saveBill(null, { cycle_id: 'cycle-1' });

    expect(receivedInsert).toEqual({
      cycle_id: 'cycle-1',
      vendor: '',
      provider: null,
      amount_cents: 0,
      kind: null,
      recurring: false,
      position: 0,
    });
    expect(result).toEqual(inserted);
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/cycle/cycle-1');
  });

  it('clamps amount_cents to a non-negative integer', async () => {
    let receivedInsert: any;
    const builder: any = {};
    builder.insert = vi.fn((row: any) => {
      receivedInsert = row;
      return builder;
    });
    builder.select = vi.fn(() => builder);
    builder.single = vi
      .fn()
      .mockResolvedValue({ data: sampleBill, error: null });

    mockedCreateClient.mockResolvedValue(
      makeFakeSupabase({ fromBuilder: () => builder }) as never,
    );

    await saveBill(null, {
      cycle_id: 'cycle-1',
      amount_cents: -50.9,
      position: -2.7,
    });

    expect(receivedInsert.amount_cents).toBe(0);
    expect(receivedInsert.position).toBe(0);
  });

  it('truncates positive non-integer amount_cents and position', async () => {
    let receivedInsert: any;
    const builder: any = {};
    builder.insert = vi.fn((row: any) => {
      receivedInsert = row;
      return builder;
    });
    builder.select = vi.fn(() => builder);
    builder.single = vi
      .fn()
      .mockResolvedValue({ data: sampleBill, error: null });

    mockedCreateClient.mockResolvedValue(
      makeFakeSupabase({ fromBuilder: () => builder }) as never,
    );

    await saveBill(null, {
      cycle_id: 'cycle-1',
      amount_cents: 123.9,
      position: 4.7,
    });

    expect(receivedInsert.amount_cents).toBe(123);
    expect(receivedInsert.position).toBe(4);
  });

  it('throws when cycle_id is missing on insert', async () => {
    mockedCreateClient.mockResolvedValue(makeFakeSupabase() as never);

    await expect(saveBill(null, { vendor: 'X' })).rejects.toThrow(
      'cycle_id is required to create a bill',
    );
  });
});

describe('addBill', () => {
  it('delegates to saveBill(null, { ...defaults, cycle_id })', async () => {
    let receivedInsert: any;
    const builder: any = {};
    builder.insert = vi.fn((row: any) => {
      receivedInsert = row;
      return builder;
    });
    builder.select = vi.fn(() => builder);
    builder.single = vi
      .fn()
      .mockResolvedValue({ data: sampleBill, error: null });

    mockedCreateClient.mockResolvedValue(
      makeFakeSupabase({ fromBuilder: () => builder }) as never,
    );

    const result = await addBill('cycle-1', {
      vendor: 'PG&E',
      kind: 'electricity',
      recurring: true,
    });

    expect(receivedInsert).toEqual({
      cycle_id: 'cycle-1',
      vendor: 'PG&E',
      provider: null,
      amount_cents: 0,
      kind: 'electricity',
      recurring: true,
      position: 0,
    });
    expect(result).toEqual(sampleBill);
  });

  it('inserts with empty defaults when none supplied', async () => {
    let receivedInsert: any;
    const builder: any = {};
    builder.insert = vi.fn((row: any) => {
      receivedInsert = row;
      return builder;
    });
    builder.select = vi.fn(() => builder);
    builder.single = vi
      .fn()
      .mockResolvedValue({ data: sampleBill, error: null });

    mockedCreateClient.mockResolvedValue(
      makeFakeSupabase({ fromBuilder: () => builder }) as never,
    );

    await addBill('cycle-1');

    expect(receivedInsert).toEqual({
      cycle_id: 'cycle-1',
      vendor: '',
      provider: null,
      amount_cents: 0,
      kind: null,
      recurring: false,
      position: 0,
    });
  });
});

describe('deleteBill', () => {
  it('removes the bill row, revalidates the cycle path, and skips storage when no pdf_path', async () => {
    let lookupBuilder: any;
    let deleteBuilder: any;
    let callIdx = 0;

    const fromBuilder = () => {
      callIdx += 1;
      if (callIdx === 1) {
        // Lookup chain: select().eq().maybeSingle()
        lookupBuilder = {};
        lookupBuilder.select = vi.fn(() => lookupBuilder);
        lookupBuilder.eq = vi.fn(() => lookupBuilder);
        lookupBuilder.maybeSingle = vi.fn().mockResolvedValue({
          data: { id: 'bill-1', cycle_id: 'cycle-1', pdf_path: null },
          error: null,
        });
        return lookupBuilder;
      }
      // Delete chain: delete().eq()
      deleteBuilder = {};
      deleteBuilder.delete = vi.fn(() => deleteBuilder);
      deleteBuilder.eq = vi.fn().mockResolvedValue({ error: null });
      return deleteBuilder;
    };

    const storageBuilder = vi.fn();
    const fake = makeFakeSupabase({
      fromBuilder,
      storageBuilder: () => ({
        upload: vi.fn(),
        remove: storageBuilder,
      }),
    });
    mockedCreateClient.mockResolvedValue(fake as never);

    await deleteBill('bill-1');

    expect(deleteBuilder.delete).toHaveBeenCalled();
    expect(deleteBuilder.eq).toHaveBeenCalledWith('id', 'bill-1');
    expect(storageBuilder).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/cycle/cycle-1');
  });

  it('removes the storage object when pdf_path is set, then deletes the row', async () => {
    let callIdx = 0;
    let deleteBuilder: any;

    const fromBuilder = () => {
      callIdx += 1;
      if (callIdx === 1) {
        const lookup: any = {};
        lookup.select = vi.fn(() => lookup);
        lookup.eq = vi.fn(() => lookup);
        lookup.maybeSingle = vi.fn().mockResolvedValue({
          data: {
            id: 'bill-1',
            cycle_id: 'cycle-1',
            pdf_path: 'user-1/cycle-1/bill-1.pdf',
          },
          error: null,
        });
        return lookup;
      }
      deleteBuilder = {};
      deleteBuilder.delete = vi.fn(() => deleteBuilder);
      deleteBuilder.eq = vi.fn().mockResolvedValue({ error: null });
      return deleteBuilder;
    };

    const remove = vi.fn().mockResolvedValue({ data: null, error: null });
    const fake = makeFakeSupabase({
      fromBuilder,
      storageBuilder: () => ({ upload: vi.fn(), remove }),
    });
    mockedCreateClient.mockResolvedValue(fake as never);

    await deleteBill('bill-1');

    expect(fake.storage.from).toHaveBeenCalledWith('bills');
    expect(remove).toHaveBeenCalledWith(['user-1/cycle-1/bill-1.pdf']);
    expect(deleteBuilder.delete).toHaveBeenCalled();
  });

  it('returns silently when the bill row is missing', async () => {
    const lookup: any = {};
    lookup.select = vi.fn(() => lookup);
    lookup.eq = vi.fn(() => lookup);
    lookup.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

    const fromBuilder = vi.fn(() => lookup);
    const fake = makeFakeSupabase({ fromBuilder });
    mockedCreateClient.mockResolvedValue(fake as never);

    await expect(deleteBill('missing')).resolves.toBeUndefined();
    // Only one .from() call (the lookup) — no delete chain.
    expect(fake.from).toHaveBeenCalledTimes(1);
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it('throws when not authenticated', async () => {
    mockedCreateClient.mockResolvedValue(
      makeFakeSupabase({ user: null }) as never,
    );

    await expect(deleteBill('bill-1')).rejects.toThrow('Not authenticated');
  });
});

// ---- attachPdf — the focus of this test file -------------------------------

describe('attachPdf', () => {
  /**
   * Helper: build a fake supabase wired up for attachPdf's three trips:
   *   1) from('bills').select(...).eq('id', billId).single()  → bill lookup
   *   2) storage.from('bills').upload(path, buf, opts)         → upload
   *   3) from('bills').update({pdf_path}).eq('id',billId).select('*').single()
   *      → final patch
   */
  function wireAttachPdf(opts: {
    user?: FakeUser | null;
    billLookup?: { data: any; error: any };
    upload?: { data: any; error: any };
    update?: { data: any; error: any };
  }) {
    const billLookup = opts.billLookup ?? {
      data: { id: 'bill-1', cycle_id: 'cycle-1', pdf_path: null },
      error: null,
    };
    const upload = opts.upload ?? {
      data: { path: 'user-1/cycle-1/bill-1.pdf' },
      error: null,
    };
    const update = opts.update ?? {
      data: { ...sampleBill, pdf_path: 'user-1/cycle-1/bill-1.pdf' },
      error: null,
    };

    const lookupBuilder: any = {};
    lookupBuilder.select = vi.fn(() => lookupBuilder);
    lookupBuilder.eq = vi.fn(() => lookupBuilder);
    lookupBuilder.single = vi.fn().mockResolvedValue(billLookup);

    let updateReceived: any = null;
    let updateEq: any[] = [];
    const updateBuilder: any = {};
    updateBuilder.update = vi.fn((u: any) => {
      updateReceived = u;
      return updateBuilder;
    });
    updateBuilder.eq = vi.fn((...args: any[]) => {
      updateEq = args;
      return updateBuilder;
    });
    updateBuilder.select = vi.fn(() => updateBuilder);
    updateBuilder.single = vi.fn().mockResolvedValue(update);

    let callIdx = 0;
    const fromBuilder = () => {
      callIdx += 1;
      return callIdx === 1 ? lookupBuilder : updateBuilder;
    };

    const uploadFn = vi.fn().mockResolvedValue(upload);
    const remove = vi.fn();
    const storageBuilder = () => ({ upload: uploadFn, remove });

    const fake = makeFakeSupabase({
      user: opts.user === undefined ? { id: 'user-1' } : opts.user,
      fromBuilder,
      storageBuilder,
    });

    return {
      fake,
      uploadFn,
      lookupBuilder,
      updateBuilder,
      get updateReceived() {
        return updateReceived;
      },
      get updateEq() {
        return updateEq;
      },
    };
  }

  it('uploads the file to <user_id>/<cycle_id>/<bill_id>.pdf and updates pdf_path', async () => {
    const wired = wireAttachPdf({});
    mockedCreateClient.mockResolvedValue(wired.fake as never);

    const file = makeFakeFile({ type: 'application/pdf' });
    const result = await attachPdf('bill-1', file);

    // Storage upload was called with the canonical path, the ArrayBuffer
    // bytes from `file.arrayBuffer()`, and `{contentType, upsert: true}`.
    expect(wired.fake.storage.from).toHaveBeenCalledWith('bills');
    expect(wired.uploadFn).toHaveBeenCalledTimes(1);
    const [path, body, options] = wired.uploadFn.mock.calls[0];
    expect(path).toBe('user-1/cycle-1/bill-1.pdf');
    expect(body).toBeInstanceOf(ArrayBuffer);
    expect(options).toEqual({
      contentType: 'application/pdf',
      upsert: true,
    });

    // The bill row was updated with the storage path.
    expect(wired.updateReceived).toEqual({
      pdf_path: 'user-1/cycle-1/bill-1.pdf',
    });
    expect(wired.updateEq).toEqual(['id', 'bill-1']);

    // Returned the updated bill row.
    expect(result).toEqual({
      ...sampleBill,
      pdf_path: 'user-1/cycle-1/bill-1.pdf',
    });

    // Revalidated the cycle path.
    expect(mockedRevalidatePath).toHaveBeenCalledWith('/cycle/cycle-1');
  });

  it('falls back to application/pdf when file.type is empty', async () => {
    const wired = wireAttachPdf({});
    mockedCreateClient.mockResolvedValue(wired.fake as never);

    const file = makeFakeFile({ type: '' });
    await attachPdf('bill-1', file);

    const [, , options] = wired.uploadFn.mock.calls[0];
    expect(options.contentType).toBe('application/pdf');
  });

  it('throws "Not authenticated" when there is no session', async () => {
    const wired = wireAttachPdf({ user: null });
    mockedCreateClient.mockResolvedValue(wired.fake as never);

    const file = makeFakeFile();
    await expect(attachPdf('bill-1', file)).rejects.toThrow('Not authenticated');

    // No storage I/O when auth fails.
    expect(wired.uploadFn).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it('throws "Bill not found" when the lookup returns no row', async () => {
    const wired = wireAttachPdf({
      billLookup: { data: null, error: null },
    });
    mockedCreateClient.mockResolvedValue(wired.fake as never);

    const file = makeFakeFile();
    await expect(attachPdf('missing', file)).rejects.toThrow('Bill not found');

    // Did not attempt to upload or update.
    expect(wired.uploadFn).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it('bubbles up the lookup error message', async () => {
    const wired = wireAttachPdf({
      billLookup: { data: null, error: { message: 'rls denied' } },
    });
    mockedCreateClient.mockResolvedValue(wired.fake as never);

    await expect(attachPdf('bill-1', makeFakeFile())).rejects.toThrow(
      'rls denied',
    );
    expect(wired.uploadFn).not.toHaveBeenCalled();
  });

  it('bubbles up storage upload errors and does NOT update the row', async () => {
    const wired = wireAttachPdf({
      upload: { data: null, error: { message: 'storage exploded' } },
    });
    mockedCreateClient.mockResolvedValue(wired.fake as never);

    const file = makeFakeFile();
    await expect(attachPdf('bill-1', file)).rejects.toThrow('storage exploded');

    // Update step was never reached.
    expect(wired.updateBuilder.update).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it('throws when the post-upload row update fails', async () => {
    const wired = wireAttachPdf({
      update: { data: null, error: { message: 'cannot persist path' } },
    });
    mockedCreateClient.mockResolvedValue(wired.fake as never);

    await expect(attachPdf('bill-1', makeFakeFile())).rejects.toThrow(
      'cannot persist path',
    );
  });

  it('throws "Failed to record pdf_path" when update returns no data and no error', async () => {
    const wired = wireAttachPdf({
      update: { data: null, error: null },
    });
    mockedCreateClient.mockResolvedValue(wired.fake as never);

    await expect(attachPdf('bill-1', makeFakeFile())).rejects.toThrow(
      'Failed to record pdf_path',
    );
  });

  it('passes a large (25 MB) file through unchanged — no client-side size limit', async () => {
    const wired = wireAttachPdf({});
    mockedCreateClient.mockResolvedValue(wired.fake as never);

    const TWENTY_FIVE_MB = 25 * 1024 * 1024;
    const file = makeFakeFile({ size: TWENTY_FIVE_MB, type: 'application/pdf' });

    await expect(attachPdf('bill-1', file)).resolves.toBeTruthy();

    const [, body, options] = wired.uploadFn.mock.calls[0];
    expect(body).toBeInstanceOf(ArrayBuffer);
    expect((body as ArrayBuffer).byteLength).toBe(TWENTY_FIVE_MB);
    expect(options.upsert).toBe(true);
  });

  // Behaviour-documenting test: the implementation does NOT validate the MIME
  // type. A PNG (or any other non-PDF) is uploaded as-is and the storage path
  // still ends in `.pdf` (because the path is built from bill.id, not from the
  // file extension). If we ever add client-side mime guarding, this test
  // should flip to expect a thrown error.
  it('does NOT reject mismatched mime types — uploads PNG bytes with image/png contentType', async () => {
    const wired = wireAttachPdf({});
    mockedCreateClient.mockResolvedValue(wired.fake as never);

    const file = makeFakeFile({
      type: 'image/png',
      name: 'screenshot.png',
      size: 256,
    });

    await expect(attachPdf('bill-1', file)).resolves.toBeTruthy();

    const [path, , options] = wired.uploadFn.mock.calls[0];
    // Path is built from bill ids — extension is hard-coded `.pdf`.
    expect(path).toBe('user-1/cycle-1/bill-1.pdf');
    // contentType reflects the file's actual mime, not the extension.
    expect(options.contentType).toBe('image/png');
    expect(options.upsert).toBe(true);
  });
});
