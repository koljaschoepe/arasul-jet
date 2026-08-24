#!/bin/bash
# =============================================================================
# Wartungsfenster: die Selbstheilung haelt still, solange hier gebaut wird
# =============================================================================
# Einbinden:  source "$(dirname "${BASH_SOURCE[0]}")/../lib/wartungsfenster.sh"
# Danach:     wartung_an ... wartung_aus, oder gleich `wartung_herzschlag_an`
#
# Warum gemeinsam und nicht je Skript: `deploy-local.sh` hat das Fenster am
# 23.08.2026 als erstes bekommen, weil die Selbstheilung Dienste mitten im
# Deploy neu startete, gegen den Deploy. Am selben Tag um 00:59 hatte aber ein
# ganz anderer Vorgang denselben Schaden angerichtet: `pruefstand.sh hoch` baut
# mit `--build` auf DEMSELBEN Geraet, n8n wurde unter der Last ungesund, und
# die Kette lief bis zur Neustart-Entscheidung durch.
#
# Zwei Skripte mit je eigener Fassung derselben Idee driften auseinander. Der
# Pfad ist der empfindlichste Teil: liefe einer der beiden auf einen anderen
# Ordner als der Agent, waere sein Fenster wirkungslos, ohne dass es jemand
# merkt. Deshalb steht die Frage genau einmal hier und wird bei Docker
# erfragt, nicht geraten — `LOGS_PATH` ist konfigurierbar.
#
# Kein Schalter, sondern ein Herzschlag: die Datei wird waehrend des ganzen
# Vorgangs immer wieder angefasst. Ein abgebrochener Lauf legt die
# Selbstheilung deshalb nicht dauerhaft schlafen, sondern hoechstens fuer
# SELFHEAL_WARTUNG_MAX_MINUTEN (Vorgabe 30, siehe services/self-healing-agent/config.py).
#
# Ausdruecklich ausgesetzt wird nur Kategorie A, also Dienstneustarts.
# Temperatur, RAM und Platte bleiben scharf. Ein Build heizt das Geraet, und
# ein Temperaturschutz, der sich beim Bauen abschaltet, waere genau verkehrt
# herum gebaut.
# =============================================================================

# Den Ordner NICHT raten. Der Fallback greift nur, wenn es den Agenten noch
# nicht gibt — dann heilt auch niemand.
wartung_pfad() {
  local quelle
  quelle="$(docker inspect "${WARTUNG_AGENT:-self-healing-agent}" \
    --format '{{range .Mounts}}{{if eq .Destination "/arasul/logs"}}{{.Source}}{{end}}{{end}}' \
    2>/dev/null)"
  printf '%s/wartung.aktiv' "${quelle:-${WARTUNG_FALLBACK_DIR:-${PWD}/logs}}"
}

wartung_an() {
  : "${WARTUNG_DATEI:=$(wartung_pfad)}"
  mkdir -p "$(dirname "$WARTUNG_DATEI")" 2>/dev/null
  printf '%s %s\n' "$(date -Iseconds)" "${WARTUNG_GRUND:-wartung}" > "$WARTUNG_DATEI" 2>/dev/null || true
}

# Beendet das Fenster, LOESCHT die Datei aber nicht, sondern schreibt einen
# Endzeitpunkt hinein. Der Grund steht in der Selbstheilung: der Agent prueft
# alle zehn Sekunden, und am 24.08.2026 lag ein ganzer Vorgang dazwischen (27
# Sekunden gesamt, das Fenster davon nur wenige). Er hat das Fenster nie
# gesehen, also lief auch kein Nachlauf, und er griff siebzehn Sekunden spaeter
# zu. Ausgerechnet die kurzen Vorgaenge waren damit ungeschuetzt.
#
# Mit dem Endzeitpunkt in der Datei braucht er das Fenster nicht gesehen zu
# haben: er liest, wann es zu war, und rechnet den Nachlauf ab da. Liegen
# bleibt die Datei ohne Schaden — der naechste `wartung_an` ueberschreibt sie,
# und der Deckel aus SELFHEAL_WARTUNG_MAX_MINUTEN greift unabhaengig davon.
wartung_aus() {
  [ -n "${WARTUNG_HERZ:-}" ] && kill "$WARTUNG_HERZ" 2>/dev/null
  WARTUNG_HERZ=''
  if [ -n "${WARTUNG_DATEI:-}" ] && [ -f "$WARTUNG_DATEI" ]; then
    printf '%s %s ende=%s\n' "$(date -Iseconds)" "${WARTUNG_GRUND:-wartung}" "$(date +%s)" \
      > "$WARTUNG_DATEI" 2>/dev/null || true
  fi
  return 0
}

# Setzt das Fenster und haelt es offen, bis `wartung_aus` laeuft oder die
# aufrufende Shell endet. Fuer Vorgaenge, die am Stueck blockieren und deshalb
# selbst nicht nachfassen koennen, etwa `compose up -d --build`.
wartung_herzschlag_an() {
  wartung_an
  # Der Takt ist einstellbar, damit ein Selbsttest nicht eine Minute warten
  # muss, um zu sehen, ob nachgefasst wird. Ein Herzschlag, den niemand
  # geprueft hat, ist nur eine Behauptung.
  local takt="${WARTUNG_TAKT_SEKUNDEN:-60}"
  ( while kill -0 "$$" 2>/dev/null; do sleep "$takt"; wartung_an; done ) &
  WARTUNG_HERZ=$!
}
