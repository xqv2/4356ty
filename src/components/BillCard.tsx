'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
} from 'react';
import type { Bill, BillKind } from '@/lib/types';
import { formatMoney, parseAmountToCents } from '@/lib/format';
import PdfButton from './PdfButton';

export interface BillCardProps {
  bill: Bill;
  onSave: (patch: Partial<Bill>) => void;
  onDelete: () => void;
  onAttachPdf: (file: File) => void;
}

const KNOWN_KINDS: ReadonlyArray<BillKind> = [
  'electricity',
  'water',
  'trash',
  'internet',
];

const DEBOUNCE_MS = 400;

/** Pick the icon path for a bill kind; fall back to a generic icon. */
function iconPathForKind(kind: BillKind | null): string {
  if (kind && (KNOWN_KINDS as readonly string[]).includes(kind)) {
    return `/icons/${kind}.png`;
  }
  return '/icons/electricity.png';
}

/** Best-effort kind inference from a vendor string when kind is null. */
function inferKindFromVendor(vendor: string): BillKind | null {
  const v = vendor.trim().toLowerCase();
  if (!v) return null;
  if (v.includes('electric') || v.includes('power') || v.includes('pg&e')) {
    return 'electricity';
  }
  if (v.includes('water')) return 'water';
  if (v.includes('trash') || v.includes('garbage') || v.includes('recology')) {
    return 'trash';
  }
  if (v.includes('internet') || v.includes('wifi') || v.includes('sonic') || v.includes('comcast')) {
    return 'internet';
  }
  return null;
}

export default function BillCard({
  bill,
  onSave,
  onDelete,
  onAttachPdf,
}: BillCardProps) {
  const [vendor, setVendor] = useState(bill.vendor);
  const [provider, setProvider] = useState(bill.provider ?? '');
  const [amountText, setAmountText] = useState(
    bill.amount_cents > 0 ? formatMoney(bill.amount_cents) : '',
  );
  const [amountFocused, setAmountFocused] = useState(false);

  // Track previous bill id so we re-sync local state when the row swaps.
  const prevIdRef = useRef(bill.id);
  useEffect(() => {
    if (prevIdRef.current !== bill.id) {
      prevIdRef.current = bill.id;
      setVendor(bill.vendor);
      setProvider(bill.provider ?? '');
      setAmountText(bill.amount_cents > 0 ? formatMoney(bill.amount_cents) : '');
    }
  }, [bill.id, bill.vendor, bill.provider, bill.amount_cents]);

  // Debounced save plumbing — one timer per field so multiple edits coalesce.
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<Partial<Bill>>({});

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (Object.keys(patch).length > 0) {
      saveRef.current(patch);
    }
  }, []);

  const queueSave = useCallback((patch: Partial<Bill>) => {
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const next = pendingPatchRef.current;
      pendingPatchRef.current = {};
      if (Object.keys(next).length > 0) {
        saveRef.current(next);
      }
    }, DEBOUNCE_MS);
  }, []);

  // Flush any pending edits on unmount so debounced typing isn't lost.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const patch = pendingPatchRef.current;
      pendingPatchRef.current = {};
      if (Object.keys(patch).length > 0) {
        saveRef.current(patch);
      }
    };
  }, []);

  const handleVendorChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setVendor(next);
    const patch: Partial<Bill> = { vendor: next };
    // Re-infer kind only when the row hasn't been pinned to a custom kind.
    if (bill.kind == null || (KNOWN_KINDS as readonly string[]).includes(bill.kind)) {
      const inferred = inferKindFromVendor(next);
      if (inferred && inferred !== bill.kind) {
        patch.kind = inferred;
      }
    }
    queueSave(patch);
  };

  const handleProviderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setProvider(next);
    queueSave({ provider: next.trim() === '' ? null : next });
  };

  const handleAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setAmountText(next);
    queueSave({ amount_cents: parseAmountToCents(next) });
  };

  const handleAmountFocus = () => {
    setAmountFocused(true);
  };

  const handleAmountBlur = (_e: FocusEvent<HTMLInputElement>) => {
    setAmountFocused(false);
    const cents = parseAmountToCents(amountText);
    // Pretty-print on blur — "$285.00" instead of leaving "285" or "$285".
    setAmountText(cents > 0 ? formatMoney(cents) : '');
    flush();
  };

  const handleVendorBlur = () => flush();
  const handleProviderBlur = () => flush();

  const iconSrc = iconPathForKind(bill.kind);
  const iconAlt = bill.vendor || 'Bill';

  return (
    <div className="bill-card">
      <div className="bill-icon">
        <img src={iconSrc} alt={iconAlt} />
      </div>
      <div className="bill-info">
        <input
          className="bill-vendor-edit"
          type="text"
          value={vendor}
          onChange={handleVendorChange}
          onBlur={handleVendorBlur}
          placeholder="Vendor"
          aria-label="Vendor"
        />
        <input
          className="bill-meta-edit"
          type="text"
          value={provider}
          onChange={handleProviderChange}
          onBlur={handleProviderBlur}
          placeholder="Provider"
          aria-label="Provider"
        />
      </div>
      <div className="row-end">
        <PdfButton attached={Boolean(bill.pdf_path)} onUpload={onAttachPdf} />
        <input
          className={amountFocused ? 'bill-amount-input is-focused' : 'bill-amount-input'}
          type="text"
          inputMode="decimal"
          value={amountText}
          onChange={handleAmountChange}
          onFocus={handleAmountFocus}
          onBlur={handleAmountBlur}
          placeholder="$0.00"
          aria-label="Amount"
        />
        <button
          type="button"
          className="row-delete"
          onClick={onDelete}
          aria-label="Delete bill"
          title="Delete bill"
        >
          ×
        </button>
      </div>
    </div>
  );
}
