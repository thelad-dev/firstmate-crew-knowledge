# firstmate-crew-knowledge

Pi-Extension für [Firstmate](https://github.com/thelad-dev): empfiehlt pro Task-Klasse konkrete `{harness, model, effort}`-Profile und balanciert die Nutzung über die Captain-Subscriptions **Cursor**, **Claude**, **ChatGPT/Codex** und **Grok (xAI)**.

> **Wichtig:** Dieses Paket **ersetzt weder Firstmate-Urteil noch `fm-spawn`**. Firstmate bleibt Owner von Intake, `quota-array-dispatch` und dem finalen Spawn. Die Tools liefern nur Empfehlungen, Spawn-Flags und optional eine `crew-dispatch.json`.

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

Installable Pi package (`pi-package`) that classifies crew work, recommends `--harness/--model/--effort` for Firstmate’s `fm-spawn`, and ranks providers from live `quota-axi --json`. It can dry-run or write `config/crew-dispatch.json` under `FM_HOME`. It does **not** auto-spawn and does **not** replace Firstmate judgment.

## Firstmate-Anbindung

| Oberfläche | Zweck |
| --- | --- |
| Tool `crew_route` | Task-Text → Klasse + Spawn-Flags + Tradeoff/Quota-Evidence |
| Tool `crew_balance` | Live-Quota sortiert (Headroom/Runway), degraded wenn `quota-axi` fehlt |
| Tool `crew_apply_dispatch` | Erzeugt Firstmate-`crew-dispatch.json` (Default: **dry-run**) |
| Tool `crew_suggest_primary` | Listet/sucht authentifizierte Pi-Session-Modelle (`modelRegistry` / `scopedModels`) und empfiehlt ein Primary-Switch-Ziel nur darunter (kein Model-Switch, keine Crew-Panes) |
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

- `task-classes.json` — trivial_fix, standard_ship, hard_multi_file, research_web_live, scout_audit
- `providers.json` — Rollen/Stärken Claude · Codex · Cursor · Grok, Pi-Model-Muster (`provider/model`)
- `profiles.json` — konkrete Profile + Dispatch-Template

Tabellen aktualisieren, ohne Scorer-Code anzufassen.

## Fail-closed / Degraded

- `quota-axi` fehlt oder schlägt fehl → klare Meldung, Offline-Heuristik aus Knowledge, Label **`degraded`**.
- Unbekannte Quota wird **nicht** als 0 behandelt; erschöpfte Provider werden gemieden, wenn Alternativen existieren.
- Keine Secrets, keine Billing-APIs außer dem lokalen `quota-axi`.

## Entwicklung

```bash
npm test
```

Tests laufen ohne Netzwerk gegen Fixture-JSON unter `tests/fixtures/`.

## Lizenz

MIT
