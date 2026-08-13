import { indexProvidersById, type QuotaReadResult } from "./quota.ts";
import { resolveProfiles, type KnowledgePack } from "./knowledge.ts";
import type {
  BalanceResult,
  KnowledgeProfile,
  ProviderQuotaView,
  QualityFloor,
  RankedCandidate,
  RouteResult,
  TaskClass,
} from "./types.ts";

const QUALITY_RANK: Record<QualityFloor, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const DISCLAIMER =
  "Empfehlung nur — ersetzt weder Firstmate-Urteil noch quota-array-dispatch. Firstmate übergibt konkrete Flags an fm-spawn.";

export interface ClassifyResult {
  taskClass: TaskClass;
  confidence: "high" | "medium" | "low";
  notes: string[];
}

/** Keyword/heuristic classification; optional explicit class id wins. */
export function classifyTask(
  pack: KnowledgePack,
  taskText: string,
  explicitClassId?: string,
): ClassifyResult {
  if (explicitClassId) {
    const hit = pack.taskClasses.find((c) => c.id === explicitClassId);
    if (hit) {
      return {
        taskClass: hit,
        confidence: "high",
        notes: [`Explizite Klasse: ${hit.id}`],
      };
    }
    return {
      taskClass: pack.taskClasses.find((c) => c.id === "standard_ship") ?? pack.taskClasses[0],
      confidence: "low",
      notes: [
        `Unbekannte Klasse "${explicitClassId}", Fallback standard_ship`,
      ],
    };
  }

  const text = taskText.toLowerCase();
  const scores: Array<{ cls: TaskClass; score: number; hits: string[] }> = [];
  for (const cls of pack.taskClasses) {
    const hits = cls.keywords.filter((k) => keywordMatches(text, k));
    scores.push({ cls, score: hits.length, hits });
  }
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  if (!best || best.score === 0) {
    const standard =
      pack.taskClasses.find((c) => c.id === "standard_ship") ?? pack.taskClasses[0];
    return {
      taskClass: standard,
      confidence: "low",
      notes: [
        "Keine Keyword-Treffer; Fallback standard_ship. Bei Bedarf taskClass explizit setzen.",
      ],
    };
  }
  const second = scores[1];
  const confidence =
    best.score >= 2 && (!second || best.score > second.score)
      ? "high"
      : best.score >= 1
        ? "medium"
        : "low";
  return {
    taskClass: best.cls,
    confidence,
    notes: [
      `Keyword-Treffer (${best.score}): ${best.hits.slice(0, 6).join(", ")}`,
    ],
  };
}

