# AGENTS.md — firstmate-crew-knowledge

Agent-Skill (kein Pi-Package / keine Extension) für Firstmate Crew-Routing und Delegation/Microtasking-Policy.

## Was dieses Repo ist

- Einstieg: `SKILL.md` (Agent-only, `user-invocable: false`)
- Knowledge: `knowledge/*.json` plus optionale Ebenen unter `manufacturers/`, `benchmarks/`, `local/`
- Policy-Doku: `docs/` (Delegation, Context Pack, Failure Modes)
- Beispiele: `examples/`, Evaluation: `evaluation/`

## Was es nicht ist

- Kein Pi-Package (`pi.extensions`), kein MCP-Tool-Set (alte `crew_*`-Tools entfernt)
- Kein Ersatz für Firstmate-Core (`bin/fm-spawn.sh`, Intake, `quota-array-dispatch`)
- Kein Auto-Spawn, kein Credential-Store, kein Billing

## Firstmate-Verträge (Pointer)

Autoritative Firstmate-Doku liegt im Firstmate-Home:

- Dispatch-Schema / `config/crew-dispatch.json` → Firstmate `docs/configuration.md`
- Array-Auflösung → Skill `quota-array-dispatch`
- Spawn-Flags → `bin/fm-spawn.sh --harness/--model/--effort`
- Quota-Daten → `quota-axi` (Skill `quota-axi`)
- Harness/Model-Discovery → Skill `harness-adapters`

## Architektur-Prinzipien

- **Firstmate bleibt Authority** — dieser Skill liefert nur Empfehlungen
- **Kein Competing Dispatch Engine** — nutzt Firstmates Array-Dispatch
- **Provider ≠ Model ≠ Harness** — kein Inferieren des Providers aus dem Model-Namen
- **Herdr ist Infrastructure** — Backend ≠ Model-Qualität
- **Privacy-First Evidence** — nur Metriken in `knowledge/local/`

## Lokale Konventionen

- User-facing Docs: Deutsch; kurze English-Section in README ok
- Commits/PR: Deutsch, ohne AI-Co-Author-Meta
- Validierung: `./scripts/validate-knowledge.sh` (JSON parse)

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file instead.
Prefer rewriting or pruning existing entries over appending new ones.
