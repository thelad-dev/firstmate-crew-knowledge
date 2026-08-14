/**
 * knowledge-layers.ts — Three-level knowledge system
 *
 * Phase 2: Drei-Ebenen Knowledge
 * A. Hersteller-Fakten (official manufacturer docs)
 * B. Externe Benchmarks (Artificial Analysis, coding benchmarks)
 * C. Lokale Crew-Evidenz (from no-mistakes outcomes)
 *
 * Each level: source, confidence, timestamp, valid_until
 * Separate storage: knowledge/manufacturers/, knowledge/benchmarks/, knowledge/local/
 *
 * Source-Konflikt-Hierarchie (Section 10):
 * - "What's available?": Live Discovery > Auth State > Manufacturer Website
 * - "What can it do?": Official Docs > Website > Discovery
 * - "How good?": Local Evidence > External Benchmarks > Manufacturer Claims
 */

import fs from "node:fs";
import path from "node:path";

/** Confidence level for knowledge */
export type ConfidenceLevel =
  | "measured" // From local evidence
  | "high" // Official docs
  | "medium" // External benchmarks
  | "low" // Manufacturer claims
  | "uncertain"; // Unknown or unreliable

/** Knowledge source type */
export type SourceType =
  | "local" // Local evidence
  | "discovery" // Live model discovery
  | "official-docs" // Manufacturer official documentation
  | "external-benchmark" // Artificial Analysis, etc.
  | "manufacturer-claim" // Manufacturer website/marketing
  | "auth-state"; // Authentication state

/** Base knowledge entry */
export interface KnowledgeEntry {
  source: SourceType;
  confidence: ConfidenceLevel;
  timestamp: number;
  validUntil?: number;
}

/** Manufacturer facts entry */
export interface ManufacturerFact extends KnowledgeEntry {
  source: "official-docs" | "manufacturer-claim";
  provider: string;
  fact: string;
  details: Record<string, unknown>;
  url?: string;
}

/** External benchmark entry */
export interface BenchmarkResult extends KnowledgeEntry {
  source: "external-benchmark";
  benchmarkName: string;
  provider: string;
  model: string;
  score: number;
  metric: string;
  url?: string;
}

/** Capability fact */
export interface CapabilityFact extends KnowledgeEntry {
  provider: string;
  model?: string;
  capability: string;
  supported: boolean;
  notes?: string;
}

function getKnowledgeDir(layer: "manufacturers" | "benchmarks" | "local"): string {
  const dir = path.join(process.cwd(), "knowledge", layer);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Save manufacturer fact
 */
export function saveManufacturerFact(fact: ManufacturerFact): void {
  const dir = getKnowledgeDir("manufacturers");
  const filename = `${fact.provider}-${Date.now()}.json`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, JSON.stringify(fact, null, 2));
}

/**
 * Save benchmark result
 */
export function saveBenchmarkResult(result: BenchmarkResult): void {
  const dir = getKnowledgeDir("benchmarks");
  const filename = `${result.benchmarkName}-${result.provider}-${result.model}-${Date.now()}.json`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
}

/**
 * Load all manufacturer facts
 */
export function loadManufacturerFacts(): ManufacturerFact[] {
  const dir = getKnowledgeDir("manufacturers");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  
  const facts: ManufacturerFact[] = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      const fact = JSON.parse(content);
      facts.push(fact);
    } catch (err) {
      console.error(`Failed to load manufacturer fact ${file}: ${err}`);
    }
  }
  
  return facts;
}

/**
 * Load all benchmark results
 */
export function loadBenchmarkResults(): BenchmarkResult[] {
  const dir = getKnowledgeDir("benchmarks");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  
  const results: BenchmarkResult[] = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      const result = JSON.parse(content);
      results.push(result);
    } catch (err) {
      console.error(`Failed to load benchmark result ${file}: ${err}`);
    }
  }
  
  return results;
}

/**
 * Check if knowledge entry is still valid
 */
export function isValid(entry: KnowledgeEntry): boolean {
  if (!entry.validUntil) {
    return true; // No expiry
  }
  return Date.now() < entry.validUntil;
}

/**
 * Filter valid knowledge entries
 */
export function filterValid<T extends KnowledgeEntry>(entries: T[]): T[] {
  return entries.filter(isValid);
}

/**
 * Resolve conflict between multiple knowledge sources
 * Priority: Local Evidence > External Benchmarks > Official Docs > Manufacturer Claims
 */
export function resolveConflict<T extends KnowledgeEntry>(
  entries: T[],
  selector: (entry: T) => boolean,
): T | undefined {
  const matching = entries.filter(selector).filter(isValid);
  
  if (matching.length === 0) {
    return undefined;
  }

  // Priority by confidence
  const priorities: Record<ConfidenceLevel, number> = {
    measured: 4,
    high: 3,
    medium: 2,
    low: 1,
    uncertain: 0,
  };

  matching.sort((a, b) => {
    const priorityDiff = priorities[b.confidence] - priorities[a.confidence];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    // If same confidence, prefer newer
    return b.timestamp - a.timestamp;
  });

  return matching[0];
}

