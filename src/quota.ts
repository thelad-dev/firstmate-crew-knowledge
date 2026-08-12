import { execFileSync } from "node:child_process";
import type {
  EffectiveAvailability,
  ProviderQuotaView,
  QuotaProviderSnapshot,
  QuotaSnapshot,
} from "./types.ts";

export interface QuotaReadResult {
  mode: "live" | "degraded";
  snapshot?: QuotaSnapshot;
  degradedReason?: string;
  providers: ProviderQuotaView[];
}

const QUOTA_TIMEOUT_MS = 20_000;

/** Run quota-axi --json from PATH. Never invents credentials. */
export function readLiveQuota(
  exec: typeof execFileSync = execFileSync,
): QuotaReadResult {
  try {
    const stdout = exec("quota-axi", ["--json"], {
      encoding: "utf8",
      timeout: QUOTA_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      env: process.env,
    });
    const snapshot = JSON.parse(stdout) as QuotaSnapshot;
    if (!snapshot || !Array.isArray(snapshot.providers)) {
      return {
        mode: "degraded",
        degradedReason: "quota-axi --json returned unexpected shape (missing providers[])",
        providers: [],
      };
    }
    return {
      mode: "live",
      snapshot,
      providers: snapshot.providers.map(summarizeProvider),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const missing =
      /ENOENT|not found|spawn/i.test(message)
        ? "quota-axi not found on PATH"
        : `quota-axi failed: ${message.split("\n")[0]}`;
    return {
      mode: "degraded",
      degradedReason: `${missing}. Using offline knowledge heuristics (labeled degraded).`,
      providers: [],
    };
  }
}

/** Pure parse path for fixtures/tests. */
export function summarizeSnapshot(snapshot: QuotaSnapshot): ProviderQuotaView[] {
  return (snapshot.providers ?? []).map(summarizeProvider);
}

export function summarizeProvider(p: QuotaProviderSnapshot): ProviderQuotaView {
  const stateStatus = p.state?.status ?? "unknown";
  const stale = Boolean(p.state?.stale);
  const semanticsStatus = p.quotaSemantics?.status ?? "unknown";
  const avail = pickApplicableAvailability(p.quotaSemantics?.effectiveAvailability ?? []);

  let effectiveRemaining: number | null = null;
  let usableRunwaySeconds: number | null = null;
  let runwayStatus = "unknown";
  let scopeUsed: string | undefined;

  if (avail && !stale) {
    scopeUsed = avail.scope;
    if (
      avail.status === "known" &&
      typeof avail.effectivePercentRemaining === "number" &&
      Number.isFinite(avail.effectivePercentRemaining)
    ) {
      effectiveRemaining = avail.effectivePercentRemaining;
    }
    const runway = avail.runway;
    if (runway) {
      runwayStatus = runway.status ?? "unknown";
      if (
        runway.status === "projected_exhaustion" ||
        runway.status === "through_reset" ||
        runway.status === "exhausted_now"
      ) {
        if (typeof runway.usableRunwaySeconds === "number" && Number.isFinite(runway.usableRunwaySeconds)) {
          usableRunwaySeconds = runway.usableRunwaySeconds;
        } else if (runway.status === "exhausted_now") {
          usableRunwaySeconds = 0;
        }
      }
    }
  }

  // Fallback diagnostic: single window percentRemaining when semantics unknown
  // but a clear 0-remaining window exists — still label as window-diagnostic.
  let exhausted = effectiveRemaining === 0 || usableRunwaySeconds === 0;
  if (effectiveRemaining === null && Array.isArray(p.windows) && p.windows.length > 0) {
    const remainings = p.windows
      .map((w) => w.percentRemaining)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    if (remainings.length > 0 && remainings.every((n) => n <= 0)) {
      exhausted = true;
    }
  }

  const evidenceParts: string[] = [
    `state=${stateStatus}`,
    stale ? "stale" : "fresh-or-n/a",
    `semantics=${semanticsStatus}`,
  ];
  if (scopeUsed) evidenceParts.push(`scope=${scopeUsed}`);
  if (effectiveRemaining !== null) evidenceParts.push(`effectiveRemaining=${effectiveRemaining}%`);
  else evidenceParts.push("effectiveRemaining=unknown");
  if (usableRunwaySeconds !== null) evidenceParts.push(`runwaySeconds=${usableRunwaySeconds}`);
  else evidenceParts.push(`runway=${runwayStatus}`);
  if (p.state?.authStatus) evidenceParts.push(`authStatus=${p.state.authStatus}`);
  if (p.state?.error) evidenceParts.push(`error=${p.state.error}`);

  return {
    provider: p.provider,
    label: p.label ?? p.provider,
    stateStatus,
    stale,
    authStatus: p.state?.authStatus,
    error: p.state?.error,
    semanticsStatus,
    effectiveRemaining,
    usableRunwaySeconds,
    runwayStatus,
    scopeUsed,
    exhausted,
    evidence: evidenceParts.join("; "),
  };
}

/**
 * Prefer broad account scopes (all_models / all_products) over model-specific
 * scopes when summarizing provider-level headroom.
 */
export function pickApplicableAvailability(
  items: EffectiveAvailability[],
): EffectiveAvailability | undefined {
  if (!items.length) return undefined;
  const broad = items.find((i) => {
    const s = (i.scope ?? "").toLowerCase();
    return s === "all_models" || s === "all_products" || s === "account";
  });
  if (broad) return broad;
  // Prefer known status entries
  const known = items.find((i) => i.status === "known");
  return known ?? items[0];
}

export function indexProvidersById(
  views: ProviderQuotaView[],
): Map<string, ProviderQuotaView> {
  const m = new Map<string, ProviderQuotaView>();
  for (const v of views) m.set(v.provider, v);
  return m;
}
