'use server';

// src/actions/bills.ts
// Bill CRUD + PDF attachment. RLS scopes everything via the cycle's owner.

import { revalidatePath } from 'next/cache';

import type { Bill, BillKind, UUID } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';

/** Patch shape accepted by saveBill — every field is optional. */
export interface BillPatch {
  cycle_id?: UUID;
  vendor?: string;
  provider?: string | null;
  amount_cents?: number;
  pdf_path?: string | null;
  recurring?: boolean;
  kind?: BillKind | null;
  position?: number;
}

/**
 * Upsert pattern: when `billId` is null/undefined we insert a new row using
 * `patch.cycle_id`; otherwise we update the existing row in place. RLS
 * enforces ownership via the joined cycle row.
 */
export async function saveBill(
  billId: UUID | null | undefined,
  patch: BillPatch,
): Promise<Bill> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('Not authenticated');

  const trimmedPatch = stripUndefined(patch);

  if (billId) {
    // Strip cycle_id from updates — moving a bill across cycles isn't a
    // supported operation through this entry point.
    const { cycle_id: _ignored, ...updatable } = trimmedPatch;
    void _ignored;

    const { data, error } = await supabase
      .from('bills')
      .update(updatable)
      .eq('id', billId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to update bill');
    }

    revalidatePath(`/cycle/${data.cycle_id}`);
    return data as Bill;
  }

  // Insert path requires a cycle_id and a vendor.
  if (!trimmedPatch.cycle_id) {
    throw new Error('cycle_id is required to create a bill');
  }
  const insert = {
    cycle_id: trimmedPatch.cycle_id,
    vendor: trimmedPatch.vendor ?? '',
    provider: trimmedPatch.provider ?? null,
    amount_cents:
      typeof trimmedPatch.amount_cents === 'number'
        ? Math.max(0, Math.trunc(trimmedPatch.amount_cents))
        : 0,
    kind: trimmedPatch.kind ?? null,
    recurring: trimmedPatch.recurring ?? false,
    position:
      typeof trimmedPatch.position === 'number'
        ? Math.max(0, Math.trunc(trimmedPatch.position))
        : 0,
  };

  const { data, error } = await supabase
    .from('bills')
    .insert(insert)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create bill');
  }

  revalidatePath(`/cycle/${data.cycle_id}`);
  return data as Bill;
}

/**
 * Insert a new bill into a cycle with optional defaults. Returns the row.
 */
export async function addBill(
  cycleId: UUID,
  defaults: Partial<Omit<BillPatch, 'cycle_id'>> = {},
): Promise<Bill> {
  return saveBill(null, { ...defaults, cycle_id: cycleId });
}

/** Delete a bill by id. RLS prevents touching other users' rows. */
export async function deleteBill(billId: UUID): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('Not authenticated');

  // Look up the cycle_id first so we can revalidate the right path AND so we
  // can clean up any storage object attached to this bill.
  const { data: bill, error: lookupErr } = await supabase
    .from('bills')
    .select('id, cycle_id, pdf_path')
    .eq('id', billId)
    .maybeSingle();

  if (lookupErr) throw new Error(lookupErr.message);
  if (!bill) return;

  if (bill.pdf_path) {
    // Best-effort: ignore storage deletion errors so the row delete still wins.
    await supabase.storage.from('bills').remove([bill.pdf_path]);
  }

  const { error } = await supabase.from('bills').delete().eq('id', billId);
  if (error) throw new Error(error.message);

  revalidatePath(`/cycle/${bill.cycle_id}`);
}

/**
 * Upload a PDF for a bill. The file is stored at
 *   `<user_id>/<cycle_id>/<bill_id>.pdf`
 * inside the private `bills` bucket. The resulting `pdf_path` is written
 * back onto the bill row.
 */
export async function attachPdf(billId: UUID, file: File): Promise<Bill> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('Not authenticated');

  // Verify ownership + grab cycle_id to build the storage key.
  const { data: bill, error: lookupErr } = await supabase
    .from('bills')
    .select('id, cycle_id, pdf_path')
    .eq('id', billId)
    .single();

  if (lookupErr || !bill) {
    throw new Error(lookupErr?.message ?? 'Bill not found');
  }

  const path = `${user.id}/${bill.cycle_id}/${bill.id}.pdf`;

  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadErr } = await supabase.storage
    .from('bills')
    .upload(path, arrayBuffer, {
      contentType: file.type || 'application/pdf',
      upsert: true,
    });

  if (uploadErr) throw new Error(uploadErr.message);

  const { data: updated, error: updateErr } = await supabase
    .from('bills')
    .update({ pdf_path: path })
    .eq('id', billId)
    .select('*')
    .single();

  if (updateErr || !updated) {
    throw new Error(updateErr?.message ?? 'Failed to record pdf_path');
  }

  revalidatePath(`/cycle/${updated.cycle_id}`);
  return updated as Bill;
}

// ---- helpers ----------------------------------------------------------------

function stripUndefined<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}
