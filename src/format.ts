import type {
  BalanceResult,
  DispatchBuildResult,
  RankedCandidate,
  RouteResult,
} from "./types.ts";

export function formatRouteResult(result: RouteResult): string {
  const rec = result.recommendation;
  const lines: string[] = [
    "# crew_route",
    "",
    `Task-Klasse: ${result.taskClass.id} (${result.taskClass.label})`,
    `Klassifikation: ${result.classificationConfidence} — ${result.classificationNotes.join(" ")}`,
    `Modus: ${result.mode}${result.degradedReason ? ` — ${result.degradedReason}` : ""}`,
    `Quota-Kurz: ${result.quotaSummary}`,
    "",
    "## Empfehlung",
    `spawn: ${rec.spawnFlags}`,
    `profile: ${rec.profile.id}`,
    `tradeoff: ${rec.tradeoff}`,
    `why: ${rec.profile.why}`,
    "evidence:",
    ...rec.evidence.map((e) => `  - ${e}`),
    "",
  ];

  if (result.alternatives.length) {
    lines.push("## Alternativen");
    for (const alt of result.alternatives) {
      lines.push(
        `- ${alt.spawnFlags}  [${alt.profile.id}] score=${alt.rankScore.toFixed(1)} — ${alt.tradeoff}`,
      );
    }
    lines.push("");
  }

  lines.push(`## Hinweis`, result.disclaimer);
  return lines.join("\n");
}

export function formatBalanceResult(result: BalanceResult): string {
  const lines: string[] = [
    "# crew_balance",
    "",
    `Modus: ${result.mode}${result.degradedReason ? ` — ${result.degradedReason}` : ""}`,
    result.generatedAt ? `Snapshot: ${result.generatedAt}` : "Snapshot: n/a",
    "",
    "## Provider (sortiert)",
  ];
  for (const p of result.providers) {
    const head =
      p.effectiveRemaining !== null ? `${p.effectiveRemaining}%` : "unknown";
    const runway =
      p.usableRunwaySeconds !== null
        ? `${Math.round(p.usableRunwaySeconds / 3600)}h`
        : p.runwayStatus;
    lines.push(
      `- ${p.provider}: headroom=${head} runway=${runway} exhausted=${p.exhausted} state=${p.stateStatus}`,
    );
    lines.push(`  evidence: ${p.evidence}`);
  }
  lines.push("", "## Notes", ...result.rankingNotes.map((n) => `- ${n}`));
  lines.push("", result.disclaimer);
  return lines.join("\n");
}

export function formatDispatchResult(result: DispatchBuildResult): string {
  const lines: string[] = [
    "# crew_apply_dispatch",
    "",
    result.summary,
    `path: ${result.path}`,
    `dryRun: ${result.dryRun}`,
    `wrote: ${result.wrote}`,
    `validation: ${result.validation.ok ? "ok" : "FAILED"}`,
  ];
  if (!result.validation.ok) {
    for (const e of result.validation.errors) lines.push(`  - ${e}`);
  }
  lines.push("", "## crew-dispatch.json", "```json", JSON.stringify(result.dispatch, null, 2), "```");
  lines.push(
    "",
    "Firstmate liest diese Datei bei Intake, wählt die passende Regel und löst Arrays über quota-array-dispatch auf, bevor fm-spawn konkrete Flags bekommt.",
  );
  return lines.join("\n");
}

export function routeResultJson(result: RouteResult): unknown {
  return {
    taskClass: result.taskClass.id,
    classificationConfidence: result.classificationConfidence,
    mode: result.mode,
    degradedReason: result.degradedReason,
    quotaSummary: result.quotaSummary,
    spawnFlags: result.recommendation.spawnFlags,
    recommendation: candidateJson(result.recommendation),
    alternatives: result.alternatives.map(candidateJson),
    disclaimer: result.disclaimer,
  };
}

function candidateJson(c: RankedCandidate) {
  return {
    profileId: c.profile.id,
    harness: c.profile.harness,
    model: c.profile.model,
    effort: c.profile.effort,
    provider: c.profile.provider,
    spawnFlags: c.spawnFlags,
    rankScore: Number(c.rankScore.toFixed(3)),
    qualityFit: c.qualityFit,
    tradeoff: c.tradeoff,
    evidence: c.evidence,
    quota: c.providerView
      ? {
          effectiveRemaining: c.providerView.effectiveRemaining,
          usableRunwaySeconds: c.providerView.usableRunwaySeconds,
          exhausted: c.providerView.exhausted,
          evidence: c.providerView.evidence,
        }
      : null,
  };
}
