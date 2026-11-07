"use client";

import { useEffect, useState } from "react";
import { contractAddress, housefulAbi } from "@/lib/contract";
import { publicClient } from "@/lib/device-wallet";
import { buildSeatLayout, seatCaption, type SeatId } from "@/lib/seat-layout";

type SeatMapProps = {
  chainEventId: number;
  capacity: number;
  seated: boolean;
  value: SeatId | null;
  onChange: (seat: SeatId | null) => void;
  disabled?: boolean;
};

/**
 * Picks a seat for a seated show, or confirms general admission.
 * Taken seats are read from the contract and refused in plain words.
 */
export function SeatMap({ chainEventId, capacity, seated, value, onChange, disabled }: SeatMapProps) {
  const [taken, setTaken] = useState<boolean[]>(() => (seated ? [] : []));
  const [error, setError] = useState<string | null>(null);
  const showMap = seated && Boolean(contractAddress);

  useEffect(() => {
    if (!showMap || !contractAddress) return;
    let cancelled = false;
    (async () => {
      const flags = await publicClient.readContract({
        address: contractAddress,
        abi: housefulAbi,
        functionName: "seatsTaken",
        args: [BigInt(chainEventId), 1, capacity],
      });
      if (!cancelled) setTaken([...flags]);
    })().catch(() => {
      if (!cancelled) setError("Could not load which seats are taken. Try again in a moment.");
    });
    return () => {
      cancelled = true;
    };
  }, [chainEventId, capacity, showMap]);

  useEffect(() => {
    if (value != null && value > 0 && taken[value - 1] === true) {
      onChange(null);
    }
  }, [taken, value, onChange]);

  if (!seated) {
    return (
      <div className="rounded-[2px] border border-ink/15 p-4">
        <p className="text-sm font-semibold">General admission</p>
        <p className="mt-1 text-sm text-ink-soft">No assigned seat. Show up and find a spot.</p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(0)}
          className={`mt-4 rounded-full px-5 py-2.5 text-sm font-semibold ${
            value === 0 ? "bg-ink text-paper" : "border border-ink/20"
          }`}
        >
          Continue without a seat
        </button>
      </div>
    );
  }

  const layout = buildSeatLayout(capacity);

  function pick(seat: SeatId) {
    if (disabled) return;
    if (taken[seat - 1]) {
      setError(`Seat ${seat} was just taken. Pick another.`);
      return;
    }
    setError(null);
    onChange(seat);
  }

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Pick a seat</p>
      <p className="mt-1 text-sm text-ink-soft">Grey seats are taken. Your pick stays until you pay.</p>
      <div className="mt-4 space-y-2 overflow-x-auto">
        {layout.rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="w-5 shrink-0 font-mono text-[10px] text-muted">{row.label}</span>
            <div className="flex flex-wrap gap-1.5">
              {row.seats.map((cell) => {
                const isTaken = taken[cell.seat - 1] === true;
                const selected = value === cell.seat;
                return (
                  <button
                    key={cell.seat}
                    type="button"
                    disabled={disabled || isTaken}
                    onClick={() => pick(cell.seat)}
                    aria-label={isTaken ? `${seatCaption(cell.seat)}, taken` : seatCaption(cell.seat)}
                    className={`h-8 min-w-8 rounded-[2px] px-1.5 font-mono text-[11px] ${
                      isTaken
                        ? "bg-ink/10 text-ink/30"
                        : selected
                          ? "bg-ink text-paper"
                          : "border border-ink/20 text-ink"
                    }`}
                  >
                    {cell.indexInRow}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {value && value > 0 && taken[value - 1] !== true ? (
        <p className="mt-3 text-sm font-semibold">{seatCaption(value)} selected</p>
      ) : null}
      {error ? <p className="mt-2 text-sm font-medium text-reject">{error}</p> : null}
    </div>
  );
}
