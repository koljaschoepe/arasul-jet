# Jetson Thor & Software-Kompatibilität — Recherche (Stand 2026-04)

## Executive Summary

- **Jetson AGX Thor ist seit 25. August 2025 offiziell verfügbar** (Developer Kit Shipping ab 20. Nov. 2025, 3.499 USD). Er läuft unter **JetPack 7.0/7.1** auf **CUDA 13.0** und nutzt die **Blackwell-GPU (sm_110, Compute Capability 11.0)**.
- **Jetson AGX Orin bleibt auf JetPack 6/CUDA 12** bis zur Auslieferung von **JetPack 7.2 (geplant Q2 2026)**, das Orin auf die gleiche SBSA-/CUDA-13.2-Basis hebt. JetPack 6 EOL ist laut Community-Quellen Q3 2028.
- **Thor basiert auf SBSA (Server Base System Architecture)** — ein Paradigmenwechsel gegenüber Orin. Das bedeutet: `--gpus=all` funktioniert nicht, man muss `--runtime=nvidia` verwenden; der `-igpu`-Tag in Containern entfällt; es werden SBSA-Images (`r38.2.arm64-sbsa-cu130`) benötigt.
- **Offizielle Ollama-Container existieren für Thor** (`ghcr.io/nvidia-ai-iot/ollama:r38.2.arm64-sbsa-cu130-24.04`), aber es gibt **bestätigte Bugs**: Grafik-Exceptions und korrupte Antworten in Docker (Workaround: nativ laufen lassen, Ollama 0.12.9 statt 0.12.10). Performance liegt aktuell bei ~19 tokens/s statt erwarteter ~150 t/s auf llama3.2:3b Q4 — Build-System von `dusty-nv/jetson-containers` ist noch unvollständig für Thor.
- **Alle übrigen Stack-Komponenten (PostgreSQL 16, Qdrant, Traefik) sind multi-arch**. **MinIO hat offizielle ARM64-Images**, aber die Community-Edition hat seit Oktober 2025 keine Binary-Builds mehr — nur noch Source- oder Commercial-Builds.
- **BGE-M3 auf Jetson Orin** ist nicht-trivial: `text-embeddings-inference` (TEI) unterstützt sm_87 nur eingeschränkt. **ONNX Runtime ist der pragmatische Kompromiss**, TensorRT die Performance-Option; PyTorch ist der Fallback.

---

## Jetson AGX Thor — Aktueller Status

### Verfügbarkeit & Preis

- Ankündigung & GA: **25. August 2025** (NVIDIA Newsroom).
- Developer Kit Shipping: ab **20. November 2025**.
- Preis: **3.499 USD** (Developer Kit, 945-14070-0080-000).
- Module: **T5000** (128 GB, Flagship) und ab JetPack 7.1 auch **T4000** (64 GB, 1.200 FP4 TFLOPs).

### Technische Specs (T5000)

| Feature        | Wert                                                                         |
| -------------- | ---------------------------------------------------------------------------- |
| GPU            | Blackwell, 2.560 CUDA-Cores, 96 Tensor-Cores (5th Gen), **sm_110** (CC 11.0) |
| AI-Compute     | **2.070 FP4 TFLOPs** (sparse)                                                |
| CPU            | 14-Core Arm Neoverse-V3AE                                                    |
| RAM            | 128 GB LPDDR5X, 256-Bit Bus, 276 GB/s                                        |
| Netzwerk       | QSFP28 (4× 25 GbE) + 5 GbE RJ-45                                             |
| Power          | 40–130 W (konfigurierbar)                                                    |
| Positionierung | **7,5× AI-Compute vs. Orin**, 3,5× Energie-Effizienz                         |

### JetPack 7 — Software-Stack