/**
 * Get availability information for a provider/model
 * Priority: Live Discovery > Auth State > Manufacturer Website
 */
export function getAvailability(
  provider: string,
  model: string,
  allEntries: KnowledgeEntry[],
): { available: boolean; confidence: ConfidenceLevel; source: SourceType } {
  const relevant = allEntries.filter(
    (e) =>
      "provider" in e &&
      e.provider === provider &&
      (!("model" in e) || e.model === model),
  );

  // Priority order for "what's available"
  const discovery = relevant.find((e) => e.source === "discovery");
  if (discovery) {
    return {
      available: true,
      confidence: discovery.confidence,
      source: "discovery",
    };
  }

  const authState = relevant.find((e) => e.source === "auth-state");
  if (authState) {
    return {
      available: true,
      confidence: authState.confidence,
      source: "auth-state",
    };
  }

  const manufacturer = relevant.find(
    (e) => e.source === "manufacturer-claim" || e.source === "official-docs",
  );
  if (manufacturer) {
    return {
      available: true,
      confidence: manufacturer.confidence,
      source: manufacturer.source,
    };
  }

  return {
    available: false,
    confidence: "uncertain",
    source: "manufacturer-claim",
  };
}

/**
 * Get capability information
 * Priority: Official Docs > Website > Discovery
 */
export function getCapability(
  provider: string,
  model: string,
  capability: string,
  allEntries: KnowledgeEntry[],
): { supported: boolean; confidence: ConfidenceLevel; source: SourceType } {
  const relevant = allEntries.filter(
    (e) =>
      "provider" in e &&
      e.provider === provider &&
      (!("model" in e) || e.model === model) &&
      "capability" in e &&
      (e as CapabilityFact).capability === capability,
  ) as CapabilityFact[];

  // Priority order for "what can it do"
  const officialDocs = relevant.find((e) => e.source === "official-docs");
  if (officialDocs) {
    return {
      supported: officialDocs.supported,
      confidence: officialDocs.confidence,
      source: "official-docs",
    };
  }

  const manufacturer = relevant.find((e) => e.source === "manufacturer-claim");
  if (manufacturer) {
    return {
      supported: manufacturer.supported,
      confidence: manufacturer.confidence,
      source: "manufacturer-claim",
    };
  }

  const discovery = relevant.find((e) => e.source === "discovery");
  if (discovery) {
    return {
      supported: discovery.supported,
      confidence: discovery.confidence,
      source: "discovery",
    };
  }

  return {
    supported: false,
    confidence: "uncertain",
    source: "manufacturer-claim",
  };
}

/**
 * Get quality/performance information
 * Priority: Local Evidence > External Benchmarks > Manufacturer Claims
 */
export function getQuality(
  provider: string,
  model: string,
  allEntries: KnowledgeEntry[],
): {
  score?: number;
  confidence: ConfidenceLevel;
  source: SourceType;
} {
  const relevant = allEntries.filter(
    (e) =>
      ("provider" in e && e.provider === provider) &&
      (!("model" in e) || e.model === model),
  );

  // Priority order for "how good"
  const localEvidence = relevant.find((e) => e.source === "local");
  if (localEvidence && "score" in localEvidence) {
    return {
      score: (localEvidence as { score: number }).score,
      confidence: "measured",
      source: "local",
    };
  }

  const benchmark = relevant.find((e) => e.source === "external-benchmark");
  if (benchmark && "score" in benchmark) {
    return {
      score: (benchmark as BenchmarkResult).score,
      confidence: benchmark.confidence,
      source: "external-benchmark",
    };
  }

  const manufacturer = relevant.find(
    (e) => e.source === "manufacturer-claim" || e.source === "official-docs",
  );
  if (manufacturer && "score" in manufacturer) {
    return {
      score: (manufacturer as { score: number }).score,
      confidence: manufacturer.confidence,
      source: manufacturer.source,
    };
  }

  return {
    confidence: "uncertain",
    source: "manufacturer-claim",
  };
}

/**
 * Combine all knowledge layers for a comprehensive view
 */
export function getCombinedKnowledge(provider: string, model: string): {
  availability: ReturnType<typeof getAvailability>;
  quality: ReturnType<typeof getQuality>;
} {
  // In a full implementation, this would load from all three directories
  // For now, we return a structure showing how to combine layers
  const allEntries: KnowledgeEntry[] = [
    ...loadManufacturerFacts(),
    ...loadBenchmarkResults(),
    // Local evidence would come from evidence.ts
  ];

  return {
    availability: getAvailability(provider, model, allEntries),
    quality: getQuality(provider, model, allEntries),
  };
}
