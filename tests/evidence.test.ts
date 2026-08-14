/**
 * evidence.test.ts — Tests for Phase 5: Lokale Crew-Evidence Collection
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  recordEvidence,
  loadEvidence,
  aggregateEvidence,
  loadAggregatedEvidence,
  getEvidenceForTask,
  getBestModelForTask,
  recordFromNoMistakesOutcome,
} from "../src/evidence.ts";

describe("Evidence Collection", () => {
  const evidenceDir = path.join(process.cwd(), "knowledge", "local");
  const evidencePath = path.join(evidenceDir, "evidence.json");
  const aggregatedPath = path.join(evidenceDir, "aggregated.json");

  beforeEach(() => {
    // Clear evidence before each test
    if (fs.existsSync(evidencePath)) {
      fs.unlinkSync(evidencePath);
    }
    if (fs.existsSync(aggregatedPath)) {
      fs.unlinkSync(aggregatedPath);
    }
  });

  afterEach(() => {
    // Cleanup after tests
    if (fs.existsSync(evidencePath)) {
      fs.unlinkSync(evidencePath);
    }
    if (fs.existsSync(aggregatedPath)) {
      fs.unlinkSync(aggregatedPath);
    }
  });

  it("should record evidence", () => {
    recordEvidence({
      taskId: "test-1",
      taskClass: "standard_ship",
      harness: "pi",
      provider: "claude",
      model: "sonnet",
      effort: "medium",
      startTime: Date.now() - 10000,
      endTime: Date.now(),
      durationMs: 10000,
      success: true,
      testsRun: 10,
      testsPassed: 10,
      ciResult: "pass",
      reworkCount: 0,
    });

    const evidence = loadEvidence();
    assert.strictEqual(evidence.length, 1, "Should have one evidence entry");
    assert.strictEqual(evidence[0].taskId, "test-1", "Should match task ID");
    assert.strictEqual(evidence[0].source, "local", "Source should be local");
    assert.strictEqual(evidence[0].confidence, "measured", "Confidence should be measured");
  });

  it("should aggregate evidence by task class and model", () => {
    // Record multiple evidence entries
    const baseTime = Date.now();
    
    recordEvidence({
      taskId: "test-1",
      taskClass: "standard_ship",
      harness: "pi",
      provider: "claude",
      model: "sonnet",
      effort: "medium",
      startTime: baseTime - 10000,
      endTime: baseTime,
      durationMs: 10000,
      success: true,
      testsRun: 10,
      testsPassed: 10,
      ciResult: "pass",
      reworkCount: 0,
    });

    recordEvidence({
      taskId: "test-2",
      taskClass: "standard_ship",
      harness: "pi",
      provider: "claude",
      model: "sonnet",
      effort: "medium",
      startTime: baseTime - 15000,
      endTime: baseTime - 5000,
      durationMs: 10000,
      success: true,
      testsRun: 10,
      testsPassed: 9,
      ciResult: "pass",
      reworkCount: 1,
    });

    const aggregated = loadAggregatedEvidence();
    
    assert.ok(aggregated.length > 0, "Should have aggregated data");
    
    const entry = aggregated.find(
      (e) =>
        e.taskClass === "standard_ship" &&
        e.provider === "claude" &&
        e.model === "sonnet",
    );

    assert.ok(entry, "Should find aggregated entry for standard_ship/claude/sonnet");
    assert.strictEqual(entry!.totalTasks, 2, "Should count 2 tasks");
    assert.strictEqual(entry!.successfulTasks, 2, "Should count 2 successes");
    assert.strictEqual(entry!.successRate, 1, "Success rate should be 100%");
    assert.strictEqual(entry!.avgDurationMs, 10000, "Average duration should be 10s");
  });

  it("should get evidence for specific task/model", () => {
    recordEvidence({
      taskId: "test-1",
      taskClass: "trivial_fix",
      harness: "claude",
      provider: "claude",
      model: "haiku",
      effort: "low",
      startTime: Date.now() - 5000,
      endTime: Date.now(),
      durationMs: 5000,
      success: true,
      reworkCount: 0,
    });

    const evidence = getEvidenceForTask("trivial_fix", "claude", "haiku");
    
    assert.ok(evidence, "Should find evidence");
    assert.strictEqual(evidence!.taskClass, "trivial_fix", "Should match task class");
    assert.strictEqual(evidence!.provider, "claude", "Should match provider");
    assert.strictEqual(evidence!.model, "haiku", "Should match model");
  });

  it("should identify best model for task class", () => {
    const baseTime = Date.now();

    // Claude performs better
    recordEvidence({
      taskId: "test-1",
      taskClass: "hard_multi_file",
      harness: "pi",
      provider: "claude",
      model: "opus",
      effort: "high",
      startTime: baseTime - 30000,
      endTime: baseTime,
      durationMs: 30000,
      success: true,
      reworkCount: 0,
    });

    recordEvidence({
      taskId: "test-2",
      taskClass: "hard_multi_file",
      harness: "pi",
      provider: "claude",
      model: "opus",
      effort: "high",
      startTime: baseTime - 32000,
      endTime: baseTime - 2000,
      durationMs: 30000,
      success: true,
      reworkCount: 0,
    });

    // Codex has lower success rate
    recordEvidence({
      taskId: "test-3",
      taskClass: "hard_multi_file",
      harness: "codex",
      provider: "codex",
      model: "gpt-5.5",
      effort: "high",
      startTime: baseTime - 40000,
      endTime: baseTime - 10000,
      durationMs: 30000,
      success: false,
      reworkCount: 2,
    });

    const best = getBestModelForTask("hard_multi_file");
    
    assert.ok(best, "Should find best model");
    assert.strictEqual(best!.provider, "claude", "Claude should be best for hard_multi_file");
    assert.strictEqual(best!.model, "opus", "Opus should be best model");
  });

  it("should record from no-mistakes outcome", () => {
    const baseTime = Date.now();
    
    recordFromNoMistakesOutcome({
      taskId: "nm-test-1",
      taskClass: "standard_ship",
      harness: "pi",
      provider: "claude",
      model: "sonnet",
      effort: "medium",
      startTime: baseTime - 20000,
      endTime: baseTime,
      success: true,
      testsRun: 15,
      testsPassed: 15,
      ciResult: "pass",
      reworkCount: 1,
    });

    const evidence = loadEvidence();
    
    assert.strictEqual(evidence.length, 1, "Should record evidence");
    assert.strictEqual(evidence[0].taskId, "nm-test-1", "Should match task ID");
    assert.strictEqual(evidence[0].durationMs, 20000, "Should calculate duration");
  });

  it("should handle missing test data gracefully", () => {
    recordEvidence({
      taskId: "test-no-tests",
      taskClass: "scout_audit",
      harness: "pi",
      provider: "claude",
      model: "sonnet",
      effort: "low",
      startTime: Date.now() - 5000,
      endTime: Date.now(),
      durationMs: 5000,
      success: true,
      reworkCount: 0,
      // No test data
    });

    const aggregated = loadAggregatedEvidence();
    const entry = aggregated.find((e) => e.taskClass === "scout_audit");

    assert.ok(entry, "Should aggregate even without test data");
    // avgTestPassRate should handle missing data
    assert.ok(typeof entry!.avgTestPassRate === "number", "Should have test pass rate");
  });

  it("should preserve privacy - no code content", () => {
    recordEvidence({
      taskId: "privacy-test",
      taskClass: "standard_ship",
      harness: "pi",
      provider: "claude",
      model: "sonnet",
      effort: "medium",
      startTime: Date.now() - 10000,
      endTime: Date.now(),
      durationMs: 10000,
      success: true,
      reworkCount: 0,
    });

    const evidence = loadEvidence();
    const entry = evidence[0];

    // Ensure no code-related fields exist
    assert.ok(!("code" in entry), "Should not contain code");
    assert.ok(!("prompt" in entry), "Should not contain prompt");
    assert.ok(!("diff" in entry), "Should not contain diff");
    assert.ok(!("files" in entry), "Should not contain files");
  });
});