- **JetPack 7.0**: Release 25. August 2025, erste Production-Release für Thor. Jetson Linux 38.2, Kernel 6.8, Ubuntu 24.04 LTS, CUDA 13.0.
- **JetPack 7.1**: Release 12. Januar 2026. Jetson Linux 38.4, zusätzlich T4000-Support, TensorRT EdgeLLM, Video Codec SDK.
- **JetPack 7.2**: geplant Q2 2026 — wichtig, weil es **CUDA 13.2 mitbringt** und dann **auch Orin auf SBSA CUDA** hebt (unified Arm SBSA CUDA Toolkit).
- **Neuerungen**: Preemptable Real-Time Kernel, Multi-Instance GPU (MIG) Support, Holoscan Sensor Bridge.

### Key-Unterschiede Orin → Thor

|                 | Orin (JetPack 6)          | Thor (JetPack 7)                           |
| --------------- | ------------------------- | ------------------------------------------ |
| GPU-Arch        | Ampere (GA10B)            | Blackwell                                  |
| Compute Cap.    | sm_87                     | sm_110 (CUDA 13.0+)                        |
| CUDA            | 12.x                      | 13.0 / 13.2                                |
| OS              | Ubuntu 22.04, Kernel 5.15 | Ubuntu 24.04, Kernel 6.8                   |
| Container-Basis | iGPU (L4T)                | **SBSA** (Server Base System Architecture) |
| GPU-Flag Docker | `--gpus=all` möglich      | **Nur `--runtime=nvidia`**                 |
| Container-Tag   | `-igpu`                   | `-sbsa`                                    |

---

## Software-Stack Kompatibilitäts-Matrix

| Komponente                            | Orin (JetPack 6 / CUDA 12)                                                              | Thor (JetPack 7 / CUDA 13)                                                                                                                                      | Kommentar                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **PostgreSQL 16**                     | ✅ `postgres:16` multi-arch                                                             | ✅ `postgres:16` multi-arch                                                                                                                                     | Keine Änderungen nötig                                                                                                      |
| **Qdrant**                            | ✅ `qdrant/qdrant` multi-arch, ARM Neon optimiert                                       | ✅ multi-arch                                                                                                                                                   | ~10–20 % langsamer als x86 aber konsistent; Neon SIMD vorhanden                                                             |
| **MinIO**                             | ⚠️ offizielles Image multi-arch aber seit Okt. 2025 keine CE-Binaries mehr              | ⚠️ dito                                                                                                                                                         | Für Commercial OK; für Community-Edition muss evtl. self-built werden oder auf `jessestuart/minio` o. ä. ausgewichen werden |
| **Traefik v2.11 / v3**                | ✅ multi-arch                                                                           | ✅ multi-arch                                                                                                                                                   | Standard, kein Problem                                                                                                      |
| **Ollama**                            | ✅ `dustynv/ollama:r36.2.0` (JetPack 6) oder native Install                             | ⚠️ `ghcr.io/nvidia-ai-iot/ollama:r38.2.arm64-sbsa-cu130-24.04` verfügbar, **aber Docker-Bug mit Grafik-Exceptions** — Workaround: native Install, Ollama 0.12.9 | Native Performance ok, Docker-Perf derzeit ~19 t/s statt ~150 t/s erwartet                                                  |
| **BGE-M3 Embedding**                  | ⚠️ TEI-Build erfordert sm_87-Patch; ONNX Runtime/TensorRT sind praktikable Alternativen | ❓ Noch keine öffentlich verifizierten Builds; sm_110 sollte mit CUDA 13 ok sein sobald TEI das unterstützt                                                     | Empfehlung: ONNX-Export (`aapot/bge-m3-onnx`) + ONNX Runtime mit CUDA Provider                                              |
| **Docker / nvidia-container-runtime** | ✅ Standard                                                                             | ⚠️ SBSA-Stack, `--gpus=all` bricht, nur `--runtime=nvidia`                                                                                                      | Wichtig für Compose-Files                                                                                                   |
| **dusty-nv/jetson-containers**        | ✅ Mature                                                                               | ⚠️ Build-Probleme: Test-Harness nutzt `--gpus=all`; sbsa/cu132-Registry fehlen pip/setuptools/numpy/cmake; TensorRT-Download braucht Login                      | GitHub Issue #1661 dokumentiert Workarounds                                                                                 |
| **NGC Base-Images**                   | `nvcr.io/nvidia/l4t-jetpack:r36.x`                                                      | `nvcr.io/nvidia/pytorch:25.08-py3`, `nvcr.io/nvidia/tensorrt:25.08-py3` (SBSA)                                                                                  | Thor nutzt die gleichen Images wie Server-Arm — kein dedizierter l4t-jetpack-Tag für Thor                                   |
| **n8n**                               | ✅ multi-arch (Node.js)                                                                 | ✅ multi-arch                                                                                                                                                   | Keine GPU-Abhängigkeit                                                                                                      |
| **Embedding Service (eigen)**         | PyTorch / ONNX Runtime                                                                  | Erfordert ONNX/PyTorch-Rebuild gegen CUDA 13 + sm_110                                                                                                           | Beim Migrationsschritt beachten                                                                                             |

