# Ruhende Pläne

Angefangen, nicht abgeschlossen, und nicht in Arbeit. Sie liegen hier statt in
`active/`, weil `active/` genau einen Plan enthält: den, an dem gerade gebaut
wird. Ein Ordner mit drei Plänen darin sagt nicht, welcher gilt, und genau
daran ist schon einmal eine Sitzung in die falsche Richtung gelaufen.

Ruhend heißt nicht erledigt und nicht verworfen. Wer einen davon
wiederaufnimmt, verschiebt ihn zurück nach `active/`, und der vorige geht
vorher hierher.

**Zwei der drei Pläne hier ruhen nicht mehr, sie sind zu Ende** (Plan 023 K2,
22.08.2026): 021 ist abgeschlossen mit benannter Abweichung, 020 teilgeliefert.
Sie liegen weiter hier, weil ihre Seiten die Begründung tragen — aber niemand
wartet darauf, sie wiederaufzunehmen. Was von beiden offen ist, hängt an einer
Hardware-Entscheidung und steht als Roadmap-Ziel J4 im Steuer-Repo (Frist
15.09.2026), nicht als Plan in diesem.

> Stand: 2026-08-22

## 020 Multi-Plattform-Portierung

**Teilgeliefert, 22.08.2026** (Plan 023 K2).

Vier Schritte, davon der erste (Mess-Harness und Engine-Baseline) abgeschlossen
und als `020-baseline.md` dokumentiert. Offen sind die
Hardware-Abstraktionsschicht, der Engine-Wechsel auf SGLang und das Lösen des
Embeddings von L4T.

**Warum teilgeliefert und nicht ruhend:** der Plan zielt auf Thor und DGX
Spark. Ob DGX Spark überhaupt verkauft wird, ist eine Entscheidung mit Frist
15.09.2026 (Ziel J4 im Steuer-Repo). Portieren, bevor entschieden ist, wohin,
wäre Arbeit auf Verdacht — und der Rest hängt an genau dieser Entscheidung,
nicht an freier Kapazität hier. Er gehört deshalb an das Roadmap-Ziel, nicht an
eine Planseite.

Der gelieferte Teil bleibt nützlich, unabhängig von der Entscheidung: das
Mess-Harness misst auf jeder Hardware.

## 021 Engine-Vereinheitlichung und agentisches RAG

**Abgeschlossen mit Abweichung, 22.08.2026** (Plan 023 K2).

Acht Schritte. Gelaufen sind 1, 2 und 8. Schritt 8 hat das klassische RAG in
das Profil `classic-rag` verschoben, weshalb Qdrant und der Embedding-Dienst im
Normalbetrieb nicht laufen.

**Die Abweichung, benannt:** der Engine-Wechsel auf SGLang (Schritt 3) hat
NICHT stattgefunden, und die restlichen Schritte auch nicht. Plan 023 Phase D
hat dasselbe Gebiet aus der Verkaufssicht angefasst und dabei auf dem
vorhandenen Ollama-Pfad gearbeitet, nicht auf einem neuen. Was von Schritt 3
übrig ist, steht als engine-bewusste Sicht in `GET /api/llm/models`
(`"engine": "ollama" | "vllm"`) — die Abstraktion existiert, der Wechsel wurde
nie vollzogen.

**Was Plan 023 dazu entschieden hat:** G5 hat die Rücknahme von Schritt 8
geprüft und ausdrücklich abgelehnt (rund 1100 Neu-Indexierungen und ein 8-GB-
Container auf einer GPU, die schon 18,6 GB trägt). Der Zustand ist damit kein
Zwischenstand mehr, sondern eine Entscheidung.

**Warum abgeschlossen und nicht ruhend:** ein ruhender Plan wartet darauf,
wiederaufgenommen zu werden. Dieser wartet nicht. Der offene Rest ist
hardwaregebunden und gehört an das Roadmap-Ziel J4 (DGX Spark, Frist
15.09.2026) im Steuer-Repo, nicht an eine Planseite hier.
