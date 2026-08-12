import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { KnowledgeProfile, ProviderInfo, TaskClass } from "./types.ts";

export interface DispatchTemplateRule {
  when: string;
  profileIds: string[];
  why?: string;
}

export interface KnowledgePack {
  taskClasses: TaskClass[];
  providers: ProviderInfo[];
  profiles: Map<string, KnowledgeProfile>;
  profileList: KnowledgeProfile[];
  dispatchTemplate: {
    rules: DispatchTemplateRule[];
    defaultProfileIds: string[];
  };
  rootDir: string;
}

interface TaskClassesFile {
  classes: TaskClass[];
}

interface ProvidersFile {
  providers: ProviderInfo[];
}

interface ProfilesFile {
  profiles: KnowledgeProfile[];
  dispatchTemplate: {
    rules: DispatchTemplateRule[];
    defaultProfileIds: string[];
  };
}

function packageRootFrom(moduleUrl: string): string {
  // src/knowledge.ts → package root
  return join(dirname(fileURLToPath(moduleUrl)), "..");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Load curated knowledge tables from the package knowledge/ directory. */
export function loadKnowledge(rootDir: string = packageRootFrom(import.meta.url)): KnowledgePack {
  const knowledgeDir = join(rootDir, "knowledge");
  const taskFile = readJson<TaskClassesFile>(join(knowledgeDir, "task-classes.json"));
  const providerFile = readJson<ProvidersFile>(join(knowledgeDir, "providers.json"));
  const profileFile = readJson<ProfilesFile>(join(knowledgeDir, "profiles.json"));

  const profiles = new Map<string, KnowledgeProfile>();
  for (const p of profileFile.profiles) {
    profiles.set(p.id, p);
  }

  return {
    taskClasses: taskFile.classes,
    providers: providerFile.providers,
    profiles,
    profileList: profileFile.profiles,
    dispatchTemplate: profileFile.dispatchTemplate,
    rootDir,
  };
}

export function resolveProfiles(
  pack: KnowledgePack,
  ids: string[],
): KnowledgeProfile[] {
  const out: KnowledgeProfile[] = [];
  for (const id of ids) {
    const p = pack.profiles.get(id);
    if (p) out.push(p);
  }
  return out;
}
