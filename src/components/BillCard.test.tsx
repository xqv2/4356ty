// src/components/BillCard.test.tsx
// Component tests for <BillCard />. Covers the visible state contracts the
// editor relies on: vendor + amount inputs reflect the bill row, the PDF
// button reads `pdf_path` for its attached visual state, delete fires the
// callback, and edits flush via debounce -> onSave on blur.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BillCard from './BillCard';
import type { Bill } from '@/lib/types';

// Project tsconfig sets jsx: preserve, so Vitest's esbuild transform falls
// back to the classic JSX runtime — both this file and the component under
// test need React in scope.
void React;

/** Build a complete `Bill` row; tests override only the fields they care about. */
function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-1',
    cycle_id: 'cycle-1',
    vendor: 'PG&E',
    provider: 'Account 12345',
    amount_cents: 12345, // $123.45
    pdf_path: null,
    recurring: false,
    kind: 'electricity',
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Wait long enough for the 400ms debounce in BillCard to flush. */
function waitForDebounce(ms = 500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('<BillCard />', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the vendor value in the vendor input', () => {
    render(
      <BillCard
        bill={makeBill({ vendor: 'Recology' })}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onAttachPdf={vi.fn()}
      />,
    );

    const vendorInput = screen.getByLabelText('Vendor') as HTMLInputElement;
    expect(vendorInput.value).toBe('Recology');
  });

  it('renders the amount input pre-formatted as $X.XX from amount_cents', () => {
    render(
      <BillCard
        bill={makeBill({ amount_cents: 28500 })}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onAttachPdf={vi.fn()}
      />,
    );

    const amountInput = screen.getByLabelText('Amount') as HTMLInputElement;
    expect(amountInput.value).toBe('$285.00');
  });

  it('shows the empty string in the amount input when amount_cents is 0', () => {
    render(
      <BillCard
        bill={makeBill({ amount_cents: 0 })}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onAttachPdf={vi.fn()}
      />,
    );

    const amountInput = screen.getByLabelText('Amount') as HTMLInputElement;
    expect(amountInput.value).toBe('');
  });

  it('marks the PDF button as attached when pdf_path is set', () => {
    render(
      <BillCard
        bill={makeBill({ pdf_path: 'user-1/cycle-1/bill-1.pdf' })}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onAttachPdf={vi.fn()}
      />,
    );

    // PdfButton flips its className + aria-pressed based on `attached`.
    const pdfBtn = screen.getByRole('button', { name: /view attached pdf/i });
    expect(pdfBtn).toHaveClass('attached');
    expect(pdfBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders the PDF button in unattached state when pdf_path is null', () => {
    render(
      <BillCard
        bill={makeBill({ pdf_path: null })}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onAttachPdf={vi.fn()}
      />,
    );

    const pdfBtn = screen.getByRole('button', { name: /^attach pdf$/i });
    expect(pdfBtn).not.toHaveClass('attached');
    expect(pdfBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('fires onDelete when the delete button is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <BillCard
        bill={makeBill()}
        onSave={vi.fn()}
        onDelete={onDelete}
        onAttachPdf={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /delete bill/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('calls onSave with the new vendor patch after editing + blurring', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <BillCard
        // start with custom kind so vendor edits don't auto-set `kind`
        bill={makeBill({ vendor: 'Old', kind: 'custom' })}
        onSave={onSave}
        onDelete={vi.fn()}
        onAttachPdf={vi.fn()}
      />,
    );

    const vendorInput = screen.getByLabelText('Vendor');
    await user.clear(vendorInput);
    await user.type(vendorInput, 'New Vendor');

    // Blur flushes whatever is pending in the debounce buffer.
    await user.tab();
    // Wait past the 400ms debounce in case any straggler timers were armed.
    await waitForDebounce();

    expect(onSave).toHaveBeenCalled();
    // Last call carries the final vendor value; the call count itself is
    // not pinned because keystrokes can re-arm the debounce.
    const lastPatch = onSave.mock.calls[onSave.mock.calls.length - 1][0];
    expect(lastPatch).toMatchObject({ vendor: 'New Vendor' });
  });

  it('infers kind from a recognizable vendor when the row has no kind set', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <BillCard
        bill={makeBill({ vendor: '', kind: null })}
        onSave={onSave}
        onDelete={vi.fn()}
        onAttachPdf={vi.fn()}
      />,
    );

    const vendorInput = screen.getByLabelText('Vendor');
    await user.type(vendorInput, 'PG&E');
    await user.tab();
    await waitForDebounce();

    // Different keystrokes can split the patch across calls; merge them all.
    const calls = onSave.mock.calls.map((c) => c[0]);
    const merged = Object.assign({}, ...calls);
    expect(merged).toMatchObject({ vendor: 'PG&E', kind: 'electricity' });
  });

  it('parses the typed amount and saves cents on blur', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <BillCard
        bill={makeBill({ amount_cents: 0 })}
        onSave={onSave}
        onDelete={vi.fn()}
        onAttachPdf={vi.fn()}
      />,
    );

    const amountInput = screen.getByLabelText('Amount') as HTMLInputElement;
    await user.click(amountInput);
    await user.type(amountInput, '$1,234.56');
    await user.tab();
    await waitForDebounce();

    expect(onSave).toHaveBeenCalled();
    const lastPatch = onSave.mock.calls[onSave.mock.calls.length - 1][0];
    expect(lastPatch).toMatchObject({ amount_cents: 123456 });

    // Blur also pretty-prints the input value back to canonical $X.XX form.
    expect(amountInput.value).toBe('$1,234.56');
  });

  it('clears the amount input on blur when the parsed value is zero', async () => {
    const user = userEvent.setup();

    render(
      <BillCard
        bill={makeBill({ amount_cents: 5000 })}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onAttachPdf={vi.fn()}
      />,
    );

    const amountInput = screen.getByLabelText('Amount') as HTMLInputElement;
    await user.click(amountInput);
    await user.clear(amountInput);
    await user.tab();
    await waitForDebounce();

    expect(amountInput.value).toBe('');
  });
});
