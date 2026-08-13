import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadKnowledge } from "../src/knowledge.ts";
import { summarizeSnapshot, type QuotaReadResult } from "../src/quota.ts";
import {
  listAuthenticatedSessionModels,
  searchSessionModels,
  type SessionModelSource,
} from "../src/session-models.ts";
import {
  modelMatchesProfile,
  suggestPrimary,
} from "../src/suggest-primary.ts";
import type { QuotaSnapshot } from "../src/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "tests", "fixtures");
const pack = loadKnowledge(root);

function loadFixture(name: string): QuotaReadResult {
  const snapshot = JSON.parse(
    readFileSync(join(fixtures, name), "utf8"),
  ) as QuotaSnapshot;
  return {
    mode: "live",
    snapshot,
    providers: summarizeSnapshot(snapshot),
  };
}

function sessionWith(
  models: Array<{ provider: string; id: string; name?: string }>,
  opts: {
    current?: { provider: string; id: string; name?: string };
    scoped?: boolean;
    authed?: Set<string>;
  } = {},
): SessionModelSource {
  const authed = opts.authed;
  if (opts.scoped) {
    return {
      scopedModels: models.map((m) => ({ model: m })),
      model: opts.current ?? null,
      modelRegistry: {
        getAvailable: () => [],
      },
    };
  }
  return {
    model: opts.current ?? null,
    modelRegistry: {
      getAvailable: () => models,
      hasConfiguredAuth: (m) =>
        authed ? authed.has(`${m.provider}/${m.id}`) : true,
    },
  };
}

describe("listAuthenticatedSessionModels", () => {
  it("prefers scopedModels over catalogue", () => {
    const listed = listAuthenticatedSessionModels({
      scopedModels: [
        { model: { provider: "anthropic", id: "claude-sonnet-4", name: "Sonnet" } },
      ],
      modelRegistry: {
        getAvailable: () => [
          { provider: "openai-codex", id: "gpt-5.5" },
          { provider: "anthropic", id: "claude-sonnet-4" },
        ],
      },
    });
    assert.equal(listed.source, "scoped");
    assert.equal(listed.models.length, 1);
    assert.equal(listed.models[0].ref, "anthropic/claude-sonnet-4");
  });

  it("filters getAvailable by hasConfiguredAuth", () => {
    const listed = listAuthenticatedSessionModels(
      sessionWith(
        [
          { provider: "anthropic", id: "claude-sonnet-4" },
          { provider: "xai", id: "grok-4" },
        ],
        { authed: new Set(["xai/grok-4"]) },
      ),
    );
    assert.equal(listed.source, "available");
    assert.deepEqual(
      listed.models.map((m) => m.ref),
      ["xai/grok-4"],
    );
  });
});

describe("searchSessionModels", () => {
  it("filters by provider/id substring", () => {
    const all = listAuthenticatedSessionModels(
      sessionWith([
        { provider: "anthropic", id: "claude-sonnet-4" },
        { provider: "anthropic", id: "claude-opus-4" },
        { provider: "xai", id: "grok-4" },
      ]),
    ).models;
    const hits = searchSessionModels(all, "opus");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, "claude-opus-4");
  });
});

describe("suggestPrimary", () => {
  it("only recommends models present in the session", () => {
    const quota = loadFixture("quota-balanced.json");
    const session = sessionWith([
      { provider: "openai-codex", id: "gpt-5.5", name: "GPT" },
      { provider: "xai", id: "grok-4" },
    ]);
    const result = suggestPrimary(pack, quota, {
      goal: "implement a standard feature",
      session,
    });
    assert.ok(result.recommendation);
    assert.ok(
      ["openai-codex/gpt-5.5", "xai/grok-4"].includes(
        result.recommendation!.model.ref,
      ),
    );
    assert.equal(result.availableCount, 2);
    for (const m of result.matches) {
      assert.ok(
        ["openai-codex/gpt-5.5", "xai/grok-4"].includes(m.model.ref),
        `unexpected model ${m.model.ref}`,
      );
    }
  });

  it("does not invent models outside the session catalogue", () => {
    const quota = loadFixture("quota-balanced.json");
    const session = sessionWith([{ provider: "xai", id: "grok-4" }]);
    const result = suggestPrimary(pack, quota, {
      goal: "hard multi-file architecture refactor",
      session,
    });
    assert.ok(result.recommendation);
    assert.equal(result.recommendation!.model.ref, "xai/grok-4");
    assert.ok(
      !result.matches.some((m) => m.model.provider === "anthropic"),
      "must not surface anthropic when not in session",
    );
  });

  it("returns null recommendation when session has no models", () => {
    const quota = loadFixture("quota-balanced.json");
    const result = suggestPrimary(pack, quota, {
      goal: "anything",
      session: { modelRegistry: { getAvailable: () => [] } },
    });
    assert.equal(result.recommendation, null);
    assert.equal(result.availableCount, 0);
    assert.match(result.notes.join(" "), /Keine Empfehlung/);
  });

  it("search restricts candidates", () => {
    const quota = loadFixture("quota-balanced.json");
    const session = sessionWith([
      { provider: "anthropic", id: "claude-sonnet-4" },
      { provider: "anthropic", id: "claude-opus-4" },
      { provider: "openai-codex", id: "gpt-5.5" },
    ]);
    const result = suggestPrimary(pack, quota, {
      goal: "standard ship",
      search: "opus",
      session,
    });
    assert.ok(result.recommendation);
    assert.equal(result.recommendation!.model.id, "claude-opus-4");
    assert.equal(result.searchHits.length, 1);
  });

  it("matches knowledge profile model ids against session models", () => {
    const profile = pack.profiles.get("standard-pi-sonnet");
    assert.ok(profile);
    assert.equal(
      modelMatchesProfile(
        {
          provider: "anthropic",
          id: "claude-sonnet-4",
          ref: "anthropic/claude-sonnet-4",
        },
        profile!,
      ),
      true,
    );
    assert.equal(
      modelMatchesProfile(
        {
          provider: "anthropic",
          id: "claude-sonnet-4-20250514",
          ref: "anthropic/claude-sonnet-4-20250514",
        },
        profile!,
      ),
      true,
    );
  });
});
