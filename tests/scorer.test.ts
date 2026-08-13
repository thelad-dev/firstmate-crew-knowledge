import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadKnowledge } from "../src/knowledge.ts";
import { summarizeSnapshot, type QuotaReadResult } from "../src/quota.ts";
import {
  balanceProviders,
  buildSpawnFlags,
  classifyTask,
  rankCandidates,
  routeTask,
} from "../src/scorer.ts";
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

describe("classifyTask", () => {
  it("classifies research by keywords", () => {
    const r = classifyTask(
      pack,
      "Need live web research on current market news and latest news today",
    );
    assert.equal(r.taskClass.id, "research_web_live");
    assert.notEqual(r.confidence, "low");
  });

  it("does not classify ordinary coding as research_web_live", () => {
    const currentBug = classifyTask(
      pack,
      "fix the current bug in the login form",
    );
    assert.notEqual(currentBug.taskClass.id, "research_web_live");

    const latestCommit = classifyTask(
      pack,
      "update the latest commit message",
    );
    assert.notEqual(latestCommit.taskClass.id, "research_web_live");

    const freshBranch = classifyTask(
      pack,
      "rebase onto a fresh branch today",
    );
    assert.notEqual(freshBranch.taskClass.id, "research_web_live");

    const productChanges = classifyTask(
      pack,
      "need product changes in the checkout flow",
    );
    assert.notEqual(productChanges.taskClass.id, "research_web_live");

    const codebaseResearch = classifyTask(
      pack,
      "research why the login test fails",
    );
    assert.notEqual(codebaseResearch.taskClass.id, "research_web_live");
  });

  it("honors explicit class id", () => {
    const r = classifyTask(pack, "anything", "hard_multi_file");
    assert.equal(r.taskClass.id, "hard_multi_file");
    assert.equal(r.confidence, "high");
  });

  it("falls back to standard_ship", () => {
    const r = classifyTask(pack, "xyzzy unrelated blob");
    assert.equal(r.taskClass.id, "standard_ship");
    assert.equal(r.confidence, "low");
  });

  it("does not false-fire short keywords inside ordinary English", () => {
    // "pr" must not match improve/approach/provider/primary; "ship" not relationship/ownership
    const r = classifyTask(
      pack,
      "improve the approach for the provider primary relationship ownership",
    );
    assert.equal(r.taskClass.id, "standard_ship");
    assert.equal(r.confidence, "low");
    assert.match(r.notes.join(" "), /Keine Keyword-Treffer/);
  });

  it("still matches real pull-request / ship phrasing", () => {
    const pr = classifyTask(pack, "please open a pr for this feature");
    assert.equal(pr.taskClass.id, "standard_ship");
    assert.notEqual(pr.confidence, "low");

    const ship = classifyTask(pack, "ready to ship it after review");
    assert.equal(ship.taskClass.id, "standard_ship");
    assert.notEqual(ship.confidence, "low");
  });
});

describe("rankCandidates / routeTask with fixtures", () => {
  it("prefers codex when claude is low and codex has headroom", () => {
    const quota = loadFixture("quota-balanced.json");
    const result = routeTask(
      pack,
      quota,
      "implement a standard feature and open a PR",
      "standard_ship",
    );
    assert.equal(result.mode, "live");
    assert.equal(result.recommendation.profile.provider, "codex");
    assert.match(result.recommendation.spawnFlags, /--harness codex/);
    assert.match(result.recommendation.spawnFlags, /--model /);
    assert.match(result.recommendation.spawnFlags, /--effort /);
  });

  it("avoids exhausted claude when codex alternative exists", () => {
    const quota = loadFixture("quota-claude-exhausted.json");
    const result = routeTask(
      pack,
      quota,
      "big ambiguous multi-file refactor across architecture",
      "hard_multi_file",
    );
    assert.notEqual(result.recommendation.profile.provider, "claude");
    assert.equal(result.recommendation.profile.provider, "codex");
    const claudeAlt = [result.recommendation, ...result.alternatives].find(
      (c) => c.profile.provider === "claude",
    );
    assert.ok(claudeAlt);
    assert.ok(
      claudeAlt!.rankScore < result.recommendation.rankScore,
      "exhausted claude should rank below codex",
    );
  });

  it("keeps unknown-quota providers eligible (not treated as zero)", () => {
    const quota = loadFixture("quota-balanced.json");
    const profiles = pack.profileList.filter((p) =>
      ["standard-codex", "cursor-composer"].includes(p.id),
    );
    const providerIndex = new Map(
      quota.providers.map((p) => [p.provider, p] as const),
    );
    const ranked = rankCandidates(profiles, providerIndex, "medium", "live");
    const cursor = ranked.find((r) => r.profile.provider === "cursor");
    assert.ok(cursor);
    assert.equal(cursor!.providerView?.effectiveRemaining, null);
    // Should not be crushed to bottom solely for unknown
    assert.ok(cursor!.rankScore > 0);
  });

  it("routes research to grok when headroom exists", () => {
    const quota = loadFixture("quota-balanced.json");
    const result = routeTask(
      pack,
      quota,
      "research latest news and current product changes",
      "research_web_live",
    );
    assert.equal(result.recommendation.profile.provider, "grok");
    assert.match(result.recommendation.spawnFlags, /--harness (grok|pi)/);
  });

  it("degraded mode still returns a profile", () => {
    const degraded: QuotaReadResult = {
      mode: "degraded",
      degradedReason: "quota-axi not found on PATH",
      providers: [],
    };
    const result = routeTask(pack, degraded, "fix a typo", "trivial_fix");
    assert.equal(result.mode, "degraded");
    assert.ok(result.recommendation.spawnFlags.includes("--harness"));
    assert.match(result.degradedReason ?? "", /quota-axi/);
  });
});

describe("balanceProviders", () => {
  it("sorts known headroom above exhausted", () => {
    const quota = loadFixture("quota-claude-exhausted.json");
    const bal = balanceProviders(pack, quota);
    const ids = bal.providers.map((p) => p.provider);
    assert.ok(ids.indexOf("codex") < ids.indexOf("claude"));
  });
});

describe("buildSpawnFlags", () => {
  it("emits harness model effort", () => {
    const p = pack.profiles.get("standard-codex");
    assert.ok(p);
    assert.equal(
      buildSpawnFlags(p!),
      "--harness codex --model gpt-5.5 --effort medium",
    );
  });
});
