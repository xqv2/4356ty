// src/lib/message.ts
import type { Bill, Cycle, RoommateSplit } from './types';
import { formatMoney, formatMonthName } from './format';

export function generateMessage(
  cycle: Pick<Cycle, 'label' | 'year' | 'month'>,
  bills: Bill[],
  splits: RoommateSplit[],
  roommate?: RoommateSplit,
): string {
  const monthName = formatMonthName(cycle.month);
  const total = bills.reduce((s, b) => s + (b.amount_cents || 0), 0);

  if (!roommate) {
    const equalRow = splits.find((s) => s.override == null) ?? splits[0];
    const each = equalRow ? ` Your share is ${formatMoney(equalRow.equal_share_cents)}.` : '';
    return `Hey! ${monthName} utilities came to ${formatMoney(total)} total.${each}`;
  }

  const greeting = `Hey ${roommate.name}!`;
  const totalLine = `${monthName} utilities came to ${formatMoney(total)} total.`;

  let shareLine: string;
  if (roommate.override?.kind === 'percent') {
    shareLine = `Your share is ${formatMoney(roommate.cents)} after the ${roommate.override.percent}% discount.`;
  } else {
    shareLine = `Your share is ${formatMoney(roommate.cents)}.`;
  }

  return `${greeting} ${totalLine} ${shareLine}`;
}
