"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";

/** Smoothly counts up to `value` on mount / when value changes. */
export function CountUp({
  value,
  className,
  duration = 900,
}: {
  value: number;
  className?: string;
  duration?: number;
}) {
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const startVal = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(startVal + (value - startVal) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className={className}>{n.toLocaleString()}</span>;
}

/** true shortly after mount — used to trigger CSS width/opacity transitions. */
function useReveal() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 60);
    return () => clearTimeout(t);
  }, []);
  return on;
}

export interface Segment {
  value: number;
  className: string;
  label: string;
}

/** Composition bar: segments animate out from the left, staggered. */
export function SegmentedBar({ segments }: { segments: Segment[] }) {
  const on = useReveal();
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 ring-1 ring-inset ring-black/5">
      {segments.map((s, i) => (
        <div
          key={i}
          title={`${s.label}: ${s.value}`}
          className={cn("h-full transition-all duration-700 ease-out", s.className)}
          style={{
            width: on ? `${(s.value / total) * 100}%` : "0%",
            transitionDelay: `${i * 140}ms`,
          }}
        />
      ))}
    </div>
  );
}

/** A labelled meter whose fill grows to value/max. */
export function Meter({
  value,
  max,
  gradient = "from-emerald-400 to-emerald-600",
  delay = 0,
}: {
  value: number;
  max: number;
  gradient?: string;
  delay?: number;
}) {
  const on = useReveal();
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-[900ms] ease-out", gradient)}
        style={{ width: on ? `${pct}%` : "0%", transitionDelay: `${delay}ms` }}
      />
    </div>
  );
}

/** Card that reveals with a fade+rise on mount. */
export function RevealCard({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const on = useReveal();
  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-700 ease-out",
        on ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export interface RankItem {
  name: string;
  value: number;
  sub?: string;
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** Ranked leaderboard with medals and animated bars. */
export function Leaderboard({
  items,
  unit = "",
  gradient = "from-violet-400 to-fuchsia-600",
}: {
  items: RankItem[];
  unit?: string;
  gradient?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0)
    return <p className="py-6 text-center text-sm text-gray-400">No data yet.</p>;
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={it.name} className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600">
            {MEDALS[i] ?? i + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium text-gray-800">{it.name}</span>
              <span className="shrink-0 text-sm font-bold text-gray-900">
                <CountUp value={it.value} />
                {unit && <span className="ml-0.5 text-xs font-normal text-gray-400">{unit}</span>}
              </span>
            </div>
            <div className="mt-1">
              <Meter value={it.value} max={max} gradient={gradient} delay={i * 90} />
            </div>
            {it.sub && <div className="mt-0.5 text-xs text-gray-400">{it.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Big gradient hero stat. */
export function HeroStat({
  label,
  value,
  icon,
  gradient,
}: {
  label: string;
  value: number;
  icon: string;
  gradient: string;
}) {
  const on = useReveal();
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-md transition-all duration-700",
        gradient,
        on ? "scale-100 opacity-100" : "scale-95 opacity-0"
      )}
    >
      <div className="text-3xl">{icon}</div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight">
        <CountUp value={value} />
      </div>
      <div className="mt-0.5 text-sm font-medium text-white/80">{label}</div>
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
    </div>
  );
}
