#!/usr/bin/env python3
"""Eine dokumentierte Stellschraube muss den Container auch erreichen.

Gefunden am 22.08.2026 beim Versuch, fuer Plan 023 E1 einen Abbruch
nachzustellen: `FLOW_LLM_TIMEOUT_MS` steht in `docs/ENVIRONMENT_VARIABLES.md`
und wird in `chatAgentRunner.js` gelesen, aber `compose/` reicht sie nicht
durch. Ein Wert in der `.env` des Geraets bewirkt nichts, und niemand merkt es:
der Code faellt still auf seinen eingebauten Vorgabewert zurueck.

Der Kommentar ueber den AGENT_-Zeilen in `compose.app.yaml` warnt seit Monaten
genau davor. Es ist trotzdem wieder passiert, zuletzt bei zwei Variablen aus
D7 und D9, also aus derselben Woche. Deshalb ein Waechter statt einer weiteren
Ermahnung.

Gezaehlt wird die Schnittmenge aus drei Listen:

  1. in `docs/ENVIRONMENT_VARIABLES.md` als Zeile einer Tabelle dokumentiert,
  2. im Backend-Quelltext als `process.env.X` gelesen,
  3. in keiner Datei unter `compose/` erwaehnt.

Beim ersten Lauf am 22.08.2026 waren das 88 Variablen. Diese Zahl steht in
`ERLAUBTE_LUECKE` und ist eine Schuld, keine Erlaubnis: der Waechter schlaegt
fehl, sobald eine NEUE dazukommt, und meldet ausserdem, wenn eine wegfaellt,
damit die Liste beim Aufraeumen mitschrumpft statt zu verwahrlosen.

Aufruf:
    python3 scripts/test/durchreichung.py [--wurzel PFAD]
"""

import argparse
import re
import sys
from pathlib import Path

DOK = Path("docs/ENVIRONMENT_VARIABLES.md")
COMPOSE = Path("compose")
QUELLEN = [Path("apps/dashboard-backend/src")]

# Eine Tabellenzeile beginnt mit "| NAME " und der Name ist GROSS_MIT_STRICH.
DOK_ZEILE = re.compile(r"^\|\s*([A-Z][A-Z_0-9]{3,})\s*\|")
LESE_ZUGRIFF = re.compile(r"process\.env\.([A-Z][A-Z_0-9]+)")

# Am 22.08.2026 gemessener Bestand. Wer eine Variable hier streicht, weil sie
# jetzt durchgereicht wird, tut das Richtige. Wer eine hinzufuegt, verschiebt
# ein Problem in die Zukunft und sollte stattdessen die Zeile in compose/
# schreiben, die ohnehin faellig ist.
ERLAUBTE_LUECKE = {
    "ADMIN_EMAIL",
    "ALLOWED_ORIGINS",
    "CPU_CRITICAL_PERCENT",
    "CPU_WARNING_PERCENT",
    "EXTERNAL_BACKUP_PATH",
    "FLOWS_DIR",
    "FORCE_HTTPS",
    "FORCE_SECURE_COOKIES",
    "GPU_CRITICAL_PERCENT",
    "GPU_WARNING_PERCENT",
    "JETSON_PROFILE",
    "LLM_HOST",
    "LLM_MANAGEMENT_PORT",
    "LLM_PORT",
    "LLM_SERVICE_MANAGEMENT_PORT",
    "LOG_DIR",
    "MAX_STORED_MODELS",
    "MODEL_ACTIVITY_PEAK_REQUESTS",
    "MODEL_ACTIVITY_WINDOW_MINUTES",
    "MODEL_BATCHING_ENABLED",
    "MODEL_IDLE_KEEP_ALIVE_MINUTES",
    "MODEL_LIFECYCLE_ENABLED",
    "MODEL_MAX_WAIT_SECONDS",
    "MODEL_MEMORY_SAFETY_BUFFER_MB",
    "MODEL_NORMAL_KEEP_ALIVE_MINUTES",
    "MODEL_PEAK_KEEP_ALIVE_MINUTES",
    "MODEL_PEAK_THRESHOLD",
    "MODEL_SWITCH_COOLDOWN_SECONDS",
    "MODEL_SYNC_INTERVAL",
    "OLLAMA_READY_TIMEOUT",
    "OLLAMA_RETRY_INTERVAL",
    "POSTGRES_CONNECTION_TIMEOUT",
    "POSTGRES_IDLE_TIMEOUT",
    "POSTGRES_POOL_MAX",
    "POSTGRES_POOL_MIN",
    "POSTGRES_STATEMENT_TIMEOUT",
    "RAM_CRITICAL_PERCENT",
    "RAM_WARNING_PERCENT",
    "RATE_LIMIT_ENABLED",
    "SELF_HEALING_HOST",
    "SELF_HEALING_PORT",
    "TEMP_CRITICAL_CELSIUS",
    "TEMP_WARNING_CELSIUS",
    "UPDATE_PUBLIC_KEY_PATH",
}


