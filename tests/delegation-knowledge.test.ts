import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const root = join(import.meta.dirname, "..");
const knowledgeDir = join(root, "knowledge");

function loadJson(name: string) {
  return JSON.parse(readFileSync(join(knowledgeDir, name), "utf8"));
}

describe("delegation knowledge pack", () => {
  it("delegation.json has required structure", () => {
    const d = loadJson("delegation.json");
    assert.equal(d.version, 1);
    assert.ok(Array.isArray(d.contextDependency.levels));
    assert.equal(d.contextDependency.levels.length, 5);
    const ids = d.contextDependency.levels.map((l: { id: string }) => l.id);
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
    const p = loadJson("context-pack.json");
    assert.equal(p.version, 1);
    const required = p.requiredFields.map((f: { id: string }) => f.id);
    assert.ok(required.includes("TASK"));
    assert.ok(required.includes("OUT_OF_SCOPE"));
    assert.ok(p.sufficiencyGate.onNo.length >= 3);
  });

  it("ownership keeps fm-spawn under Firstmate and execution modes match policy schema", () => {
    const d = loadJson("delegation.json");
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
    const modeIds = d.executionModes.map((m: { id: string }) => m.id);
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
});
