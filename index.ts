/**
 * firstmate-crew-knowledge — Pi extension
 *
 * Tools for the primary Firstmate session:
 *   crew_route          — task class → spawn flags + balance rationale
 *   crew_balance        — live quota-axi ranking snapshot
 *   crew_apply_dispatch — generate/update config/crew-dispatch.json (dry-run default)
 *   crew_suggest_primary — optional mid-session Pi model suggestion (no pane hijack)
 *
 * Does not replace Firstmate judgment or auto-spawn crewmates.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { applyDispatch } from "./src/dispatch.ts";
import {
  formatBalanceResult,
  formatDispatchResult,
  formatRouteResult,
  routeResultJson,
} from "./src/format.ts";
import { loadKnowledge } from "./src/knowledge.ts";
import { readLiveQuota } from "./src/quota.ts";
import { balanceProviders, routeTask } from "./src/scorer.ts";
import {
  formatSuggestPrimaryResult,
  suggestPrimary,
} from "./src/suggest-primary.ts";

const knowledge = loadKnowledge();

const ROUTE_PARAMS = Type.Object({
  task: Type.String({
    description:
      "Task description or brief excerpt used to classify work and recommend harness/model/effort.",
  }),
  taskClass: Type.Optional(
    Type.String({
      description:
        "Optional explicit class id: trivial_fix | standard_ship | hard_multi_file | research_web_live | scout_audit",
    }),
  ),
  format: Type.Optional(
    Type.Union([Type.Literal("text"), Type.Literal("json")], {
      description: "Response format (default text)",
    }),
  ),
});

const BALANCE_PARAMS = Type.Object({
  format: Type.Optional(
    Type.Union([Type.Literal("text"), Type.Literal("json")], {
      description: "Response format (default text)",
    }),
  ),
});

const APPLY_PARAMS = Type.Object({
  dryRun: Type.Optional(
    Type.Boolean({
      description:
        "Default true. When false, writes config/crew-dispatch.json under FM_HOME/config only.",
    }),
  ),
  merge: Type.Optional(
    Type.Boolean({
      description:
        "When true, append generated rules whose `when` text is not already present.",
    }),
  ),
});

const SUGGEST_PRIMARY_PARAMS = Type.Object({
  goal: Type.Optional(
    Type.String({
      description:
        "What the primary Firstmate session needs (e.g. long refactor, cheap triage).",
    }),
  ),
  search: Type.Optional(
    Type.String({
      description:
        "Optional filter over authenticated session models (provider, id, or name substring).",
    }),
  ),
  format: Type.Optional(
    Type.Union([Type.Literal("text"), Type.Literal("json")], {
      description: "Response format (default text)",
    }),
  ),
});

function textResult(text: string, details?: unknown) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function suggestPrimaryJson(result: ReturnType<typeof suggestPrimary>) {
  return {
    goal: result.goal,
    search: result.search,
    taskClassId: result.taskClassId,
    mode: result.mode,
    degradedReason: result.degradedReason,
    currentModel: result.currentModel,
    availableCount: result.availableCount,
    listedSource: result.listedSource,
    recommendation: result.recommendation,
    matches: result.matches,
    searchHits: result.searchHits,
    notes: result.notes,
    disclaimer: result.disclaimer,
  };
}

/** Emit full route text via real ExtensionUIContext APIs (no truncation). */
function presentRouteText(
  ui: ExtensionContext["ui"],
  text: string,
  spawnFlags: string,
): void {
  if (typeof ui.setEditorText === "function") {
    ui.setEditorText(text);
  }
  if (typeof ui.notify === "function") {
    // Full body via notify as well so RPC/TUI both keep spawn flags intact.
    ui.notify(text, "info");
  } else if (typeof ui.setStatus === "function") {
    ui.setStatus("crew-route", spawnFlags);
  }
}

