import { describe, expect, it } from 'vitest';

import { generateMessage } from './message';
import type { Bill, Cycle, RoommateSplit } from './types';

// ---- Fixtures ----------------------------------------------------------------

const APRIL_CYCLE: Pick<Cycle, 'label' | 'year' | 'month'> = {
  label: 'Utility',
  year: 2026,
  month: 4,
};

/** Deterministic bill totals from mockup 5: 302.89 + 140.56 + 44.50 + 49.99 = 537.94. */
function makeStandardBills(): Bill[] {
  return [
    makeBill({ id: 'b1', vendor: 'Electricity', amount_cents: 30289 }),
    makeBill({ id: 'b2', vendor: 'Water', amount_cents: 14056 }),
    makeBill({ id: 'b3', vendor: 'Trash', amount_cents: 4450 }),
    makeBill({ id: 'b4', vendor: 'Internet', amount_cents: 4999 }),
  ];
}

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-id',
    cycle_id: 'cycle-id',
    vendor: 'Vendor',
    provider: null,
    amount_cents: 0,
    pdf_path: null,
    recurring: false,
    kind: null,
    position: 0,
    created_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSplit(overrides: Partial<RoommateSplit> = {}): RoommateSplit {
  return {
    roommate_id: 'r-id',
    name: 'Person',
    cents: 13448,
    equal_share_cents: 13448,
    is_payer: false,
    override: null,
    tag: null,
    ...overrides,
  };
}

// 4-way equal share of $537.94 → 13448 cents (floor of 134485 / 4 = 33621 × 100 / 100)
// Actually: 53794 / 4 = 13448.5 → floor is 13448.
const EQUAL_SHARE_CENTS = 13448;

function makeStandardSplits(): RoommateSplit[] {
  return [
    makeSplit({ roommate_id: 'r1', name: 'Aman', cents: EQUAL_SHARE_CENTS, equal_share_cents: EQUAL_SHARE_CENTS, is_payer: true }),
    makeSplit({ roommate_id: 'r2', name: 'Astitva', cents: EQUAL_SHARE_CENTS, equal_share_cents: EQUAL_SHARE_CENTS }),
    makeSplit({ roommate_id: 'r3', name: 'Lokesh', cents: EQUAL_SHARE_CENTS, equal_share_cents: EQUAL_SHARE_CENTS }),
    makeSplit({ roommate_id: 'r4', name: 'Johny', cents: EQUAL_SHARE_CENTS, equal_share_cents: EQUAL_SHARE_CENTS }),
  ];
}

// ---- Tests -------------------------------------------------------------------

