const TZ = "Asia/Karachi";

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Human "3d 4h" style age from an ISO timestamp to now. */
export function ageSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  return humanizeMs(ms);
}

export function humanizeMs(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/** Escape + join rows into a CSV blob and trigger a download in the browser. */
export function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const NL = String.fromCharCode(10);
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    const needsQuote = s.includes(",") || s.includes('"') || s.includes(NL);
    return needsQuote ? '"' + s.split('"').join('""') + '"' : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join(String.fromCharCode(13, 10));
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
