import { readFileSync } from "node:fs";
import { resolveProfiles, type KnowledgePack } from "./knowledge.ts";
import {
  crewDispatchPath,
  resolveFmHome,
  writeUnderFmConfig,
} from "./fm-home.ts";
import type {
  CrewDispatchFile,
  DispatchBuildResult,
  KnowledgeProfile,
  SpawnProfile,
} from "./types.ts";

const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

export function profileToSpawn(p: KnowledgeProfile): SpawnProfile {
  const out: SpawnProfile = { harness: p.harness };
  if (p.model) out.model = p.model;
  if (p.effort) out.effort = p.effort;
  return out;
}

/** Build a crew-dispatch.json document from the knowledge pack template. */
export function buildDispatchFromKnowledge(pack: KnowledgePack): CrewDispatchFile {
  const rules = pack.dispatchTemplate.rules.map((rule) => {
    const profiles = resolveProfiles(pack, rule.profileIds).map(profileToSpawn);
    if (!profiles.length) {
      throw new Error(`Dispatch rule has no resolvable profiles: ${rule.when}`);
    }
    return {
      when: rule.when,
      use: profiles.length === 1 ? profiles[0]! : profiles,
      why: rule.why,
    };
  });

  const defaults = resolveProfiles(pack, pack.dispatchTemplate.defaultProfileIds).map(
    profileToSpawn,
  );
  if (!defaults.length) {
    throw new Error("dispatchTemplate.defaultProfileIds resolved empty");
  }

  return {
    rules,
    default: defaults.length === 1 ? defaults[0]! : defaults,
  };
}

/**
 * Lightweight schema check matching Firstmate docs/examples/crew-dispatch.json.
 * Does not verify harness binaries — Firstmate bootstrap owns that.
 */
export function validateDispatch(doc: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!doc || typeof doc !== "object") {
    return { ok: false, errors: ["root must be an object"] };
  }
  const root = doc as Record<string, unknown>;
  if (!Array.isArray(root.rules)) {
    errors.push("rules must be an array");
  } else {
    if (root.rules.length === 0) errors.push("rules must be non-empty");
    root.rules.forEach((rule, i) => validateRule(rule, `rules[${i}]`, errors));
  }
  if (root.default !== undefined) {
    validateUse(root.default, "default", errors);
  }
  return { ok: errors.length === 0, errors };
}

function validateRule(rule: unknown, path: string, errors: string[]): void {
  if (!rule || typeof rule !== "object") {
    errors.push(`${path} must be an object`);
    return;
  }
  const r = rule as Record<string, unknown>;
  if (typeof r.when !== "string" || !r.when.trim()) {
    errors.push(`${path}.when must be a non-empty string`);
  }
  if (r.use === undefined) {
    errors.push(`${path}.use is required`);
  } else {
    validateUse(r.use, `${path}.use`, errors);
  }
  if (r.why !== undefined && typeof r.why !== "string") {
    errors.push(`${path}.why must be a string when present`);
  }
}

function validateUse(use: unknown, path: string, errors: string[]): void {
  if (Array.isArray(use)) {
    if (use.length === 0) errors.push(`${path} array must be non-empty`);
    use.forEach((p, i) => validateProfile(p, `${path}[${i}]`, errors));
    return;
  }
  validateProfile(use, path, errors);
}

function validateProfile(profile: unknown, path: string, errors: string[]): void {
  if (!profile || typeof profile !== "object") {
    errors.push(`${path} must be a profile object`);
    return;
  }
  const p = profile as Record<string, unknown>;
  if (typeof p.harness !== "string" || !p.harness.trim()) {
    errors.push(`${path}.harness is required`);
  }
  if (p.model !== undefined && typeof p.model !== "string") {
    errors.push(`${path}.model must be a string when present`);
  }
  if (p.effort !== undefined) {
    if (typeof p.effort !== "string" || !EFFORTS.has(p.effort)) {
      errors.push(
        `${path}.effort must be one of low|medium|high|xhigh|max when present`,
      );
    }
  }
}

export interface ApplyDispatchOptions {
  /** When true (default), do not write — only return content. */
  dryRun?: boolean;
  /** Merge generated rules with an existing file when present. */
  merge?: boolean;
  /** Override FM_HOME resolution (tests). */
  fmHome?: string | null;
  env?: NodeJS.ProcessEnv;
}

/**
 * Generate (and optionally write) config/crew-dispatch.json under FM_HOME.
 * Writes are refused unless dryRun is explicitly false.
 * Never writes outside FM_HOME/config.
 */
export function applyDispatch(
  pack: KnowledgePack,
  options: ApplyDispatchOptions = {},
): DispatchBuildResult {
  const dryRun = options.dryRun !== false;
  const env = options.env ?? process.env;

  let home = options.fmHome;
  let homeSource = "option";
  if (home === undefined) {
    const resolved = resolveFmHome(env);
    home = resolved.home;
    homeSource = resolved.source;
  }

  let dispatch = buildDispatchFromKnowledge(pack);

  if (!home) {
    const validation = validateDispatch(dispatch);
    return {
      dispatch,
      path: "(FM_HOME unset — no write target)",
      dryRun: true,
      wrote: false,
      validation,
      summary: `FM_HOME unset (${homeSource}); dry-run only. Set FM_HOME to enable writes to config/crew-dispatch.json.`,
    };
  }

  const path = crewDispatchPath(home);

  if (options.merge) {
    try {
      const existing = JSON.parse(readFileSync(path, "utf8")) as CrewDispatchFile;
      dispatch = mergeDispatch(existing, dispatch);
    } catch {
      // no existing or invalid — use generated
    }
  }

  const validation = validateDispatch(dispatch);
  if (!validation.ok) {
    return {
      dispatch,
      path,
      dryRun: true,
      wrote: false,
      validation,
      summary: `Validation failed; not writing. Errors: ${validation.errors.join("; ")}`,
    };
  }

  if (dryRun) {
    return {
      dispatch,
      path,
      dryRun: true,
      wrote: false,
      validation,
      summary: `Dry-run OK. Would write ${path}. Pass dryRun=false for explicit write under FM_HOME/config.`,
    };
  }

  const body = `${JSON.stringify(dispatch, null, 2)}\n`;
  const written = writeUnderFmConfig(home, "crew-dispatch.json", body);
  return {
    dispatch,
    path: written,
    dryRun: false,
    wrote: true,
    validation,
    summary: `Wrote ${written} (${dispatch.rules.length} rules). Firstmate still chooses the matching rule and may resolve arrays via quota-array-dispatch before fm-spawn.`,
  };
}

/** Append generated rules that are not already present by exact `when` text. */
export function mergeDispatch(
  existing: CrewDispatchFile,
  generated: CrewDispatchFile,
): CrewDispatchFile {
  const whens = new Set(existing.rules.map((r) => r.when));
  const rules = [...existing.rules];
  for (const rule of generated.rules) {
    if (!whens.has(rule.when)) rules.push(rule);
  }
  return {
    rules,
    default: existing.default ?? generated.default,
  };
}
