'use client';

// src/components/EditorBody.tsx
// Client-side shell of the cycle editor. Holds bills/roommates/splits in
// React state so editing a bill amount or override recomputes the total
// locally on the same tick — no server round-trip required for the UI to
// react. Persistence still happens via server actions (saveBill,
// saveRoommate, setOverride, deleteBill, removeRoommate, attachPdf), fired
// inside useTransition; if any of those throw (e.g. placeholder Supabase
// creds while building locally), the optimistic UI stays put.

import { useMemo, useState, useTransition, useCallback, useRef, useEffect, type ReactNode } from 'react';

import BillCard from './BillCard';
import RoommateRow from './RoommateRow';
import SummaryBlock from './SummaryBlock';

import { computeSplit } from '@/lib/split';
import { generateMessage } from '@/lib/message';

import type {
  Bill,
  Cycle,
  CycleSplit,
  Roommate,
  RoommateSplit,
  ShareToken,
} from '@/lib/types';

import type { BillPatch } from '@/actions/bills';
import {
  attachPdf as attachPdfAction,
  deleteBill as deleteBillAction,
  saveBill as saveBillAction,
} from '@/actions/bills';
import {
  addRoommate as addRoommateAction,
  saveRoommate as saveRoommateAction,
  setOverride as setOverrideAction,
} from '@/actions/roommates';
import { generateShareLinks } from '@/actions/share';
import { formatCycleLabel } from '@/lib/format';

export interface EditorBodyProps {
  cycle: Cycle;
  initialBills: Bill[];
  initialRoommates: Roommate[];
  initialSplits: CycleSplit[];
  activeTokens: ShareToken[];
  /** When true, skips all server-action persistence — useful for /demo and tests. */
  demoMode?: boolean;
}

