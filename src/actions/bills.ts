'use server';

// src/actions/bills.ts

import { revalidatePath } from 'next/cache';
import type { Bill, BillKind, UUID } from '@/lib/types';
import { createServiceClient } from '@/lib/supabase/service';

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

export async function saveBill(
  billId: UUID | null | undefined,
  patch: BillPatch,
): Promise<Bill> {
  const supabase = createServiceClient();
  const trimmedPatch = stripUndefined(patch);

  if (billId) {
    const { cycle_id: _ignored, ...updatable } = trimmedPatch;
    void _ignored;

    const { data, error } = await supabase
      .from('bills')
      .update(updatable)
      .eq('id', billId)
      .select('*')
      .single();

    if (error || !data) throw new Error(error?.message ?? 'Failed to update bill');

    revalidatePath(`/cycle/${data.cycle_id}`);
    return data as Bill;
  }

  if (!trimmedPatch.cycle_id) throw new Error('cycle_id is required to create a bill');

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

  const { data, error } = await supabase.from('bills').insert(insert).select('*').single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to create bill');

  revalidatePath(`/cycle/${data.cycle_id}`);
  return data as Bill;
}

export async function addBill(
  cycleId: UUID,
  defaults: Partial<Omit<BillPatch, 'cycle_id'>> = {},
): Promise<Bill> {
  return saveBill(null, { ...defaults, cycle_id: cycleId });
}

export async function deleteBill(billId: UUID): Promise<void> {
  const supabase = createServiceClient();

  const { data: bill, error: lookupErr } = await supabase
    .from('bills')
    .select('id, cycle_id, pdf_path')
    .eq('id', billId)
    .maybeSingle();

  if (lookupErr) throw new Error(lookupErr.message);
  if (!bill) return;

  if (bill.pdf_path) {
    await supabase.storage.from('bills').remove([bill.pdf_path]);
  }

  const { error } = await supabase.from('bills').delete().eq('id', billId);
  if (error) throw new Error(error.message);

  revalidatePath(`/cycle/${bill.cycle_id}`);
}

export async function attachPdf(billId: UUID, file: File): Promise<Bill> {
  const supabase = createServiceClient();

  const { data: bill, error: lookupErr } = await supabase
    .from('bills')
    .select('id, cycle_id, pdf_path')
    .eq('id', billId)
    .single();

  if (lookupErr || !bill) throw new Error(lookupErr?.message ?? 'Bill not found');

  // Use the cycle's user_id for the storage path to stay consistent with
  // existing stored files.
  const { data: cycleRow } = await supabase
    .from('cycles')
    .select('user_id')
    .eq('id', bill.cycle_id)
    .single();

  const ownerId = cycleRow?.user_id ?? 'unknown';
  const path = `${ownerId}/${bill.cycle_id}/${bill.id}.pdf`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadErr } = await supabase.storage
    .from('bills')
    .upload(path, arrayBuffer, { contentType: file.type || 'application/pdf', upsert: true });

  if (uploadErr) throw new Error(uploadErr.message);

  const { data: updated, error: updateErr } = await supabase
    .from('bills')
    .update({ pdf_path: path })
    .eq('id', billId)
    .select('*')
    .single();

  if (updateErr || !updated) throw new Error(updateErr?.message ?? 'Failed to record pdf_path');

  revalidatePath(`/cycle/${updated.cycle_id}`);
  return updated as Bill;
}

function stripUndefined<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}