export default function firstmateCrewKnowledge(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "crew_route",
    label: "Crew Route",
    description:
      "Classify a crew task and recommend concrete --harness/--model/--effort spawn flags, balancing quality vs live quota-axi headroom. Does not spawn.",
    promptSnippet:
      "Recommend Firstmate crew spawn profile (harness/model/effort) from task text and quota-axi",
    promptGuidelines: [
      "Use crew_route before fm-spawn when choosing among Claude/Codex/Cursor/Grok profiles.",
      "Treat output as advice; Firstmate still decides and calls fm-spawn with concrete flags.",
      "If mode is degraded, prefer knowledge tables and disclose uncertainty.",
    ],
    parameters: ROUTE_PARAMS,
    async execute(_id, params) {
      const quota = readLiveQuota();
      const result = routeTask(knowledge, quota, params.task, params.taskClass);
      if (params.format === "json") {
        const payload = routeResultJson(result);
        return textResult(JSON.stringify(payload, null, 2), payload);
      }
      return textResult(formatRouteResult(result), routeResultJson(result));
    },
  });

  pi.registerTool({
    name: "crew_balance",
    label: "Crew Balance",
    description:
      "Read live quota-axi --json and summarize provider headroom/runway for balanced multi-provider burn. Data only plus transparent sort — no spawn.",
    promptSnippet: "Show quota-aware provider balance for the captain fleet",
    promptGuidelines: [
      "Call crew_balance when comparing remaining headroom across Claude, Codex, Cursor, Grok.",
      "Do not invent credentials; missing quota-axi yields labeled degraded output.",
    ],
    parameters: BALANCE_PARAMS,
    async execute(_id, params) {
      const quota = readLiveQuota();
      const result = balanceProviders(knowledge, quota);
      if (params.format === "json") {
        return textResult(JSON.stringify(result, null, 2), result);
      }
      return textResult(formatBalanceResult(result), result);
    },
  });

  pi.registerTool({
    name: "crew_apply_dispatch",
    label: "Crew Apply Dispatch",
    description:
      "Generate a Firstmate config/crew-dispatch.json fragment from the knowledge pack. Dry-run by default; writes only under FM_HOME/config when dryRun=false.",
    promptSnippet:
      "Build or dry-run write Firstmate crew-dispatch.json from curated profiles",
    promptGuidelines: [
      "Default dryRun=true — show JSON without writing.",
      "Only set dryRun=false when the captain/Firstmate explicitly wants FM_HOME/config/crew-dispatch.json updated.",
      "Never write outside FM_HOME/config.",
    ],
    parameters: APPLY_PARAMS,
    async execute(_id, params) {
      const result = applyDispatch(knowledge, {
        dryRun: params.dryRun !== false,
        merge: Boolean(params.merge),
      });
      return textResult(formatDispatchResult(result), result);
    },
  });

  pi.registerTool({
    name: "crew_suggest_primary",
    label: "Crew Suggest Primary",
    description:
      "List/search authenticated Pi session models and recommend a primary-session switch target among models actually available now. Advisory only — does not switch models or touch crew panes. pi-model-switch not required.",
    promptSnippet:
      "Suggest a primary Pi session model from authenticated session catalogue without switching",
    promptGuidelines: [
      "Advisory only — do not call model switch APIs unless the captain asks separately.",
      "Never hijack crewmate panes.",
      "Only recommend models visible via ExtensionContext modelRegistry/scopedModels.",
    ],
    parameters: SUGGEST_PRIMARY_PARAMS,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const quota = readLiveQuota();
      const result = suggestPrimary(knowledge, quota, {
        goal: params.goal,
        search: params.search,
        session: {
          modelRegistry: ctx?.modelRegistry,
          scopedModels: ctx?.scopedModels,
          model: ctx?.model,
        },
      });
      const payload = suggestPrimaryJson(result);
      if (params.format === "json") {
        return textResult(JSON.stringify(payload, null, 2), payload);
      }
      return textResult(formatSuggestPrimaryResult(result), payload);
    },
  });

  pi.registerCommand("crew-route", {
    description:
      "Classify task text and print spawn flags: /crew-route <task description>",
    handler: async (args, ctx) => {
      const task = (args ?? "").trim();
      if (!task) {
        ctx.ui.notify(
          "Usage: /crew-route <task description> — or call tool crew_route",
          "warning",
        );
        return;
      }
      const quota = readLiveQuota();
      const result = routeTask(knowledge, quota, task);
      const text = formatRouteResult(result);
      presentRouteText(ctx.ui, text, result.recommendation.spawnFlags);
    },
  });
}
