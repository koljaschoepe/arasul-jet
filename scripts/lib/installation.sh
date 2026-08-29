#!/bin/bash
# =============================================================================
# Wo dieses Geraet steht (Auftrag `artefakt-aktualisiert-nicht`, 29.08.2026)
# =============================================================================
# Aufruf: source "${SCRIPT_DIR}/../lib/installation.sh"
#
# DIE WURZEL, aus der zwei Fehler wachsen: ein Geraet hat sein PROGRAMM und
# seinen ZUSTAND im selben Verzeichnis, und jedes Artefakt bringt ein neues
# Verzeichnis mit. Wer nicht weiss, wo der Zustand liegt, raet -- und beide
# Wege auf dieses Geraet haben geraten:
#
#   * Der Kundenweg. `install.sh` kannte nur sein eigenes Verzeichnis. Fand es
#     dort keine `.env`, erzeugte `interactive_setup.sh` BEDINGUNGSLOS neue
#     Geheimnisse, waehrend der feste Projektname (`arasul-platform`) dieselben
#     Volumes uebernahm. Am Orin am 28.08.2026 nachgerechnet: `POSTGRES_PASSWORD`
#     alt `4b5ff99ff49e` gegen frisch `7a8ecc928624`. Ergebnis: alte Datenbank,
#     neues Passwort -- und Geraete-CA, `data/apps`, Flows und Sicherungen
#     blieben im alten Ordner liegen. Eine halbe Migration, schlimmer als
#     beides Ganze.
#   * Koljas Entwicklungsweg. `deploy.yml` trug `/home/arasul/arasul/arasul-jet`
#     fest im Workflow, der Live-Stapel lief aber aus `/home/arasul/arasul-0.4.0`.
#     Seit der Installation durch das Kit fehlten dem Checkout die Geheimnisse,
#     `docker compose up` brach ab, und seit dem 29.08.2026 kam nichts mehr
#     automatisch auf das Geraet (Lauf 33221221851).
#
# DIE ANTWORT IST EINE FRAGE STATT EINER ANNAHME: wo das Geraet steht, sagt
# Docker. Jeder Container eines Compose-Projekts traegt das Etikett
# `com.docker.compose.project.working_dir`, und das ist das Verzeichnis, aus
# dem der laufende Stapel wirklich kommt -- nicht das, von dem jemand es
# glaubt. `docker compose ps` ist die Wahrheit, auch fuer diese Frage.
#
# Zweite Quelle ist ein Zeiger, den `install.sh` schreibt. Er hilft, solange
# kein Container laeuft (frisch heruntergefahren, Werksreset, Pruefung ohne
# Stapel). Er ist NICHT die erste Quelle: eine Datei sagt, was zuletzt
# installiert wurde, ein laufender Container sagt, was laeuft.
# =============================================================================

# Der Projektname steht in docker-compose.yml und ist fest. Genau deshalb
# uebernimmt ein zweites Verzeichnis dieselben Volumes -- die Eigenschaft, die
# das Update ueberhaupt erst gefaehrlich macht.
ARASUL_PROJEKT="${ARASUL_PROJEKT:-arasul-platform}"

# Der Zeiger. Unter `$HOME`, weil die Installation als gewoehnlicher Benutzer
# laeuft und `/etc` sudo braeuchte -- das haben wir bei der Erstinstallation
# nicht immer (install.sh kommt ohne sudo aus).
ARASUL_ZEIGER="${ARASUL_ZEIGER:-${HOME:-/tmp}/.arasul/installation}"

# -----------------------------------------------------------------------------
# Was zum Geraet gehoert und nicht zum Programm
# -----------------------------------------------------------------------------
# DIESE LISTE IST DIE DES WERKSRESETS, RUECKWAERTS GELESEN. `factory-reset.sh`
# loescht genau diese Pfade, um aus einem benutzten Geraet ein leeres zu
# machen; eine Uebernahme traegt genau dieselben Pfade mit, um aus einem neuen
# Artefakt dasselbe Geraet zu machen. Zwei Listen, ein Begriff von "Zustand" --
# `scripts/test/zustand.py` haelt sie aneinander, damit die naechste
# Zustandsablage nicht in genau einer der beiden fehlt.
#
# `cache/` steht mit drin, obwohl es wegwerfbar ist: eine Ausnahme muesste man
# erklaeren und bei jeder Aenderung neu pruefen, und sie spart nichts.
ARASUL_ZUSTAND=(
  '.env'
  'config/device'
  'config/traefik/certs'
  'config/ssh'
  'config/secrets'
  'config/.traefik-credentials'
  'data'
  'logs'
  'cache'
  'updates'
)

# Der Merkzettel im abgegebenen Verzeichnis. `arasul` liest ihn und weigert
# sich dort zu starten -- ein `docker compose up` im leergeraeumten Ordner
# laesst Docker jede fehlende Bind-Quelle neu und leer anlegen, und das Geraet
# stuende ohne Apps, ohne Zertifikat und ohne Sicherungen da.
ARASUL_ABGEGEBEN='ABGEGEBEN.txt'

