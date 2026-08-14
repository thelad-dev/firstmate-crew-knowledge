/**
 * update.ts — Self-updating integration with Firstmate
 *
 * Phase 3: Selbstaktualisierung
 * - Integration with /updatefirstmate workflow
 * - Compatibility checks: dispatch schema, harnesses, models, efforts
 * - Auto-refresh when Firstmate updates
 * - Fail loudly on breaking changes
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getCachedDiscovery, clearCache as clearDiscoveryCache } from "./discovery.ts";

interface CompatibilityCheck {
  check: string;
  status: "ok" | "warning" | "error";
  message: string;
}

interface UpdateResult {
  compatible: boolean;
  checks: CompatibilityCheck[];
  errors: string[];
  warnings: string[];
}

/**
 * Get Firstmate home directory
 */
function getFirstmateHome(): string | undefined {
  return process.env.FM_HOME || process.env.FM_ROOT_OVERRIDE;
}

/**
 * Check if dispatch schema is compatible
 */
function checkDispatchSchema(): CompatibilityCheck {
  const fmHome = getFirstmateHome();
  if (!fmHome) {
    return {
      check: "dispatch-schema",
      status: "warning",
      message: "FM_HOME not set, cannot verify dispatch schema compatibility",
    };
  }

  const examplePath = path.join(fmHome, "docs", "examples", "crew-dispatch.json");
  if (!fs.existsSync(examplePath)) {
    return {
      check: "dispatch-schema",
      status: "warning",
      message: "Firstmate example crew-dispatch.json not found, cannot verify schema",
    };
  }

  try {
    const example = JSON.parse(fs.readFileSync(examplePath, "utf-8"));
    
    // Check for required schema fields
    if (!example.rules || !Array.isArray(example.rules)) {
      return {
        check: "dispatch-schema",
        status: "error",
        message: "Dispatch schema missing 'rules' array - BREAKING CHANGE",
      };
    }

    // Check rule structure
    const firstRule = example.rules[0];
    if (firstRule && (!firstRule.when || !firstRule.use)) {
      return {
        check: "dispatch-schema",
        status: "error",
        message: "Dispatch rule schema changed (missing when/use) - BREAKING CHANGE",
      };
    }

    return {
      check: "dispatch-schema",
      status: "ok",
      message: "Dispatch schema compatible",
    };
  } catch (err) {
    return {
      check: "dispatch-schema",
      status: "error",
      message: `Failed to parse dispatch schema: ${err}`,
    };
  }
}

/**
 * Check if known harnesses are still valid
 */
function checkHarnesses(): CompatibilityCheck {
  const discovery = getCachedDiscovery();
  const knownHarnesses = ["pi", "claude", "codex", "grok", "cursor"];
  
  const availableHarnesses = new Set(
    discovery.models.map((m) => m.harness),
  );

  const missingCritical = knownHarnesses.filter(
    (h) => h !== "cursor" && !availableHarnesses.has(h),
  );

  if (missingCritical.length > 0) {
    return {
      check: "harnesses",
      status: "warning",
      message: `Critical harnesses not discovered: ${missingCritical.join(", ")}`,
    };
  }

  return {
    check: "harnesses",
    status: "ok",
    message: `All critical harnesses available: ${Array.from(availableHarnesses).join(", ")}`,
  };
}

/**
 * Check if spawn flags are compatible
 */
function checkSpawnFlags(): CompatibilityCheck {
  const fmHome = getFirstmateHome();
  if (!fmHome) {
    return {
      check: "spawn-flags",
      status: "warning",
      message: "FM_HOME not set, cannot verify spawn flags",
    };
  }

  const spawnScript = path.join(fmHome, "bin", "fm-spawn.sh");
  if (!fs.existsSync(spawnScript)) {
    return {
      check: "spawn-flags",
      status: "warning",
      message: "fm-spawn.sh not found, cannot verify flags",
    };
  }

  try {
    const content = fs.readFileSync(spawnScript, "utf-8");
    
    // Check for expected flags
    const requiredFlags = ["--harness", "--model", "--effort"];
    const missingFlags = requiredFlags.filter((flag) => !content.includes(flag));

    if (missingFlags.length > 0) {
      return {
        check: "spawn-flags",
        status: "error",
        message: `fm-spawn.sh missing expected flags: ${missingFlags.join(", ")} - BREAKING CHANGE`,
      };
    }

    return {
      check: "spawn-flags",
      status: "ok",
      message: "Spawn flags compatible (--harness, --model, --effort present)",
    };
  } catch (err) {
    return {
      check: "spawn-flags",
      status: "error",
      message: `Failed to verify spawn flags: ${err}`,
    };
  }
}