export default function EditorBody({
  cycle,
  initialBills,
  initialRoommates,
  initialSplits,
  activeTokens,
  demoMode = false,
}: EditorBodyProps): ReactNode {
  const [bills, setBills] = useState<Bill[]>(initialBills);
  const [roommates, setRoommates] = useState<Roommate[]>(initialRoommates);
  const [splits, setSplits] = useState<CycleSplit[]>(initialSplits);
  const [, startTransition] = useTransition();

  // Share URL per roommate — populated on first copy via generateShareLinks (which shortens via TinyURL).
  const [urlByRoommate, setUrlByRoommate] = useState<Map<string, string>>(new Map());
  const generatingRef = useRef(false);

  // Seed from server-provided active tokens so first copy already has the
  // link (preserves iOS user-gesture clipboard write). The seeded URL is the
  // long origin URL; we immediately fire generateShareLinks in parallel so
  // that a moment later urlByRoommate is upgraded to the TinyURL-shortened
  // version. Subsequent copies then use the short URL.
  useEffect(() => {
    if (demoMode) return;
    const base = window.location.origin;

    if (activeTokens.length > 0) {
      setUrlByRoommate((prev) => {
        const next = new Map(prev);
        for (const t of activeTokens) {
          if (!next.has(t.roommate_id)) {
            next.set(t.roommate_id, `${base}/share/${t.token}`);
          }
        }
        return next;
      });
    }

    // Background-fetch shortened URLs so the next Copy tap uses tinyurl.com
    // instead of the long origin URL. Skipped while another fetch is in
    // flight to avoid spamming the TinyURL quota when this mounts twice.
    if (generatingRef.current) return;
    generatingRef.current = true;
    generateShareLinks(cycle.id)
      .then((results) => {
        setUrlByRoommate((prev) => {
          const next = new Map(prev);
          for (const r of results) {
            if (r.url) next.set(r.roommateId, r.url);
          }
          return next;
        });
      })
      .catch((e) => console.error('generateShareLinks (mount) failed', e))
      .finally(() => { generatingRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- derived ---------------------------------------------------------------
  const totalCents = useMemo(
    () => bills.reduce((s, b) => s + (b.amount_cents || 0), 0),
    [bills],
  );

  const splitsByRoommate = useMemo(() => {
    const m = new Map<string, CycleSplit>();
    for (const s of splits) m.set(s.roommate_id, s);
    return m;
  }, [splits]);

  const computed = useMemo(
    () =>
      computeSplit(
        totalCents,
        roommates.map((r) => {
          const s = splitsByRoommate.get(r.id);
          return {
            id: r.id,
            override_cents: s?.override_cents ?? null,
            override_percent: s?.override_percent ?? null,
          };
        }),
      ),
    [totalCents, roommates, splitsByRoommate],
  );

  function splitForRoommate(r: Roommate): CycleSplit {
    const existing = splitsByRoommate.get(r.id);
    if (existing) return existing;
    return {
      cycle_id: cycle.id,
      roommate_id: r.id,
      override_cents: null,
      override_percent: null,
      animal: 'otter',
    };
  }

  const buildRoommateSplits = useCallback((): RoommateSplit[] => {
    return roommates.map((r) => {
      const s = splitsByRoommate.get(r.id);
      const cents = computed.perRoommate.find((p) => p.id === r.id)?.cents ?? 0;
      let override: RoommateSplit['override'] = null;
      if (s?.override_cents != null && s.override_cents > 0) {
        override = { kind: 'cents', cents: s.override_cents };
      } else if (s?.override_percent != null) {
        const saved = Math.max(0, computed.equalShareCents - cents);
        override = { kind: 'percent', percent: s.override_percent, saved_cents: saved };
      }
      return { roommate_id: r.id, name: r.name, cents, equal_share_cents: computed.equalShareCents, is_payer: false, override, tag: null };
    });
  }, [roommates, splitsByRoommate, computed]);

  const handleCopyMessage = useCallback((roommateId: string) => {
    if (demoMode) return;

    // Build message synchronously — must copy before any await to preserve
    // the iOS Safari user-gesture context (clipboard requires it).
    const roommateSplits = buildRoommateSplits();
    const target = roommateSplits.find((s) => s.roommate_id === roommateId);
    const existingUrl = urlByRoommate.get(roommateId);
    const message = generateMessage(cycle, bills, roommateSplits, target);
    const text = existingUrl ? `${message}\n\nBreakdown:\n${existingUrl}` : message;

    // Copy now, within the gesture tick.
    const doCopy = (str: string) => {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(str).catch(() => copyFallback(str));
      } else {
        copyFallback(str);
      }
    };
    const copyFallback = (str: string) => {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    };
    doCopy(text);

    // Haptic feedback on supported devices
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(8);
    }

    // Fetch share URL in background — populates cache so next copy includes it.
    if (!existingUrl && !generatingRef.current) {
      generatingRef.current = true;
      generateShareLinks(cycle.id)
        .then((results) => {
          const base = typeof window !== 'undefined' ? window.location.origin : '';
          setUrlByRoommate((prev) => {
            const next = new Map(prev);
            for (const r of results) next.set(r.roommateId, r.url || `${base}/share/${r.token}`);
            return next;
          });
        })
        .catch((e) => console.error('generateShareLinks failed', e))
        .finally(() => { generatingRef.current = false; });
    }
  }, [cycle, bills, urlByRoommate, buildRoommateSplits, demoMode]);

  // ---- handlers --------------------------------------------------------------

  function handleBillSave(billId: string, patch: Partial<Bill>) {
    setBills((prev) =>
      prev.map((b) => (b.id === billId ? { ...b, ...patch } : b)),
    );
    if (demoMode) return;
    startTransition(async () => {
      try {
        await saveBillAction(billId, patch as BillPatch);
      } catch (e) {
        console.error('saveBill failed', e);
      }
    });
  }

  function handleBillDelete(billId: string) {
    setBills((prev) => prev.filter((b) => b.id !== billId));
    if (demoMode) return;
    startTransition(async () => {
      try {
        await deleteBillAction(billId);
      } catch (e) {
        console.error('deleteBill failed', e);
      }
    });
  }

  function handleBillAttach(billId: string, file: File) {
    if (demoMode) {
      // In demo mode, just flip pdf_path locally so the button turns Rausch.
      setBills((prev) =>
        prev.map((b) =>
          b.id === billId
            ? { ...b, pdf_path: `demo/${billId}/${file.name}` }
            : b,
        ),
      );
      return;
    }
    startTransition(async () => {
      try {
        const updated = await attachPdfAction(billId, file);
        setBills((prev) =>
          prev.map((b) => (b.id === billId ? updated : b)),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('attachPdf failed', e);
        // Surface the failure so the user knows why nothing happened. Without
        // this an upload error (wrong storage bucket, RLS, 5MB limit, etc.)
        // silently dropped the PDF and the UI looked unchanged.
        window.alert(`Could not attach PDF: ${msg}`);
      }
    });
  }

  function handleRoommateSave(
    roommateId: string,
    patch: {
      name?: string;
      override_cents?: number | null;
      override_percent?: number | null;
    },
  ) {
    if (typeof patch.name === 'string') {
      const name = patch.name;
      setRoommates((prev) =>
        prev.map((r) => (r.id === roommateId ? { ...r, name } : r)),
      );
      if (!demoMode) {
        startTransition(async () => {
          try {
            await saveRoommateAction(roommateId, { name });
          } catch (e) {
            console.error('saveRoommate failed', e);
          }
        });
      }
    }
    if (
      patch.override_cents !== undefined ||
      patch.override_percent !== undefined
    ) {
      setSplits((prev) => {
        const has = prev.find((s) => s.roommate_id === roommateId);
        const next: CycleSplit = {
          cycle_id: cycle.id,
          roommate_id: roommateId,
          override_cents: patch.override_cents ?? has?.override_cents ?? null,
          override_percent:
            patch.override_percent !== undefined
              ? patch.override_percent
              : (has?.override_percent ?? null),
          animal: has?.animal ?? 'otter',
        };
        // Mutual exclusion: setting one clears the other.
        if (patch.override_cents !== undefined && patch.override_cents !== null) {
          next.override_percent = null;
        }
        if (
          patch.override_percent !== undefined &&
          patch.override_percent !== null
        ) {
          next.override_cents = null;
        }
        if (has) {
          return prev.map((s) =>
            s.roommate_id === roommateId ? next : s,
          );
        }
        return [...prev, next];
      });
      startTransition(async () => {
        if (demoMode) return;
        try {
          await setOverrideAction(cycle.id, roommateId, {
            override_cents: patch.override_cents,
            override_percent: patch.override_percent,
          });
        } catch (e) {
          console.error('setOverride failed', e);
        }
      });
    }
  }

  function handleRoommateAdd() {
    const name = window.prompt('Roommate name:');
    if (!name?.trim()) return;
    const optimistic: Roommate = {
      id: `temp-${Date.now()}`,
      user_id: cycle.id,
      name: name.trim(),
      position: roommates.length,
      archived_at: null,
    lease_end_date: null,
      created_at: new Date().toISOString(),
    };
    setRoommates((prev) => [...prev, optimistic]);
    if (demoMode) return;
    startTransition(async () => {
      try {
        const created = await addRoommateAction(name.trim());
        setRoommates((prev) =>
          prev.map((r) => (r.id === optimistic.id ? created : r)),
        );
      } catch (e) {
        console.error('addRoommate failed', e);
        setRoommates((prev) => prev.filter((r) => r.id !== optimistic.id));
      }
    });
  }

  // ---- render ----------------------------------------------------------------
  const monthName = formatCycleLabel(cycle.year, cycle.month).split(' ')[0];

  return (
    <>
      <div className="header">
        <h1>{monthName}</h1>
      </div>

      <div className="section">
        <div className="section-head">
          <div className="section-title">Bills</div>
          <button
            type="button"
            className="add-bill"
            disabled
            aria-disabled="true"
            aria-label="Add bill"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>

        {bills.map((bill) => (
          <BillCard
            key={bill.id}
            bill={bill}
            onSave={(patch) => handleBillSave(bill.id, patch)}
            onDelete={() => handleBillDelete(bill.id)}
            onAttachPdf={(file) => handleBillAttach(bill.id, file)}
          />
        ))}
      </div>

      <div className="section">
        <SummaryBlock
          totalCents={totalCents}
          perPersonCents={computed.equalShareCents}
        />
      </div>

      <div className="section">
        <div className="section-head">
          <div className="section-title">Roommates</div>
          <button
            type="button"
            className="add-roommate"
            onClick={handleRoommateAdd}
            aria-label="Add roommate"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>

        <div className="roommates-grid">
          {roommates.map((r) => {
            const owedCents =
              computed.perRoommate.find((p) => p.id === r.id)?.cents ?? 0;
            return (
              <RoommateRow
                key={r.id}
                roommate={r}
                split={splitForRoommate(r)}
                computedAmountCents={owedCents}
                onSave={(patch) => handleRoommateSave(r.id, patch)}
                onCopyMessage={() => { handleCopyMessage(r.id); }}
                isLandlord={r.name.toLowerCase() === 'johny'}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
