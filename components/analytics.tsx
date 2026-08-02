"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui";
import {
  HeroStat,
  Leaderboard,
  RevealCard,
  SegmentedBar,
  type RankItem,
} from "@/components/charts";
import type { EffectiveLine, SurveyRow } from "@/lib/types";

type Kind = "district" | "zone" | "surveyor";

interface Group {
  name: string;
  issued: number;
  received: number;
  notReceived: number;
  pending: number;
}

function aggregate(lines: EffectiveLine[], keyFn: (l: EffectiveLine) => string | null) {
  const map = new Map<string, Group>();
  for (const l of lines) {
    const k = keyFn(l);
    if (!k) continue;
    const g = map.get(k) ?? { name: k, issued: 0, received: 0, notReceived: 0, pending: 0 };
    g.issued += l.total_bags;
    if (l.effective_status === "received") g.received += l.total_bags;
    else if (l.effective_status === "not_received") g.notReceived += l.total_bags;
    else g.pending += l.total_bags;
    map.set(k, g);
  }
  return Array.from(map.values()).sort((a, b) => b.issued - a.issued);
}

function FlowCard({
  title,
  icon,
  groups,
  delay,
}: {
  title: string;
  icon: string;
  groups: Group[];
  delay: number;
}) {
  return (
    <RevealCard delay={delay}>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>
      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No data yet.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.name}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm font-medium text-gray-800">{g.name}</span>
                <span className="text-xs text-gray-500">{g.issued} bags issued</span>
              </div>
              <SegmentedBar
                segments={[
                  { value: g.received, className: "bg-emerald-500", label: "Received" },
                  { value: g.pending, className: "bg-amber-400", label: "Pending" },
                  { value: g.notReceived, className: "bg-red-500", label: "Not received" },
                ]}
              />
              <div className="mt-1 flex gap-3 text-[11px]">
                <span className="text-emerald-600">{g.received} received</span>
                <span className="text-amber-600">{g.pending} pending</span>
                <span className="text-red-600">{g.notReceived} not received</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </RevealCard>
  );
}

export function Analytics({ show }: { show: Kind[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [lines, setLines] = useState<EffectiveLine[] | null>(null);
  const [surveys, setSurveys] = useState<SurveyRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const [a, b] = await Promise.all([
        supabase.from("v_issue_lines_effective").select("*"),
        supabase.from("v_surveys_visible").select("*"),
      ]);
      setLines((a.data as EffectiveLine[]) ?? []);
      setSurveys((b.data as SurveyRow[]) ?? []);
    })();
  }, [supabase]);

  if (!lines || !surveys) return <Spinner label="Building analytics…" />;

  const byDistrict = aggregate(lines, (l) => l.issue_district);
  const byZone = aggregate(lines, (l) => l.shop_zone);

  const surveyorMap = new Map<string, { count: number; bags: number }>();
  for (const s of surveys) {
    const cur = surveyorMap.get(s.survey_person_name) ?? { count: 0, bags: 0 };
    cur.count += 1;
    cur.bags += s.declared_total_bags;
    surveyorMap.set(s.survey_person_name, cur);
  }
  const ranking: RankItem[] = Array.from(surveyorMap.entries())
    .map(([name, v]) => ({ name, value: v.count, sub: `${v.bags} bags surveyed` }))
    .sort((a, b) => b.value - a.value);

  const totalIssued = lines.reduce((a, l) => a + l.total_bags, 0);
  const totalReceived = lines
    .filter((l) => l.effective_status === "received")
    .reduce((a, l) => a + l.total_bags, 0);
  const totalNotReceived = lines
    .filter((l) => l.effective_status === "not_received")
    .reduce((a, l) => a + l.total_bags, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <HeroStat label="Bags issued" value={totalIssued} icon="🌾" gradient="from-emerald-500 to-teal-600" />
        <HeroStat label="Bags received" value={totalReceived} icon="✅" gradient="from-sky-500 to-indigo-600" />
        <HeroStat label="Bags not received" value={totalNotReceived} icon="⚠️" gradient="from-rose-500 to-red-600" />
        <HeroStat label="Surveys done" value={surveys.length} icon="📋" gradient="from-violet-500 to-fuchsia-600" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {show.includes("district") && (
          <FlowCard title="By District" icon="🗺️" groups={byDistrict} delay={80} />
        )}
        {show.includes("zone") && (
          <FlowCard title="By Zone" icon="📍" groups={byZone} delay={160} />
        )}
        {show.includes("surveyor") && (
          <RevealCard delay={240}>
            <div className="mb-4 flex items-center gap-2">
              <span className="text-lg">🏆</span>
              <h3 className="font-semibold text-gray-900">Surveyor Ranking</h3>
              <span className="ml-auto text-xs text-gray-400">by surveys completed</span>
            </div>
            <Leaderboard items={ranking} unit="surveys" />
          </RevealCard>
        )}
      </div>
    </div>
  );
}