**Legende**: ✅ funktioniert out-of-the-box · ⚠️ funktioniert mit Einschränkung/Workaround · ❓ nicht verifiziert

---

## Potentielle Stolpersteine für Arasul-Plattform

### 1. Container-Runtime-Unterschied (kritisch)

- Thor akzeptiert **kein `--gpus=all`**. Alle Compose-Files / Skripte, die `deploy.resources.reservations.devices` mit `driver: nvidia`/`capabilities: [gpu]` nutzen, müssen auf `runtime: nvidia` zurückfallen. **Dies ist der mit Abstand häufigste Fehler in Thor-Migrationen.**
- Prüfen: `compose/` auf `--gpus=all` bzw. `deploy.resources.devices`.

### 2. Ollama auf Thor hat reale Bugs

- **Ollama 0.12.10 Docker auf Thor** liefert korrupte Ausgaben (non-Latin Garbage) und Kernel-Logs zeigen `SKEDCHECK36_DEPENDENCE_COUNTER_UNDERFLOW failed`.
- Workaround heute: Ollama **nativ** installieren, Version **0.12.9** pinnen, oder auf vLLM/SGLang aus dem NGC-Registry wechseln.
- Das widerspricht dem aktuellen Arasul-Containerization-Ansatz. **Entweder** Workaround akzeptieren **oder** LLM-Service per Host-Network + nativem Ollama auf Thor betreiben.
- `jetson-containers`-Issue #1661: Ollama-Build für Thor läuft mit `--skip-tests all`, aber Performance nur ~19 t/s (llama3.2:3b Q4_K_M) — das wird vor GA besser werden müssen.

### 3. Image-Tags sind nicht mehr einheitlich

- Orin: `nvcr.io/nvidia/l4t-jetpack:r36.x` oder `dustynv/*:r36.2.0`
- Thor: SBSA-Images wie `nvcr.io/nvidia/pytorch:25.08-py3` oder `ghcr.io/nvidia-ai-iot/*:r38.2.arm64-sbsa-cu130-24.04`
- **Es gibt keinen gemeinsamen Tag, der auf beiden Geräten funktioniert.** Arasul braucht eine Plattform-Detection (`scripts/setup/detect-jetson.sh`) die die passenden Tags wählt — das ist bereits in der Codebase vorgesehen, muss aber um Thor erweitert werden.

### 4. MinIO Community-Edition Lifecycle

