'use server';

// src/app/(editor)/cycle/[id]/_actions.ts
// Placeholder server actions wired into the editor page until src/actions/*
// lands. Each one is a no-op that satisfies the prop contracts of BillCard,
// RoommateRow, etc. Replace these imports with the real actions in the next
// implementation pass — the call sites won't change.

import type { Bill } from '@/lib/types';

export async function noopBillSave(_patch: Partial<Bill>): Promise<void> {
  // intentional no-op
}

export async function noopBillDelete(): Promise<void> {
  // intentional no-op
}

export async function noopBillAttach(_file: File): Promise<void> {
  // intentional no-op
}

export async function noopRoommateSave(_patch: {
  name?: string;
  override_cents?: number | null;
  override_percent?: number | null;
}): Promise<void> {
  // intentional no-op
}

export async function noopRoommateDelete(): Promise<void> {
  // intentional no-op
}
