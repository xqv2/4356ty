// src/components/SummaryBlock.tsx
// Renders the .summary block shown between the bills list and the roommates
// list in the editor (see mockups/screens/5-filled.html). Both money values
// animate via <AnimatedAmount/> — counter-up on first paint and on every
// edit.

import AnimatedAmount from './AnimatedAmount';

export interface SummaryBlockProps {
  totalCents: number;
  perPersonCents: number;
}

export default function SummaryBlock({
  totalCents,
  perPersonCents,
}: SummaryBlockProps) {
  return (
    <div className="summary">
      <div className="summary-total">
        Total <AnimatedAmount cents={totalCents} className="summary-total-amount" />
      </div>
      <div className="summary-each-line">
        <AnimatedAmount cents={perPersonCents} className="summary-each" /> each
      </div>
    </div>
  );
}
