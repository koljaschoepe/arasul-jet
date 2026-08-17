# config/platforms — Plattform-Profile (HAL-Katalog)

Deklarativer Katalog je Zielgerät. **Eine Stelle** beschreibt die Hardware,
alle anderen fragen sie ab — der Kern der Hardware-Abstraktionsschicht aus
Plan 020 (Schritt 2).

`scripts/setup/detect-platform.sh` erkennt die laufende Plattform und liefert
über das Kommando `platform-profile` den passenden Profilnamen bzw. die
zugehörige JSON. Von hier aus konsumieren spätere Schritte (Engine +
Modell-Manager in Schritt 3, Emulations-Validierung in Schritt 6) dieselbe
Quelle, statt Hardware-Wissen erneut zu verteilen.

## Schema

| Feld                 | Bedeutung                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `id`                 | Profil-/Dateiname (ohne `.json`)                                                             |
| `display_name`       | Menschenlesbarer Gerätename                                                                  |
| `arch`               | `arm64` oder `amd64` (Docker-Build-Target)                                                   |
| `compute_capability` | CUDA `sm_*`. `confirmed:false` = spekulativ, **am echten Gerät zu bestätigen** (Plan 020 §6) |
| `memory_budget_gb`   | Für die Engine nutzbares Speicherbudget (unified/VRAM)                                       |
| `default_model`      | Standard-Modell dieser Klasse                                                                |
| `precision`          | Zielpräzision (`nvfp4`, `fp8`, `q4_gguf`, …)                                                 |
| `engine`             | `ollama` (Orin) oder `vllm` (Thor/x86). **Einzige Engine-Quelle der Wahrheit** (Plan 021)    |
| `gpu_query`          | Kommando zum Auslesen des GPU-Status (`nvidia-smi` vs. `tegrastats`)                         |
| `ld_library_path`    | CUDA-Bibliothekspfad des Ziels (Schritt 3/5 parametrisiert Compose darüber)                  |
| `max_num_seqs`       | Parallel-Grenze der Engine (Continuous-Batching-Slots)                                       |
| `verification`       | Nachweisstufe in Plan 020 (`live`, `emulation`, `follow-up`)                                 |
| `notes`              | Kontext/Vorbehalte                                                                           |

## Engine-Routing (Plan 021)

Das Feld `engine` ist die **einzige Quelle der Wahrheit** für die Inferenz-Engine
eines Ziels. Es gilt genau:

- `orin-64` → **`ollama`** (GGUF/llama.cpp-Track, Idle-Unload; einziges Live-Gerät).
- Alle übrigen Ziele (Thor/x86) → **`vllm`** (löst die SGLang-Wahl aus Plan 020 ab).

Der Modell-/Engine-Router liest ausschließlich dieses Feld — die
Modell-Empfehlungen in `scripts/setup/detect-platform.sh` (`RECOMMENDED_MODELS`)
sind nur Setup-Hinweise und **keine** Engine-Autorität.

## Ehrlichkeit

Nur `orin-64` ist physisch vorhanden und wird live grün nachgewiesen. Alle
`compute_capability`-Werte mit `confirmed:false` sind aus den Repo-Unterlagen
abgeleitet und werden **nicht** hart in Code verdrahtet, sondern erst am echten
Gerät bestätigt (Echt-Hardware-Folge-Plan).
