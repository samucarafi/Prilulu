const DAY_MS = 24 * 60 * 60 * 1000;

export type InventoryUsageBooking = {
  eventDate: Date | string;
  returnDate?: Date | string;
  kit?: { inventory?: Array<{ itemId: unknown; quantity: number }> } | null;
  customInventory?: Array<{ itemId: unknown; quantity: number }>;
  removedInventory?: Array<{ itemId: unknown; quantity: number }>;
  extras?: Array<{ item: unknown; quantity?: number; selectedOptions?: Array<{ groupId: string; optionId: string }> }>;
};

function dayStamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function peakInventoryUsage(
  bookings: InventoryUsageBooking[],
  range?: { start: Date; end: Date },
) {
  const changesByItem = new Map<string, Map<number, number>>();
  const rangeStart = range ? dayStamp(range.start) : Number.NEGATIVE_INFINITY;
  const rangeEnd = range ? dayStamp(range.end) : Number.POSITIVE_INFINITY;

  const addInterval = (itemId: unknown, quantity: number, start: number, end: number) => {
    if (!quantity || end < rangeStart || start > rangeEnd) return;
    const clippedStart = Math.max(start, rangeStart);
    const clippedEnd = Math.min(end, rangeEnd);
    const id = String(itemId);
    const changes = changesByItem.get(id) ?? new Map<number, number>();
    changes.set(clippedStart, (changes.get(clippedStart) ?? 0) + quantity);
    const afterEnd = clippedEnd + DAY_MS;
    changes.set(afterEnd, (changes.get(afterEnd) ?? 0) - quantity);
    changesByItem.set(id, changes);
  };

  for (const booking of bookings) {
    const start = dayStamp(booking.eventDate);
    const savedEnd = dayStamp(booking.returnDate ?? booking.eventDate);
    const end = Math.max(savedEnd, start + DAY_MS);
    for (const part of booking.kit?.inventory ?? []) addInterval(part.itemId, part.quantity, start, end);
    for (const part of booking.removedInventory ?? []) addInterval(part.itemId, -part.quantity, start, end);
    for (const part of booking.customInventory ?? []) addInterval(part.itemId, part.quantity, start, end);
    for (const extra of booking.extras ?? []) addInterval(extra.item, extra.quantity ?? 1, start, end);
  }

  const peak = new Map<string, number>();
  for (const [itemId, changes] of changesByItem) {
    let current = 0;
    let maximum = 0;
    for (const [, change] of [...changes].sort(([a], [b]) => a - b)) {
      current += change;
      maximum = Math.max(maximum, current);
    }
    peak.set(itemId, maximum);
  }
  return peak;
}

export function peakOptionUsage(
  bookings: InventoryUsageBooking[],
  range?: { start: Date; end: Date },
) {
  const changesByOption = new Map<string, Map<number, number>>();
  const rangeStart = range ? dayStamp(range.start) : Number.NEGATIVE_INFINITY;
  const rangeEnd = range ? dayStamp(range.end) : Number.POSITIVE_INFINITY;
  for (const booking of bookings) {
    const start = dayStamp(booking.eventDate);
    const savedEnd = dayStamp(booking.returnDate ?? booking.eventDate);
    const end = Math.max(savedEnd, start + DAY_MS);
    if (end < rangeStart || start > rangeEnd) continue;
    const clippedStart = Math.max(start, rangeStart);
    const clippedEnd = Math.min(end, rangeEnd);
    for (const extra of booking.extras ?? []) {
      const itemId = String(extra.item);
      for (const option of extra.selectedOptions ?? []) {
        const key = `${itemId}:${option.groupId}:${option.optionId}`;
        const changes = changesByOption.get(key) ?? new Map<number, number>();
        changes.set(clippedStart, (changes.get(clippedStart) ?? 0) + (extra.quantity ?? 1));
        const afterEnd = clippedEnd + DAY_MS;
        changes.set(afterEnd, (changes.get(afterEnd) ?? 0) - (extra.quantity ?? 1));
        changesByOption.set(key, changes);
      }
    }
  }
  const peak = new Map<string, number>();
  for (const [key, changes] of changesByOption) {
    let current = 0;
    let maximum = 0;
    for (const [, change] of [...changes].sort(([a], [b]) => a - b)) {
      current += change;
      maximum = Math.max(maximum, current);
    }
    peak.set(key, maximum);
  }
  return peak;
}
