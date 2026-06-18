// src/lib/message.ts
// Builds the SMS / iMessage copy shown in the editor preview and copied to
// the clipboard from the share modal. Format follows mockup 5.

import type { Bill, Cycle, RoommateSplit } from './types';
import { formatMoney, formatMonthName } from './format';

/**
 * Generate a share message. When `roommate` is omitted, the message is
 * addressed to the equal-split group (no override line). When provided, the
 * message is addressed to that one roommate and includes their override
 * line if applicable.
 */
export function generateMessage(
  cycle: Pick<Cycle, 'label' | 'year' | 'month'>,
  bills: Bill[],
  splits: RoommateSplit[],
  roommate?: RoommateSplit,
): string {
  const monthName = formatMonthName(cycle.month);
  const cycleLabel = (cycle.label || 'utility').toLowerCase();

  // Greeting — equal-split message addresses everyone, per-roommate uses name.
  const greeting = roommate
    ? `Hey ${roommate.name}!`
    : 'Hey!';

  const lines: string[] = [];
  lines.push(
    `${greeting} Here's this ${monthName}'s ${cycleLabel} bill breakdown:`,
  );
  lines.push('');

  // Bill rows — only include bills with a non-zero amount (matches mockup 5).
  const realBills = bills.filter((b) => b.amount_cents > 0);
  for (const b of realBills) {
    const provider = b.provider ? ` (${b.provider})` : '';
    lines.push(`• ${b.vendor}${provider}: ${formatMoney(b.amount_cents)}`);
  }
  if (realBills.length > 0) lines.push('');

  // Total
  const total = realBills.reduce((s, b) => s + b.amount_cents, 0);
  lines.push(`Total: ${formatMoney(total)}`);

  // Equal-share line — taken from the first roommate without an override,
  // or the floor of total/N if everyone has an override.
  const equalRow =
    splits.find((s) => s.override == null && !s.is_payer) ?? splits[0];
  if (equalRow) {
    lines.push(`Each: ${formatMoney(equalRow.equal_share_cents)}`);
  }

  // Per-roommate target — adds the override / discount line.
  if (roommate) {
    lines.push('');
    if (roommate.override?.kind === 'percent') {
      const pct = roommate.override.percent;
      const saved = roommate.override.saved_cents;
      lines.push(
        `Your share (with -${pct}% off): ${formatMoney(roommate.cents)} — you save ${formatMoney(saved)}.`,
      );
    } else if (roommate.override?.kind === 'cents') {
      lines.push(
        `Your share: ${formatMoney(roommate.cents)} (custom amount).`,
      );
    } else {
      lines.push(`Your share: ${formatMoney(roommate.cents)}.`);
    }
  }

  return lines.join('\n');
}
