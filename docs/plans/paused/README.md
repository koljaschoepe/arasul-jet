# Ruhende Pläne

Angefangen, nicht abgeschlossen, und nicht in Arbeit. Sie liegen hier statt in
`active/`, weil `active/` genau einen Plan enthält: den, an dem gerade gebaut
wird. Ein Ordner mit drei Plänen darin sagt nicht, welcher gilt, und genau
daran ist schon einmal eine Sitzung in die falsche Richtung gelaufen.

Ruhend heißt nicht erledigt und nicht verworfen. Wer einen davon
wiederaufnimmt, verschiebt ihn zurück nach `active/`, und der vorige geht
vorher hierher.

> Stand: 2026-08-20

## 020 Multi-Plattform-Portierung

Vier Schritte, davon der erste (Mess-Harness und Engine-Baseline) abgeschlossen
und als `020-baseline.md` dokumentiert. Offen sind die
Hardware-Abstraktionsschicht, der Engine-Wechsel auf SGLang und das Lösen des
Embeddings von L4T.

**Warum es ruht:** Der Plan zielt auf Thor und DGX Spark. Ob DGX Spark
überhaupt verkauft wird, ist eine offene Entscheidung mit Frist 15.09.2026
(Ziel J4 im Steuer-Repo). Portieren, bevor entschieden ist, wohin, wäre Arbeit
auf Verdacht.

## 021 Engine-Vereinheitlichung und agentisches RAG

Acht Schritte. Die Schritte 1, 2 und 8 sind gelaufen; Schritt 8 hat das
klassische RAG in das Profil `classic-rag` verschoben, weshalb Qdrant im
Normalbetrieb nicht mehr läuft. Offen ist der Kern: der Engine-Wechsel
(Schritt 3) und die agentischen Teile.

**Warum es ruht:** Plan 023 Phase D und E fassen dasselbe Gebiet aus der
Verkaufssicht an, Modelle und Coding-Agent. Zwei Pläne auf denselben Dateien
wären zwei Wahrheiten. Wer Phase D angeht, liest diesen Plan zuerst und
entscheidet, was davon aufgeht und was ersatzlos entfällt.