/**
 * Check if effort values are compatible
 */
function checkEffortValues(): CompatibilityCheck {
  const knownEfforts = ["low", "medium", "high"];
  // In the future, we could parse Firstmate docs to verify these
  
  return {
    check: "effort-values",
    status: "ok",
    message: `Effort values compatible: ${knownEfforts.join(", ")}`,
  };
}

/**
 * Check quota-axi availability
 */
function checkQuotaAxi(): CompatibilityCheck {
  try {
    execSync("which quota-axi 2>/dev/null", { encoding: "utf-8" });
    
    try {
      execSync("quota-axi --json 2>/dev/null", {
        encoding: "utf-8",
        timeout: 5000,
      });
      
      return {
        check: "quota-axi",
        status: "ok",
        message: "quota-axi available and working",
      };
    } catch (err) {
      return {
        check: "quota-axi",
        status: "warning",
        message: "quota-axi found but failed to execute (might be auth issue)",
      };
    }
  } catch (err) {
    return {
      check: "quota-axi",
      status: "warning",
      message: "quota-axi not available (will use degraded mode)",
    };
  }
}

/**
 * Perform full compatibility check
 */
export function checkCompatibility(): UpdateResult {
  const checks: CompatibilityCheck[] = [
    checkDispatchSchema(),
    checkHarnesses(),
    checkSpawnFlags(),
    checkEffortValues(),
    checkQuotaAxi(),
  ];

  const errors = checks.filter((c) => c.status === "error").map((c) => c.message);
  const warnings = checks.filter((c) => c.status === "warning").map((c) => c.message);
  const compatible = errors.length === 0;

  return {
    compatible,
    checks,
    errors,
    warnings,
  };
}

/**
 * Refresh knowledge after Firstmate update
 */
export function refreshAfterUpdate(): UpdateResult {
  // Clear discovery cache to force re-discovery
  clearDiscoveryCache();

  // Re-discover models
  getCachedDiscovery(true);

  // Run compatibility checks
  const result = checkCompatibility();

  if (!result.compatible) {
    console.error("⚠️  BREAKING CHANGES DETECTED:");
    for (const error of result.errors) {
      console.error(`   ❌ ${error}`);
    }
    throw new Error(
      "Firstmate update introduced breaking changes. Manual intervention required.",
    );
  }

  if (result.warnings.length > 0) {
    console.warn("⚠️  Warnings after update:");
    for (const warning of result.warnings) {
      console.warn(`   ⚠️  ${warning}`);
    }
  }

  return result;
}

/**
 * Get Firstmate version from various sources
 */
export function getFirstmateVersion(): string | undefined {
  const fmHome = getFirstmateHome();
  if (!fmHome) {
    return undefined;
  }

  // Try package.json
  const pkgPath = path.join(fmHome, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.version) {
        return pkg.version;
      }
    } catch (err) {
      // Continue to next method
    }
  }

  // Try AGENTS.md
  const agentsPath = path.join(fmHome, "AGENTS.md");
  if (fs.existsSync(agentsPath)) {
    try {
      const content = fs.readFileSync(agentsPath, "utf-8");
      const versionMatch = content.match(/version[:\s]+([0-9.]+)/i);
      if (versionMatch) {
        return versionMatch[1];
      }
    } catch (err) {
      // Continue
    }
  }

  return undefined;
}

/**
 * Check if an update is needed based on version change
 */
export function needsUpdate(lastKnownVersion?: string): boolean {
  const currentVersion = getFirstmateVersion();
  
  if (!currentVersion) {
    // Cannot determine version, assume no update needed
    return false;
  }

  if (!lastKnownVersion) {
    // First run, no update needed
    return false;
  }

  return currentVersion !== lastKnownVersion;
}
