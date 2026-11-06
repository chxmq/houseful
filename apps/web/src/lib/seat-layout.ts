/**
 * Turns a capacity into rows for the seat map. Works for phone widths by keeping
 * row length modest so seats stay tappable at 375px.
 */

export type SeatId = number; // 1..capacity for seated shows; 0 means general admission

export type SeatCell = {
  seat: SeatId;
  row: string;
  indexInRow: number;
};

export type SeatLayout = {
  rows: { label: string; seats: SeatCell[] }[];
  capacity: number;
};

const ROW_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Prefer ~10 to 14 seats per row so a phone can show two thumbs of targets. */
export function seatsPerRow(capacity: number): number {
  if (capacity <= 10) return capacity;
  if (capacity <= 40) return 10;
  if (capacity <= 120) return 12;
  return 14;
}

export function buildSeatLayout(capacity: number): SeatLayout {
  if (capacity <= 0) return { rows: [], capacity: 0 };
  const per = seatsPerRow(capacity);
  const rows: SeatLayout["rows"] = [];
  let seat = 1;
  let rowIndex = 0;
  while (seat <= capacity) {
    const label = rowLabel(rowIndex);
    const seats: SeatCell[] = [];
    for (let i = 0; i < per && seat <= capacity; i++, seat++) {
      seats.push({ seat, row: label, indexInRow: i + 1 });
    }
    rows.push({ label, seats });
    rowIndex++;
  }
  return { rows, capacity };
}

function rowLabel(index: number): string {
  if (index < 26) return ROW_LABELS[index]!;
  return `${ROW_LABELS[Math.floor(index / 26) - 1]}${ROW_LABELS[index % 26]}`;
}

export function seatCaption(seat: SeatId): string {
  if (seat === 0) return "General admission";
  return `Seat ${seat}`;
}
