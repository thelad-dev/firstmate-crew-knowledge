import { indexProvidersById, type QuotaReadResult } from "./quota.ts";
import type { KnowledgePack } from "./knowledge.ts";
import {
  listAuthenticatedSessionModels,
  matchModelPattern,
  searchSessionModels,
  type SessionModelRef,
  type SessionModelSource,
} from "./session-models.ts";
import { routeTask } from "./scorer.ts";
import type { KnowledgeProfile, ProviderQuotaView } from "./types.ts";

const DISCLAIMER =
  "Advisory only — schaltet kein Modell und berührt keine Crew-Panes. Manuell /model oder optionales pi-model-switch nutzen.";

export interface PrimaryModelMatch {
  model: SessionModelRef;
  profileId?: string;
  score: number;
  reason: string;
  tradeoff: string;
}

export interface SuggestPrimaryResult {
  goal: string;
  search?: string;
  taskClassId: string;
  mode: "live" | "degraded";
  degradedReason?: string;
  currentModel: SessionModelRef | null;
  availableCount: number;
  listedSource: "scoped" | "available" | "empty";
  matches: PrimaryModelMatch[];
  recommendation: PrimaryModelMatch | null;
  searchHits: SessionModelRef[];
  notes: string[];
  disclaimer: string;
}

export interface SuggestPrimaryOptions {
  goal?: string;
  /** Optional filter over authenticated session models (provider/id/name). */
  search?: string;
  session: SessionModelSource;
}

function profileModelTokens(profile: KnowledgeProfile): string[] {
  if (!profile.model) return [];
  const m = profile.model.toLowerCase();
  const tokens = [m];
  if (m.includes("/")) {
    const bare = m.slice(m.lastIndexOf("/") + 1);
    if (bare) tokens.push(bare);
  }
  return tokens;
}

export function modelMatchesProfile(
  model: SessionModelRef,
  profile: KnowledgeProfile,
): boolean {
  const ref = model.ref.toLowerCase();
  const id = model.id.toLowerCase();
  for (const token of profileModelTokens(profile)) {
    if (ref === token || id === token) return true;
    if (ref.endsWith(`/${token}`)) return true;
    // Allow dated ids (claude-sonnet-4-20250514) against bare hints.
    if (id === token || id.startsWith(`${token}-`) || id.startsWith(`${token}@`)) {
      return true;
    }
  }
  return false;
}

export function modelMatchesProviderPatterns(
  model: SessionModelRef,
  patterns: string[],
): boolean {
  const ref = model.ref;
  const id = model.id;
  for (const pat of patterns) {
    if (matchModelPattern(pat, ref) || matchModelPattern(pat, id)) return true;
    // Patterns like anthropic/* against provider-only when id wildcard.
    if (pat.endsWith("/*") && matchModelPattern(pat.slice(0, -1) + model.id, ref)) {
      return true;
    }
  }
  return false;
}

function providerViewForModel(
  model: SessionModelRef,
  pack: KnowledgePack,
  providerIndex: Map<string, ProviderQuotaView>,
): ProviderQuotaView | null {
  for (const info of pack.providers) {
    if (modelMatchesProviderPatterns(model, info.piModelPatterns)) {
      return providerIndex.get(info.quotaProvider) ?? null;
    }
  }
  return null;
}

function describeModelTradeoff(
  model: SessionModelRef,
  view: ProviderQuotaView | null,
  profileId?: string,
): string {
  const parts = [`session model ${model.ref}`];
  if (profileId) parts.push(`profile ${profileId}`);
  if (!view) parts.push("quota unbekannt/n.a.");
  else if (view.exhausted) parts.push("Quota erschöpft/0");
  else if (view.effectiveRemaining !== null)
    parts.push(`Headroom ${view.effectiveRemaining}%`);
  else parts.push("Headroom unbekannt (eligible)");
  return parts.join("; ");
}

/**
 * Recommend a primary-session Pi model only among models actually available
 * in the current ExtensionContext (scopedModels / modelRegistry).
 */
