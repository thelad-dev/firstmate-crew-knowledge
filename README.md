# firstmate-crew-knowledge

**Agent-Skill** (kein Pi-Package) für [Firstmate](https://github.com/kunchenguid/firstmate): Delegation-first, context-aware Microtasking und evidenzbasierte Profile-Hinweise für `{harness, model, effort}`.

> **Wichtig:** Dieser Skill **ersetzt weder Firstmate-Urteil noch `fm-spawn`**. Firstmate bleibt Owner von Intake, `quota-array-dispatch` und dem finalen Spawn. Es gibt **keine** MCP-Tools und **keine** Pi-Extension mehr.

## Was drin ist

| Pfad | Inhalt |
| --- | --- |
| [`SKILL.md`](SKILL.md) | Agent-only Workflow (Wann laden, Procedure, Boundaries) |
| [`knowledge/`](knowledge/) | Task-Klassen, Profile, Provider, Delegation/Context-Pack Tabellen |
| [`docs/`](docs/) | Policy-Doku (Delegation, Microtasking, Failure Modes) |
| [`examples/`](examples/) | Szenarien |
| [`evaluation/`](evaluation/) | Grill-/Evaluationsfälle |

## Install

```bash
# In den Skills-Pfad legen, den Firstmate/Pi bereits scannt:
ln -sfn "$(pwd)" ~/.agents/skills/crew-knowledge
# oder:
ln -sfn "$(pwd)" "$FM_HOME/.agents/skills/crew-knowledge"
```

Voraussetzung: Firstmate-Home mit `bin/fm-spawn.sh`, Skills `quota-array-dispatch` und `harness-adapters`. Für Quota-Balance: [`quota-axi`](https://www.npmjs.com/package/quota-axi) auf `PATH`.

**Nicht** mehr: `pi install git:github.com/thelad-dev/firstmate-crew-knowledge` (das war die alte Extension).

## English (short)

Installable **agent skill** (not a Pi extension). Classifies crew work, advises `{harness, model, effort}` candidates and delegation/microtask policy from JSON + docs. Firstmate still owns spawn and quota-array resolution. No MCP tools.

## Empfohlener Ablauf

1. Skill laden (Trigger: Spawn/Delegation/Microtasking).
2. Delegation-first prüfen → bei Ja sofort briefen und spawnen.
3. Context Dependency / Context Pack laut `knowledge/delegation.json` und `docs/`.
4. Task-Klasse + Profile aus `knowledge/*.json` ableiten.
5. Bei Profil-Array: `quota-array-dispatch` + `quota-axi`.
6. Final: `bin/fm-spawn.sh … --harness … --model … --effort …`.

## Wartung

- Routing-Tabellen in `knowledge/*.json` pflegen (nicht in Code).
- Lokale Evidenz optional unter `knowledge/local/` (nur Metriken).
- JSON prüfen: `./scripts/validate-knowledge.sh`

## License

MIT — siehe [LICENSE](LICENSE).
