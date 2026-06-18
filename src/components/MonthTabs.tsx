'use client';

// src/components/MonthTabs.tsx
// Horizontal-scrollable month tabs shown at the top of the editor shell.
// Mirrors mockups/screens/5-filled.html exactly:
//   <nav class="month-tabs">
//     <button class="tab-arrow">‹</button>
//     <a class="tab" href="...">OCT</a>
//     <a class="tab" href="...">NOV</a>
//     <a class="tab" href="...">DEC</a>
//     <span class="tab-year-sep">'26</span>
//     <a class="tab" href="...">JAN</a>
//     ...
//     <a class="tab active" href="#">APR</a>
//     <button class="tab-add">+</button>
//   </nav>
// The "+" button asks the server to create the next month's cycle and the
// caller routes us there once it returns.

import Link from 'next/link';
import { useTransition, type MouseEvent } from 'react';
import type { Cycle } from '@/lib/types';

const MONTH_SHORT = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

export interface MonthTabsProps {
  cycles: Cycle[];
  activeId: string;
  /** Server action wrapper that creates the next month's cycle.
   *  Should return the new cycle id (or void if the caller handles redirect). */
  onAddNextMonth?: () => Promise<void> | void;
}

/** Sort cycles chronologically (oldest -> newest) without mutating the input. */
function sortCycles(cycles: Cycle[]): Cycle[] {
  return [...cycles].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
}

/** Two-digit year suffix for the separator pill: 2026 -> "'26". */
function yearSuffix(year: number): string {
  return `'${String(year).slice(-2)}`;
}

export default function MonthTabs({
  cycles,
  activeId,
  onAddNextMonth,
}: MonthTabsProps) {
  const ordered = sortCycles(cycles);
  const [isPending, startTransition] = useTransition();

  const handleAdd = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!onAddNextMonth || isPending) return;
    startTransition(() => {
      void onAddNextMonth();
    });
  };

  // Build an interleaved list of tabs and year separators. A separator is
  // emitted whenever the year changes between two adjacent cycles, and is
  // labelled with the *new* year (matches mockup 5: "DEC 'JAN" -> "'26"
  // between DEC 2025 and JAN 2026).
  const items: Array<
    | { kind: 'tab'; cycle: Cycle }
    | { kind: 'sep'; year: number; key: string }
  > = [];

  for (let i = 0; i < ordered.length; i++) {
    const cycle = ordered[i]!;
    const prev = i > 0 ? ordered[i - 1]! : null;
    if (prev && prev.year !== cycle.year) {
      items.push({
        kind: 'sep',
        year: cycle.year,
        key: `sep-${cycle.year}`,
      });
    }
    items.push({ kind: 'tab', cycle });
  }

  return (
    <nav className="month-tabs" aria-label="Month">
      <button
        type="button"
        className="tab-arrow"
        aria-label="Scroll months left"
      >
        ‹
      </button>

      {items.map((item) => {
        if (item.kind === 'sep') {
          return (
            <span key={item.key} className="tab-year-sep">
              {yearSuffix(item.year)}
            </span>
          );
        }
        const { cycle } = item;
        const cycleSlug = `${cycle.year}-${String(cycle.month).padStart(2, '0')}`;
        const isActive = cycleSlug === activeId;
        const label = MONTH_SHORT[cycle.month - 1] ?? '';
        return (
          <Link
            key={cycle.id}
            href={`/cycle/${cycleSlug}`}
            className={isActive ? 'tab active' : 'tab'}
            aria-current={isActive ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}

      <button
        type="button"
        className="tab-add"
        onClick={handleAdd}
        disabled={isPending || !onAddNextMonth}
        aria-label="Add next month"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </nav>
  );
}