export function suggestPrimary(
  pack: KnowledgePack,
  quota: QuotaReadResult,
  options: SuggestPrimaryOptions,
): SuggestPrimaryResult {
  const goal = options.goal?.trim() || "standard primary orchestration";
  const search = options.search?.trim() || undefined;
  const listed = listAuthenticatedSessionModels(options.session);
  const pool = search
    ? searchSessionModels(listed.models, search)
    : listed.models;

  const routed = routeTask(pack, quota, goal);
  const providerIndex = indexProvidersById(quota.providers);
  const shortlist = [routed.recommendation, ...routed.alternatives];
  const notes = [
    ...listed.notes,
    `Task-Klasse (advisory): ${routed.taskClass.id} (${routed.classificationConfidence})`,
    ...routed.classificationNotes,
  ];
  if (search) {
    notes.push(
      `Search "${search}": ${pool.length} Treffer von ${listed.models.length} verfügbaren Session-Modellen.`,
    );
  }

  if (!listed.models.length) {
    notes.push(
      "Keine Empfehlung möglich — Session hat keine sichtbaren authentifizierten Pi-Modelle.",
    );
    return {
      goal,
      search,
      taskClassId: routed.taskClass.id,
      mode: routed.mode,
      degradedReason: routed.degradedReason,
      currentModel: listed.current,
      availableCount: 0,
      listedSource: listed.source,
      matches: [],
      recommendation: null,
      searchHits: [],
      notes,
      disclaimer: DISCLAIMER,
    };
  }

  if (!pool.length) {
    notes.push(
      `Search ohne Treffer unter ${listed.models.length} verfügbaren Session-Modellen.`,
    );
    return {
      goal,
      search,
      taskClassId: routed.taskClass.id,
      mode: routed.mode,
      degradedReason: routed.degradedReason,
      currentModel: listed.current,
      availableCount: listed.models.length,
      listedSource: listed.source,
      matches: [],
      recommendation: null,
      searchHits: [],
      notes,
      disclaimer: DISCLAIMER,
    };
  }

  const matches: PrimaryModelMatch[] = pool.map((model) => {
    let score = 0;
    const reasons: string[] = [];
    let profileId: string | undefined;
    const view = providerViewForModel(model, pack, providerIndex);

    for (let i = 0; i < shortlist.length; i++) {
      const cand = shortlist[i];
      if (modelMatchesProfile(model, cand.profile)) {
        const boost = Math.max(10, 120 - i * 12);
        score += boost;
        profileId = profileId ?? cand.profile.id;
        reasons.push(`profile-match ${cand.profile.id} (+${boost})`);
        break;
      }
    }

    if (!profileId) {
      for (let i = 0; i < shortlist.length; i++) {
        const cand = shortlist[i];
        const info = pack.providers.find((p) => p.id === cand.profile.provider);
        if (
          info &&
          modelMatchesProviderPatterns(model, info.piModelPatterns)
        ) {
          const boost = Math.max(5, 60 - i * 8);
          score += boost;
          profileId = cand.profile.id;
          reasons.push(`provider-family ${info.id} via ${cand.profile.id} (+${boost})`);
          break;
        }
      }
    }

    if (view) {
      if (view.exhausted) {
        score -= 40;
        reasons.push("quota exhausted penalty");
      } else if (view.effectiveRemaining !== null) {
        const pts = Math.min(25, view.effectiveRemaining * 0.25);
        score += pts;
        reasons.push(`headroom +${pts.toFixed(1)}`);
      } else {
        score += 5;
        reasons.push("quota unknown eligible +5");
      }
    } else {
      score += 2;
      reasons.push("no quota row +2");
    }

    if (
      listed.current &&
      listed.current.ref.toLowerCase() === model.ref.toLowerCase()
    ) {
      score += 1;
      reasons.push("currently active");
    }

    return {
      model,
      profileId,
      score,
      reason: reasons.join("; ") || "available in session",
      tradeoff: describeModelTradeoff(model, view, profileId),
    };
  });

  matches.sort((a, b) => b.score - a.score);

  // Prefer models that actually tied to the route shortlist; if none scored
  // a family/profile match, still surface the best available session model.
  const fitted = matches.filter(
    (m) => m.profileId !== undefined || m.score >= 5,
  );
  const ordered = fitted.length ? fitted : matches;
  const recommendation = ordered[0] ?? null;

  if (recommendation && recommendation.profileId === undefined) {
    notes.push(
      "Kein Knowledge-Profil traf exakt; beste verfügbare Session-Modell-Heuristik.",
    );
  }
  if (
    recommendation &&
    !shortlist.some(
      (c) =>
        modelMatchesProfile(recommendation.model, c.profile) ||
        modelMatchesProviderPatterns(
          recommendation.model,
          pack.providers.find((p) => p.id === c.profile.provider)
            ?.piModelPatterns ?? [],
        ),
    )
  ) {
    notes.push(
      "Empfehlung liegt außerhalb der route-preferred Provider-Familien — nur Session-Verfügbarkeit.",
    );
  }

  notes.push(
    "Empfehlung nur unter in dieser Session sichtbaren/authentifizierten Pi-Modellen.",
  );

  return {
    goal,
    search,
    taskClassId: routed.taskClass.id,
    mode: routed.mode,
    degradedReason: routed.degradedReason,
    currentModel: listed.current,
    availableCount: listed.models.length,
    listedSource: listed.source,
    matches: ordered.slice(0, 8),
    recommendation,
    searchHits: search ? pool : [],
    notes,
    disclaimer: DISCLAIMER,
  };
}

export function formatSuggestPrimaryResult(result: SuggestPrimaryResult): string {
  const lines: string[] = [
    "# crew_suggest_primary",
    "",
    `Goal: ${result.goal}`,
    result.search ? `Search: ${result.search}` : "Search: (none)",
    `Suggested class: ${result.taskClassId}`,
    `Mode: ${result.mode}${result.degradedReason ? ` — ${result.degradedReason}` : ""}`,
    `Session models: ${result.availableCount} (${result.listedSource})`,
    result.currentModel
      ? `Current: ${result.currentModel.ref}`
      : "Current: (none)",
    "",
  ];

  if (!result.recommendation) {
    lines.push("No primary switch target among authenticated session models.");
  } else {
    const rec = result.recommendation;
    lines.push("## Recommendation (advisory)");
    lines.push(`switch target: ${rec.model.ref}`);
    if (rec.model.name) lines.push(`name: ${rec.model.name}`);
    if (rec.profileId) lines.push(`aligned profile: ${rec.profileId}`);
    lines.push(`tradeoff: ${rec.tradeoff}`);
    lines.push(`why: ${rec.reason}`);
    lines.push("");
  }

  if (result.matches.length > 1) {
    lines.push("## Alternatives in session");
    for (const m of result.matches.slice(1, 6)) {
      lines.push(
        `- ${m.model.ref}${m.profileId ? ` [${m.profileId}]` : ""} score=${m.score.toFixed(1)} — ${m.reason}`,
      );
    }
    lines.push("");
  }

  if (result.search && result.searchHits.length) {
    lines.push("## Search hits");
    for (const hit of result.searchHits.slice(0, 12)) {
      lines.push(`- ${hit.ref}${hit.name ? ` (${hit.name})` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Notes");
  for (const n of result.notes) lines.push(`- ${n}`);
  lines.push("", result.disclaimer);
  return lines.join("\n");
}
