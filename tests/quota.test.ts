import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickApplicableAvailability,
  readLiveQuota,
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

  it("does not mark stale zero windows as exhausted", () => {
    const snap: QuotaProviderSnapshot = {
      provider: "cursor",
      state: { status: "fresh", stale: true },
      windows: [
        { id: "a", percentRemaining: 0 },
        { id: "b", percentRemaining: 0 },
      ],
      quotaSemantics: { status: "unknown", effectiveAvailability: [] },
    };
    const v = summarizeProvider(snap);
    assert.equal(v.stale, true);
    assert.equal(v.effectiveRemaining, null);
    assert.equal(v.exhausted, false);
  });
});

function failExec(code: string, message: string): () => Promise<string> {
  return async () => {
    const err = new Error(message) as NodeJS.ErrnoException;
    err.code = code;
    throw err;
  };
}

describe("readLiveQuota", () => {
  it("labels missing binary only when error.code is ENOENT", async () => {
    const result = await readLiveQuota({
      exec: failExec("ENOENT", "spawn quota-axi ENOENT"),
    });
    assert.equal(result.mode, "degraded");
    assert.match(result.degradedReason ?? "", /quota-axi not found on PATH/);
  });

  it("does not label timeout or permission errors as missing binary", async () => {
    const timeout = await readLiveQuota({
      exec: failExec("ETIMEDOUT", "spawnSync quota-axi ETIMEDOUT"),
    });
    assert.equal(timeout.mode, "degraded");
    assert.match(timeout.degradedReason ?? "", /quota-axi failed/);
    assert.doesNotMatch(timeout.degradedReason ?? "", /not found on PATH/);

    const denied = await readLiveQuota({
      exec: failExec("EACCES", "spawn quota-axi EACCES"),
    });
    assert.equal(denied.mode, "degraded");
    assert.match(denied.degradedReason ?? "", /quota-axi failed/);
    assert.doesNotMatch(denied.degradedReason ?? "", /not found on PATH/);
  });

  it("rejects when AbortSignal aborts an in-flight quota-axi run", async () => {
    const ac = new AbortController();
    const resultPromise = readLiveQuota({
      signal: ac.signal,
      exec: (_file, _args, options) =>
        new Promise((_, reject) => {
          const onAbort = () => {
            const err = Object.assign(new Error("The operation was aborted"), {
              code: "ABORT_ERR",
              name: "AbortError",
            });
            reject(err);
          };
          if (options.signal?.aborted) {
            onAbort();
            return;
          }
          options.signal?.addEventListener("abort", onAbort, { once: true });
        }),
    });
    ac.abort();
    await assert.rejects(resultPromise, (err: unknown) => {
      assert.ok(isAbortish(err));
      return true;
    });
  });

  it("rejects without spawning when AbortSignal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    let spawned = false;
    await assert.rejects(
      () =>
        readLiveQuota({
          signal: ac.signal,
          exec: async () => {
            spawned = true;
            return "{}";
          },
        }),
      (err: unknown) => {
        assert.equal(spawned, false);
        assert.ok(isAbortish(err));
        return true;
      },
    );
  });
});

function isAbortish(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? (err as { code: unknown }).code : undefined;
  const name = "name" in err ? (err as { name: unknown }).name : undefined;
  return code === "ABORT_ERR" || name === "AbortError";
}
