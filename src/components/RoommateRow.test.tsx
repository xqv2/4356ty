// src/components/RoommateRow.test.tsx
// Render-shape smoke tests for RoommateRow. We exercise the four pill/input
// branches without driving full edit interactions — those are covered
// elsewhere. Each variant just confirms the right DOM is on screen.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RoommateRow from './RoommateRow';
import type { CycleSplit, Roommate } from '@/lib/types';

// ---- fixtures ---------------------------------------------------------------

const ROOMMATE: Roommate = {
  id: 'rm-1',
  user_id: 'user-1',
  name: 'Alice',
  position: 0,
  archived_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

function makeSplit(overrides: Partial<CycleSplit> = {}): CycleSplit {
  return {
    cycle_id: 'cycle-1',
    roommate_id: ROOMMATE.id,
    override_cents: null,
    override_percent: null,
    animal: 'bichon',
    ...overrides,
  };
}

// ---- variants ---------------------------------------------------------------

describe('RoommateRow', () => {
  it('plain roommate (no overrides) shows avatar initial, name input, static amount, and no pills', () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(
      <RoommateRow
        roommate={ROOMMATE}
        split={makeSplit()}
        computedAmountCents={2500}
        onSave={onSave}
        onDelete={onDelete}
      />,
    );

    // Avatar initial — uppercase first code-point of the name.
    expect(screen.getByText('A')).toBeInTheDocument();

    // Name input is locally controlled and pre-filled with the roommate name.
    const nameInput = screen.getByLabelText('Roommate name') as HTMLInputElement;
    expect(nameInput).toBeInTheDocument();
    expect(nameInput.value).toBe('Alice');

    // No overrides → static amount span, not the override input.
    const amount = container.querySelector('.roommate-amount');
    expect(amount).not.toBeNull();
    expect(amount?.textContent).toBe('$25.00');
    expect(container.querySelector('.override-input')).toBeNull();

    // No pills.
    expect(container.querySelector('.override-pill')).toBeNull();
    expect(container.querySelector('.discount-pill')).toBeNull();
    expect(container.querySelector('.tag-pill')).toBeNull();
  });

  it('with override_cents shows .override-pill ("override") and an editable .override-input', () => {
    const { container } = render(
      <RoommateRow
        roommate={ROOMMATE}
        split={makeSplit({ override_cents: 1500 })}
        computedAmountCents={1500}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const pill = container.querySelector('.override-pill');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe('override');

    // Discount pill must NOT render when only cents override is set.
    expect(container.querySelector('.discount-pill')).toBeNull();

    // Static amount span replaced by an editable input pre-filled from override_cents.
    expect(container.querySelector('.roommate-amount')).toBeNull();
    const input = container.querySelector('.override-input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.tagName).toBe('INPUT');
    expect(input?.value).toBe('$15.00');
    expect(input?.readOnly).toBe(false);
    expect(input?.disabled).toBe(false);
  });

  it('with override_percent=20 shows .discount-pill with text "−20%"', () => {
    const { container } = render(
      <RoommateRow
        roommate={ROOMMATE}
        split={makeSplit({ override_percent: 20 })}
        computedAmountCents={2000}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const pill = container.querySelector('.discount-pill');
    expect(pill).not.toBeNull();
    // Note: U+2212 MINUS SIGN, not a hyphen.
    expect(pill?.textContent).toBe('−20%');

    // Override pill must NOT render when percent is set.
    expect(container.querySelector('.override-pill')).toBeNull();

    // Percent override still surfaces the override input (mirrors computed amount).
    expect(container.querySelector('.override-input')).not.toBeNull();
  });

  it('with isLandlord=true (and no overrides) shows .tag-pill "landlord"', () => {
    const { container } = render(
      <RoommateRow
        roommate={ROOMMATE}
        split={makeSplit()}
        computedAmountCents={2500}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        isLandlord
      />,
    );

    const pill = container.querySelector('.tag-pill');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe('landlord');

    // Other pills should not render.
    expect(container.querySelector('.override-pill')).toBeNull();
    expect(container.querySelector('.discount-pill')).toBeNull();
  });
});