export function buildSpawnFlags(profile: KnowledgeProfile): string {
  const parts = [`--harness ${shellQuote(profile.harness)}`];
  if (profile.model) parts.push(`--model ${shellQuote(profile.model)}`);
  if (profile.effort) parts.push(`--effort ${shellQuote(String(profile.effort))}`);
  return parts.join(" ");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Match keywords on token/phrase boundaries so short tokens like "pr" or "ship"
 * do not false-fire inside ordinary English (improve, relationship, …).
 */
export function keywordMatches(haystackLower: string, keyword: string): boolean {
  const k = keyword.toLowerCase().trim();
  if (!k) return false;
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const re = new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:$|[^a-z0-9_])`, "i");
  return re.test(haystackLower);
}

/**
 * Transparent ranking:
 * 1. Quality floor must be met (hard filter for preferred list; soft for fallback).
 * 2. Prefer non-exhausted providers when alternatives exist.
 * 3. Prefer higher known effectiveRemaining.
 * 4. Prefer longer known usable runway.
 * 5. Unknown quota stays eligible with uncertainty disclosed (never treated as 0).
 * 6. Preferred-list order is a weak tie-break only after quota comparisons.
 *
 * Rank score is diagnostic/transparent, not a hidden composite that replaces judgment.
 */
export interface RankOptions {
  /** Number of leading profiles that are class-preferred (rest are fallback). */
  preferredCount?: number;
}

export function rankCandidates(
  profiles: KnowledgeProfile[],
  providerIndex: Map<string, ProviderQuotaView>,
  qualityFloor: QualityFloor,
  mode: "live" | "degraded",
  options: RankOptions = {},
): RankedCandidate[] {
  const floor = QUALITY_RANK[qualityFloor] ?? 2;
  const preferredCount = options.preferredCount ?? profiles.length;
  const anyKnownHeadroom = [...providerIndex.values()].some(
    (p) => p.effectiveRemaining !== null && !p.exhausted,
  );

  const ranked: RankedCandidate[] = profiles.map((profile, index) => {
    const view = providerIndex.get(profile.provider) ?? null;
    const qualityFit = QUALITY_RANK[profile.quality] >= floor;
    const isPreferred = index < preferredCount;
    const evidence: string[] = [
      `profile=${profile.id}`,
      `provider=${profile.provider}`,
      `quality=${profile.quality} (floor ${qualityFloor})`,
      isPreferred ? "list=preferred" : "list=fallback",
      profile.why,
    ];

    let rankScore = 0;
    // Task-class fit dominates quota: preferred shortlist beats healthy fallbacks
    // unless preferred is exhausted while a fallback has real headroom.
    if (isPreferred) {
      rankScore += 50;
      rankScore += Math.max(0, preferredCount - index) * 0.5;
    } else {
      rankScore += Math.max(0, 5 - (index - preferredCount)) * 0.1;
    }

    if (qualityFit) rankScore += 100;
    else rankScore -= 50;

    if (mode === "degraded" || !view) {
      evidence.push(
        mode === "degraded"
          ? "quota=degraded/offline heuristic"
          : "quota=no provider row",
      );
      rankScore += 5; // neutral-ish offline
      return {
        profile,
        providerView: view,
        qualityFit,
        rankScore,
        tradeoff: qualityFit
          ? "Qualität ok; Quota offline/unbekannt — Knowledge-Reihenfolge."
          : "Unter Quality-Floor; nur Fallback.",
        evidence,
        spawnFlags: buildSpawnFlags(profile),
      };
    }

    evidence.push(view.evidence);

    if (view.exhausted && anyKnownHeadroom) {
      rankScore -= 80;
      evidence.push("penalty=exhausted_while_alternatives_exist");
    } else if (view.exhausted) {
      rankScore -= 20;
      evidence.push("note=exhausted_but_no_known_alternative_headroom");
    }

    if (view.effectiveRemaining !== null) {
      // 0..40 points from headroom
      rankScore += Math.min(40, Math.max(0, view.effectiveRemaining) * 0.4);
      evidence.push(`headroom_term=${(view.effectiveRemaining * 0.4).toFixed(1)}`);
    } else {
      // Unknown stays eligible; slight preference for known sustainable evidence elsewhere
      rankScore += 8;
      evidence.push("headroom_term=unknown_eligible(+8)");
    }

    if (view.usableRunwaySeconds !== null) {
      // Cap runway contribution (~1 day)
      const hours = view.usableRunwaySeconds / 3600;
      const runwayPts = Math.min(25, hours * 0.5);
      rankScore += runwayPts;
      evidence.push(`runway_term=${runwayPts.toFixed(1)} (${hours.toFixed(1)}h)`);
    } else {
      evidence.push("runway_term=unknown");
    }

    // Concrete auth failure is uncertainty for most providers; only soft penalty
    if (view.stateStatus === "auth_required" || view.authStatus === "unusable") {
      rankScore -= 15;
      evidence.push("soft_penalty=auth_uncertain");
    }

    const tradeoff = describeTradeoff(profile, view, qualityFit);
    return {
      profile,
      providerView: view,
      qualityFit,
      rankScore,
      tradeoff,
      evidence,
      spawnFlags: buildSpawnFlags(profile),
    };
  });

  ranked.sort((a, b) => b.rankScore - a.rankScore);
  return ranked;
}

function describeTradeoff(
  profile: KnowledgeProfile,
  view: ProviderQuotaView,
  qualityFit: boolean,
): string {
  const parts: string[] = [];
  if (!qualityFit) parts.push("unter Quality-Floor");
  else parts.push(`Qualität ${profile.quality}/${profile.reasoningClass}`);

  if (view.exhausted) parts.push("Quota erschöpft/0");
  else if (view.effectiveRemaining !== null)
    parts.push(`Headroom ${view.effectiveRemaining}% (${view.scopeUsed ?? "scope?"})`);
  else parts.push("Headroom unbekannt (eligible)");

  if (view.usableRunwaySeconds !== null)
    parts.push(`Runway ~${Math.round(view.usableRunwaySeconds / 3600)}h`);
  else if (view.runwayStatus && view.runwayStatus !== "unknown")
    parts.push(`Runway-Status ${view.runwayStatus}`);

  return parts.join("; ");
}

export function routeTask(
  pack: KnowledgePack,
  quota: QuotaReadResult,
  taskText: string,
  explicitClassId?: string,
): RouteResult {
  const classification = classifyTask(pack, taskText, explicitClassId);
  const preferred = resolveProfiles(pack, classification.taskClass.preferredProfileIds);
  const fallback = resolveProfiles(pack, classification.taskClass.fallbackProfileIds);
  // Deduplicate by profile id, preferred first
  const seen = new Set<string>();
  const combined: KnowledgeProfile[] = [];
  let preferredCount = 0;
  for (const p of preferred) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    combined.push(p);
    preferredCount += 1;
  }
  for (const p of fallback) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    combined.push(p);
  }

  const providerIndex = indexProvidersById(quota.providers);
  const ranked = rankCandidates(
    combined,
    providerIndex,
    classification.taskClass.qualityFloor,
    quota.mode,
    { preferredCount },
  );

  if (!ranked.length) {
    // Absolute fallback: first standard profile
    const emergency =
      pack.profileList.find((p) => p.id === "standard-codex") ?? pack.profileList[0];
    const emergencyRanked: RankedCandidate = {
      profile: emergency,
      providerView: providerIndex.get(emergency.provider) ?? null,
      qualityFit: true,
      rankScore: 0,
      tradeoff: "Emergency fallback — no class profiles resolved",
      evidence: ["no profiles for class"],
      spawnFlags: buildSpawnFlags(emergency),
    };
    return {
      taskClass: classification.taskClass,
      classificationConfidence: classification.confidence,
      classificationNotes: classification.notes,
      mode: quota.mode,
      degradedReason: quota.degradedReason,
      recommendation: emergencyRanked,
      alternatives: [],
      quotaSummary: summarizeQuota(quota),
      disclaimer: DISCLAIMER,
    };
  }

  const [recommendation, ...alternatives] = ranked;
  return {
    taskClass: classification.taskClass,
    classificationConfidence: classification.confidence,
    classificationNotes: classification.notes,
    mode: quota.mode,
    degradedReason: quota.degradedReason,
    recommendation,
    alternatives: alternatives.slice(0, 5),
    quotaSummary: summarizeQuota(quota),
    disclaimer: DISCLAIMER,
  };
}

export function balanceProviders(
  pack: KnowledgePack,
  quota: QuotaReadResult,
): BalanceResult {
  const views =
    quota.providers.length > 0
      ? [...quota.providers]
      : pack.providers.map(
          (p): ProviderQuotaView => ({
            provider: p.quotaProvider,
            label: p.label,
            stateStatus: "unknown",
            stale: false,
            semanticsStatus: "unknown",
            effectiveRemaining: null,
            usableRunwaySeconds: null,
            runwayStatus: "unknown",
            exhausted: false,
            evidence: "offline: no quota-axi data",
          }),
        );

  views.sort((a, b) => {
    // Non-exhausted known headroom first, then unknown, then exhausted
    const score = (v: ProviderQuotaView) => {
      if (v.exhausted) return -1000;
      if (v.effectiveRemaining !== null) return v.effectiveRemaining;
      return -1; // unknown above exhausted, below known positive
    };
    const d = score(b) - score(a);
    if (d !== 0) return d;
    const ra = a.usableRunwaySeconds ?? -1;
    const rb = b.usableRunwaySeconds ?? -1;
    return rb - ra;
  });

  const notes = [
    "Sortierung: bekanntes Headroom desc, dann Runway; exhausted zuletzt; unknown bleibt eligible.",
    "Prozentwerte sind provider-intern und nicht cross-provider vergleichbar — nur relative Preferenz.",
  ];
  if (quota.mode === "degraded") {
    notes.push(`Degraded: ${quota.degradedReason}`);
  }

  return {
    mode: quota.mode,
    degradedReason: quota.degradedReason,
    generatedAt: quota.snapshot?.generatedAt,
    providers: views,
    rankingNotes: notes,
    disclaimer: DISCLAIMER,
  };
}

function summarizeQuota(quota: QuotaReadResult): string {
  if (quota.mode === "degraded") {
    return `degraded: ${quota.degradedReason ?? "unknown"}`;
  }
  if (!quota.providers.length) return "live: no providers in snapshot";
  return quota.providers
    .map((p) => {
      const head =
        p.effectiveRemaining !== null ? `${p.effectiveRemaining}%` : "unk";
      const ex = p.exhausted ? "!exhausted" : "ok";
      return `${p.provider}:${head}/${ex}`;
    })
    .join(", ");
}