# -----------------------------------------------------------------------------
# Wo steht das Geraet?
# -----------------------------------------------------------------------------
# Alle drei Funktionen geben IMMER 0 zurueck und drucken im Zweifel nichts.
# Eine Rueckgabe ungleich 0 waere in `x="$(installation_finden)"` unter `set -e`
# das stille Ende des Aufrufers (scripts/test/stiller-tod.py kennt den Fall) --
# dieselbe Regel wie in `scripts/lib/fassung.sh`.

# Das Arbeitsverzeichnis des laufenden Stapels, aus Dockers eigenen Etiketten.
# Erst die LAUFENDEN Container, dann alle: ein gestoppter Container aus einem
# frueheren Verzeichnis darf einen laufenden nicht ueberstimmen.
installation_aus_docker() {
  command -v docker >/dev/null 2>&1 || { printf '%s\n' ''; return 0; }

  local schalter roh haeufigster=''
  for schalter in '' '-a'; do
    # shellcheck disable=SC2086
    roh="$(docker ps $schalter \
      --filter "label=com.docker.compose.project=${ARASUL_PROJEKT}" \
      --format '{{.Label "com.docker.compose.project.working_dir"}}' 2>/dev/null || true)"
    [ -n "$roh" ] || continue
    # Der haeufigste nicht-leere Wert. Nach einem Wechsel, bei dem ein
    # Container nicht neu angelegt wurde, stehen hier zwei Verzeichnisse --
    # genau der Fall, den das Update mit einem `down` verhindert
    # (docs/ops/AUSLIEFERUNG.md, `docker-proxy` am 28.08.2026).
    haeufigster="$(printf '%s\n' "$roh" | grep -v '^$' | sort | uniq -c | sort -rn | sed -n '1s/^ *[0-9]* *//p' || true)"
    if [ -n "$haeufigster" ]; then
      break
    fi
  done

  printf '%s\n' "${haeufigster:-}"
}

# Was zuletzt installiert wurde. Nur, wenn es das Verzeichnis noch gibt: ein
# Zeiger auf einen geloeschten Ordner ist keine Auskunft, sondern eine Falle.
installation_aus_zeiger() {
  [ -f "$ARASUL_ZEIGER" ] || { printf '%s\n' ''; return 0; }
  local pfad
  pfad="$(sed -n '1p' "$ARASUL_ZEIGER" 2>/dev/null || true)"
  if [ -n "$pfad" ] && [ -d "$pfad" ]; then
    printf '%s\n' "$pfad"
    return 0
  fi
  printf '%s\n' ''
}

# Die eine Antwort. Reihenfolge: was von Hand gesagt wurde, dann was laeuft,
# dann was zuletzt installiert wurde.
installation_finden() {
  if [ -n "${ARASUL_INSTALLATION:-}" ] && [ -d "${ARASUL_INSTALLATION}" ]; then
    printf '%s\n' "$ARASUL_INSTALLATION"
    return 0
  fi

  local aus_docker aus_zeiger
  aus_docker="$(installation_aus_docker)"
  if [ -n "$aus_docker" ] && [ -d "$aus_docker" ]; then
    printf '%s\n' "$aus_docker"
    return 0
  fi

  aus_zeiger="$(installation_aus_zeiger)"
  printf '%s\n' "${aus_zeiger:-}"
}

installation_merken() {
  local pfad="$1"
  mkdir -p "$(dirname "$ARASUL_ZEIGER")" 2>/dev/null || return 0
  printf '%s\n' "$pfad" > "$ARASUL_ZEIGER" 2>/dev/null || return 0
  chmod 600 "$ARASUL_ZEIGER" 2>/dev/null || true
  return 0
}

# Gibt es auf diesem Rechner schon einen Zustand dieses Projekts? Gefragt wird
# nach den Volumes, nicht nach Containern: Container kommen und gehen, ein
# Volume ist die Datenbank. Genau dieses Volume hat die halbe Migration
# ermoeglicht -- `arasul-platform_arasul-postgres` blieb liegen, waehrend das
# Passwort daneben neu erzeugt wurde.
zustand_vorhanden() {
  command -v docker >/dev/null 2>&1 || return 1
  local volumes
  volumes="$(docker volume ls -q --filter "name=^${ARASUL_PROJEKT}_" 2>/dev/null || true)"
  [ -n "$volumes" ]
}

