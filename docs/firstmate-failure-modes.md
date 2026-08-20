# Firstmate Failure Modes

Bekannte Fehlverhalten und Lücken — mit Firstmate-Evidenz. Keine Vermutungen als Fakten; unbelegt = **[UNVERIFIED]**.

Enthält: Delegations-Eigenarbeit, Captain-Chat-Rauschen, Approval, Crewmate→Captain, Abweichungstabelle.

---

## 1. Delegation: unnötige Eigenarbeit

### Problem

Firstmate erledigt projektbezogene Arbeit selbst, obwohl ein Worker verfügbar ist.

### Current Behaviour

- Regel existiert: `AGENTS.md` §1 delegiert Coding/Investigation/Planning an Crewmates.
- Primary-Guard blockiert Harness-Delegationstools (`docs/subagent-guard.md`).
- **Kein** erzwungener „delegate-first“-Check vor Read/Edit in `projects/`.

### Expected Behaviour

Jede Aufgabe: delegierbar → sofort Brief + `fm-spawn`, ohne Voranalyse durch Firstmate.

### Root Cause (belegt + plausibel)

| Ursache | Evidenz / Klassifikation |
| --- | --- |
| Prompt-Konflikt: „hilf dem Captain“ vs. Delegation | DOKUMENTIERT Widerspruchspotential in §1 vs. §9 Hilfsbereitschaft |
| Fehlender Delegations-Check vor Tool-Use | NICHT VORHANDEN in Firstmate-Code |
| Vorarbeit vor `fm-spawn` (Repo lesen, Plan schreiben) | FEHLERHAFT vs. Policy; häufiges Agent-Verhalten **[UNVERIFIED quantitativ]** |
| Wiedereinstieg nach Worker-Ergebnis (selbst fixen) | DOKUMENTIERT verboten außer Supervision; Praxis **[UNVERIFIED]** |
| Hard Rule 1 Ausnahme zu breit interpretiert | FEHLERHAFT wenn Scope inferiert wird |

### Impact

Captain sieht Firstmate-Token statt Worker-Output; langsamer Fleet-Durchsatz; Supervision blindet.

### Proposed Fix

| Fix | Owner |
| --- | --- |
| Knowledge: `docs/delegation-policy.md`, Brief-Beispiele | crew-knowledge ✓ |
| Pre-Tool Gate: project path → require spawn or explicit exception | FIRSTMATE EXTENSION REQUIRED |
| Session-Start Nudge: „delegate-first“ | FIRSTMATE EXTENSION OPTIONAL |

---

## 2. Captain Chat Noise

### Problem

Captain sieht Systemevents, Watcher, Status, Heartbeats, Tool-Output, Crew-Lifecycle.

### Current Behaviour

| Mechanismus | Status |
| --- | --- |
| „Interne Mechanik nicht captain-facing“ | DOKUMENTIERT `AGENTS.md` §8–§9 |
| Status-Dateien append-only, nicht verbatim relay | DOKUMENTIERT §9 |
| Watcher absorbiert benign wakes | IMPLEMENTIERT `docs/architecture.md` |
| Away-Mode batched digest | IMPLEMENTIERT §8 |
| „Captain, shipshape.“ für no-op | DOKUMENTIERT §9 |

### Expected Behaviour

Captain Chat = Auftrag + echte Rückfrage + echter Blocker + relevantes Ergebnis (PR-URL, Findings, Entscheidung).

### Root Cause bei Verstößen

| Ursache | Klassifikation |
| --- | --- |
| Firstmate paraphrasiert nicht (verbatim Status) | FIRSTMATE BUG |
| Harness zeigt Tool-Output im Primary-Chat | HARNESS LIMITATION |
| Herdr/Pi Lifecycle-Meldungen sichtbar | HERDR/HARNESS LIMITATION |
| Worker schreibt captain-facing Prosa in Status | Brief-Verstoß / FIRSTMATE BUG (steer) |

### Proposed Fix

- Transport/Harness-Ursache: nicht nur Prompt verschärfen — aggregieren oder intern halten.
- Knowledge: Übersetzungsregeln in §9 bleiben authoritative; crew-knowledge verweist.

---

## 3. Manuelle Freigaben an falscher Stelle

Siehe `docs/approval-policy.md`.

### Current Behaviour

No-Mistakes ask-user ist IMPLEMENTIERT; Authority in `ask-user-authority` SKILL.

### Failure Pattern

