# AGENTS.md — firstmate-crew-knowledge

Pi-Package (`pi-package`), das Firstmate bei Crew-Routing und Quota-Balance unterstützt.

## Was dieses Repo ist

- Installierbare Extension: `package.json` → `"pi": { "extensions": ["./index.ts"] }`
- Tools: `crew_route`, `crew_balance`, `crew_apply_dispatch`, `crew_suggest_primary`
- Knowledge: `knowledge/*.json` (Task-Klassen, Provider, Profile)
- Logik in `src/`

## Was es nicht ist

- Kein Ersatz für Firstmate-Core (`bin/fm-spawn.sh`, Intake-Urteil, `quota-array-dispatch`)
- Kein Auto-Spawn, kein Credential-Store, kein Billing

## Firstmate-Verträge (Pointer)

Autoritative Firstmate-Doku liegt im Firstmate-Home (nicht hier kopieren):

- Dispatch-Schema / `config/crew-dispatch.json` → Firstmate `docs/configuration.md` (Crew dispatch profiles) und `docs/examples/crew-dispatch.json`
- Array-Auflösung → Firstmate-Skill `quota-array-dispatch`
- Spawn-Flags → `bin/fm-spawn.sh --harness/--model/--effort`
- Quota-Daten → `quota-axi --json` (Skill `quota-axi`)

## Lokale Konventionen

- User-facing Docs: Deutsch; kurze English-Section in README ok
- Commits/PR: Deutsch, ohne AI-Co-Author-Meta
- Writes nur unter dem aufgelösten Home/config (siehe README) und nur bei explizitem Tool-Call (`dryRun=false`)
- Tests: `npm test` (Node built-in test runner, Fixtures, kein Netz)

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
