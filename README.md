# firstmate-crew-knowledge

Pi-Extension für [Firstmate](https://github.com/thelad-dev): empfiehlt pro Task-Klasse konkrete `{harness, model, effort}`-Profile und balanciert die Nutzung über die Captain-Subscriptions **Cursor**, **Claude**, **ChatGPT/Codex**, **Grok (xAI)** und **Kimi**.

> **Wichtig:** Dieses Paket **ersetzt weder Firstmate-Urteil noch `fm-spawn`**. Firstmate bleibt Owner von Intake, `quota-array-dispatch` und dem finalen Spawn. Die Tools liefern nur Empfehlungen, Spawn-Flags und optional eine `crew-dispatch.json`.

## Features

- **Live Model Discovery**: Automatische Erkennung verfügbarer Modelle von Pi, Claude, Codex, Grok, Kimi mit Caching
- **Drei-Ebenen Knowledge System**: Hersteller-Fakten, externe Benchmarks, lokale Crew-Evidenz
- **Lokale Evidenz-Sammlung**: Automatisches Tracking von no-mistakes Outcomes (Privacy-conscious: keine Code-Inhalte, keine Prompts)
- **Selbstaktualisierung**: Kompatibilitätsprüfung mit Firstmate-Updates
- **Quota-Balance**: Live-Quota-Ranking über alle Subscriptions

## Install

```bash
# npm (sobald published)
pi install npm:firstmate-crew-knowledge

# GitHub
pi install git:github.com/thelad-dev/firstmate-crew-knowledge

# lokaler Checkout
pi install /pfad/zu/firstmate-crew-knowledge
```

Voraussetzung: Node ≥ 22.6, Pi Coding Agent. Für Live-Quota: [`quota-axi`](https://www.npmjs.com/package/quota-axi) auf `PATH` (`quota-axi --json`).

## English (short)

Installable Pi package (`pi-package`) that classifies crew work, recommends `--harness/--model/--effort` for Firstmate’s `fm-spawn`, and ranks providers from live `quota-axi --json`. It can dry-run or write `config/crew-dispatch.json` under the resolved Firstmate home. It does **not** auto-spawn and does **not** replace Firstmate judgment.

## Firstmate-Anbindung

| Oberfläche | Zweck |
| --- | --- |
| Tool `crew_route` | Task-Text → Klasse + Spawn-Flags + Tradeoff/Quota-Evidence |
| Tool `crew_balance` | Live-Quota sortiert (Headroom/Runway), degraded wenn `quota-axi` fehlt |
| Tool `crew_apply_dispatch` | Erzeugt Firstmate-`crew-dispatch.json` (Default: **dry-run**; `merge` hängt fehlende `when`-Regeln an und verweigert unlesbare/ungültige Bestandsdateien) |
| Tool `crew_suggest_primary` | Listet/sucht authentifizierte Pi-Session-Modelle (`modelRegistry` / `scopedModels`) und empfiehlt ein Primary-Switch-Ziel nur darunter (kein Model-Switch, keine Crew-Panes) |
| Tool `crew_discover` | Live-Modell-Discovery von Pi, Claude, Codex, Grok, Kimi mit 15min Cache |
| Tool `crew_evidence` | Lokale Crew-Evidenz aus no-mistakes Outcomes anzeigen (aggregiert nach Task-Klasse/Modell) |
| Tool `crew_update_check` | Kompatibilitätsprüfung mit aktueller Firstmate-Version |
| Command `/crew-route …` | Slash-Einstieg: vollständige `crew_route`-Ausgabe via Widget/Notify/Status (ohne Truncation, ohne Editor) |

### Empfohlener Ablauf im Primary

1. Task skizzieren → `crew_route` (oder `/crew-route …`).
2. Output lesen: Zeile `spawn: --harness … --model … --effort …` plus Rationale.
3. Optional `crew_balance` für den Gesamtblick über Subscriptions.
4. Optional `crew_apply_dispatch` dry-run; bei Bedarf mit `dryRun=false` nach `$FM_HOME/config/crew-dispatch.json` schreiben.
5. **Firstmate** wählt final (ggf. Array via `quota-array-dispatch`) und ruft auf:

```bash
bin/fm-spawn.sh <task-id> <project> --mode … --yolo … \
  --harness … --model … --effort …
```

Schema der Dispatch-Datei entspricht Firstmate `docs/examples/crew-dispatch.json` (`rules[].when/use/why`, `default`).

### Umgebungsvariablen

| Variable | Bedeutung |
| --- | --- |
| `FM_HOME` | Operational Home; Schreibziel `config/crew-dispatch.json` |
| `FM_ROOT_OVERRIDE` | Fallback, wenn `FM_HOME` unset |

Ohne aufgelöstes Home (`FM_HOME` oder Fallback `FM_ROOT_OVERRIDE`) nur Dry-Run/Anzeige — **keine** Writes. Writes gehen ausschließlich nach `<Home>/config/…` (explizites Tool mit `dryRun=false`).

## Knowledge-Pack

Datengetrieben unter [`knowledge/`](knowledge/):

### Basis-Knowledge (Ebene 0)
- `task-classes.json` — trivial_fix, standard_ship, hard_multi_file, research_web_live, scout_audit
- `providers.json` — Rollen/Stärken Claude · Codex · Cursor · Grok · Kimi, Pi-Model-Muster (`provider/model`)
- `profiles.json` — konkrete Profile + Dispatch-Template

### Drei-Ebenen Knowledge System

#### A. Hersteller-Fakten (`knowledge/manufacturers/`)
- Offizielle Dokumentation von Anthropic, OpenAI, xAI, Moonshot AI
- Source: `official-docs` | `manufacturer-claim`
- Confidence: `high` (official-docs) | `low` (manufacturer-claim)

#### B. Externe Benchmarks (`knowledge/benchmarks/`)
- Artificial Analysis, HumanEval, MBPP, Coding-Benchmarks
- Source: `external-benchmark`
- Confidence: `medium`

#### C. Lokale Crew-Evidenz (`knowledge/local/`)
- Automatisch gesammelt aus no-mistakes Outcomes
- Source: `local`
- Confidence: `measured`
- **Privacy:** Nur Metriken (Task-Klasse, Harness, Provider, Modell, Effort, Duration, Success, Tests, CI, Rework) – keine Code-Inhalte, keine Prompts

### Source-Konflikt-Hierarchie

- **"Was ist verfügbar?"**: Live Discovery > Auth State > Manufacturer Website
- **"Was kann es?"**: Official Docs > Website > Discovery
- **"Wie gut?"**: Local Evidence > External Benchmarks > Manufacturer Claims

Tabellen aktualisieren, ohne Scorer-Code anzufassen.

## Fail-closed / Degraded

- `quota-axi` fehlt oder schlägt fehl → klare Meldung, Offline-Heuristik aus Knowledge, Label **`degraded`**. Abbruch der Tool-Ausführung ist Cancellation, nicht Degraded.
- Unbekannte Quota (einschließlich stale Snapshots) wird **nicht** als 0 behandelt; erschöpfte Provider werden gemieden, wenn Alternativen existieren.
- Keine Secrets, keine Billing-APIs außer dem lokalen `quota-axi`.

## Entwicklung

```bash
npm test
```

Tests laufen ohne Netzwerk gegen Fixture-JSON unter `tests/fixtures/`.

### Test Coverage

- **Phase 1 (Discovery)**: `tests/discovery.test.ts` – Live Model Discovery, Caching, Staleness
- **Phase 2 (Knowledge Layers)**: `tests/knowledge-layers.test.ts` – Drei-Ebenen System, Conflict Resolution
- **Phase 3 (Update)**: `tests/update.test.ts` – Compatibility Checks, Version Detection
- **Phase 4 (Compatibility)**: Alle Tests prüfen Dispatch-Schema, Harness-Verfügbarkeit, Effort-Werte
- **Phase 5 (Evidence)**: `tests/evidence.test.ts` – Privacy-conscious Metric Collection, Aggregation

Alle Tests müssen grün sein (`npm test`).

## Architektur-Prinzipien

- **Firstmate bleibt Authority**: crew-knowledge liefert nur Empfehlungen
- **Kein Competing Dispatch Engine**: Nutzt Firstmate's `quota-array-dispatch`
- **Respektiert config/crew-dispatch.json**: Natural Language Rules bleiben authoritative
- **Provider ≠ Model ≠ Harness**: Klare Trennung, kein Inferieren
- **Herdr ist Infrastructure**: Backend-Wahl beeinflusst nicht Model-Qualität

## Lizenz

MIT