# -----------------------------------------------------------------------------
# Die Uebernahme
# -----------------------------------------------------------------------------
# Der Zustand ZIEHT UM, er wird nicht kopiert. Zwei Kopien desselben Geraets
# sind genau die Zweideutigkeit, gegen die dieser ganze Weg gebaut ist: danach
# koennte niemand mehr sagen, welche die echte ist, und ein `docker compose up`
# im falschen Ordner faehrt die halbe.
#
# Ein `mv` innerhalb eines Dateisystems ist ein `rename`: es kostet nichts,
# auch bei 40 GB Modellen, und die Bind-Mounts der LAUFENDEN Container haengen
# am Inode und laufen unbeirrt weiter. Deshalb darf der Umzug vor dem
# Abschalten passieren -- der alte Stapel merkt nichts davon. Liegen die
# Verzeichnisse auf verschiedenen Dateisystemen, faellt es auf Kopieren zurueck
# und loescht die Quelle erst nach dem Gelingen.
#
# UMGEZOGEN WIRD EINTRAG FUER EINTRAG, nicht Ordner fuer Ordner. Der Grund ist
# `config/secrets/`: das Artefakt bringt darin `README.md` und `.example/` mit,
# also GIBT es den Ordner im Zielverzeichnis schon, waehrend die Geheimnisse
# daneben im alten liegen. Wer nur auf die Existenz des Ordners sieht, meldet
# dort einen Zusammenstoss, den es nicht gibt (29.08.2026, erster Lauf dieser
# Abnahme).
#
# UND WO EINE DATEI WIRKLICH ZWEIMAL DA IST, GEWINNT DIE DES ARTEFAKTS. Das
# Zielverzeichnis ist ein frisch ausgepacktes Artefakt -- das prueft der
# Aufrufer, bevor er hier hereingeht --, also ist alles darin PROGRAMM und
# nichts davon Zustand. `config/secrets/README.md` gibt es in beiden, und die
# neue Fassung ist die richtige. Die alte wird nicht geloescht, sondern bleibt
# liegen: sie ist Programm, sie wird mit dem alten Ordner weggeworfen, und
# nichts zu loeschen ist immer die kleinere Behauptung.
_umzug_stehen=0

_umzug_eintrag() {
  local quelle="$1" ziel="$2"
  [ -e "$quelle" ] || return 0

  if [ ! -e "$ziel" ]; then
    mkdir -p "$(dirname "$ziel")"
    if mv "$quelle" "$ziel" 2>/dev/null; then
      return 0
    fi
    # Anderes Dateisystem: kopieren, und die Quelle erst nach dem Gelingen weg.
    if cp -a "$quelle" "$ziel" 2>/dev/null && rm -rf "$quelle"; then
      return 0
    fi
    echo "Konnte ${quelle} nicht nach ${ziel} bringen." >&2
    return 1
  fi

  if [ -d "$quelle" ] && [ -d "$ziel" ]; then
    local eintrag
    for eintrag in "$quelle"/* "$quelle"/.[!.]*; do
      [ -e "$eintrag" ] || continue
      _umzug_eintrag "$eintrag" "${ziel}/$(basename "$eintrag")" || return 1
    done
    return 0
  fi

  # Zweimal dieselbe Datei: die des Artefakts steht schon am Ziel und bleibt.
  _umzug_stehen=$((_umzug_stehen + 1))
  return 0
}

# Rueckgabe auf stdout: "<umgezogene Pfade> <stehengelassene Dateien>".
zustand_umziehen() {
  local alt="$1" neu="$2"
  local pfad bewegt=0

  _umzug_stehen=0
  for pfad in "${ARASUL_ZUSTAND[@]}"; do
    [ -e "${alt}/${pfad}" ] || continue
    _umzug_eintrag "${alt}/${pfad}" "${neu}/${pfad}" || return 1
    bewegt=$((bewegt + 1))
  done

  printf '%s %s\n' "$bewegt" "$_umzug_stehen"
  return 0
}


# Der Merkzettel im abgegebenen Verzeichnis. `arasul` liest ihn und weigert
# sich dort zu starten -- ein `docker compose up` im leergeraeumten Ordner
# laesst Docker jede fehlende Bind-Quelle neu und leer anlegen, und das Geraet
# stuende ohne Apps, ohne Zertifikat und ohne Sicherungen da.
abgabe_vermerken() {
  local alt="$1" neu="$2"
  cat > "${alt}/${ARASUL_ABGEGEBEN}" <<VERMERK 2>/dev/null || true
Dieses Verzeichnis ist nicht mehr das Geraet.

Am $(date '+%d.%m.%Y %H:%M') ist der Zustand dieses Geraets -- Geheimnisse,
Geraete-CA, Datenbankzugang, Apps, Flows, Sicherungen, Protokolle -- nach

    ${neu}

umgezogen. Hier stehen nur noch die Programmdateien der alten Fassung.

NICHT hier starten. Ein \`docker compose up\` in diesem Verzeichnis laesst
Docker jede fehlende Bind-Quelle leer anlegen; das Geraet stuende danach ohne
Apps, ohne Zertifikat und ohne Sicherungen da, waehrend die Datenbank im
gemeinsamen Volume weiterlebt. \`./arasul\` weigert sich hier deshalb.

Weiter geht es in ${neu}.
Wegwerfen darf man dieses Verzeichnis, sobald die neue Fassung laeuft.
VERMERK
  return 0
}