- Seit Oktober 2025 stellt MinIO für die Community-Edition keine vorkompilierten Binaries mehr bereit. Docker-Hub-Tag `minio/minio:RELEASE.2025-09-07T16-13-09Z-cpuv1` ist der letzte offizielle.
- Für eine **5-Jahr-Appliance** ist das ein Risiko: entweder Version pinnen + Mirror im eigenen Registry, oder auf Alternative wie **SeaweedFS**/**Garage** evaluieren.

### 5. BGE-M3 auf sm_87 / sm_110

- Huggingface TEI hat historisch Probleme mit sm_87 (siehe PR #467). Stand April 2026 muss TEI für Jetson selbst gebaut werden.
- **Empfehlung**: Embedding-Service auf **ONNX Runtime mit CUDA Execution Provider** umstellen; BGE-M3-ONNX-Export ist stabil (`aapot/bge-m3-onnx`, `yuniko-software/bge-m3-onnx`). Das läuft auf sm*87 \_und* sm_110 ohne Neukompilierung.
- FP16 Quantisierung ist in ONNX problemlos; INT8 erfordert Kalibrierungsdaten.

### 6. JetPack 7.2 — Window für Orin-Migration

- JetPack 7.2 (Q2 2026) bringt **CUDA 13.2 auch auf Orin** und damit sm_87 im gleichen SBSA-Stack. Dann wäre eine einheitliche Image-Strategie möglich.
- Risiko: Termin ist NVIDIA-eigen und hat sich in Vergangenheit bereits verschoben (ursprünglich Q1 2026 avisiert).
- **Strategie**: Phase "Thor-Support" so bauen, dass bei Orin _beide_ Pfade (JetPack 6 und JetPack 7.2) funktionieren können.

### 7. JetPack 6 EOL (Q3 2028)

- Orin-Kunden mit JetPack 6 haben noch ~2,5 Jahre Produktiv-Support. Für eine 5-Jahr-Appliance heißt das: **bis Q3 2028 muss der JetPack-7.2-Pfad für Orin produktiv getestet sein**.

---

## Empfehlungen für den Phasen-Plan

### Phase A: Thor-Abstraction-Layer (blocking für Thor-Support)

1. **`scripts/setup/detect-jetson.sh`** erweitern: Thor-Detection (via `/proc/device-tree/compatible` oder `nvidia-tegrastats`), Ausgabe: `ORIN_JP6`, `ORIN_JP7`, `THOR_JP7`.
2. **`compose/`-Overlays**: `compose/overrides/thor.yml` mit `runtime: nvidia` anstelle `deploy.resources.devices`. Identische Services, aber unterschiedliche GPU-Config.
3. **Image-Tag-Variable** in `.env`:
   - `OLLAMA_IMAGE=dustynv/ollama:r36.2.0` (Orin JP6) vs. `ghcr.io/nvidia-ai-iot/ollama:r38.2.arm64-sbsa-cu130-24.04` (Thor).
   - Analog für alle GPU-relevanten Services.
4. **Fallback auf Native Ollama** auf Thor, bis NVIDIA/Ollama den Docker-Bug fixen (Monitoring via Release-Notes 0.13.x).

### Phase B: Embedding-Service Migration auf ONNX

1. BGE-M3 als **ONNX-Modell** bundle (`aapot/bge-m3-onnx`).
2. `services/embedding-service/` auf ONNX Runtime + CUDA Execution Provider umstellen.
3. FP16-Quantisierung für Jetson aktivieren; Benchmark Orin (sm_87) + Thor (sm_110) aufnehmen.
4. Rollback-Pfad: PyTorch-Variante parallel halten für 1 Release-Zyklus.

### Phase C: Multi-Arch-Pinning

Alle kritischen Images mit Multi-Arch-Digest pinnen (sowohl amd64 als auch arm64), um Drift zu vermeiden:

```
postgres:16.4-alpine@sha256:...
qdrant/qdrant:v1.12.5@sha256:...
traefik:v3.2@sha256:...
minio/minio:RELEASE.2025-09-07T16-13-09Z-cpuv1@sha256:...
n8n/n8n:1.72.0@sha256:...
```

Und GPU-seitig **pro Plattform getrennt**:

```
# Orin (JP6):
dustynv/ollama:r36.2.0@sha256:...
# Thor (JP7):
ghcr.io/nvidia-ai-iot/ollama:r38.2.arm64-sbsa-cu130-24.04@sha256:...
```

### Phase D: Testplan Thor

Akzeptanz-Matrix, die zwingend grün sein muss, bevor Thor als "supported" markiert wird:

| Test                               | Orin JP6 | Thor JP7            | Orin JP7.2 (wenn verfügbar) |
| ---------------------------------- | -------- | ------------------- | --------------------------- |
| `docker compose up -d` vollständig | ✅       | to-do               | to-do                       |
| LLM `/api/chat` e2e                | ✅       | to-do (Docker-Bug!) | to-do                       |
| Embedding `/v1/embeddings`         | ✅       | to-do               | to-do                       |
| PostgreSQL-Migrationen 078+        | ✅       | to-do               | to-do                       |
| Qdrant Cluster-Insert + Search     | ✅       | to-do               | to-do                       |
| Upload → Index → RAG-Query         | ✅       | to-do               | to-do                       |
| GPU `nvidia-smi` / `tegrastats`    | ✅       | to-do               | to-do                       |
| 48h-Uptime-Stresstest              | ✅       | to-do               | to-do                       |

### Phase E: MinIO-Risiko adressieren

- MinIO-Version explizit pinnen + eigenes Mirror-Registry.
- Parallel **SeaweedFS** oder **Garage** als POC bauen (beides multi-arch, Apache-2.0, aktiv gepflegt). Entscheidung bis Q4 2026.

### Phase F: JetPack-7.2-Dry-Run (sobald Preview verfügbar)

- Sobald NVIDIA JetPack 7.2 als Preview freigibt (~Q2 2026): Orin-Testboard damit flashen, gesamte Stack-Kompatibilität verifizieren.
- Dann konvergieren: Orin JP7.2 + Thor JP7.x teilen den gleichen SBSA-Stack → eine einzige Image-Matrix.

---

## Quellen

- [NVIDIA Newsroom — Blackwell-Powered Jetson Thor Now Available](https://nvidianews.nvidia.com/news/nvidia-blackwell-powered-jetson-thor-now-available-accelerating-the-age-of-general-robotics)
- [NVIDIA Jetson Thor Product Page](https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-thor/)
- [HotHardware — Jetson AGX Thor Review](https://hothardware.com/reviews/nvidia-jetson-agx-thor-developer-kit-hands-on)
- [VideoCardz — Jetson Thor Launch $3499](https://videocardz.com/newz/nvidia-jetson-thor-with-blackwell-gpu-architecture-launched-costs-3499)
- [JetPack 7.0 / Jetson Linux 38.2 Announcement (NVIDIA Forums)](https://forums.developer.nvidia.com/t/jetpack-7-0-jetson-linux-38-2-for-nvidia-jetson-thor-is-now-live/343128)
- [JetPack 7.1 Release — JetsonHacks (12. Januar 2026)](https://jetsonhacks.com/2026/01/12/jetpack-7-1-and-jetson-t4000-now-available/)
- [JetPack 7.0 White Paper (Advantech)](https://docs.aim-linux.advantech.com/blog/nvidia-jetpack-70-jetson-thor)
- [JetPack SDK Downloads & Release Notes](https://developer.nvidia.com/embedded/jetpack/downloads)
- [NVIDIA Technical Blog — CUDA 13.0 for Jetson Thor](https://developer.nvidia.com/blog/whats-new-in-cuda-toolkit-13-0-for-jetson-thor-unified-arm-ecosystem-and-more/)
- [NVIDIA Forum — Support for JetPack 7 on Jetson AGX Orin (Q1 2026)](https://forums.developer.nvidia.com/t/support-for-jetpack-7-on-the-jetson-agx-orin/344130)
- [NVIDIA Forum — JetPack 7.2 Q2 2026 Timeline](https://forums.developer.nvidia.com/t/jetpack-7-2-q2-2026-timeline/360233)
- [NVIDIA Forum — SBSA Compliance for Thor](https://forums.developer.nvidia.com/t/sbsa-compliance-and-upstream-distributions-for-thor/345192)
- [NVIDIA Forum — Ollama Docker Graphics Exceptions on Thor](https://forums.developer.nvidia.com/t/ollama-in-docker-causing-graphics-exceptions-and-bad-responses/351878)
- [NVIDIA Forum — Ollama + OpenWebUI on AGX Thor DK](https://forums.developer.nvidia.com/t/getting-ollama-and-openwebui-docker-containers-working-together-on-agx-thor-dk/345422)
- [Jetson AI Lab — Ollama Tutorial (offiziell)](https://www.jetson-ai-lab.com/tutorials/ollama/)
- [GitHub — dusty-nv/jetson-containers](https://github.com/dusty-nv/jetson-containers)
- [GitHub Issue #1661 — Thor / L4T r39 / CUDA 13.2 Build Failures](https://github.com/dusty-nv/jetson-containers/issues/1661)
- [GitHub Issue #1286 — Architecture Detection (tegra-aarch64 vs IS_SBSA)](https://github.com/dusty-nv/jetson-containers/issues/1286)
- [NGC Catalog — L4T JetPack](https://catalog.ngc.nvidia.com/orgs/nvidia/containers/l4t-jetpack)
- [NGC Catalog — L4T Base](https://catalog.ngc.nvidia.com/orgs/nvidia/containers/l4t-base)
- [Qdrant — ARM Architecture Support Blog](https://qdrant.tech/blog/qdrant-supports-arm-architecture/)
- [Qdrant Dockerfile on GitHub (multi-arch build)](https://github.com/qdrant/qdrant/blob/master/Dockerfile)
- [Docker Hub — official postgres image (multi-arch)](https://hub.docker.com/_/postgres)
- [GitHub Issue — MinIO Multiarch Container Images (resolved)](https://github.com/minio/minio/issues/9546)
- [Docker Hub — minio/minio tags](https://hub.docker.com/r/minio/minio/tags)
- [Huggingface — BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)
- [Huggingface — aapot/bge-m3-onnx](https://huggingface.co/aapot/bge-m3-onnx)
- [GitHub — yuniko-software/bge-m3-onnx](https://github.com/yuniko-software/bge-m3-onnx)
- [GitHub — huggingface/text-embeddings-inference](https://github.com/huggingface/text-embeddings-inference)
- [TEI PR #467 — Jetson Orin Support](https://github.com/huggingface/text-embeddings-inference/pull/467)
- [Arnon Shimoni — CUDA arch / gencode Reference](https://arnon.dk/matching-sm-architectures-arch-and-gencode-for-various-nvidia-cards/)
- [NVIDIA — CUDA GPU Compute Capability List](https://developer.nvidia.com/cuda/gpus)
- [RidgeRun — JetPack 6 Migration Guide](https://developer.ridgerun.com/wiki/index.php/JetPack_6_Migration_and_Developer_Guide/Introduction/Versions_and_Support)
- [RidgeRun — JetPack 7.0 Components for Thor](https://developer.ridgerun.com/wiki/index.php/NVIDIA_Jetson_AGX_Thor/JetPack_7.0/Getting_Started/Components)

---

## Unklarheiten / nicht verifiziert

- **Konkrete BGE-M3-Benchmarks auf Thor (sm_110)** — wurden noch nicht öffentlich publiziert. Muss selbst gemessen werden.
- **Exaktes Release-Datum JetPack 7.2** — NVIDIA-Forum bestätigt nur "Q2 2026", keine Monatsangabe.
- **TensorRT-EdgeLLM-Support** ist in JetPack 7.1 enthalten, aber konkrete Integration mit Ollama/vLLM im Jetson-AI-Lab-Tutorial ist Stand April 2026 noch unterspezifiziert.
- **Long-term MinIO-Strategie** — der Vendor-Shift weg von CE-Binaries ist im Fluss; eine endgültige Bewertung ist erst nach Q3 2026 sinnvoll.
