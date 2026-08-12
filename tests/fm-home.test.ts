import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  crewDispatchPath,
  resolveFmHome,
  writeUnderFmConfig,
} from "../src/fm-home.ts";

describe("resolveFmHome", () => {
  it("prefers FM_HOME", () => {
    const r = resolveFmHome({
      FM_HOME: "/tmp/fm-home-test",
      FM_ROOT_OVERRIDE: "/tmp/other",
    });
    assert.equal(r.source, "FM_HOME");
    assert.ok(r.home?.endsWith("fm-home-test"));
  });

  it("falls back to FM_ROOT_OVERRIDE", () => {
    const r = resolveFmHome({ FM_ROOT_OVERRIDE: "/tmp/root-only" });
    assert.equal(r.source, "FM_ROOT_OVERRIDE");
  });

  it("returns null when unset", () => {
    const r = resolveFmHome({});
    assert.equal(r.home, null);
  });
});

describe("writeUnderFmConfig", () => {
  it("writes crew-dispatch.json under config", () => {
    const home = mkdtempSync(join(tmpdir(), "fck-home-"));
    try {
      const path = writeUnderFmConfig(home, "crew-dispatch.json", '{"rules":[]}\n');
      assert.equal(path, crewDispatchPath(home));
      assert.equal(readFileSync(path, "utf8"), '{"rules":[]}\n');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("refuses path escape", () => {
    const home = mkdtempSync(join(tmpdir(), "fck-esc-"));
    try {
      assert.throws(
        () => writeUnderFmConfig(home, "../secrets.txt", "nope"),
        /outside FM_HOME\/config/,
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
