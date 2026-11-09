"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Card, Td, Th, TableWrap } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { downloadCsv } from "@/lib/format";
import type { Zone } from "@/components/UserForm";

type ImportType = "shopkeeper" | "flour_mill" | "survey";
type Row = Record<string, string>;
interface Result { email: string; ok: boolean; error?: string }

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

/** Minimal RFC-4180-ish CSV parser (handles quotes and embedded commas). */
function parseCsv(text: string): string[][] {
  const clean = text.split(CR).join("");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQ) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === LF) { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim().length > 0));
}

function toObjects(text: string): Row[] {
  const grid = parseCsv(text);
  if (grid.length < 2) return [];
  const headers = grid[0].map((h) => h.trim().toLowerCase());
  return grid.slice(1).map((cols) => {
    const o: Row = {};
    headers.forEach((h, i) => (o[h] = (cols[i] ?? "").trim()));
    return o;
  });
}

export function ImportUsers({
  districtLocked,
  zones,
  onClose,
  onDone,
}: {
  districtLocked: string;
  zones: Zone[];
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [type, setType] = useState<ImportType>("shopkeeper");
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const zoneNames = zones.map((z) => z.name);
  const exampleZone = zoneNames[0] ?? "Zone A";

  function downloadSample() {
    if (type === "survey") {
      downloadCsv("survey_persons_sample.csv", [
        ["full_name", "email", "password", "cnic", "phone", "zone"],
        ["New Surveyor", "surveyor@example.pk", "Password123", "3520255555551", "03005555555", exampleZone],
      ]);
      return;
    }
    if (type === "flour_mill") {
      downloadCsv("flour_mills_sample.csv", [
        ["full_name", "email", "password", "cnic", "phone"],
        ["New Flour Mill", "newmill@example.pk", "Password123", "3520298765431", "03009876543"],
      ]);
    } else {
      downloadCsv("shopkeepers_sample.csv", [
        ["full_name", "licence_number", "phone", "shop_name", "address", "zone", "latitude", "longitude"],
        ["Ali Traders", "LIC-4471-A", "03001234567", "Ali Kiryana Store", "Shop 12, Main Boulevard", exampleZone, "31.5204", "74.3587"],
      ]);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setErr(null);
    setResults(null);
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = toObjects(String(reader.result ?? ""));
      if (parsed.length === 0) { setErr("No rows found. Use the sample as a starting point."); setRows([]); return; }
      setRows(parsed);
    };
    reader.readAsText(f);
  }

  async function runImport() {
    setImporting(true);
    setErr(null);
    const out: Result[] = [];
    for (const r of rows) {
      const payload =
        type === "survey"
          ? {
              p_email: r.email, p_password: r.password, p_full_name: r.full_name, p_role: "survey",
              p_district: districtLocked, p_zone: r.zone, p_cnic: r.cnic, p_phone: r.phone,
              p_shop_name: null, p_latitude: null, p_longitude: null,
            }
          : type === "shopkeeper"
          ? {
              p_email: null, p_password: null, p_full_name: r.full_name, p_role: "shopkeeper",
              p_district: districtLocked, p_zone: r.zone,
              // shopkeepers use a licence number; older files may still say cnic
              p_cnic: r.licence_number || r.cnic, p_phone: r.phone,
              p_shop_name: r.shop_name,
              p_latitude: r.latitude ? Number(r.latitude) : null,
              p_longitude: r.longitude ? Number(r.longitude) : null,
              p_address: r.address || null,
            }
          : {
              p_email: r.email, p_password: r.password, p_full_name: r.full_name, p_role: "flour_mill",
              p_district: districtLocked, p_zone: null, p_cnic: r.cnic, p_phone: r.phone,
              p_shop_name: null, p_latitude: null, p_longitude: null,
            };
      const { error } = await supabase.rpc("admin_create_user", payload);
      out.push({ email: r.full_name || r.email || "(unnamed)", ok: !error, error: error?.message });
    }
    setResults(out);
    setImporting(false);
    onDone();
  }

  const created = results?.filter((r) => r.ok).length ?? 0;
  const failed = results?.filter((r) => !r.ok).length ?? 0;

  return (
    <Modal open onClose={onClose} size="lg" title="Import from CSV">
      <div className="space-y-4">
        {/* type toggle */}
        <div className="flex rounded-lg border border-gray-300 p-0.5">
          {(["shopkeeper", "flour_mill", "survey"] as ImportType[]).map((t) => (
            <button
              key={t}
              onClick={() => { setType(t); setRows([]); setResults(null); setFileName(""); }}
              className={
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium " +
                (type === t ? "bg-emerald-600 text-white" : "text-gray-600")
              }
            >
              {t === "shopkeeper" ? "Shopkeepers" : t === "flour_mill" ? "Flour Mills" : "Survey Persons"}
            </button>
          ))}
        </div>

        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
          <div className="mb-2 font-medium text-gray-800">How it works</div>
          <ol className="list-inside list-decimal space-y-1">
            <li>Download the sample CSV and fill one row per {type === "shopkeeper" ? "shopkeeper" : type === "flour_mill" ? "flour mill" : "survey person"}.</li>
            <li>Every user is created in your district, <strong>{districtLocked}</strong>.</li>
            {(type === "shopkeeper" || type === "survey") && (
              <li>The <code>zone</code> must be one of: {zoneNames.length ? zoneNames.join(", ") : "(no zones yet — ask the Super Admin)"}.</li>
            )}
            {type === "survey" && <li>Survey persons sign in, so each needs an <code>email</code> and <code>password</code> (8+ chars, letter + number).</li>}
            {type === "shopkeeper" && <li>Shopkeepers don&apos;t sign in, so no email or password is needed.</li>}
            <li>Upload the file below and press Import.</li>
          </ol>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={downloadSample}>⬇ Download sample CSV</Button>
          </div>
        </div>

        <div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-700"
            />
          </label>
          {fileName && <p className="mt-1 text-xs text-gray-500">{fileName} — {rows.length} row(s) detected</p>}
        </div>

        {err && <Alert tone="error">{err}</Alert>}

        {rows.length > 0 && !results && (
          <Card>
            <TableWrap>
              <thead><tr>
                <Th>Name</Th>
                {type === "shopkeeper"
                  ? <><Th>Shop</Th><Th>Zone</Th><Th>Phone</Th></>
                  : type === "survey"
                  ? <><Th>Email</Th><Th>Zone</Th><Th>Phone</Th></>
                  : <><Th>Email</Th><Th>CNIC</Th><Th>Phone</Th></>}
              </tr></thead>
              <tbody>
                {rows.slice(0, 8).map((r, i) => (
                  <tr key={i}>
                    <Td className="font-medium">{r.full_name}</Td>
                    {type === "shopkeeper"
                      ? <><Td>{r.shop_name}</Td><Td>{r.zone}</Td><Td>{r.phone}</Td></>
                      : type === "survey"
                      ? <><Td>{r.email}</Td><Td>{r.zone}</Td><Td>{r.phone}</Td></>
                      : <><Td>{r.email}</Td><Td>{r.cnic}</Td><Td>{r.phone}</Td></>}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            {rows.length > 8 && <div className="px-4 py-2 text-xs text-gray-400">…and {rows.length - 8} more</div>}
          </Card>
        )}

        {results && (
          <div>
            <Alert tone={failed === 0 ? "success" : "info"}>
              {created} created{failed > 0 ? `, ${failed} failed` : ""}.
            </Alert>
            {failed > 0 && (
              <Card className="mt-3">
                <TableWrap>
                  <thead><tr><Th>User</Th><Th>Result</Th></tr></thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i}>
                        <Td>{r.email}</Td>
                        <Td className={r.ok ? "text-emerald-600" : "text-red-600"}>
                          {r.ok ? "✓ created" : r.error}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </Card>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            {results ? "Close" : "Cancel"}
          </Button>
          {!results && (
            <Button onClick={runImport} disabled={importing || rows.length === 0}>
              {importing ? "Importing…" : `Import ${rows.length || ""} user(s)`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
