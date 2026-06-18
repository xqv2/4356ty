'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@/lib/format';

const DURATION_MS = 600;

// Cubic ease-out — fast at the start, settles at the end. The Apple-y feel.
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export interface AnimatedAmountProps {
  /** Target value in cents. */
  cents: number;
  className?: string;
  /** When true, animate from 0 on first paint. Defaults to true. */
  countFromZero?: boolean;
}

export default function AnimatedAmount({
  cents,
  className,
  countFromZero = true,
}: AnimatedAmountProps) {
  const [display, setDisplay] = useState(countFromZero ? 0 : cents);
  const rafRef = useRef<number | null>(null);
  const displayRef = useRef(display);
  displayRef.current = display;

  useEffect(() => {
    const from = displayRef.current;
    const to = cents;
    if (from === to) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const value = Math.round(from + (to - from) * easeOut(t));
      setDisplay(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [cents]);

  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {formatMoney(display)}
    </span>
  );
}
