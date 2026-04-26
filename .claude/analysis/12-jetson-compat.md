# Jetson-Kompatibilität — Orin + Thor — Findings

## Stand der Unterstützung

| Modell          | Status                   | JetPack           | CUDA          | CC                | Getestet?      |
| --------------- | ------------------------ | ----------------- | ------------- | ----------------- | -------------- |
| AGX Orin 64GB   | ✅ LIVE                  | JP6               | 12.6          | sm_87             | Ja (Dev-Gerät) |
| AGX Orin 32GB   | ✅ Profile               | JP6               | 12.x          | sm_87             | Nein           |
| Orin NX 16GB    | ✅ Profile               | JP6               | 12.x          | sm_87             | Nein           |
| Orin Nano 8GB   | ⚠️ Profile               | JP6               | 12.x          | sm_87             | Nein (RAM eng) |
| Orin Nano 4GB   | ⚠️ RAM_LIMIT zu hoch     | JP6               | 12.x          | sm_87             | Nein           |
| Xavier AGX 32GB | ⚠️ Profile               | JP5               | 11.x          | sm_72             | Nein (EOL?)    |
| Xavier NX 8GB   | ⚠️ Profile               | JP5               | 11.x          | sm_72             | Nein           |
| Nano 4GB        | ⚠️ Generic-Fallback      | JP4               | 10.x          | sm_53             | Nein           |
| **Thor 128GB**  | ❌ **Nicht vorbereitet** | **JP7.0/7.1/7.2** | **13.0/13.2** | **sm_100/sm_110** | Nein           |

## BLOCKERS für Thor (detail in 19-jetson-research.md)

### JC-B01: SBSA-Stack auf Thor inkompatibel mit `--gpus=all`

- Thor nutzt SBSA Arm64 (Server-ARM), Orin nutzt Tegra
- Compose-Files verwenden `--gpus=all` oder `deploy.resources.reservations.devices` → funktioniert auf Thor NICHT
- Fix: Plattform-Detection + `runtime: nvidia` (Tegra-Stil) vs SBSA-Stil
- Siehe compose.ai.yaml Line 65: `LD_LIBRARY_PATH` JP6-hardcoded

### JC-B02: Ollama-Docker auf Thor hat bestätigten NVIDIA-Bug

- Grafik-Exceptions + korrupte Outputs (NVIDIA Developer Forum)
- Workaround: Ollama 0.12.9 statt 0.12.10 ODER nativ installieren
- Long-term: `ghcr.io/nvidia-ai-iot/ollama:r38.2.arm64-sbsa-cu130-24.04` nutzen

### JC-B03: Image-Tags divergieren fundamental

- Orin: `dustynv/*:r36.2.0` (JetPack 6, CUDA 12.x)
- Thor: `ghcr.io/nvidia-ai-iot/ollama:r38.2.arm64-sbsa-cu130-24.04`
- Kein gemeinsamer Tag → compose-override-<platform>.yaml nötig

### JC-B04: BGE-M3 mit TEI/PyTorch auf Thor (sm_110) UNVERIFIZIERT

- PyTorch-Wheels für sm_110 noch nicht released (Stand 04/2026)
- Empfehlung: Migration auf ONNX Runtime (siehe `aapot/bge-m3-onnx` auf HF)
- ONNX Runtime läuft auf sm_87 + sm_110 ohne Re-Build

## MAJORS

### JC-M01: `LD_LIBRARY_PATH` hardcoded für JetPack 6

- `compose/compose.ai.yaml:65` — Thor (JP7) hat andere Pfade
- Fix: Env-Var via `detect-jetson.sh`

### JC-M02: RAM-Limits inkompatibel mit Nano/Xavier

- LLM=32G, Embedding=12G, Qdrant=6G, Postgres=4G → Summe > 4GB Nano
- Siehe 10-infra-docker.md I-M04
- Fix: Profile-Overrides in `compose.override.<profile>.yaml`

### JC-M03: L4T PyTorch r37 (für Thor) noch nicht released

- NVIDIA hat noch kein offizielles PyTorch-Wheel für JetPack 7.x / Thor
- Custom-Builds oder Warten notwendig

### JC-M04: MinIO-Community-Edition EOL-Risiko

- Seit Oktober 2025 keine offiziellen Binaries
- Long-term (5J): Alternativen evaluieren (SeaweedFS, Garage, Minio-Enterprise)

### JC-M05: detect-jetson.sh kennt nur Orin/Xavier/Nano — keinen Thor

- `scripts/setup/detect-jetson.sh` hat `thor_128gb` Profile, aber keine JP7-Branch
- Fix: JP7-Detection + entsprechende Image-Tags

## MINORS

- JC-m01: Keine CI-Matrix für Jetson-Varianten — nur manueller Test auf Orin
- JC-m02: Jetson-Docs (`docs/JETSON_COMPATIBILITY.md`) erwähnt Thor nicht
- JC-m03: Keine Runtime-Warnung bei inkompatiblem Modell
- JC-m04: `tegrastats` vs. `nvidia-smi`-Unterschiede nicht überall abgedeckt

## Positive Signale

- PostgreSQL 16, Qdrant, Traefik, n8n: alle sauber multi-arch
- Qdrant hat ARM-Neon SIMD (~10-20% langsamer als x86, konsistent)
- NVIDIA hat offizielle Ollama-Container für Thor (trotz Bug)
- `detect-jetson.sh` robust für alle Orin-Varianten + Xavier

## Priorität

1. JC-B01 + JC-B03 (Thor-Abstraction-Layer) — Voraussetzung für Thor-Rollout
2. JC-B04 (ONNX-Migration für Embedding) — löst sm_87 + sm_110 gleichzeitig
3. JC-M02 (RAM-Profile für kleine Jetsons) — aktueller Rollout-Blocker Orin Nano
4. JC-M04 (MinIO-Alternative) — 5J-Risiko, nicht sofort
