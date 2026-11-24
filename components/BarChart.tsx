"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

export interface Series {
  key: string;
  label: string;
  color: string;
}

export interface BarGroup {
  name: string;
  values: Record<string, number>;
}

/** "Nice" axis ticks from 0 to >= max, always with one step of headroom
 *  so the value label printed above the tallest bar is never clipped. */
export function ticks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = 0; v <= Math.ceil(max / step) * step + 1e-9; v += step) out.push(Math.round(v));
  if (out[out.length - 1] <= max) out.push(Math.round(out[out.length - 1] + step));
  return out;
}

/**
 * Grouped vertical bar chart with labelled X/Y axes, a value printed above
 * every bar, and hover tooltips. Clicking a cluster fires onPick; clicking a
 * single bar fires onPickBar.
 */
export function GroupedBarChart({
  groups,
  series,
  xLabel,
  yLabel = "Bags",
  unit = "bags",
  onPick,
  picked,
  onPickBar,
  pickedBar,
  height = 210,
  emptyText = "No data yet.",
  hint,
  renderSubLabel,
}: {
  groups: BarGroup[];
  series: Series[];
  xLabel: string;
  yLabel?: string;
  unit?: string;
  onPick?: (name: string) => void;
  picked?: string | null;
  onPickBar?: (groupName: string, seriesKey: string) => void;
  pickedBar?: { group: string; key: string } | null;
  height?: number;
  emptyText?: string;
  hint?: string;
  /** Extra line drawn under each group's X-axis label (e.g. shop coverage). */
  renderSubLabel?: (groupName: string) => ReactNode;
}) {
  const [on, setOn] = useState(false);
  const [hover, setHover] = useState<{ g: string; s: string; v: number } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 60);
    return () => clearTimeout(t);
  }, []);

  if (groups.length === 0)
    return <p className="py-8 text-center text-sm text-gray-400">{emptyText}</p>;

  const rawMax = Math.max(0, ...groups.flatMap((g) => series.map((s) => g.values[s.key] ?? 0)));
  const tk = ticks(rawMax);
  const axisMax = tk[tk.length - 1] || 1;

  return (
    <div>
      <div className="flex">
        {/* Y axis */}
        <div className="relative mr-1 shrink-0" style={{ width: 46, height }}>
          {tk.map((t) => (
            <div
              key={t}
              className="absolute right-1 -translate-y-1/2 text-[10px] text-gray-400"
              style={{ bottom: `${(t / axisMax) * 100}%` }}
            >
              {t.toLocaleString()}
            </div>
          ))}
        </div>

        {/* plot */}
        <div className="relative flex-1 overflow-x-auto">
          <div className="relative" style={{ height }}>
            {tk.map((t) => (
              <div
                key={t}
                className="absolute left-0 right-0 border-t border-dashed border-gray-200"
                style={{ bottom: `${(t / axisMax) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-5 px-1">
              {groups.map((g, gi) => {
                const isPicked = picked === g.name;
                return (
                  <div
                    key={g.name}
                    onClick={onPick ? () => onPick(g.name) : undefined}
                    className={cn(
                      "flex h-full min-w-20 flex-1 items-end justify-center gap-1.5 rounded-t",
                      onPick && "cursor-pointer hover:bg-emerald-50/60",
                      isPicked && "bg-emerald-50"
                    )}
                  >
                    {series.map((s, si) => {
                      const v = g.values[s.key] ?? 0;
                      const h = (v / axisMax) * 100;
                      const barPicked =
                        pickedBar && pickedBar.group === g.name && pickedBar.key === s.key;
                      const dim = pickedBar && !barPicked;
                      return (
                        <div
                          key={s.key}
                          className={cn(
                            "relative flex h-full flex-1 items-end justify-center",
                            onPickBar && "cursor-pointer"
                          )}
                          onMouseEnter={() => setHover({ g: g.name, s: s.label, v })}
                          onMouseLeave={() => setHover(null)}
                          onClick={
                            onPickBar
                              ? (e) => {
                                  e.stopPropagation();
                                  onPickBar(g.name, s.key);
                                }
                              : undefined
                          }
                        >
                          {v > 0 && (
                            <span
                              className="pointer-events-none absolute z-[1] text-[9px] font-semibold leading-none text-gray-700 transition-all duration-700 ease-out"
                              style={{
                                bottom: on ? `calc(${Math.max(2, h)}% + 3px)` : "3px",
                                transitionDelay: `${gi * 80 + si * 50}ms`,
                              }}
                            >
                              {v.toLocaleString()}
                            </span>
                          )}
                          <div
                            className={cn(
                              "w-full max-w-7 rounded-t transition-all duration-700 ease-out",
                              barPicked && "ring-2 ring-gray-800 ring-offset-1"
                            )}
                            style={{
                              height: on ? `${Math.max(v > 0 ? 2 : 0, h)}%` : "0%",
                              background: s.color,
                              transitionDelay: `${gi * 80 + si * 50}ms`,
                              opacity:
                                dim ? 0.35
                                : hover && hover.g === g.name && hover.s === s.label ? 0.75
                                : 1,
                            }}
                          />
                          {hover && hover.g === g.name && hover.s === s.label && (
                            <div
                              className="pointer-events-none absolute z-10 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] text-white shadow"
                              style={{ bottom: `calc(${Math.max(2, h)}% + 16px)` }}
                            >
                              {g.name} · {s.label}: <strong>{v.toLocaleString()}</strong> {unit}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* X axis */}
          <div className="mt-1 border-t border-gray-300" />
          <div className="flex gap-5 px-1">
            {groups.map((g) => (
              <div key={g.name} className="min-w-20 flex-1 pt-1 text-center">
                <span
                  className={cn(
                    "block truncate text-xs",
                    picked === g.name ? "font-semibold text-emerald-700" : "text-gray-600"
                  )}
                >
                  {g.name}
                </span>
                {renderSubLabel && renderSubLabel(g.name)}
              </div>
            ))}
          </div>
          <div className="mt-1 text-center text-[10px] font-medium uppercase tracking-wide text-gray-400">
            {xLabel}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{yLabel}</span>
        <div className="flex flex-wrap gap-4">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      {hint && <p className="mt-2 text-center text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}
