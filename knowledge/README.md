# Knowledge pack

Datengetriebene Tabellen für `firstmate-crew-knowledge`. Tool-Code liest diese Dateien; Routing-Updates gehören hierher, nicht in den Scorer.

## Basis-Knowledge (Ebene 0)

| Datei | Inhalt |
| --- | --- |
| `task-classes.json` | Task-Klassen (trivial → scout), Keywords, bevorzugte Profile |
| `providers.json` | Provider-Rollen (Claude, Codex, Cursor, Grok, Kimi), Harness- und Model-Muster |
| `profiles.json` | Konkrete `{harness, model, effort}`-Profile + Dispatch-Template |

## Drei-Ebenen Knowledge System

### A. Hersteller-Fakten (`manufacturers/`)

Offizielle Dokumentation und Manufacturer Claims.

- **Source**: `official-docs` (hohe Confidence) | `manufacturer-claim` (niedrige Confidence)
- **Format**: JSON mit `{source, confidence, timestamp, validUntil, provider, fact, details, url}`
- **Nutzung**: "Was kann ein Modell?"
- **Priorität**: Official Docs > Website > Discovery

### B. Externe Benchmarks (`benchmarks/`)

Externe Benchmark-Ergebnisse (Artificial Analysis, HumanEval, MBPP, etc.).

- **Source**: `external-benchmark`
- **Confidence**: `medium`
- **Format**: JSON mit `{source, confidence, timestamp, benchmarkName, provider, model, score, metric, url}`
- **Nutzung**: "Wie gut ist ein Modell?"
- **Priorität**: Local Evidence > External Benchmarks > Manufacturer Claims

### C. Lokale Crew-Evidenz (`local/`)

Automatisch gesammelt aus no-mistakes Outcomes.

- **Source**: `local`
- **Confidence**: `measured`
- **Format**: JSON mit Metriken (Task-Klasse, Harness, Provider, Modell, Effort, Duration, Success, Tests, CI, Rework)
- **Privacy**: **KEINE Code-Inhalte, KEINE Prompts** – nur Metriken
- **Nutzung**: "Wie gut performt ein Modell lokal?"
- **Priorität**: Höchste (gemessene Daten schlagen externe Benchmarks und Claims)

#### Evidenz-Dateien

- `evidence.json`: Raw evidence entries (append-only)
- `aggregated.json`: Aggregiert nach TaskClass/Provider/Model/Effort

### Source-Konflikt-Hierarchie

Bei Konflikten zwischen verschiedenen Quellen:

- **"Was ist verfügbar?"**: Live Discovery > Auth State > Manufacturer Website
- **"Was kann es?"**: Official Docs > Website > Discovery
- **"Wie gut?"**: Local Evidence > External Benchmarks > Manufacturer Claims

## Maintaining Knowledge

Firstmate bleibt urteilsfähig: diese Tabellen sind Vorschläge, kein Ersatz für `quota-array-dispatch` oder `fm-spawn`.

- **Basis-Knowledge**: Manuell pflegen via JSON-Updates
- **Hersteller-Fakten**: Manuell aus offiziellen Docs sammeln
- **Externe Benchmarks**: Manuell aus Benchmark-Sites eintragen
- **Lokale Evidenz**: **Automatisch** via `recordEvidence()` aus no-mistakes outcomes
