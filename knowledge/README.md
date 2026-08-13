# Knowledge pack

Datengetriebene Tabellen für `firstmate-crew-knowledge`. Tool-Code liest diese Dateien; Routing-Updates gehören hierher, nicht in den Scorer.

| Datei | Inhalt |
| --- | --- |
| `task-classes.json` | Task-Klassen (trivial → scout), Keywords, bevorzugte Profile |
| `providers.json` | Provider-Rollen (Claude, Codex, Cursor, Grok), Harness- und Model-Muster |
| `profiles.json` | Konkrete `{harness, model, effort}`-Profile + Dispatch-Template |

Firstmate bleibt urteilsfähig: diese Tabellen sind Vorschläge, kein Ersatz für `quota-array-dispatch` oder `fm-spawn`.