Worker oder Firstmate fragt Captain für Routine-Fortsetzung → **illegitim**.

### Proposed Fix

Brief-Scaffold: „Do not ask captain for routine continuation“ (Ship-Brief Pattern in `examples/`).

---

## 4. Unangemeldete Crewmate-Interaktion

| Fall | Typische Klassifikation |
| --- | --- |
| Crewmate wartet auf Captain-Eingabe | FIRSTMATE BUG (Brief) / HARNESS Trust |
| Crewmate fordert illegitime Freigabe | Brief-Verstoß |
| Unterbricht Kontrollfluss | FIRSTMATE BUG / HARNESS |
| Delegiert Firstmate-Entscheidung an Captain | Brief-Verstoß; ask-user nur via Firstmate |
| Wartet auf Tool/Trust-Prompt | HARNESS LIMITATION; Firstmate `harness-adapters` |

Hard Rule 4: Crewmates **never** address captain — IMPLEMENTIERT als Regel; Durchsetzung im Worker-Brief.

---

## 5. Fehlende / falsche Delegation

| Muster | Erwartung |
| --- | --- |
| Kein Spawn trotz Ship-Intent | Delegationsfehler |
| Scout statt Ship ohne Unsicherheit | Falsche Intake-Klassifikation §7 |
| Parallel Scout + Ship ohne Autorisierung | Verboten §7 |
| Falscher Execution Mode (Microtask ohne Pack) | Knowledge-Fix + Brief |

---

## 6. Kontext: zu groß / zu klein

| Failure | Beschreibung |
| --- | --- |
| Übertragung ganzer Repos | Context Loss-Risiko umgekehrt: Noise; komprimiere gezielt |
| Microtask ohne SYSTEM CONTEXT | Worker rät falsch → `docs/context-sufficiency.md` |
| „Klein = billig = besser“ | Policy `microtaskNotAlwaysBetter` |

---

## 7. Firstmate-Abweichungen (Teil 20)

| Current Firstmate | Expected | Gap | Knowledge Fix | Code Fix? |
| --- | --- | --- | --- | --- |
| Delegationsregel nur in AGENTS.md | Operational delegate-first | Kein Gate | `delegation-policy.md`, `delegation.json` | Pre-tool gate |
| Kein Context-Dependency-Modell | VERY_LOW…VERY_HIGH vor Split | Fehlt | `context-aware-microtasking.md`, JSON | Optional classifier |
| Brief `{TASK}` frei form | Context Pack bei Microtasks | Schema nicht validiert | `context-pack.json`, examples | Brief validator optional |
| Scout report frei form | Evidence chain | Struktur optional | examples, microtasking doc | Template in fm-brief optional |
| §9 Chat-Regeln | Kein Noise | Praxis drift | failure-modes §2 | Harness aggregation |
| ask-user authority | Worker nie selbst | IMPLEMENTIERT | `approval-policy.md` | — |
| Subagent guard | Primary nicht delegieren via Harness | IMPLEMENTIERT | delegation doc | — |
| quota-array-dispatch | Ein Router | IMPLEMENTIERT | Kein zweiter Router in crew-knowledge | — |
| Ship/Scout intake | Getrennt von Execution Mode | Konzeptverwechslung möglich | delegation-policy Tabelle | — |
| fm-crew-state für Supervision | Current state | IMPLEMENTIERT | — | — |
| Konflikt zwei Microtasks | Keine blinde Synthese | Nur Policy | evidenceChain in JSON | Merge gate optional |

---

## Grill-Checkliste (Captain)

| Frage | Antwort |
| --- | --- |
| Weniger Eigenarbeit? | Policy + Brief-Beispiele; Code-Gate fehlt noch |
| Kontextbewusstes Microtasking? | Ja, JSON + docs |
| Context-Loss-Risiko adressiert? | compressionVsLoss + sufficiency |
| Zweite Routing/Approval-Engine? | Nein — nur Policy |
| Duplikate zu Firstmate? | Ship/Scout vs Execution Mode getrennt dokumentiert |
| Firstmate-Flaschenhoss? | direct delegation für Simple Cases |
| Konflikterkennung? | evidenceChain, noBlindSynthesis |
| Crewmate→Captain? | Hard Rule 4 + failure §4 |
| Chat-Noise? | failure §2 + AGENTS §9 pointer |
| Ship/Scout-Widersprüche? | Tabelle delegation-policy |
| Behauptete Fähigkeiten code-belegt? | Status-Spalten mit Pfaden |
