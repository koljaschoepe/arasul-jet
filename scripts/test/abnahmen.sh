#!/bin/bash
# =============================================================================
# abnahmen.sh — die ganze Abnahme-Reihe gegen das laufende Geraet.
#
# Jede einzelne Abnahme belegt eine Zusage gegen den Orin. Zusammen sind sie der
# Beleg fuer Gate G1 ("alle Funktionen arbeiten nachweislich"). Einzeln
# aufgerufen vergisst man eine; deshalb dieser eine Befehl.
#
# EINE ANMELDUNG FUER ALLE (Entscheidung 27.08.2026). Diese Datei meldet sich
# einmal an und gibt den Token an jede Abnahme weiter -- an die vier im Browser
# ueber eine Playwright-Sitzungsdatei, an die anderen ueber `ARASUL_TOKEN`.
# Vorher meldete sich jede selbst an, zusammen ueber ein Dutzend Mal, und die
# Anmeldedrossel (`loginLimiter`, ZEHN je Viertelstunde und IP) griff mitten in
# der Reihe. Die Abnahmen meldeten daraufhin Dinge ueber das GERAET, die nur
# ueber den Messaufbau galten. Die Drossel bleibt bei zehn: sie schuetzt das
# Erraten eines Passworts, und sie zu lockern, damit die eigenen Messungen
# bequemer werden, hiesse das Geraet fuer den Messaufbau zu schwaechen.
#
# Was sich NICHT teilen laesst, sind die Zugaenge, die eine Abnahme selbst
# anlegt: `rollen-abnahme.sh` braucht einen eigenen Admin und einen eigenen
# Mitarbeiter, `mitarbeiter-abnahme.sh` fuenf Anmeldungen desselben Menschen mit
# wechselnden Passwoertern. Das IST dort die Messung.
#
# Sie laufen NACHEINANDER, nicht parallel: mehrere Browser gegen dasselbe
# Modell wuerden sich um die GPU streiten, und die Messungen waeren dann eine
# Aussage ueber die Warteschlange, nicht ueber die Funktion.
#
# Voraussetzung: ein SSH-Tunnel auf das Geraet.
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/abnahmen.sh          alle
#   ARASUL_PASSWORT=... bash scripts/test/abnahmen.sh csp apps nur diese
#
# Rueckgabe 0, wenn jede Abnahme gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

