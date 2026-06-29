// src/components/ShareView.test.tsx
// Tests for the per-roommate share page. ShareView is a server component but
// has no async server-only imports (only `next/cache` is excluded), so RTL can
// render it directly. The lone client island it composes
// (`ShareDetailsToggle`) is rendered as-is so we can exercise the open/close
// behavior end-to-end.

import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ShareView, { type ShareViewProps } from './ShareView';
import { DISPLAY_NAMES, EMOJI } from '@/lib/animals';
import type { Bill, Cycle, CycleSplit, Roommate } from '@/lib/types';

// ---- Fixtures --------------------------------------------------------------

function makeCycle(overrides: Partial<Cycle> = {}): Cycle {
  return {
    id: 'cycle-1',
    user_id: 'user-1',
    label: 'Utilities',
    year: 2026,
    month: 4,
    created_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRoommate(overrides: Partial<Roommate> = {}): Roommate {
  return {
    id: 'rm-1',
    user_id: 'user-1',
    name: 'Lokesh',
    position: 0,
    archived_at: null,
    lease_end_date: null,
    created_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSplit(overrides: Partial<CycleSplit> = {}): CycleSplit {
  return {
    cycle_id: 'cycle-1',
    roommate_id: 'rm-1',
    override_cents: null,
    override_percent: null,
    animal: 'doodle',
    ...overrides,
  };
}

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-electricity',
    cycle_id: 'cycle-1',
    vendor: 'PG&E',
    provider: 'Pacific Gas',
    amount_cents: 12345,
    pdf_path: null,
    recurring: true,
    kind: 'electricity',
    position: 0,
    created_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeProps(overrides: Partial<ShareViewProps> = {}): ShareViewProps {
  return {
    cycle: makeCycle(),
    bills: [],
    roommate: makeRoommate(),
    split: makeSplit(),
    computedAmountCents: 10700,
    equalShareCents: 10700,
    totalCents: 42800,
    animal: 'doodle',
    pdfUrls: {},
    ...overrides,
  };
}

// ---- Tests -----------------------------------------------------------------

describe('ShareView', () => {
  describe('greeting', () => {
    it('renders "Hey {name}!" with the roommate name in <b>', () => {
      const { container } = render(
        <ShareView {...makeProps({ roommate: makeRoommate({ name: 'Lokesh' }) })} />,
      );
      const greeting = container.querySelector('.share-greeting');
      expect(greeting).not.toBeNull();
      expect(greeting!.textContent).toMatch(/^Hey Lokesh!/);
      const bold = greeting!.querySelector('b');
      expect(bold).not.toBeNull();
      expect(bold!.textContent).toBe('Lokesh');
    });
  });

  describe('amount rendering', () => {
    it('renders the big dollar amount with cents in a smaller .cents span', () => {
      const { container } = render(
        <ShareView {...makeProps({ computedAmountCents: 10745 })} />,
      );
      const amount = container.querySelector('.share-amount');
      expect(amount).not.toBeNull();
      // The big dollars portion is the direct text node before the .cents span.
      expect(amount!.textContent).toBe('$107.45');
      const cents = amount!.querySelector('.cents');
      expect(cents).not.toBeNull();
      expect(cents!.textContent).toBe('.45');
    });

    it('formats the dollars with en-US thousands separator', () => {
      const { container } = render(
        <ShareView {...makeProps({ computedAmountCents: 1234567 })} />,
      );
      const amount = container.querySelector('.share-amount')!;
      expect(amount.textContent).toBe('$12,345.67');
      expect(amount.querySelector('.cents')!.textContent).toBe('.67');
    });

    it('pads single-digit cents to two digits', () => {
      const { container } = render(
        <ShareView {...makeProps({ computedAmountCents: 10705 })} />,
      );
      const amount = container.querySelector('.share-amount')!;
      expect(amount.textContent).toBe('$107.05');
      expect(amount.querySelector('.cents')!.textContent).toBe('.05');
    });

    it('clamps negative computed amounts to 0', () => {
      const { container } = render(
        <ShareView {...makeProps({ computedAmountCents: -500 })} />,
      );
      const amount = container.querySelector('.share-amount')!;
      expect(amount.textContent).toBe('$0.00');
      expect(amount.querySelector('.cents')!.textContent).toBe('.00');
    });
  });

  describe('discount callout', () => {
    it('shows "−N% off this month" when override_percent is set', () => {
      const { container } = render(
        <ShareView
          {...makeProps({
            split: makeSplit({ override_percent: 20 }),
            computedAmountCents: 8560,
            equalShareCents: 10700,
          })}
        />,
      );
      const callout = container.querySelector('.discount-callout');
      expect(callout).not.toBeNull();
      // "−" is U+2212 (real minus), not "-".
      expect(callout!.textContent).toBe('−20% off this month');
    });

    it('does not render when override_percent is null', () => {
      const { container } = render(
        <ShareView {...makeProps({ split: makeSplit({ override_percent: null }) })} />,
      );
      expect(container.querySelector('.discount-callout')).toBeNull();
    });

    it('does not render for cents-only override', () => {
      const { container } = render(
        <ShareView
          {...makeProps({
            split: makeSplit({ override_cents: 5000, override_percent: null }),
          })}
        />,
      );
      expect(container.querySelector('.discount-callout')).toBeNull();
    });
  });

  describe('animal avatar + tag', () => {
    it('renders avatar with src=/animals/{key}.png and alt = display name', () => {
      const { container } = render(
        <ShareView {...makeProps({ animal: 'doodle' })} />,
      );
      const avatar = container.querySelector('.animal-avatar img') as HTMLImageElement | null;
      expect(avatar).not.toBeNull();
      // The src attribute is exactly the relative path; jsdom may resolve to an
      // absolute URL via .src, so assert against the attribute.
      expect(avatar!.getAttribute('src')).toBe('/animals/doodle.png');
      expect(avatar!.alt).toBe(DISPLAY_NAMES.doodle); // "Doodle (Golden)"
    });

    it('shows "{Month}\'s {AnimalDisplayName} {emoji}" in .animal-tag', () => {
      const { container } = render(
        <ShareView
          {...makeProps({
            cycle: makeCycle({ month: 4 }),
            animal: 'doodle',
          })}
        />,
      );
      const tag = container.querySelector('.animal-tag');
      expect(tag).not.toBeNull();
      // JSX `&apos;` renders as an ASCII apostrophe in textContent.
      expect(tag!.textContent).toBe(
        `April's ${DISPLAY_NAMES.doodle} ${EMOJI.doodle}`,
      );
    });

    it('handles a different month + animal correctly', () => {
      const { container } = render(
        <ShareView
          {...makeProps({
            cycle: makeCycle({ month: 12 }),
            animal: 'sea-bunny',
          })}
        />,
      );
      const tag = container.querySelector('.animal-tag')!;
      expect(tag.textContent).toBe(
        `December's ${DISPLAY_NAMES['sea-bunny']} ${EMOJI['sea-bunny']}`,
      );
      const avatar = container.querySelector('.animal-avatar img') as HTMLImageElement;
      expect(avatar.getAttribute('src')).toBe('/animals/sea-bunny.png');
      expect(avatar.alt).toBe(DISPLAY_NAMES['sea-bunny']);
    });
  });

  describe('ShareDetailsToggle island', () => {
    it('starts collapsed: bill rows not visible inside an open container', () => {
      const bills = [
        makeBill({ id: 'b-elec', vendor: 'PG&E', kind: 'electricity' }),
        makeBill({ id: 'b-water', vendor: 'EBMUD', kind: 'water' }),
      ];
      const { container } = render(<ShareView {...makeProps({ bills })} />);

      const toggleBtn = screen.getByRole('button', { name: /view bills/i });
      expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

      const details = container.querySelector('#share-details');
      expect(details).not.toBeNull();
      // Closed state: container does not carry the .open modifier class.
      expect(details!.className).toBe('share-details');
      expect(details!.className).not.toContain('open');
    });

    it('expands on click and reveals each bill row with vendor + amount', async () => {
      const user = userEvent.setup();
      const bills = [
        makeBill({
          id: 'b-elec',
          vendor: 'PG&E',
          provider: 'Pacific Gas',
          amount_cents: 12345,
          kind: 'electricity',
        }),
        makeBill({
          id: 'b-water',
          vendor: 'EBMUD',
          provider: null,
          amount_cents: 5400,
          kind: 'water',
        }),
      ];
      const { container } = render(<ShareView {...makeProps({ bills })} />);

      const toggleBtn = screen.getByRole('button', { name: /view bills/i });
      await user.click(toggleBtn);

      // After click: aria-expanded flips, button label changes, and the
      // details container gains the .open modifier.
      expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
      expect(toggleBtn.textContent).toMatch(/hide bills/i);

      const details = container.querySelector('#share-details')!;
      expect(details.className).toContain('open');

      const rows = details.querySelectorAll('.share-detail-row');
      expect(rows.length).toBe(2);

      const elecRow = rows[0];
      expect(within(elecRow as HTMLElement).getByText('PG&E')).toBeInTheDocument();
      expect(within(elecRow as HTMLElement).getByText('Pacific Gas')).toBeInTheDocument();
      expect(
        within(elecRow as HTMLElement).getByText('$123.45'),
      ).toBeInTheDocument();

      const waterRow = rows[1];
      expect(within(waterRow as HTMLElement).getByText('EBMUD')).toBeInTheDocument();
      expect(within(waterRow as HTMLElement).getByText('$54.00')).toBeInTheDocument();
      // No provider → no .meta line
      expect((waterRow as HTMLElement).querySelector('.meta')).toBeNull();
    });

    it('renders a "Download PDF" link only for bills whose pdf_path resolved to a URL', async () => {
      const user = userEvent.setup();
      const bills = [
        makeBill({ id: 'b-elec', vendor: 'PG&E', pdf_path: 'user1/cyc1/b-elec.pdf' }),
        makeBill({ id: 'b-water', vendor: 'EBMUD', pdf_path: null }),
      ];
      const pdfUrls = {
        'b-elec': 'https://signed.example/b-elec.pdf',
        'b-water': null,
      };
      const { container } = render(
        <ShareView {...makeProps({ bills, pdfUrls })} />,
      );

      await user.click(screen.getByRole('button', { name: /view bills/i }));

      const links = container.querySelectorAll('.pdf-link');
      expect(links.length).toBe(1);
      const link = links[0] as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('https://signed.example/b-elec.pdf');
      expect(link.textContent).toMatch(/Download PDF/);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');

      // The other (no-pdf) row exists but contains no .pdf-link.
      const rows = container.querySelectorAll('.share-detail-row');
      expect(rows.length).toBe(2);
      expect((rows[1] as HTMLElement).querySelector('.pdf-link')).toBeNull();
    });

    it('toggles back to collapsed on a second click', async () => {
      const user = userEvent.setup();
      const bills = [makeBill()];
      const { container } = render(<ShareView {...makeProps({ bills })} />);

      const toggleBtn = screen.getByRole('button', { name: /view bills/i });
      await user.click(toggleBtn);
      expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');

      await user.click(toggleBtn);
      expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
      expect(toggleBtn.textContent).toMatch(/view bills/i);

      const details = container.querySelector('#share-details')!;
      expect(details.className).toBe('share-details');
    });
  });
});
