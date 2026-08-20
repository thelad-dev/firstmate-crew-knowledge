# Dokumentation — Delegation & Microtasking

Policy und Beispiele für Firstmate-Orchestrierung. **Ersetzt Firstmate nicht** — siehe Firstmate `AGENTS.md`.

| Dokument | Inhalt |
| --- | --- |
| [delegation-policy.md](delegation-policy.md) | Delegate-first, erlaubte Eigenarbeit, Entscheidungsmodus |
| [context-aware-microtasking.md](context-aware-microtasking.md) | Context Dependency, wann (nicht) splitten |
| [context-sufficiency.md](context-sufficiency.md) | Context Pack, Sufficiency Gate |
| [approval-policy.md](approval-policy.md) | Legitime Freigaben, Crewmate→Captain |
| [firstmate-failure-modes.md](firstmate-failure-modes.md) | Failure-Katalog, Abweichungstabelle, Grill-Checkliste |

## Knowledge JSON

| Datei | Inhalt |
| --- | --- |
| `../knowledge/delegation.json` | Execution modes, dependency levels, evidence chain |
| `../knowledge/context-pack.json` | Pflichtfelder Context Pack |

## Beispiele & Evaluation

- [`../examples/`](../examples/) — sechs Szenarien
- [`../evaluation/delegation-cases.md`](../evaluation/delegation-cases.md) — Fälle A–H

## Tools (unverändert)

`crew_route`, `crew_balance`, `fm-spawn` — Routing bleibt Firstmate + `quota-array-dispatch`.

## Evidenz-Pfade

Status- und Evidence-Spalten mit Prefix **Firstmate** verweisen auf Dateien im [kunchenguid/firstmate](https://github.com/kunchenguid/firstmate)-Checkout (bzw. `$FM_HOME`), nicht auf dieses crew-knowledge-Paket. Relative Pfade ohne Prefix (`docs/…`, `knowledge/…`, `examples/`) sind lokal hier.
