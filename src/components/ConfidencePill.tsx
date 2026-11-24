"use client";

interface Props {
  value: number;
}

export default function ConfidencePill({ value }: Props) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 75 ? "bg-emerald-100 text-emerald-700" :
    pct >= 50 ? "bg-amber-100 text-amber-700" :
    "bg-red-100 text-red-700";

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {pct}%
    </span>
  );
}
