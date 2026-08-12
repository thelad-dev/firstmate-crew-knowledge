/** Shared types for firstmate-crew-knowledge. */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type QualityFloor = "low" | "medium" | "high";

export interface SpawnProfile {
  harness: string;
  model?: string;
  effort?: Effort | string;
}

export interface DispatchRule {
  when: string;
  use: SpawnProfile | SpawnProfile[];
  why?: string;
}

export interface CrewDispatchFile {
  rules: DispatchRule[];
  default?: SpawnProfile | SpawnProfile[];
}

export interface KnowledgeProfile extends SpawnProfile {
  id: string;
  provider: string;
  quality: QualityFloor;
  reasoningClass: string;
  why: string;
}

export interface TaskClass {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  qualityFloor: QualityFloor;
  preferredProfileIds: string[];
  fallbackProfileIds: string[];
}

export interface ProviderInfo {
  id: string;
  label: string;
  quotaProvider: string;
  harnesses: string[];
  strengths: string[];
  weaknesses: string[];
  piModelPatterns: string[];
  nativeModelHints: string[];
  defaultHarness: string;
  notes?: string;
}

export interface QuotaRunway {
  status?: string;
  usableRunwaySeconds?: number | null;
  projectedExhaustedAt?: string | null;
  limitingWindowId?: string | null;
  projectionConfidence?: string | null;
  projectionBasis?: string | null;
  unmeasurableWindowIds?: string[];
}

export interface EffectiveAvailability {
  scope: string;
  status?: string;
  effectivePercentRemaining?: number | null;
  boundedBy?: string[];
  runway?: QuotaRunway;
  pace?: { status?: string; [k: string]: unknown };
  limitingWindowIds?: string[];
}

export interface QuotaProviderSnapshot {
  provider: string;
  label?: string;
  source?: string;
  plan?: string;
  windows?: Array<{
    id?: string;
    label?: string;
    kind?: string;
    percentUsed?: number | null;
    percentRemaining?: number | null;
    resetsAt?: string | null;
  }>;
  state?: {
    status?: string;
    stale?: boolean;
    error?: string;
    authStatus?: string;
    refreshedAt?: string;
    sourcesTried?: string[];
  };
  quotaSemantics?: {
    status?: string;
    description?: string;
    effectiveAvailability?: EffectiveAvailability[];
    unresolvedWindowIds?: string[];
  };
}

export interface QuotaSnapshot {
  generatedAt?: string;
  schemaVersion?: number;
  providers: QuotaProviderSnapshot[];
}

export interface ProviderQuotaView {
  provider: string;
  label: string;
  stateStatus: string;
  stale: boolean;
  authStatus?: string;
  error?: string;
  semanticsStatus: string;
  /** Known effective remaining % from the broadest applicable scope, or null if unknown. */
  effectiveRemaining: number | null;
  /** Known usable runway seconds, or null if unknown/unmeasurable. */
  usableRunwaySeconds: number | null;
  runwayStatus: string;
  scopeUsed?: string;
  exhausted: boolean;
  evidence: string;
}

export interface RankedCandidate {
  profile: KnowledgeProfile;
  providerView: ProviderQuotaView | null;
  qualityFit: boolean;
  rankScore: number;
  tradeoff: string;
  evidence: string[];
  spawnFlags: string;
}

export interface RouteResult {
  taskClass: TaskClass;
  classificationConfidence: "high" | "medium" | "low";
  classificationNotes: string[];
  mode: "live" | "degraded";
  degradedReason?: string;
  recommendation: RankedCandidate;
  alternatives: RankedCandidate[];
  quotaSummary: string;
  disclaimer: string;
}

export interface BalanceResult {
  mode: "live" | "degraded";
  degradedReason?: string;
  generatedAt?: string;
  providers: ProviderQuotaView[];
  rankingNotes: string[];
  disclaimer: string;
}

export interface DispatchBuildResult {
  dispatch: CrewDispatchFile;
  path: string;
  dryRun: boolean;
  wrote: boolean;
  validation: { ok: boolean; errors: string[] };
  summary: string;
}