# Phase B2 (26.08.2026): chat, terminal, dokument, modell und rueckfrage sind
# aus der Reihe gefallen. Sie massen den Agent-Chat, das Terminal und den
# Datei-Explorer, und die gibt es in der Oberflaeche nicht mehr. D4 schneidet
# Rueckfrage und Modellwahl je Flow neu. Phase B4: erweiterung, bruecke und
# paket sind mit dem Erweiterungs-Baukasten gefallen. Phase B6: modell-link
# (Modell per Link nachladen) ist weg, C8 erlaubt nur die Kurzliste.
#
# Phase C3 (27.08.2026): die drei curl-Abnahmen stehen jetzt MIT in der Reihe
# statt daneben. Sie waren nie im Browser, aber sie messen gegen dasselbe
# Geraet, und seit alle sich einen Token teilen, gibt es keinen Grund mehr,
# sie getrennt zu fahren. Was weiter daneben steht, ist das Zerstoerende:
# `passwort-loeschung-abnahme.sh` und `werksreset-abnahme.sh` laufen nur gegen
# den Pruefstand, `souveraenitaet-abnahme.sh` und `endpunkte-live.py` messen
# etwas anderes als eine Funktion.
#
# Phase C4 (27.08.2026): `app-anmeldung` kommt dazu und steht direkt hinter
# `apps` -- sie misst, was `apps` voraussetzt. Sie braucht ZWEI eigene
# Anmeldungen, eine je Mensch; damit sitzt die Reihe auf der Grenze der
# Anmeldedrossel (zwei fuer `rollen`, fuenf fuer `mitarbeiter`, zwei hier, eine
# geteilte: genau zehn je Viertelstunde und IP).
ALLE=(csp fernzugriff rueckmeldung oberflaeche apps app-anmeldung rollen mitarbeiter)
GEWAEHLT=("$@")
[ ${#GEWAEHLT[@]} -eq 0 ] && GEWAEHLT=("${ALLE[@]}")

BERICHT="${ARASUL_BERICHT:-$(mktemp -d)}/abnahmen"
mkdir -p "$BERICHT"

# Gefragt wird nach der Adresse, die die Reihe DANN auch benutzt. Die feste
# Zeile `nc -z localhost 8443` davor stimmte nur vom Arbeitsrechner aus; auf
# dem Geraet selbst (ARASUL_URL=https://localhost:443) brach die ganze Reihe
# mit "Kein Tunnel" ab, waehrend das Geraet lief.
if ! arasul_geraet_erreichbar "$ARASUL_URL"; then
  echo "Kein Geraet unter $ARASUL_URL."
  echo "  Vom Arbeitsrechner:  ssh -f -N -L 8443:localhost:443 jetson"
  echo "  Auf dem Geraet:      ARASUL_URL=https://localhost:443 $0 $*"
  exit 1
fi

echo "=== Abnahme-Reihe, $(date '+%d.%m. %H:%M') ==="
echo ""

# --- Die eine Anmeldung ------------------------------------------------------
TOKEN=$(arasul_token)
if [ -z "$TOKEN" ]; then
  echo "Keine Anmeldung an $ARASUL_URL (HTTP $(arasul_anmeldecode))."
  echo "429 heisst Anmeldedrossel: zehn je Viertelstunde und IP, eine"
  echo "Viertelstunde warten. Sonst ARASUL_PASSWORT pruefen."
  exit 1
fi
if ! arasul_sitzung_bauen "$TOKEN"; then
  echo "Hinweis: die Browser-Sitzung liess sich nicht schreiben. Die vier"
  echo "Abnahmen im Browser melden sich dann selbst an -- vier Anmeldungen"
  echo "mehr, aber kein falsches Rot."
fi
echo "Angemeldet. Ein Token fuer die ganze Reihe."
echo ""
export ARASUL_TOKEN="$TOKEN"
export ARASUL_SITZUNG ARASUL_URL ARASUL_BENUTZER ARASUL_PASSWORT

FEHLER=0
for name in "${GEWAEHLT[@]}"; do
  # Im Browser oder auf der Kommandozeile: beide gehoeren in dieselbe Reihe,
  # und welcher Art eine Abnahme ist, sagt ihre Datei, nicht eine zweite Liste.
  if [ -f "scripts/test/${name}-abnahme.mjs" ]; then
    ausfuehren=(node "scripts/test/${name}-abnahme.mjs")
  elif [ -f "scripts/test/${name}-abnahme.sh" ]; then
    ausfuehren=(bash "scripts/test/${name}-abnahme.sh")
  else
    printf '  %-14s %s\n' "$name" "gibt es nicht (weder .mjs noch .sh)"
    FEHLER=1
    continue
  fi
  start=$(date +%s)
  "${ausfuehren[@]}" > "$BERICHT/$name.log" 2>&1
  code=$?
  dauer=$(( $(date +%s) - start ))
  letzte=$(grep -E 'gruen$|von [0-9]+ gruen' "$BERICHT/$name.log" | tail -1)
  [ -z "$letzte" ] && letzte=$(tail -1 "$BERICHT/$name.log")
  if [ "$code" = "0" ]; then
    printf '  OK    %-14s %-34s %4ds\n' "$name" "$letzte" "$dauer"
  else
    printf '  ROT   %-14s %-34s %4ds\n' "$name" "$letzte" "$dauer"
    FEHLER=1
    # Die roten Zeilen gleich mitgeben, sonst muss man die Datei suchen.
    grep -E '^ROT' "$BERICHT/$name.log" | head -4 | sed 's/^/          /'
  fi
done

echo ""
echo "Protokolle: $BERICHT"
if [ "$FEHLER" = "0" ]; then
  echo "Alles gruen."
else
  echo "Mindestens eine Abnahme ist rot."
fi
exit "$FEHLER"
