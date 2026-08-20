import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const root = join(import.meta.dirname, "..");
const knowledgeDir = join(root, "knowledge");

type Level = { id: string; microtaskDefault: string };
type Mode = {
  id: string;
  label: string;
  when: string;
  shipScoutRelation: string;
};
type Field = { id: string };

function loadJson(name: string) {
  return JSON.parse(readFileSync(join(knowledgeDir, name), "utf8"));
}

/** Owned machine-readable policy contract for context-aware delegation. */
function loadDelegation() {
  return loadJson("delegation.json") as {
    version: number;
    ownership: {
      firstmateExisting: string[];
      knowledgePolicy: string[];
      firstmateExtensionRequired: string[];
    };
    delegationFirstRule: {
      forbiddenAsDefaultFirstmateWork: string[];
      allowedFirstmateWork: string[];
    };
    contextDependency: { levels: Level[] };
    executionModes: Mode[];
    evidenceChain: {
      requiredFields: string[];
      noBlindSynthesis: string;
    };
    compressionVsLoss: {
      compressionAllowed: string;
      lossForbidden: string;
    };
    progressiveContextExpansion: string[];
    decisionModel: { output: string; antiPatterns: string[] };
    microtaskNotAlwaysBetter: {
      preferSingleTaskWhen: string[];
      preferMicrotaskWhen: string[];
    };
  };
}

function loadContextPack() {
  return loadJson("context-pack.json") as {
    version: number;
    requiredFields: Field[];
    conditionalFields: Field[];
    sufficiencyGate: { question: string; onNo: string[] };
    dependencyCheckPrompts: string[];
  };
}

/**
 * Evaluation suite A–H: expected dependency / mode families from
 * evaluation/delegation-cases.md, asserted against the JSON policy model.
 */
const EVALUATION_CASES: Array<{
  id: string;
  dependency?: string;
  mustAllowModes: string[];
  forbidModes?: string[];
  notes: string;
}> = [
  {
    id: "A",
    dependency: "VERY_LOW",
    mustAllowModes: ["DIRECT_DELEGATION", "MICROTASK"],
    notes: "local readonly analysis",
  },
  {
    id: "B",
    dependency: "MEDIUM",
    mustAllowModes: ["MICROTASK_CONTEXT_PACK"],
    notes: "local change + API with system context",
  },
  {
    id: "C",
    dependency: "LOW",
    mustAllowModes: ["MICROTASK"],
    notes: "three parallel readonly microtasks",
  },
  {
    id: "D",
    dependency: "HIGH",
    mustAllowModes: ["SCOUT_THEN_SHIP"],
    forbidModes: ["MICROTASK"],
    notes: "multi-service: no blind microtask split",
  },
  {
    id: "E",
    mustAllowModes: ["MICROTASK", "MICROTASK_CONTEXT_PACK"],
    notes: "progressive expansion after block",
  },
  {
    id: "F",
    mustAllowModes: ["MICROTASK"],
    notes: "conflict → re-evidence via noBlindSynthesis",
  },
  {
    id: "G",
    mustAllowModes: ["DIRECT_DELEGATION", "MICROTASK", "FULL_CONTEXT_DELEGATION"],
    notes: "routine ship without illegitimate approval",
  },
  {
    id: "H",
    mustAllowModes: ["FULL_CONTEXT_DELEGATION", "SCOUT_THEN_SHIP"],
    notes: "security/destructive → captain",
  },
];

