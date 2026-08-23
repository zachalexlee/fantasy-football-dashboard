// Readable views over ESPN's raw scoring + roster settings blobs (stored on the
// league). ESPN keys scoring by numeric stat id; we label the well-known
// offensive ones and surface the rest count so nothing is silently dropped.

const SCORING_LABEL: Record<number, string> = {
  3: "Per passing yard",
  4: "Passing TD",
  20: "Interception thrown",
  19: "2-pt conversion (pass)",
  24: "Per rushing yard",
  25: "Rushing TD",
  26: "2-pt conversion (rush)",
  42: "Per receiving yard",
  43: "Receiving TD",
  53: "Per reception (PPR)",
  44: "2-pt conversion (rec)",
  72: "Fumble lost",
  74: "FG made 50+",
  77: "FG made 40-49",
  80: "FG made 0-39",
  85: "Extra point made",
  89: "Defense: 0 pts allowed",
  95: "Defense: interception",
  96: "Defense: fumble recovery",
  97: "Defense: sack",
  98: "Defense: safety",
  99: "Defense: TD",
  101: "Kickoff return TD",
  102: "Punt return TD",
};

export type ScoringRule = { label: string; points: number };

export function scoringRules(scoring: Record<string, unknown> | null): {
  rules: ScoringRule[];
  ppr: number | null;
  unknown: number;
} {
  const items = (scoring?.scoringItems as { statId: number; points: number }[]) ?? [];
  const rules: ScoringRule[] = [];
  let unknown = 0;
  let ppr: number | null = null;
  for (const it of items) {
    const label = SCORING_LABEL[it.statId];
    if (it.statId === 53) ppr = it.points;
    if (label) rules.push({ label, points: it.points });
    else unknown++;
  }
  // Stable, readable order (biggest-impact scoring first).
  rules.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  return { rules, ppr, unknown };
}

const SLOT_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "RB/WR", "WR/TE", "OP", "D/ST", "K", "BE", "IR"];

/** Full roster composition (starters + bench/IR) from settings.rosterSettings. */
export function rosterComposition(
  settings: Record<string, unknown> | null
): { slot: string; count: number }[] {
  const raw = (settings?.rosterSettings as { lineupSlotCounts?: Record<string, number> })
    ?.lineupSlotCounts;
  const SLOT_BY_ID: Record<string, string> = {
    "0": "QB", "2": "RB", "3": "RB/WR", "4": "WR", "5": "WR/TE", "6": "TE",
    "7": "OP", "16": "D/ST", "17": "K", "20": "BE", "21": "IR", "23": "FLEX",
  };
  if (!raw) return [];
  const out: { slot: string; count: number }[] = [];
  for (const [id, n] of Object.entries(raw)) {
    const slot = SLOT_BY_ID[id];
    if (slot && n > 0) out.push({ slot, count: n });
  }
  return out.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
}
