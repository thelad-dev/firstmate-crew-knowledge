/**
 * discovery.test.ts — Tests for Phase 1: Discovery & Firstmate-Version-Awareness
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  getCachedDiscovery,
  verifyModelHarness,
  getAvailableHarnesses,
  isCacheStale,
  clearCache,
} from "../src/discovery.ts";

describe("Discovery", () => {
  const cacheDir = path.join(os.homedir(), ".cache", "firstmate-crew-knowledge");
  const cachePath = path.join(cacheDir, "discovery.json");

  beforeEach(() => {
    // Clear cache before each test
    clearCache();
  });

  it("should discover models and cache results", () => {
    const discovery = getCachedDiscovery();

    assert.ok(discovery, "Discovery should return results");
    assert.ok(discovery.timestamp, "Discovery should have timestamp");
    assert.ok(Array.isArray(discovery.models), "Discovery should have models array");
    assert.ok(Array.isArray(discovery.errors), "Discovery should have errors array");
  });

  it("should use cache when fresh", () => {
    const first = getCachedDiscovery();
    const second = getCachedDiscovery();

    assert.strictEqual(
      first.timestamp,
      second.timestamp,
      "Should use cached timestamp",
    );
  });

  it("should detect stale cache", () => {
    // Create a stale cache
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const staleData = {
      timestamp: Date.now() - 20 * 60 * 1000, // 20 minutes ago
      models: [],
      errors: [],
    };

    fs.writeFileSync(cachePath, JSON.stringify(staleData));

    assert.ok(isCacheStale(), "Should detect stale cache");
  });

  it("should verify model/harness combinations", () => {
    const discovery = getCachedDiscovery();

    if (discovery.models.length > 0) {
      const firstModel = discovery.models[0];
      const result = verifyModelHarness(
        firstModel.provider,
        firstModel.model,
        firstModel.harness,
      );

      assert.ok(result.available, "Should verify available model");
      assert.ok(result.source, "Should report source");
    }

    const nonExistent = verifyModelHarness("fake", "nonexistent", "invalid");
    assert.strictEqual(
      nonExistent.available,
      false,
      "Should not verify non-existent model",
    );
  });

  it("should list available harnesses", () => {
    const harnesses = getAvailableHarnesses();

    assert.ok(Array.isArray(harnesses), "Should return harnesses array");

    for (const h of harnesses) {
      assert.ok(h.harness, "Harness should have name");
      assert.ok(Array.isArray(h.models), "Harness should have models array");
      assert.ok(typeof h.available === "boolean", "Harness should have availability");
    }
  });

  it("should clear cache", () => {
    getCachedDiscovery(); // Create cache
    assert.ok(fs.existsSync(cachePath), "Cache should exist");

    clearCache();
    assert.ok(!fs.existsSync(cachePath), "Cache should be cleared");
  });

  it("should handle discovery errors gracefully", () => {
    const discovery = getCachedDiscovery();

    // Even if some discoveries fail, should still return structure
    assert.ok(discovery, "Should return discovery even with errors");
    assert.ok(Array.isArray(discovery.errors), "Should collect errors");
  });

  it("should force refresh when requested", () => {
    const first = getCachedDiscovery();
    
    // Wait a tiny bit to ensure timestamp would differ
    const start = Date.now();
    while (Date.now() - start < 5) {
      // Small wait
    }
    
    const second = getCachedDiscovery(true);

    // If models are discovered, timestamps should differ
    if (first.models.length > 0 || second.models.length > 0) {
      assert.notStrictEqual(
        first.timestamp,
        second.timestamp,
        "Force refresh should create new timestamp",
      );
    }
  });
});
