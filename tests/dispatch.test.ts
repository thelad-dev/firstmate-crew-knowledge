import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyDispatch,
  buildDispatchFromKnowledge,
  mergeDispatch,
  validateDispatch,
} from "../src/dispatch.ts";
import { loadKnowledge } from "../src/knowledge.ts";
import type { CrewDispatchFile } from "../src/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pack = loadKnowledge(root);

describe("buildDispatchFromKnowledge", () => {
  it("matches Firstmate schema shape", () => {
    const doc = buildDispatchFromKnowledge(pack);
    const v = validateDispatch(doc);
    assert.equal(v.ok, true, v.errors.join("; "));
    assert.ok(Array.isArray(doc.rules) && doc.rules.length >= 3);
    assert.ok(doc.default);
    for (const rule of doc.rules) {
      assert.equal(typeof rule.when, "string");
      assert.ok(rule.use);
    }
  });

  it("rejects empty rules", () => {
    const v = validateDispatch({ rules: [] });
    assert.equal(v.ok, false);
  });

  it("rejects profile without harness", () => {
    const v = validateDispatch({
      rules: [{ when: "x", use: { model: "y" } }],
    });
    assert.equal(v.ok, false);
  });
});

describe("applyDispatch", () => {
  it("dry-run by default does not write", () => {
    const home = mkdtempSync(join(tmpdir(), "fck-dry-"));
    try {
      const result = applyDispatch(pack, { fmHome: home, dryRun: true });
      assert.equal(result.wrote, false);
      assert.equal(result.dryRun, true);
      assert.equal(result.validation.ok, true);
      assert.ok(result.path.endsWith("config/crew-dispatch.json"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("writes only under FM_HOME/config when dryRun=false", () => {
    const home = mkdtempSync(join(tmpdir(), "fck-write-"));
    try {
      const result = applyDispatch(pack, { fmHome: home, dryRun: false });
      assert.equal(result.wrote, true);
      const raw = readFileSync(result.path, "utf8");
      const parsed = JSON.parse(raw) as CrewDispatchFile;
      assert.equal(validateDispatch(parsed).ok, true);
      assert.ok(result.path.includes(join(home, "config")));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("refuses write when FM_HOME unset without option", () => {
    const result = applyDispatch(pack, {
      fmHome: null,
      dryRun: false,
      env: {},
    });
    assert.equal(result.wrote, false);
    assert.match(result.summary, /FM_HOME unset/);
  });

  it("merge keeps existing when text", () => {
    const home = mkdtempSync(join(tmpdir(), "fck-merge-"));
    try {
      mkdirSync(join(home, "config"), { recursive: true });
      const existing: CrewDispatchFile = {
        rules: [
          {
            when: "Custom captain rule about widgets.",
            use: { harness: "codex", model: "gpt-5.5", effort: "medium" },
            why: "captain",
          },
        ],
        default: { harness: "codex" },
      };
      writeFileSync(
        join(home, "config", "crew-dispatch.json"),
        JSON.stringify(existing),
      );
      const result = applyDispatch(pack, {
        fmHome: home,
        dryRun: false,
        merge: true,
      });
      assert.equal(result.wrote, true);
      assert.ok(
        result.dispatch.rules.some((r) => r.when.includes("Custom captain")),
      );
      assert.ok(result.dispatch.rules.length > 1);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("mergeDispatch", () => {
  it("does not duplicate identical when", () => {
    const a: CrewDispatchFile = {
      rules: [{ when: "same", use: { harness: "a" } }],
    };
    const b: CrewDispatchFile = {
      rules: [
        { when: "same", use: { harness: "b" } },
        { when: "other", use: { harness: "c" } },
      ],
      default: { harness: "c" },
    };
    const m = mergeDispatch(a, b);
    assert.equal(m.rules.length, 2);
    const firstUse = m.rules[0]!.use;
    assert.ok(!Array.isArray(firstUse));
    assert.equal(firstUse.harness, "a");
  });
});
