import { execFile, type ChildProcess } from "node:child_process";
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

export type QuotaExec = (
  file: string,
  args: readonly string[],
  options: {
    encoding: "utf8";
    timeout: number;
    maxBuffer: number;
    env: NodeJS.ProcessEnv;
    signal?: AbortSignal;
  },
) => Promise<string>;

export interface ReadLiveQuotaOptions {
  signal?: AbortSignal;
  exec?: QuotaExec;
}

const QUOTA_TIMEOUT_MS = 20_000;

function defaultQuotaExec(
  file: string,
  args: readonly string[],
  options: {
    encoding: "utf8";
    timeout: number;
    maxBuffer: number;
    env: NodeJS.ProcessEnv;
    signal?: AbortSignal;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let child: ChildProcess | undefined;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const failAborted = () => {
      settle(() => reject(abortError(options.signal?.reason)));
    };
    const onAbort = () => {
      child?.kill("SIGTERM");
      failAborted();
    };

    if (options.signal?.aborted) {
      failAborted();
      return;
    }

    child = execFile(
      file,
      [...args],
      {
        encoding: "utf8",
        timeout: options.timeout,
        maxBuffer: options.maxBuffer,
        env: options.env,
        signal: options.signal,
      },
      (err, stdout) => {
        if (err) {
          settle(() => reject(err));
          return;
        }
        settle(() =>
          resolve(typeof stdout === "string" ? stdout : stdout.toString("utf8")),
        );
      },
    );

    options.signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function nodeErrorCode(err: unknown): unknown {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code: unknown }).code;
  }
  return undefined;
}

function abortError(reason?: unknown): Error {
  if (reason instanceof Error) return reason;
  return Object.assign(new Error("The operation was aborted"), {
    code: "ABORT_ERR",
    name: "AbortError",
  });
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if (nodeErrorCode(err) === "ABORT_ERR") return true;
  return "name" in err && (err as { name: unknown }).name === "AbortError";
}

function quotaFailureReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const missing =
    nodeErrorCode(err) === "ENOENT"
      ? "quota-axi not found on PATH"
      : `quota-axi failed: ${message.split("\n")[0]}`;
  return `${missing}. Using offline knowledge heuristics (labeled degraded).`;
}

function degraded(reason: string): QuotaReadResult {
  return {
    mode: "degraded",
    degradedReason: reason,
    providers: [],
  };
}

/** Run quota-axi --json from PATH. Never invents credentials. */
export async function readLiveQuota(
  options: ReadLiveQuotaOptions = {},
): Promise<QuotaReadResult> {
  const exec = options.exec ?? defaultQuotaExec;
  const signal = options.signal;
  if (signal?.aborted) {
    throw abortError(signal.reason);
  }
  try {
    const stdout = await exec("quota-axi", ["--json"], {
      encoding: "utf8",
      timeout: QUOTA_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      env: process.env,
      signal,
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
    if (isAbortError(err)) throw err;
    return degraded(quotaFailureReason(err));
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
  if (
    !stale &&
    effectiveRemaining === null &&
    Array.isArray(p.windows) &&
    p.windows.length > 0
  ) {
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