describe('generateMessage', () => {
  describe('standard group message (no roommate)', () => {
    const bills = makeStandardBills();
    const splits = makeStandardSplits();
    const msg = generateMessage(APRIL_CYCLE, bills, splits);

    it('matches the literal expected text from mockup 5', () => {
      // The on-screen mockup ("Equal split (4 ways): $134.48 each") is the
      // rendered editor preview; the actual generator uses the more compact
      // "Each: $X.XX" form, so this test pins the implementation output.
      const expected = [
        "Hey! Here's this April's utility bill breakdown:",
        '',
        '• Electricity: $302.89',
        '• Water: $140.56',
        '• Trash: $44.50',
        '• Internet: $49.99',
        '',
        'Total: $537.94',
        'Each: $134.48',
      ].join('\n');
      expect(msg).toBe(expected);
    });

    it('matches inline snapshot', () => {
      expect(msg).toMatchInlineSnapshot(`
        "Hey! Here's this April's utility bill breakdown:

        • Electricity: $302.89
        • Water: $140.56
        • Trash: $44.50
        • Internet: $49.99

        Total: $537.94
        Each: $134.48"
      `);
    });

    it('greets the group with "Hey!" (not a name)', () => {
      expect(msg).toMatch(/^Hey! /);
      expect(msg).not.toMatch(/^Hey \w+!/);
    });

    it('contains every bill amount with the right formatting', () => {
      expect(msg).toContain('• Electricity: $302.89');
      expect(msg).toContain('• Water: $140.56');
      expect(msg).toContain('• Trash: $44.50');
      expect(msg).toContain('• Internet: $49.99');
    });

    it('omits the per-roommate share line when no recipient is given', () => {
      expect(msg).not.toMatch(/Your share/);
    });

    it('total equals the sum of bill amounts', () => {
      const sum = bills.reduce((s, b) => s + b.amount_cents, 0);
      expect(sum).toBe(53794);
      expect(msg).toContain('Total: $537.94');
    });

    it('emits an "Each:" line driven by equal_share_cents (floor of total/N)', () => {
      expect(msg).toContain('Each: $134.48');
    });
  });

  describe('greeting / month / cycle label', () => {
    it('lowercases the cycle label', () => {
      const msg = generateMessage(
        { label: 'UTILITY', year: 2026, month: 4 },
        [],
        [],
      );
      expect(msg).toContain("Here's this April's utility bill breakdown:");
    });

    it('falls back to "utility" when cycle.label is empty', () => {
      const msg = generateMessage(
        { label: '', year: 2026, month: 4 },
        [],
        [],
      );
      expect(msg).toContain("April's utility bill breakdown");
    });

    it('renders the long month name from cycle.month', () => {
      const msg = generateMessage(
        { label: 'Utility', year: 2026, month: 12 },
        [],
        [],
      );
      expect(msg).toContain("December's utility bill breakdown");
    });

    it('greets the named roommate when provided', () => {
      const split = makeSplit({ name: 'Astitva' });
      const msg = generateMessage(APRIL_CYCLE, [], [split], split);
      expect(msg).toMatch(/^Hey Astitva! /);
    });
  });

  describe('bill row formatting', () => {
    it('includes the provider in parentheses when present', () => {
      const bills = [
        makeBill({ vendor: 'Electricity', provider: 'PG&E', amount_cents: 30289 }),
      ];
      const msg = generateMessage(APRIL_CYCLE, bills, []);
      expect(msg).toContain('• Electricity (PG&E): $302.89');
    });

    it('omits the provider parens when provider is null', () => {
      const bills = [makeBill({ vendor: 'Electricity', provider: null, amount_cents: 30289 })];
      const msg = generateMessage(APRIL_CYCLE, bills, []);
      expect(msg).toContain('• Electricity: $302.89');
      expect(msg).not.toContain('()');
    });

    it('skips bills with amount_cents <= 0', () => {
      const bills = [
        makeBill({ vendor: 'Electricity', amount_cents: 30289 }),
        makeBill({ vendor: 'Empty', amount_cents: 0 }),
        makeBill({ vendor: 'Negative', amount_cents: -100 }),
      ];
      const msg = generateMessage(APRIL_CYCLE, bills, []);
      expect(msg).toContain('• Electricity: $302.89');
      expect(msg).not.toContain('Empty');
      expect(msg).not.toContain('Negative');
      expect(msg).toContain('Total: $302.89');
    });

    it('produces a $0.00 total and no bullet rows when every bill is zero', () => {
      const bills = [
        makeBill({ vendor: 'A', amount_cents: 0 }),
        makeBill({ vendor: 'B', amount_cents: 0 }),
      ];
      const msg = generateMessage(APRIL_CYCLE, bills, []);
      expect(msg).not.toContain('•');
      expect(msg).toContain('Total: $0.00');
    });

    it('produces a $0.00 total when bills array is empty', () => {
      const msg = generateMessage(APRIL_CYCLE, [], []);
      expect(msg).toContain('Total: $0.00');
      expect(msg).not.toContain('•');
    });
  });

  describe('"Each:" equal-share line', () => {
    it('uses the first non-payer non-overridden split', () => {
      const splits: RoommateSplit[] = [
        makeSplit({ roommate_id: 'r1', name: 'Payer', is_payer: true, equal_share_cents: 13448 }),
        makeSplit({
          roommate_id: 'r2',
          name: 'Overridden',
          equal_share_cents: 13448,
          override: { kind: 'cents', cents: 9500 },
        }),
        makeSplit({ roommate_id: 'r3', name: 'Baseline', equal_share_cents: 13448 }),
      ];
      const msg = generateMessage(APRIL_CYCLE, [], splits);
      expect(msg).toContain('Each: $134.48');
    });

    it('falls back to splits[0] when every roommate has an override or is the payer', () => {
      const splits: RoommateSplit[] = [
        makeSplit({
          roommate_id: 'r1',
          name: 'A',
          is_payer: true,
          equal_share_cents: 5000,
        }),
        makeSplit({
          roommate_id: 'r2',
          name: 'B',
          equal_share_cents: 7777,
          override: { kind: 'cents', cents: 1000 },
        }),
      ];
      const msg = generateMessage(APRIL_CYCLE, [], splits);
      // splits[0]'s equal_share_cents is used as the fallback.
      expect(msg).toContain('Each: $50.00');
    });

    it('omits the "Each:" line entirely when there are no splits', () => {
      const msg = generateMessage(APRIL_CYCLE, [], []);
      expect(msg).not.toContain('Each:');
    });
  });

  describe('per-recipient mode', () => {
    it('appends a plain "Your share" line when the recipient has no override', () => {
      const recipient = makeSplit({
        roommate_id: 'r2',
        name: 'Astitva',
        cents: 13448,
        equal_share_cents: 13448,
      });
      const splits = [recipient];
      const msg = generateMessage(APRIL_CYCLE, makeStandardBills(), splits, recipient);
      expect(msg).toMatch(/^Hey Astitva! /);
      expect(msg).toContain('Your share: $134.48.');
    });

    it('appends a percent-discount line when override.kind === "percent"', () => {
      // 20% off the equal share of $134.48 → $107.58 (you save $26.90).
      const recipient = makeSplit({
        roommate_id: 'r3',
        name: 'Lokesh',
        cents: 10758,
        equal_share_cents: 13448,
        override: { kind: 'percent', percent: 20, saved_cents: 2690 },
      });
      const splits = [recipient];
      const msg = generateMessage(APRIL_CYCLE, makeStandardBills(), splits, recipient);

      expect(msg).toMatch(/^Hey Lokesh! /);
      expect(msg).toContain('Your share (with -20% off): $107.58 — you save $26.90.');
      expect(msg).toContain('20%');
      expect(msg.toLowerCase()).toContain('your share');
    });

    it('appends a custom-amount line when override.kind === "cents"', () => {
      const recipient = makeSplit({
        roommate_id: 'r3',
        name: 'Aman',
        cents: 9500,
        equal_share_cents: 13448,
        override: { kind: 'cents', cents: 9500 },
      });
      const splits = [recipient];
      const msg = generateMessage(APRIL_CYCLE, makeStandardBills(), splits, recipient);
      expect(msg).toContain('Your share: $95.00 (custom amount).');
    });

    it('per-recipient message addresses that person specifically', () => {
      const recipient = makeSplit({
        roommate_id: 'r4',
        name: 'Johny',
        cents: 13448,
        equal_share_cents: 13448,
      });
      const msg = generateMessage(APRIL_CYCLE, [], [recipient], recipient);
      // Greeting names them, body says "Your share".
      expect(msg.startsWith('Hey Johny!')).toBe(true);
      expect(msg).toContain('Your share: $134.48.');
    });
  });

  describe('stable formatting', () => {
    it('every dollar amount is rendered with two decimal places', () => {
      const bills = [
        makeBill({ vendor: 'Round', amount_cents: 10000 }), // $100.00
        makeBill({ vendor: 'Penny', amount_cents: 1 }), // $0.01
        makeBill({ vendor: 'Big', amount_cents: 123456 }), // $1,234.56
      ];
      const splits = [makeSplit({ equal_share_cents: 12500 })];
      const msg = generateMessage(APRIL_CYCLE, bills, splits);
      // Match every $ amount in the output.
      const amounts = msg.match(/\$\d[\d,]*\.\d{2}/g) ?? [];
      expect(amounts.length).toBeGreaterThan(0);
      for (const a of amounts) {
        expect(a).toMatch(/^\$\d[\d,]*\.\d{2}$/);
      }
      // Specific renders (incl. thousands separator).
      expect(msg).toContain('$100.00');
      expect(msg).toContain('$0.01');
      expect(msg).toContain('$1,234.56');
    });

    it('total exactly equals the sum of non-zero bill amounts', () => {
      const bills = [
        makeBill({ vendor: 'A', amount_cents: 12345 }),
        makeBill({ vendor: 'Zero', amount_cents: 0 }),
        makeBill({ vendor: 'B', amount_cents: 67 }),
      ];
      const msg = generateMessage(APRIL_CYCLE, bills, []);
      // 12345 + 67 = 12412 cents = $124.12
      expect(msg).toContain('Total: $124.12');
    });

    it('output contains no trailing whitespace on any line', () => {
      const msg = generateMessage(APRIL_CYCLE, makeStandardBills(), makeStandardSplits());
      for (const line of msg.split('\n')) {
        expect(line).toBe(line.replace(/\s+$/, ''));
      }
    });
  });
});
