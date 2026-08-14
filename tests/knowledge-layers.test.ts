/**
 * knowledge-layers.test.ts — Tests for Phase 2: Drei-Ebenen Knowledge
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  saveManufacturerFact,
  saveBenchmarkResult,
  loadManufacturerFacts,
  loadBenchmarkResults,
  isValid,
  filterValid,
  resolveConflict,
  getAvailability,
  getCapability,
  getQuality,
} from "../src/knowledge-layers.ts";
import type {
  ManufacturerFact,
  BenchmarkResult,
  CapabilityFact,
} from "../src/knowledge-layers.ts";

describe("Knowledge Layers", () => {
  const manufacturersDir = path.join(process.cwd(), "knowledge", "manufacturers");
  const benchmarksDir = path.join(process.cwd(), "knowledge", "benchmarks");

  beforeEach(() => {
    // Clean up test files
    if (fs.existsSync(manufacturersDir)) {
      const files = fs.readdirSync(manufacturersDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        fs.unlinkSync(path.join(manufacturersDir, file));
      }
    }
    if (fs.existsSync(benchmarksDir)) {
      const files = fs.readdirSync(benchmarksDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        fs.unlinkSync(path.join(benchmarksDir, file));
      }
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (fs.existsSync(manufacturersDir)) {
      const files = fs.readdirSync(manufacturersDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        fs.unlinkSync(path.join(manufacturersDir, file));
      }
    }
    if (fs.existsSync(benchmarksDir)) {
      const files = fs.readdirSync(benchmarksDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        fs.unlinkSync(path.join(benchmarksDir, file));
      }
    }
  });

  it("should save and load manufacturer facts", () => {
    const fact: ManufacturerFact = {
      source: "official-docs",
      confidence: "high",
      timestamp: Date.now(),
      provider: "claude",
      fact: "Claude supports long context",
      details: { contextWindow: 200000 },
      url: "https://docs.anthropic.com",
    };

    saveManufacturerFact(fact);

    const facts = loadManufacturerFacts();
    assert.ok(facts.length > 0, "Should load facts");

    const loaded = facts.find((f) => f.provider === "claude");
    assert.ok(loaded, "Should find Claude fact");
    assert.strictEqual(loaded!.source, "official-docs", "Should have correct source");
    assert.strictEqual(loaded!.confidence, "high", "Should have high confidence");
  });

  it("should save and load benchmark results", () => {
    const benchmark: BenchmarkResult = {
      source: "external-benchmark",
      confidence: "medium",
      timestamp: Date.now(),
      benchmarkName: "HumanEval",
      provider: "codex",
      model: "gpt-5.5",
      score: 95.5,
      metric: "pass@1",
      url: "https://example.com/benchmark",
    };

    saveBenchmarkResult(benchmark);

    const results = loadBenchmarkResults();
    assert.ok(results.length > 0, "Should load benchmarks");

    const loaded = results.find(
      (r) => r.benchmarkName === "HumanEval" && r.provider === "codex",
    );
    assert.ok(loaded, "Should find HumanEval benchmark");
    assert.strictEqual(loaded!.score, 95.5, "Should have correct score");
  });

  it("should validate knowledge entries by timestamp", () => {
    const validEntry = {
      source: "official-docs" as const,
      confidence: "high" as const,
      timestamp: Date.now(),
      validUntil: Date.now() + 86400000, // 1 day from now
    };

    const expiredEntry = {
      source: "official-docs" as const,
      confidence: "high" as const,
      timestamp: Date.now() - 86400000, // 1 day ago
      validUntil: Date.now() - 3600000, // 1 hour ago
    };

    assert.ok(isValid(validEntry), "Should validate future expiry");
    assert.ok(!isValid(expiredEntry), "Should reject expired entry");
  });

  it("should filter valid entries", () => {
    const entries = [
      {
        source: "official-docs" as const,
        confidence: "high" as const,
        timestamp: Date.now(),
        validUntil: Date.now() + 86400000,
      },
      {
        source: "official-docs" as const,
        confidence: "high" as const,
        timestamp: Date.now() - 86400000,
        validUntil: Date.now() - 3600000,
      },
    ];

    const valid = filterValid(entries);
    assert.strictEqual(valid.length, 1, "Should filter out expired entry");
  });

  it("should resolve conflicts by confidence priority", () => {
    const entries = [
      {
        source: "manufacturer-claim" as const,
        confidence: "low" as const,
        timestamp: Date.now(),
        value: "claim",
      },
      {
        source: "external-benchmark" as const,
        confidence: "medium" as const,
        timestamp: Date.now(),
        value: "benchmark",
      },
      {
        source: "local" as const,
        confidence: "measured" as const,
        timestamp: Date.now(),
        value: "measured",
      },
    ];

    const best = resolveConflict(entries, () => true);

    assert.ok(best, "Should find best entry");
    assert.strictEqual(best!.confidence, "measured", "Should prefer measured");
    assert.strictEqual(best!.value, "measured", "Should select measured value");
  });

  it("should prioritize newer entries when confidence equal", () => {
    const now = Date.now();
    const entries = [
      {
        source: "official-docs" as const,
        confidence: "high" as const,
        timestamp: now - 10000,
        value: "old",
      },
      {
        source: "official-docs" as const,
        confidence: "high" as const,
        timestamp: now,
        value: "new",
      },
    ];

    const best = resolveConflict(entries, () => true);

    assert.ok(best, "Should find best entry");
    assert.strictEqual(best!.value, "new", "Should prefer newer entry");
  });

  it("should get availability with correct priority", () => {
    const entries = [
      {
        source: "manufacturer-claim" as const,
        confidence: "low" as const,
        timestamp: Date.now(),
        provider: "test",
        model: "test-model",
      },
      {
        source: "discovery" as const,
        confidence: "high" as const,
        timestamp: Date.now(),
        provider: "test",
        model: "test-model",
      },
    ];

    const availability = getAvailability("test", "test-model", entries);

    assert.ok(availability.available, "Should be available");
    assert.strictEqual(
      availability.source,
      "discovery",
      "Should prefer discovery over manufacturer claim",
    );
  });

  it("should get capability with correct priority", () => {
    const capabilities: CapabilityFact[] = [
      {
        source: "manufacturer-claim",
        confidence: "low",
        timestamp: Date.now(),
        provider: "test",
        model: "test-model",
        capability: "long-context",
        supported: true,
      },
      {
        source: "official-docs",
        confidence: "high",
        timestamp: Date.now(),
        provider: "test",
        model: "test-model",
        capability: "long-context",
        supported: true,
      },
    ];

    const capability = getCapability("test", "test-model", "long-context", capabilities);

    assert.ok(capability.supported, "Should be supported");
    assert.strictEqual(
      capability.source,
      "official-docs",
      "Should prefer official docs over manufacturer claim",
    );
  });

  it("should get quality with correct priority", () => {
    const entries = [
      {
        source: "manufacturer-claim" as const,
        confidence: "low" as const,
        timestamp: Date.now(),
        provider: "test",
        model: "test-model",
        score: 90,
      },
      {
        source: "local" as const,
        confidence: "measured" as const,
        timestamp: Date.now(),
        provider: "test",
        model: "test-model",
        score: 85,
      },
    ];

    const quality = getQuality("test", "test-model", entries);

    assert.ok(quality.score, "Should have score");
    assert.strictEqual(quality.score, 85, "Should prefer local evidence over claim");
    assert.strictEqual(quality.source, "local", "Should use local source");
    assert.strictEqual(quality.confidence, "measured", "Should have measured confidence");
  });

  it("should handle missing knowledge gracefully", () => {
    const entries: any[] = [];

    const availability = getAvailability("nonexistent", "model", entries);
    assert.strictEqual(availability.available, false, "Should not be available");
    assert.strictEqual(availability.confidence, "uncertain", "Should be uncertain");

    const capability = getCapability("nonexistent", "model", "test", entries);
    assert.strictEqual(capability.supported, false, "Should not be supported");
    assert.strictEqual(capability.confidence, "uncertain", "Should be uncertain");

    const quality = getQuality("nonexistent", "model", entries);
    assert.strictEqual(quality.score, undefined, "Should have no score");
    assert.strictEqual(quality.confidence, "uncertain", "Should be uncertain");
  });
});
