# Plan 020 · Schritt 1 — Engine-Baseline

Begleitdokument zum Mess-Harness `scripts/test/measure-throughput.sh`. Ziel ist
ein **wiederholbares Werkzeug**, kein einmaliger Zahlenwert — dieselbe Messung
läuft vor und nach dem Engine-Wechsel (Schritt 3) und später auf Thor/Spark
ohne Umbau.

## Warum Tokens/Tag statt Tokens/Sekunde

Der Kundenworkload ist asynchron: Flows laufen im Hintergrund, niemand starrt
auf einen einzelnen Antwort-Stream. Verkaufs- und Kapazitätsaussage ist deshalb
der **aggregierte Durchsatz unter Last** — Tokens pro Tag — nicht die
Single-Stream-Latenz. Das Harness misst darum die _gesamt verarbeiteten Tokens_
(Prompt + Generierung) pro Wanduhr-Sekunde bei 1, 4 und 16 parallelen Anfragen
und rechnet auf Tokens/Tag hoch.

## Engine-neutral by design

Das Harness spricht zwei Dialekte, damit es den Engine-Wechsel überlebt:

| Flag                     | Endpunkt                    | Token-Quelle                                      |
| ------------------------ | --------------------------- | ------------------------------------------------- |
| `--api=ollama` (Default) | `POST /api/generate`        | `prompt_eval_count` + `eval_count`                |
| `--api=openai`           | `POST /v1/chat/completions` | `usage.prompt_tokens` + `usage.completion_tokens` |

SGLang und vLLM sprechen beide OpenAI-`/v1` — nach Schritt 3 wechselt nur das
Flag, nicht das Skript.

## Ehrliche Einschränkung dieses Laufs

- Der **aussagekräftige** Vergleich braucht die Zielhardware (Thor/Spark). Die
  NVFP4-MoE-Zielklasse läuft auf dem Orin (Ampere, sm_87, kein FP8/NVFP4)
  gar nicht.
- Was der Orin-Lauf belegt: (1) das Harness funktioniert und ist wiederholbar,
  (2) Ollama bedient nur eine feste Zahl paralleler Slots
  (`OLLAMA_NUM_PARALLEL`, Default 2) und macht **kein Continuous Batching** —
  der aggregierte Durchsatz läuft jenseits der Slot-Zahl in ein Plateau.
- Der direkte **vLLM-vs-SGLang-Durchsatz-Vergleich** und die echten
  Tokens/Tag je Zielgerät gehören in den **Echt-Hardware-Folge-Plan** (siehe
  Plan 020 §5 Stufe 2). Nichts davon wird hier auf Basis von Emulation
  behauptet.

## Ausführen

Auf dem Gerät (Ollama ist nur host-lokal erreichbar):

```bash
ssh arasul@<device>
cd /home/arasul/arasul/arasul-jet
./scripts/test/measure-throughput.sh                 # Orin-Ollama, Auto-Modell
./scripts/test/measure-throughput.sh --levels=1,2,4,8,16 --num-predict=256
# Nach Schritt 3 gegen SGLang:
./scripts/test/measure-throughput.sh --api=openai --port=8000
```

Ausgabe: eine Tabelle (Parallel · Anfragen · OK · Wanduhr · Tokens/s ·
Tokens/Tag) plus ein JSON-Bericht unter `data/throughput-baseline.json`.

## Indikativer Orin-Lauf (2026-08-15, live)

Gemessen auf dem Orin gegen das **deployte** Ollama (host-lokal
`127.0.0.1:11434`), `gemma3:4b`, `--num-predict=128`, `--rounds=2`.

| Parallel | Anfragen | OK  | Wanduhr (s) | Tokens/s | Tokens/Tag |
| -------- | -------- | --- | ----------- | -------- | ---------- |
| 1        | 2        | 2   | 7.99        | 46.8     | 4.04 M     |
| 2        | 4        | 4   | 9.64        | 77.6     | 6.70 M     |
| 4        | 8        | 8   | 18.43       | 81.2     | 7.01 M     |
| 16       | 32       | 32  | 73.51       | 81.4     | 7.03 M     |

- Gerät / Modell: NVIDIA Jetson AGX Orin (sm_87) / `gemma3:4b`
- `OLLAMA_NUM_PARALLEL`: 2 (Container-Env bestätigt)
- **Beobachtung:** Der Durchsatz steigt von 1 → 2 Parallel (46,8 → 77,6
  Tokens/s, die zwei Slots), läuft dann bei 4 und 16 Parallel **flach**
  (81,2 → 81,4 Tokens/s), während die Wanduhr linear mitwächst (18,4 s → 73,5 s
  für 4-fache Last). Das ist der sichtbare Fingerabdruck fester
  Slot-Bedienung **ohne Continuous Batching**: mehr Parallelität bringt keinen
  Zusatzdurchsatz mehr, nur längere Wartezeit. Eine Batching-Engine
  (vLLM/SGLang) würde hier weiter skalieren — der Grund für Schritt 3. Alle 32
  parallelen Anfragen liefen fehlerfrei durch (OK = 32/32).

> Dies ist der _indikative_ Beleg (Harness + Plateau), nicht die
> Zielhardware-Messung. Die NVFP4-MoE-Zielklasse läuft auf dem Orin nicht; der
> vLLM-vs-SGLang-Durchsatz auf Thor/Spark ist der Echt-Hardware-Folge-Plan.
