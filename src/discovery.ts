/**
 * discovery.ts — Live model/harness discovery with caching and staleness detection
 *
 * Phase 1: Discovery & Firstmate-Version-Awareness
 * - Query Pi, Claude, Codex, Grok, Kimi for available models
 * - Cache results with timestamps
 * - Detect stale data
 * - Verify against harness catalogs
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/** How long discovery cache remains fresh (15 minutes) */
const CACHE_TTL_MS = 15 * 60 * 1000;

interface DiscoveredModel {
  provider: string;
  model: string;
  harness: string;
  source: "pi" | "claude" | "codex" | "grok" | "kimi";
  available: boolean;
}

interface DiscoveryCache {
  timestamp: number;
  models: DiscoveredModel[];
  firstmateVersion?: string;
  errors: string[];
}

interface HarnessInfo {
  harness: string;
  available: boolean;
  models: string[];
}

function getCacheDir(): string {
  const home = os.homedir();
  const dir = path.join(home, ".cache", "firstmate-crew-knowledge");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getCachePath(): string {
  return path.join(getCacheDir(), "discovery.json");
}

function isStale(timestamp: number): boolean {
  return Date.now() - timestamp > CACHE_TTL_MS;
}

/**
 * Discover models from Pi harness
 */
function discoverPi(): DiscoveredModel[] {
  const models: DiscoveredModel[] = [];
  try {
    const output = execSync("pi --list-models 2>/dev/null", {
      encoding: "utf-8",
      timeout: 10000,
    }).trim();

    // Parse pi --list-models output
    // Expected format: provider/model lines
    const lines = output.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      if (line.includes("/")) {
        const [provider, model] = line.trim().split("/", 2);
        if (provider && model) {
          models.push({
            provider: provider.trim(),
            model: model.trim(),
            harness: "pi",
            source: "pi",
            available: true,
          });
        }
      }
    }
  } catch (err) {
    // Pi not available or command failed
  }
  return models;
}

/**
 * Discover models from Claude CLI
 */
function discoverClaude(): DiscoveredModel[] {
  const models: DiscoveredModel[] = [];
  try {
    // Try to detect if Claude CLI is available and authenticated
    execSync("which claude 2>/dev/null", { encoding: "utf-8" });
    // If claude is available, add known models
    // Claude CLI doesn't have a --list-models, so we infer from knowledge
    models.push(
      {
        provider: "claude",
        model: "haiku",
        harness: "claude",
        source: "claude",
        available: true,
      },
      {
        provider: "claude",
        model: "sonnet",
        harness: "claude",
        source: "claude",
        available: true,
      },
      {
        provider: "claude",
        model: "opus",
        harness: "claude",
        source: "claude",
        available: true,
      },
    );
  } catch (err) {
    // Claude CLI not available
  }
  return models;
}

/**
 * Discover models from Codex CLI
 */
function discoverCodex(): DiscoveredModel[] {
  const models: DiscoveredModel[] = [];
  try {
    execSync("which codex 2>/dev/null", { encoding: "utf-8" });
    // Codex CLI available - infer common models
    models.push(
      {
        provider: "codex",
        model: "gpt-5.5",
        harness: "codex",
        source: "codex",
        available: true,
      },
      {
        provider: "codex",
        model: "gpt-5.4",
        harness: "codex",
        source: "codex",
        available: true,
      },
    );
  } catch (err) {
    // Codex not available
  }
  return models;
}

/**
 * Discover models from Grok CLI
 */
function discoverGrok(): DiscoveredModel[] {
  const models: DiscoveredModel[] = [];
  try {
    const output = execSync("grok models 2>/dev/null", {
      encoding: "utf-8",
      timeout: 10000,
    }).trim();

    // Parse grok models output
    const lines = output.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        models.push({
          provider: "grok",
          model: trimmed,
          harness: "grok",
          source: "grok",
          available: true,
        });
      }
    }

    // Fallback to known models if parsing failed
    if (models.length === 0) {
      models.push({
        provider: "grok",
        model: "latest",
        harness: "grok",
        source: "grok",
        available: true,
      });
    }
  } catch (err) {
    // Grok not available
  }
  return models;
}

/**
 * Discover models from Kimi CLI
 */