describe("delegation knowledge pack", () => {
  it("delegation.json has required structure", () => {
    const d = loadDelegation();
    assert.equal(d.version, 1);
    assert.ok(Array.isArray(d.contextDependency.levels));
    assert.equal(d.contextDependency.levels.length, 5);
    const ids = d.contextDependency.levels.map((l) => l.id);
    assert.deepEqual(ids, [
      "VERY_LOW",
      "LOW",
      "MEDIUM",
      "HIGH",
      "VERY_HIGH",
    ]);
    assert.ok(Array.isArray(d.executionModes));
    assert.ok(d.executionModes.length >= 5);
    assert.ok(d.evidenceChain.requiredFields.includes("FINDINGS"));
    assert.ok(d.delegationFirstRule.forbiddenAsDefaultFirstmateWork.length > 0);
  });

  it("context-pack.json lists sufficiency fields", () => {
    const p = loadContextPack();
    assert.equal(p.version, 1);
    const required = p.requiredFields.map((f) => f.id);
    assert.ok(required.includes("TASK"));
    assert.ok(required.includes("OUT_OF_SCOPE"));
    assert.ok(p.sufficiencyGate.onNo.length >= 3);
  });

  it("ownership keeps fm-spawn under Firstmate and execution modes match policy schema", () => {
    const d = loadDelegation();
    assert.ok(
      Array.isArray(d.ownership.firstmateExisting) &&
        d.ownership.firstmateExisting.includes("bin/fm-spawn.sh"),
    );
    assert.ok(
      Array.isArray(d.ownership.knowledgePolicy) &&
        d.ownership.knowledgePolicy.length > 0,
    );
    assert.ok(!d.ownership.knowledgePolicy.includes("bin/fm-spawn.sh"));
    assert.ok(
      Array.isArray(d.ownership.firstmateExtensionRequired) &&
        !d.ownership.firstmateExtensionRequired.includes("bin/fm-spawn.sh"),
    );
    const modeIds = d.executionModes.map((m) => m.id);
    assert.deepEqual(modeIds, [
      "DIRECT_DELEGATION",
      "MICROTASK",
      "MICROTASK_CONTEXT_PACK",
      "FULL_CONTEXT_DELEGATION",
      "SCOUT_THEN_SHIP",
    ]);
    for (const mode of d.executionModes) {
      assert.equal(typeof mode.id, "string");
      assert.equal(typeof mode.label, "string");
      assert.equal(typeof mode.when, "string");
      assert.equal(typeof mode.shipScoutRelation, "string");
    }
  });

  it("evidence chain, compression≠loss, and progressive expansion are machine-readable", () => {
    const d = loadDelegation();
    assert.deepEqual(d.evidenceChain.requiredFields, [
      "FINDINGS",
      "EVIDENCE",
      "FILES",
      "SYMBOLS",
      "CONFIDENCE",
      "OPEN_QUESTIONS",
      "RECOMMENDATION",
    ]);
    assert.equal(typeof d.evidenceChain.noBlindSynthesis, "string");
    assert.ok(d.evidenceChain.noBlindSynthesis.length > 20);
    assert.ok(d.compressionVsLoss.compressionAllowed.length > 10);
    assert.ok(d.compressionVsLoss.lossForbidden.length > 10);
    assert.ok(d.progressiveContextExpansion.length >= 3);
    assert.equal(d.decisionModel.output, "executionMode");
    assert.ok(d.decisionModel.antiPatterns.includes("compression that drops global invariants"));
    assert.ok(d.microtaskNotAlwaysBetter.preferSingleTaskWhen.length > 0);
    assert.ok(d.microtaskNotAlwaysBetter.preferMicrotaskWhen.length > 0);
  });

  it("context pack schema covers all required microtask fields and gate exits", () => {
    const p = loadContextPack();
    assert.deepEqual(
      p.requiredFields.map((f) => f.id),
      [
        "TASK",
        "GOAL",
        "RELEVANT_FILES",
        "RELEVANT_SYMBOLS",
        "DEPENDENCIES",
        "KNOWN_CONSTRAINTS",
        "EXPECTED_OUTPUT",
        "OUT_OF_SCOPE",
      ],
    );
    assert.ok(p.conditionalFields.some((f) => f.id === "SYSTEM_CONTEXT"));
    assert.ok(typeof p.sufficiencyGate.question === "string");
    for (const exit of [
      "add SYSTEM_CONTEXT or RELEVANT_FILES",
      "run scout first",
      "use FULL-CONTEXT DELEGATION",
      "abandon microtask split",
    ]) {
      assert.ok(p.sufficiencyGate.onNo.includes(exit), `missing gate exit: ${exit}`);
    }
    assert.ok(p.dependencyCheckPrompts.length >= 5);
  });

  it("HIGH/VERY_HIGH levels discourage blind microtask splits", () => {
    const d = loadDelegation();
    const byId = Object.fromEntries(d.contextDependency.levels.map((l) => [l.id, l]));
    assert.equal(byId.VERY_LOW.microtaskDefault, "often");
    assert.equal(byId.LOW.microtaskDefault, "usually");
    assert.equal(byId.MEDIUM.microtaskDefault, "only_with_context_pack");
    assert.equal(byId.HIGH.microtaskDefault, "avoid_blind_split");
    assert.equal(byId.VERY_HIGH.microtaskDefault, "no");
  });

  it("evaluation cases A–H map onto declared execution modes and dependency levels", () => {
    const d = loadDelegation();
    const modeIds = new Set(d.executionModes.map((m) => m.id));
    const levelIds = new Set(d.contextDependency.levels.map((l) => l.id));
    assert.equal(EVALUATION_CASES.length, 8);
    for (const c of EVALUATION_CASES) {
      if (c.dependency) {
        assert.ok(levelIds.has(c.dependency), `case ${c.id}: unknown level`);
      }
      for (const mode of c.mustAllowModes) {
        assert.ok(modeIds.has(mode), `case ${c.id}: missing mode ${mode}`);
      }
      if (c.forbidModes && c.dependency) {
        const level = d.contextDependency.levels.find((l) => l.id === c.dependency)!;
        assert.ok(
          level.microtaskDefault === "avoid_blind_split" ||
            level.microtaskDefault === "no",
          `case ${c.id}: dependency ${c.dependency} must discourage blind microtasks`,
        );
      }
    }
    // Case F requires explicit no-blind-synthesis policy (observable contract).
    assert.match(d.evidenceChain.noBlindSynthesis, /conflict|Conflicting|never/i);
  });

  it("quota-array-dispatch stays Firstmate-owned (no parallel routing engine in knowledgePolicy)", () => {
    const d = loadDelegation();
    assert.ok(d.ownership.firstmateExisting.includes("quota-array-dispatch"));
    assert.ok(d.ownership.firstmateExisting.includes("bin/fm-spawn.sh"));
    for (const item of d.ownership.knowledgePolicy) {
      assert.ok(!/fm-spawn|quota-array-dispatch|crew-dispatch\.json/i.test(item));
    }
  });

  it("deliverable examples and docs exist as published knowledge surfaces", () => {
    const examples = readdirSync(join(root, "examples")).filter((f) => f.endsWith(".md"));
    for (const name of [
      "simple-microtask.md",
      "microtask-with-context-pack.md",
      "not-microtaskable.md",
      "full-context-delegation.md",
      "scout-then-ship.md",
      "conflicting-microtask-results.md",
    ]) {
      assert.ok(examples.includes(name), `missing example ${name}`);
    }
    for (const name of [
      "context-aware-microtasking.md",
      "delegation-policy.md",
      "context-sufficiency.md",
      "approval-policy.md",
      "firstmate-failure-modes.md",
    ]) {
      assert.ok(
        readFileSync(join(root, "docs", name), "utf8").length > 100,
        `docs/${name} empty`,
      );
    }
    const evalDoc = readFileSync(join(root, "evaluation", "delegation-cases.md"), "utf8");
    for (const letter of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
      assert.match(evalDoc, new RegExp(`## ${letter} —`));
    }
  });
});
