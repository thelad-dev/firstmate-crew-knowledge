import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickApplicableAvailability,
  summarizeProvider,
} from "../src/quota.ts";
import type { QuotaProviderSnapshot } from "../src/types.ts";

describe("pickApplicableAvailability", () => {
  it("prefers all_models over model scope", () => {
    const picked = pickApplicableAvailability([
      {
        scope: "model:fable",
        status: "known",
        effectivePercentRemaining: 4,
      },
      {
        scope: "all_models",
        status: "known",
        effectivePercentRemaining: 10,
      },
    ]);
    assert.equal(picked?.scope, "all_models");
    assert.equal(picked?.effectivePercentRemaining, 10);
  });
});

describe("summarizeProvider", () => {
  it("marks exhausted_now as exhausted", () => {
    const snap: QuotaProviderSnapshot = {
      provider: "claude",
      state: { status: "fresh", stale: false },
      quotaSemantics: {
        status: "known",
        effectiveAvailability: [
          {
            scope: "all_models",
            status: "known",
            effectivePercentRemaining: 0,
            runway: { status: "exhausted_now", usableRunwaySeconds: 0 },
          },
        ],
      },
    };
    const v = summarizeProvider(snap);
    assert.equal(v.exhausted, true);
    assert.equal(v.effectiveRemaining, 0);
  });

  it("leaves unknown headroom null (not zero)", () => {
    const snap: QuotaProviderSnapshot = {
      provider: "cursor",
      state: { status: "fresh", stale: false },
      windows: [{ id: "included_usage", percentRemaining: 25 }],
      quotaSemantics: {
        status: "unknown",
        effectiveAvailability: [],
      },
    };
    const v = summarizeProvider(snap);
    assert.equal(v.effectiveRemaining, null);
    assert.equal(v.exhausted, false);
  });

  it("treats all window remaining 0 as exhausted diagnostic", () => {
    const snap: QuotaProviderSnapshot = {
      provider: "cursor",
      state: { status: "fresh", stale: false },
      windows: [
        { id: "a", percentRemaining: 0 },
        { id: "b", percentRemaining: 0 },
      ],
      quotaSemantics: { status: "unknown", effectiveAvailability: [] },
    };
    const v = summarizeProvider(snap);
    assert.equal(v.exhausted, true);
  });

  it("ignores stale effective percentages for routing headroom", () => {
    const snap: QuotaProviderSnapshot = {
      provider: "codex",
      state: { status: "fresh", stale: true },
      quotaSemantics: {
        status: "known",
        effectiveAvailability: [
          {
            scope: "all_models",
            status: "known",
            effectivePercentRemaining: 90,
          },
        ],
      },
    };
    const v = summarizeProvider(snap);
    assert.equal(v.stale, true);
    assert.equal(v.effectiveRemaining, null);
  });
});
