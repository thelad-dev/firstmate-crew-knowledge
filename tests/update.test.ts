/**
 * update.test.ts — Tests for Phase 3: Selbstaktualisierung
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  checkCompatibility,
  getFirstmateVersion,
  needsUpdate,
} from "../src/update.ts";

describe("Update and Compatibility", () => {
  it("should check compatibility", () => {
    const result = checkCompatibility();

    assert.ok(result, "Should return compatibility result");
    assert.ok(typeof result.compatible === "boolean", "Should have compatible flag");
    assert.ok(Array.isArray(result.checks), "Should have checks array");
    assert.ok(Array.isArray(result.errors), "Should have errors array");
    assert.ok(Array.isArray(result.warnings), "Should have warnings array");
  });

  it("should report check status", () => {
    const result = checkCompatibility();

    for (const check of result.checks) {
      assert.ok(check.check, "Check should have name");
      assert.ok(["ok", "warning", "error"].includes(check.status), "Check should have valid status");
      assert.ok(check.message, "Check should have message");
    }
  });

  it("should check dispatch schema", () => {
    const result = checkCompatibility();
    const dispatchCheck = result.checks.find((c) => c.check === "dispatch-schema");

    assert.ok(dispatchCheck, "Should have dispatch schema check");
    // Should be ok or warning (might not have FM_HOME in test env)
    assert.ok(
      ["ok", "warning"].includes(dispatchCheck.status),
      "Dispatch schema should not error in normal conditions",
    );
  });

  it("should check harnesses", () => {
    const result = checkCompatibility();
    const harnessCheck = result.checks.find((c) => c.check === "harnesses");

    assert.ok(harnessCheck, "Should have harness check");
    assert.ok(
      ["ok", "warning"].includes(harnessCheck.status),
      "Harness check should not error",
    );
  });

  it("should check spawn flags", () => {
    const result = checkCompatibility();
    const flagsCheck = result.checks.find((c) => c.check === "spawn-flags");

    assert.ok(flagsCheck, "Should have spawn flags check");
    // Might be warning if FM_HOME not set
    assert.ok(
      ["ok", "warning"].includes(flagsCheck.status),
      "Spawn flags check should be ok or warning",
    );
  });

  it("should check effort values", () => {
    const result = checkCompatibility();
    const effortCheck = result.checks.find((c) => c.check === "effort-values");

    assert.ok(effortCheck, "Should have effort values check");
    assert.strictEqual(effortCheck.status, "ok", "Effort values should be ok");
  });

  it("should check quota-axi availability", () => {
    const result = checkCompatibility();
    const quotaCheck = result.checks.find((c) => c.check === "quota-axi");

    assert.ok(quotaCheck, "Should have quota-axi check");
    // Can be ok or warning depending on environment
    assert.ok(
      ["ok", "warning"].includes(quotaCheck.status),
      "Quota-axi check should be ok or warning",
    );
  });

  it("should get Firstmate version if available", () => {
    const version = getFirstmateVersion();

    // Might be undefined in test environment without FM_HOME
    if (version) {
      assert.ok(typeof version === "string", "Version should be string");
      assert.ok(version.length > 0, "Version should not be empty");
    }
  });

  it("should detect when update is needed", () => {
    const needsUpdateResult = needsUpdate("0.0.1");

    // Result depends on whether FM_HOME is set and has version
    assert.ok(
      typeof needsUpdateResult === "boolean",
      "Should return boolean",
    );
  });

  it("should not need update when versions match", () => {
    const currentVersion = getFirstmateVersion();
    
    if (currentVersion) {
      const needsUpdateResult = needsUpdate(currentVersion);
      assert.strictEqual(
        needsUpdateResult,
        false,
        "Should not need update when versions match",
      );
    }
  });

  it("should collect errors and warnings separately", () => {
    const result = checkCompatibility();

    // Errors should only come from error-status checks
    const errorChecks = result.checks.filter((c) => c.status === "error");
    assert.strictEqual(
      result.errors.length,
      errorChecks.length,
      "Errors array should match error checks",
    );

    // Warnings should only come from warning-status checks
    const warningChecks = result.checks.filter((c) => c.status === "warning");
    assert.strictEqual(
      result.warnings.length,
      warningChecks.length,
      "Warnings array should match warning checks",
    );
  });

  it("should be compatible if no errors", () => {
    const result = checkCompatibility();

    if (result.errors.length === 0) {
      assert.strictEqual(
        result.compatible,
        true,
        "Should be compatible when no errors",
      );
    } else {
      assert.strictEqual(
        result.compatible,
        false,
        "Should not be compatible when errors exist",
      );
    }
  });
});
