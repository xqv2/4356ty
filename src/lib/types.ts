// src/lib/types.ts
// Shared types for the Bills app. Mirrors Postgres tables 1:1 plus the
// computed view-models used by the editor and share pages.

export type UUID = string;

/** Bill kind drives the icon + a few heuristics. `'custom'` is used for
 *  user-typed vendors that don't map to one of the four known kinds. */
export type BillKind =
  | 'electricity'
  | 'water'
  | 'trash'
  | 'internet'
  | 'custom';

export const BILL_KINDS: readonly BillKind[] = [
  'electricity',
  'water',
  'trash',
  'internet',
  'custom',
] as const;

/** Animal pool used on the per-roommate share page. */
export type AnimalKey =
  | 'bichon'
  | 'doodle'
  | 'duck'
  | 'lamb'
  | 'otter'
  | 'panda'
  | 'pomeranian'
  | 'samoyed'
  | 'sea-bunny'
  | 'seahorse'
  | 'seal'
  | 'wheaten';

// ---- DB row types -----------------------------------------------------------

export interface Cycle {
  id: UUID;
  user_id: UUID;
  label: string;
  year: number;
  month: number; // 1..12
  created_at: string; // ISO timestamp
}

export interface Bill {
  id: UUID;
  cycle_id: UUID;
  vendor: string;
  provider: string | null;
  amount_cents: number;
  pdf_path: string | null;
  recurring: boolean;
  kind: BillKind | null;
  position: number;
  created_at: string;
}

export interface Roommate {
  id: UUID;
  user_id: UUID;
  name: string;
  position: number;
  archived_at: string | null;
  created_at: string;
}

/** One row per (cycle, roommate). At most one of `override_*` is set. */
export interface CycleSplit {
  cycle_id: UUID;
  roommate_id: UUID;
  override_cents: number | null;
  override_percent: number | null; // 1..99
  animal: AnimalKey;
}

export interface ShareToken {
  token: string; // 8-char id, also primary key
  cycle_id: UUID;
  roommate_id: UUID;
  expires_at: string; // ISO
  created_at: string;
}

// ---- View-models ------------------------------------------------------------

/** What the editor + message preview render for a single roommate. */
export interface RoommateSplit {
  roommate_id: UUID;
  name: string;
  cents: number; // what they owe
  equal_share_cents: number; // baseline equal share (used for "you save")
  is_payer: boolean; // bill payer absorbs override differences
  override:
    | { kind: 'cents'; cents: number }
    | { kind: 'percent'; percent: number; saved_cents: number }
    | null;
  tag: 'landlord' | null;
}

/** Aggregate result of computeSplit(). */
export interface ComputedSplit {
  perRoommate: Array<{ id: UUID; cents: number }>;
  equalShareCents: number;
  totalCollectedCents: number;
}

/** Result row from `generateShareLinks` server action. */
export interface ShareLinkOutput {
  roommateId: UUID;
  name: string;
  token: string;
  url: string;
  animal: AnimalKey;
  amount_cents: number;
  is_discounted: boolean;
}

/** Result helper used by every server action. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
