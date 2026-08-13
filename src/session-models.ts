/** List/search authenticated Pi session models without switching. */

export interface SessionModelRef {
  provider: string;
  id: string;
  name?: string;
  /** Canonical `provider/id` reference used by Pi `/model`. */
  ref: string;
}

/** Minimal shape of Pi ExtensionContext model surfaces used here. */
export interface SessionModelSource {
  modelRegistry?: {
    getAvailable?: () => Array<{ provider: string; id: string; name?: string }>;
    getAll?: () => Array<{ provider: string; id: string; name?: string }>;
    hasConfiguredAuth?: (model: {
      provider: string;
      id: string;
      name?: string;
    }) => boolean;
  };
  scopedModels?: ReadonlyArray<{
    model: { provider: string; id: string; name?: string };
  }>;
  model?: { provider: string; id: string; name?: string } | null;
}

export interface ListedSessionModels {
  models: SessionModelRef[];
  current: SessionModelRef | null;
  source: "scoped" | "available" | "empty";
  notes: string[];
}

export function toSessionModelRef(model: {
  provider: string;
  id: string;
  name?: string;
}): SessionModelRef {
  return {
    provider: model.provider,
    id: model.id,
    name: model.name,
    ref: `${model.provider}/${model.id}`,
  };
}

function dedupeModels(models: SessionModelRef[]): SessionModelRef[] {
  const seen = new Set<string>();
  const out: SessionModelRef[] = [];
  for (const m of models) {
    const key = m.ref.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/**
 * Prefer session-scoped models when configured; otherwise authenticated
 * catalogue via modelRegistry.getAvailable() (auth-filtered when possible).
 */
export function listAuthenticatedSessionModels(
  source: SessionModelSource,
): ListedSessionModels {
  const notes: string[] = [];
  const current = source.model ? toSessionModelRef(source.model) : null;

  if (source.scopedModels && source.scopedModels.length > 0) {
    const models = dedupeModels(
      source.scopedModels.map((entry) => toSessionModelRef(entry.model)),
    );
    notes.push(
      `Using ${models.length} session-scoped model(s) (same set as /scoped-models).`,
    );
    return { models, current, source: "scoped", notes };
  }

  const registry = source.modelRegistry;
  let raw =
    typeof registry?.getAvailable === "function" ? registry.getAvailable() : [];

  if (!raw.length && typeof registry?.getAll === "function") {
    raw = registry.getAll();
    if (raw.length) {
      notes.push("getAvailable() empty; fell back to getAll() catalogue.");
    }
  }

  if (raw.length && typeof registry?.hasConfiguredAuth === "function") {
    const authed = raw.filter((m) => {
      try {
        return registry.hasConfiguredAuth!(m);
      } catch {
        return true;
      }
    });
    if (authed.length > 0) {
      raw = authed;
      notes.push("Filtered to models with configured auth.");
    } else {
      notes.push(
        "No model passed hasConfiguredAuth; listing unfiltered available catalogue.",
      );
    }
  } else if (raw.length) {
    notes.push("Auth filter unavailable; listing getAvailable() catalogue.");
  }

  const models = dedupeModels(raw.map(toSessionModelRef));
  if (!models.length) {
    notes.push(
      "No authenticated/available Pi models visible in this session context.",
    );
    return { models, current, source: "empty", notes };
  }
  return { models, current, source: "available", notes };
}

/** Case-insensitive substring search over provider, id, name, and ref. */
export function searchSessionModels(
  models: SessionModelRef[],
  query: string,
): SessionModelRef[] {
  const q = query.trim().toLowerCase();
  if (!q) return models;
  return models.filter((m) => {
    if (m.ref.toLowerCase().includes(q)) return true;
    if (m.id.toLowerCase().includes(q)) return true;
    if (m.provider.toLowerCase().includes(q)) return true;
    if (m.name && m.name.toLowerCase().includes(q)) return true;
    return false;
  });
}

/** Simple glob match (`*` only) against a full string. */
export function matchModelPattern(pattern: string, value: string): boolean {
  const escaped = pattern
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}
