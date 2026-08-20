# AGENTS.md — firstmate-crew-knowledge

Pi-Package (`pi-package`), das Firstmate bei Crew-Routing und Quota-Balance unterstützt.

## Was dieses Repo ist

- Installierbare Extension: `package.json` → `"pi": { "extensions": ["./index.ts"] }`
- Tools: `crew_route`, `crew_balance`, `crew_apply_dispatch`, `crew_suggest_primary`, `crew_discover`, `crew_evidence`, `crew_update_check`
- Knowledge: Drei-Ebenen System
  - Basis: `knowledge/*.json` (Task-Klassen, Provider, Profile)
  - Hersteller: `knowledge/manufacturers/` (Official Docs, Manufacturer Claims)
  - Benchmarks: `knowledge/benchmarks/` (Artificial Analysis, HumanEval, etc.)
  - Lokale Evidenz: `knowledge/local/` (no-mistakes Outcomes, privacy-conscious)
- Logik in `src/`:
  - `discovery.ts`: Live Model Discovery (Pi, Claude, Codex, Grok, Kimi)
  - `evidence.ts`: Lokale Evidenz-Sammlung aus no-mistakes
  - `knowledge-layers.ts`: Drei-Ebenen Knowledge System mit Conflict Resolution
  - `update.ts`: Compatibility Checks und Firstmate-Version-Awareness
- Delegation/Microtasking (Policy, kein paralleles Routing): `knowledge/delegation.json`, `knowledge/context-pack.json`, `docs/` (siehe `docs/README.md`)

## Was es nicht ist

- Kein Ersatz für Firstmate-Core (`bin/fm-spawn.sh`, Intake-Urteil, `quota-array-dispatch`)
- Kein Auto-Spawn, kein Credential-Store, kein Billing

## Firstmate-Verträge (Pointer)

Autoritative Firstmate-Doku liegt im Firstmate-Home (nicht hier kopieren):

- Dispatch-Schema / `config/crew-dispatch.json` → Firstmate `docs/configuration.md` (Crew dispatch profiles) und `docs/examples/crew-dispatch.json`
- Array-Auflösung → Firstmate-Skill `quota-array-dispatch`
- Spawn-Flags → `bin/fm-spawn.sh --harness/--model/--effort`
- Quota-Daten → `quota-axi --json` (Skill `quota-axi`)

## Architektur-Prinzipien

- **Firstmate bleibt Authority**: crew-knowledge liefert nur Empfehlungen
- **Kein Competing Dispatch Engine**: Nutzt Firstmate's `quota-array-dispatch`
- **Respektiert config/crew-dispatch.json**: Natural Language Rules bleiben authoritative
- **Provider ≠ Model ≠ Harness**: Klare Trennung, kein Inferieren von Provider aus Model-Namen
- **Herdr ist Infrastructure**: Backend-Wahl (tmux, Herdr, etc.) beeinflusst nicht Model-Qualität
- **Discovery Cache**: 15min TTL, force-refresh möglich
- **Privacy-First Evidence**: Nur Metriken, KEINE Code-Inhalte, KEINE Prompts

## Lokale Konventionen

- User-facing Docs: Deutsch; kurze English-Section in README ok
- Commits/PR: Deutsch, ohne AI-Co-Author-Meta
- Writes nur unter dem aufgelösten Home/config (siehe README) und nur bei explizitem Tool-Call (`dryRun=false`)
- Tests: `npm test` (Node built-in test runner, Fixtures, kein Netz)
- Evidence Collection: Automatisch aus no-mistakes, manuell via `recordEvidence()` oder `recordFromNoMistakesOutcome()`
- Discovery Cache: `~/.cache/firstmate-crew-knowledge/discovery.json`
- Local Evidence: `knowledge/local/evidence.json` und `knowledge/local/aggregated.json`

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
