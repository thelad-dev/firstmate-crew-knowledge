/**
 * evidence.ts — Local crew evidence collection from no-mistakes outcomes
 *
 * Phase 5: Lokale Crew-Evidence Collection (MANDATORY)
 * - Collect metrics from completed no-mistakes tasks
 * - Task class, harness, provider, model, effort
 * - Duration, success/fail, tests passed, CI result, rework count
 * - Privacy: NO code content, NO prompts - only metrics
 * - Aggregation per TaskClass/Model
 */

import fs from "node:fs";
import path from "node:path";

export interface TaskEvidence {
  /** Unique task ID */
  taskId: string;
  /** Task classification */
  taskClass: string;
  /** Harness used (pi, claude, codex, grok, etc.) */
  harness: string;
  /** Provider (claude, codex, grok, etc.) */
  provider: string;
  /** Model used */
  model: string;
  /** Effort level (low, medium, high) */
  effort: string;
  /** Task start timestamp */
  startTime: number;
  /** Task end timestamp */
  endTime: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Overall success */
  success: boolean;
  /** Number of tests run */
  testsRun?: number;
  /** Number of tests passed */
  testsPassed?: number;
  /** CI result (pass, fail, skip) */
  ciResult?: "pass" | "fail" | "skip";
  /** Number of rework cycles */
  reworkCount: number;
  /** Source of evidence (always "local") */
  source: "local";
  /** Confidence (always "measured") */
  confidence: "measured";
  /** Timestamp of evidence collection */
  timestamp: number;
}

export interface AggregatedEvidence {
  taskClass: string;
  provider: string;
  model: string;
  effort: string;
  totalTasks: number;
  successfulTasks: number;
  successRate: number;
  avgDurationMs: number;
  avgReworkCount: number;
  avgTestPassRate: number;
  lastUpdated: number;
}

function getEvidenceDir(): string {
  // Store in knowledge/local/
  const dir = path.join(process.cwd(), "knowledge", "local");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getEvidencePath(): string {
  return path.join(getEvidenceDir(), "evidence.json");
}

function getAggregatedPath(): string {
  return path.join(getEvidenceDir(), "aggregated.json");
}

/**
 * Load all raw evidence
 */
export function loadEvidence(): TaskEvidence[] {
  const evidencePath = getEvidencePath();
  if (!fs.existsSync(evidencePath)) {
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(evidencePath, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`Failed to load evidence: ${err}`);
    return [];
  }
}

/**
 * Save raw evidence
 */
function saveEvidence(evidence: TaskEvidence[]): void {
  const evidencePath = getEvidencePath();
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
}

/**
 * Record a new task evidence entry
 */
export function recordEvidence(evidence: Omit<TaskEvidence, "source" | "confidence" | "timestamp">): void {
  const allEvidence = loadEvidence();
  
  const newEvidence: TaskEvidence = {
    ...evidence,
    source: "local",
    confidence: "measured",
    timestamp: Date.now(),
  };

  allEvidence.push(newEvidence);
  saveEvidence(allEvidence);

  // Trigger re-aggregation
  aggregateEvidence();
}

/**
 * Aggregate evidence by task class, provider, model, effort
 */
export function aggregateEvidence(): AggregatedEvidence[] {
  const evidence = loadEvidence();
  const groups = new Map<string, TaskEvidence[]>();

  // Group by taskClass|provider|model|effort
  for (const ev of evidence) {
    const key = `${ev.taskClass}|${ev.provider}|${ev.model}|${ev.effort}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(ev);
  }

  // Aggregate each group
  const aggregated: AggregatedEvidence[] = [];
  for (const [key, items] of groups) {
    const [taskClass, provider, model, effort] = key.split("|");
    
    const totalTasks = items.length;
    const successfulTasks = items.filter((e) => e.success).length;
    const successRate = totalTasks > 0 ? successfulTasks / totalTasks : 0;
    
    const avgDurationMs = items.reduce((sum, e) => sum + e.durationMs, 0) / totalTasks;
    const avgReworkCount = items.reduce((sum, e) => sum + e.reworkCount, 0) / totalTasks;
    
    const testsData = items.filter((e) => e.testsRun && e.testsPassed);
    const avgTestPassRate = testsData.length > 0
      ? testsData.reduce((sum, e) => (e.testsPassed! / e.testsRun!), 0) / testsData.length
      : 0;

    aggregated.push({
      taskClass,
      provider,
      model,
      effort,
      totalTasks,
      successfulTasks,
      successRate,
      avgDurationMs,
      avgReworkCount,
      avgTestPassRate,
      lastUpdated: Date.now(),
    });
  }

  // Save aggregated data
  const aggregatedPath = getAggregatedPath();
  fs.writeFileSync(aggregatedPath, JSON.stringify(aggregated, null, 2));

  return aggregated;
}

/**
 * Load aggregated evidence
 */
export function loadAggregatedEvidence(): AggregatedEvidence[] {
  const aggregatedPath = getAggregatedPath();
  if (!fs.existsSync(aggregatedPath)) {
    // Generate if not exists
    return aggregateEvidence();
  }

  try {
    const data = JSON.parse(fs.readFileSync(aggregatedPath, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`Failed to load aggregated evidence: ${err}`);
    return [];
  }
}

/**
 * Get evidence for a specific task class and model combination
 */
export function getEvidenceForTask(
  taskClass: string,
  provider: string,
  model: string,
): AggregatedEvidence | undefined {
  const aggregated = loadAggregatedEvidence();
  return aggregated.find(
    (e) => e.taskClass === taskClass && e.provider === provider && e.model === model,
  );
}

/**
 * Get best performing model for a task class based on local evidence
 */
export function getBestModelForTask(taskClass: string): AggregatedEvidence | undefined {
  const aggregated = loadAggregatedEvidence();
  const forTask = aggregated.filter((e) => e.taskClass === taskClass);

  if (forTask.length === 0) {
    return undefined;
  }

  // Rank by success rate, then avg duration (faster is better)
  forTask.sort((a, b) => {
    if (Math.abs(a.successRate - b.successRate) > 0.05) {
      return b.successRate - a.successRate;
    }
    return a.avgDurationMs - b.avgDurationMs;
  });

  return forTask[0];
}

/**
 * Parse no-mistakes outcome and record evidence
 * This is a helper function to extract metrics from no-mistakes logs
 */
export function recordFromNoMistakesOutcome(outcome: {
  taskId: string;
  taskClass: string;
  harness: string;
  provider: string;
  model: string;
  effort: string;
  startTime: number;
  endTime: number;
  success: boolean;
  testsRun?: number;
  testsPassed?: number;
  ciResult?: "pass" | "fail" | "skip";
  reworkCount: number;
}): void {
  recordEvidence({
    taskId: outcome.taskId,
    taskClass: outcome.taskClass,
    harness: outcome.harness,
    provider: outcome.provider,
    model: outcome.model,
    effort: outcome.effort,
    startTime: outcome.startTime,
    endTime: outcome.endTime,
    durationMs: outcome.endTime - outcome.startTime,
    success: outcome.success,
    testsRun: outcome.testsRun,
    testsPassed: outcome.testsPassed,
    ciResult: outcome.ciResult,
    reworkCount: outcome.reworkCount,
  });
}