def dokumentierte(wurzel: Path) -> set:
    pfad = wurzel / DOK
    if not pfad.exists():
        return set()
    treffer = set()
    for zeile in pfad.read_text(encoding="utf-8").splitlines():
        m = DOK_ZEILE.match(zeile)
        if m:
            treffer.add(m.group(1))
    return treffer


def gelesene(wurzel: Path) -> set:
    treffer = set()
    for ordner in QUELLEN:
        basis = wurzel / ordner
        if not basis.exists():
            continue
        for datei in basis.rglob("*.js"):
            if "__tests__" in datei.parts or "node_modules" in datei.parts:
                continue
            treffer.update(LESE_ZUGRIFF.findall(datei.read_text(encoding="utf-8", errors="ignore")))
    return treffer


def durchgereichte(wurzel: Path) -> str:
    basis = wurzel / COMPOSE
    if not basis.exists():
        return ""
    return "\n".join(
        d.read_text(encoding="utf-8", errors="ignore")
        for d in sorted(basis.rglob("*.y*ml"))
    )


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--wurzel", default=".")
    args = p.parse_args()
    wurzel = Path(args.wurzel).resolve()

    dok = dokumentierte(wurzel)
    gelesen = gelesene(wurzel)
    text = durchgereichte(wurzel)

    kandidaten = dok & gelesen
    # Auch die Docker-Secret-Form zaehlt als durchgereicht: `JWT_SECRET` kommt
    # als `JWT_SECRET_FILE: /run/secrets/jwt_secret` herein und wird von
    # `utils/resolveSecrets.js` beim Start eingelesen. Ohne diese Zeile stuenden
    # die drei Geheimnisse in der Schuldenliste, obwohl sie richtig verdrahtet
    # sind, und jemand haette sie eines Tages als Klartext-Variable "behoben".
    def fehlt(v):
        return not re.search(rf"\b{re.escape(v)}(_FILE)?\b", text)

    luecke = {v for v in kandidaten if fehlt(v)}

    neu = sorted(luecke - ERLAUBTE_LUECKE)
    # Geschlossen heisst: die Variable ist weiterhin dokumentiert und wird
    # weiterhin gelesen, aber compose/ reicht sie jetzt durch. Das ist ein
    # Fehlschlag mit Absicht, damit die Schuldenliste beim Aufraeumen
    # mitschrumpft und nicht ueber Jahre Namen mitschleppt, die niemand mehr
    # nachschlagen kann.
    geschlossen = sorted((ERLAUBTE_LUECKE & kandidaten) - luecke)
    # Verschwunden heisst: die Variable steht nicht mehr in der Dokumentation
    # oder wird nicht mehr gelesen. Das ist KEIN Fehlschlag, sondern ein
    # Hinweis; sonst waere dieser Waechter in seinem eigenen Selbsttest rot,
    # weil dort keine der echten 88 vorkommt.
    verschwunden = sorted(ERLAUBTE_LUECKE - kandidaten)

    if geschlossen:
        print(
            "Diese Variablen stehen noch in ERLAUBTE_LUECKE, werden aber inzwischen\n"
            "durchgereicht. Bitte aus scripts/test/durchreichung.py streichen:"
        )
        for v in geschlossen:
            print(f"  - {v}")
        return 1

    if neu:
        print(
            "Diese Variablen sind dokumentiert und werden im Backend gelesen, aber\n"
            "compose/ reicht sie nicht durch. Ein Wert in der .env des Geraets\n"
            "bewirkt damit nichts, und der Code faellt still auf seinen Vorgabewert\n"
            "zurueck. Bitte eine Zeile in compose/compose.app.yaml ergaenzen:"
        )
        for v in neu:
            print(f"  - {v}")
        return 1

    if verschwunden:
        print(
            f"Hinweis: {len(verschwunden)} Eintrag/Eintraege in ERLAUBTE_LUECKE sind weder\n"
            "dokumentiert noch werden sie gelesen und koennen gestrichen werden: "
            + ", ".join(verschwunden[:8])
            + (" ..." if len(verschwunden) > 8 else "")
        )
    print(f"Durchreichung: in Ordnung ({len(luecke)} bekannte Luecken, keine neue)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
