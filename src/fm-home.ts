import { accessSync, constants, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

/**
 * Resolve Firstmate operational home.
 * Prefer FM_HOME, then FM_ROOT_OVERRIDE, else null (caller must not invent a write root).
 */
export function resolveFmHome(
  env: NodeJS.ProcessEnv = process.env,
): { home: string | null; source: string } {
  const fmHome = env.FM_HOME?.trim();
  if (fmHome) {
    return { home: resolveHomePath(fmHome), source: "FM_HOME" };
  }
  const rootOverride = env.FM_ROOT_OVERRIDE?.trim();
  if (rootOverride) {
    return { home: resolveHomePath(rootOverride), source: "FM_ROOT_OVERRIDE" };
  }
  return { home: null, source: "unset" };
}

function resolveHomePath(raw: string): string {
  if (isAbsolute(raw)) return resolve(raw);
  return resolve(process.cwd(), raw);
}

export function crewDispatchPath(fmHome: string): string {
  return join(fmHome, "config", "crew-dispatch.json");
}

/**
 * Atomic write restricted to paths under fmHome/config.
 * Throws if the target escapes that directory.
 */
export function writeUnderFmConfig(
  fmHome: string,
  relativeUnderConfig: string,
  contents: string,
): string {
  const configRoot = resolve(fmHome, "config");
  const target = resolve(configRoot, relativeUnderConfig);
  if (target !== configRoot && !target.startsWith(configRoot + "/") && !target.startsWith(configRoot + "\\")) {
    throw new Error(
      `Refusing write outside FM_HOME/config: ${target} (config root ${configRoot})`,
    );
  }
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, target);
  return target;
}

export function canReadPath(path: string): boolean {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
