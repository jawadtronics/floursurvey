"use client";

import { useEffect, useState } from "react";
import { humanizeMs } from "@/lib/format";

/** Live countdown to the same-day (00:00 PKT) deadline. */
export function Countdown({
  deadline,
  onExpire,
}: {
  deadline: string;
  onExpire?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ms = new Date(deadline).getTime() - now;

  useEffect(() => {
    if (ms <= 0) onExpire?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms <= 0]);

  if (ms <= 0) {
    return <span className="text-xs font-medium text-red-600">deadline passed</span>;
  }

  const urgent = ms < 60 * 60 * 1000;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const label =
    h > 0 ? humanizeMs(ms) : `${m}m ${String(s).padStart(2, "0")}s`;

  return (
    <span
      className={
        "text-xs font-medium " + (urgent ? "text-red-600" : "text-amber-600")
      }
    >
      expires in {label}
    </span>
  );
}