function discoverKimi(): DiscoveredModel[] {
  const models: DiscoveredModel[] = [];
  try {
    const output = execSync("kimi provider list --json 2>/dev/null", {
      encoding: "utf-8",
      timeout: 10000,
    }).trim();

    const data = JSON.parse(output);
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.provider && item.model) {
          models.push({
            provider: item.provider,
            model: item.model,
            harness: "kimi",
            source: "kimi",
            available: true,
          });
        }
      }
    }
  } catch (err) {
    // Kimi not available or parse error
  }
  return models;
}

/**
 * Get Firstmate version from AGENTS.md or docs
 */
function getFirstmateVersion(): string | undefined {
  try {
    const fmHome = process.env.FM_HOME || process.env.FM_ROOT_OVERRIDE;
    if (fmHome) {
      const agentsPath = path.join(fmHome, "AGENTS.md");
      if (fs.existsSync(agentsPath)) {
        const content = fs.readFileSync(agentsPath, "utf-8");
        // Try to extract version from AGENTS.md
        const versionMatch = content.match(/version[:\s]+([0-9.]+)/i);
        if (versionMatch) {
          return versionMatch[1];
        }
      }
    }
  } catch (err) {
    // Could not determine version
  }
  return undefined;
}

/**
 * Perform live discovery of all available models
 */
export function discoverModels(): DiscoveryCache {
  const errors: string[] = [];
  const models: DiscoveredModel[] = [];

  try {
    models.push(...discoverPi());
  } catch (err) {
    errors.push(`Pi discovery failed: ${err}`);
  }

  try {
    models.push(...discoverClaude());
  } catch (err) {
    errors.push(`Claude discovery failed: ${err}`);
  }

  try {
    models.push(...discoverCodex());
  } catch (err) {
    errors.push(`Codex discovery failed: ${err}`);
  }

  try {
    models.push(...discoverGrok());
  } catch (err) {
    errors.push(`Grok discovery failed: ${err}`);
  }

  try {
    models.push(...discoverKimi());
  } catch (err) {
    errors.push(`Kimi discovery failed: ${err}`);
  }

  const firstmateVersion = getFirstmateVersion();

  return {
    timestamp: Date.now(),
    models,
    firstmateVersion,
    errors,
  };
}

/**
 * Get cached discovery or perform fresh discovery if stale
 */
export function getCachedDiscovery(forceRefresh = false): DiscoveryCache {
  const cachePath = getCachePath();

  if (!forceRefresh && fs.existsSync(cachePath)) {
    try {
      const cached: DiscoveryCache = JSON.parse(
        fs.readFileSync(cachePath, "utf-8"),
      );
      if (!isStale(cached.timestamp)) {
        return cached;
      }
    } catch (err) {
      // Cache corrupted, proceed to fresh discovery
    }
  }

  // Perform fresh discovery
  const discovery = discoverModels();

  // Save to cache
  try {
    fs.writeFileSync(cachePath, JSON.stringify(discovery, null, 2));
  } catch (err) {
    // Cache write failed, but return discovery anyway
  }

  return discovery;
}

/**
 * Verify a model/harness combination against discovery
 */
export function verifyModelHarness(
  provider: string,
  model: string,
  harness: string,
): { available: boolean; source?: string } {
  const discovery = getCachedDiscovery();

  const match = discovery.models.find(
    (m) =>
      m.provider === provider && m.model === model && m.harness === harness,
  );

  if (match) {
    return { available: true, source: match.source };
  }

  return { available: false };
}

/**
 * Get all available harnesses with their models
 */
export function getAvailableHarnesses(): HarnessInfo[] {
  const discovery = getCachedDiscovery();
  const harnesses = new Map<string, Set<string>>();

  for (const model of discovery.models) {
    if (!harnesses.has(model.harness)) {
      harnesses.set(model.harness, new Set());
    }
    harnesses.get(model.harness)!.add(`${model.provider}/${model.model}`);
  }

  return Array.from(harnesses.entries()).map(([harness, modelSet]) => ({
    harness,
    available: modelSet.size > 0,
    models: Array.from(modelSet).sort(),
  }));
}

/**
 * Check if discovery cache is stale
 */
export function isCacheStale(): boolean {
  const cachePath = getCachePath();
  if (!fs.existsSync(cachePath)) {
    return true;
  }

  try {
    const cached: DiscoveryCache = JSON.parse(
      fs.readFileSync(cachePath, "utf-8"),
    );
    return isStale(cached.timestamp);
  } catch (err) {
    return true;
  }
}

/**
 * Clear the discovery cache
 */
export function clearCache(): void {
  const cachePath = getCachePath();
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
  }
}
