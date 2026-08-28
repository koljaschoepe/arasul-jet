#!/bin/bash
# =============================================================================
# pruefbenutzer.sh -- den Pruefbenutzer der Abnahmen anlegen, idempotent.
# =============================================================================
#
# WARUM ES DIESE DATEI GIBT
#
# Die Abnahmen melden sich als EIN Mensch an (ARASUL_BENUTZER, in der Regel
# `pruefer`), und dieser Mensch stand als dauerhaft angelegt in den Unterlagen.
# Der Werksreset von G1 hat ihn am 28.08.2026 um 11:55 mitgenommen, wie er
# jeden Benutzer mitnimmt (`werksreset-abnahme.sh`: `DELETE FROM admin_users`),
# und danach kam keine Browser-Abnahme mehr durch: jede Anmeldung war ein 401,
# und jede Abnahme meldete daraufhin etwas ueber den MESSAUFBAU, das wie eine
# Aussage ueber das Geraet aussah. In G1 passiert der Reset mitten im Lauf.
#
# Der Administrator `admin` hat nach dem Reset ein Startpasswort, das nur in
# der Erstausgabe am Geraet steht; die Abnahmen kennen es nicht und sollen es
# nicht kennen. Ueber die Schnittstelle laesst sich ohne ihn niemand anlegen.
# Was bleibt, ist der Weg AM GERAET: die Datenbank selbst, mit einem Hash aus
# demselben `bcrypt`, das das Backend benutzt (`utils/password.js`, zwoelf
# Runden). Genau das tut diese Datei, und nur das.
#
# IDEMPOTENT. Ein zweiter Aufruf legt nichts doppelt an: `ON CONFLICT
# (username) DO UPDATE` setzt das Passwort neu, macht den Menschen zum
# Administrator, aktiv, entsperrt, und nimmt ihm das Kennzeichen
# `passwort_vom_admin` (Migration 178), sonst verlangte die Oberflaeche beim
# ersten Anmelden einen Wechsel, und die Abnahmen messen etwas anderes. Die
# Meldung sagt, was passiert ist: `angelegt` oder `aktualisiert`.
#
# WO ES LAEUFT. Steht der Container `dashboard-backend` hier (Aufruf auf dem
# Geraet), wird er direkt gefragt; sonst geht alles ueber `ssh $ARASUL_GERAET`
# (Voreinstellung `jetson`, derselbe Name wie im Tunnel-Hinweis von
# `abnahmen.sh`). Das Passwort geht in beiden Faellen ueber STDIN und nie ueber
# die Befehlszeile: `ps` sieht es dann nicht.
#
#   ARASUL_BENUTZER=pruefer ARASUL_PASSWORT=... bash scripts/util/pruefbenutzer.sh
#
# Umgebung: ARASUL_BENUTZER (Voreinstellung pruefer), ARASUL_PASSWORT (Pflicht),
# ARASUL_GERAET (ssh-Ziel, Voreinstellung jetson), CONTAINER_PREFIX.
# Rueckgabe 0, wenn der Benutzer danach da ist und das Passwort traegt.
# =============================================================================
set -uo pipefail

BENUTZER="${ARASUL_BENUTZER:-pruefer}"
PASSWORT="${ARASUL_PASSWORT:-}"
GERAET="${ARASUL_GERAET:-jetson}"
PREFIX="${CONTAINER_PREFIX:-}"

if [ -z "$PASSWORT" ]; then
  echo "pruefbenutzer: ARASUL_PASSWORT fehlt. Ohne Passwort gibt es nichts anzulegen." >&2
  exit 2
fi
# Der Name steht gleich in einer SQL-Zeile. Ein Name, der nicht aus Buchstaben,
# Ziffern, Punkt, Strich und Unterstrich besteht, ist kein Name, sondern ein
# Versuch, und wird nicht angefasst.
if ! [[ "$BENUTZER" =~ ^[A-Za-z0-9._-]{1,50}$ ]]; then
  echo "pruefbenutzer: '$BENUTZER' ist kein zulaessiger Benutzername." >&2
  exit 2
fi

# Was am Geraet laeuft. Liest das Passwort als erste Zeile von STDIN, hasht es
# im Backend-Container (dort liegt das bcrypt, das das Backend selbst benutzt)
# und schreibt die Zeile in die Datenbank. Erwartet BENUTZER und PREFIX in der
# Umgebung.
AM_GERAET='
set -uo pipefail
IFS= read -r PASSWORT || { echo "pruefbenutzer: kein Passwort auf STDIN." >&2; exit 2; }
BACKEND="${PREFIX}dashboard-backend"
DB="${PREFIX}postgres-db"
for c in "$BACKEND" "$DB"; do
  if [ "$(docker inspect -f "{{.State.Running}}" "$c" 2>/dev/null)" != "true" ]; then
    echo "pruefbenutzer: der Container $c laeuft hier nicht." >&2
    exit 3
  fi
done
HASH=$(printf "%s" "$PASSWORT" | docker exec -i "$BACKEND" node -e "
  let s = \"\";
  process.stdin.on(\"data\", d => { s += d; }).on(\"end\", async () => {
    process.stdout.write(await require(\"bcrypt\").hash(s, 12));
  });
")
case "$HASH" in
  \$2*) ;;
  *) echo "pruefbenutzer: kein Hash aus dem Backend-Container (${HASH:0:80})." >&2; exit 4 ;;
esac
ERGEBNIS=$(docker exec -i "$DB" psql -U arasul -d arasul_db -tA -v ON_ERROR_STOP=1 <<SQL
INSERT INTO admin_users (username, password_hash, email, role, is_active,
                         passwort_vom_admin, login_attempts, locked_until,
                         created_at, updated_at)
VALUES (\x27$BENUTZER\x27, \x27$HASH\x27, \x27$BENUTZER@abnahme.local\x27, \x27admin\x27,
        true, false, 0, NULL, NOW(), NOW())
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = \x27admin\x27,
  is_active = true,
  passwort_vom_admin = false,
  login_attempts = 0,
  locked_until = NULL,
  updated_at = NOW()
RETURNING CASE WHEN xmax = 0 THEN \x27angelegt\x27 ELSE \x27aktualisiert\x27 END;
SQL
)
# Die ERSTE Zeile ist die Antwort, die zweite ist psqls Quittung. `RETURNING`
# gibt die Zeile aus, danach schreibt psql den Befehlsanhang `INSERT 0 1` --
# auch mit `-tA`, denn der Anhang ist keine Zeile des Ergebnisses. Der
# Vergleich unten sah beides als einen Text und meldete den gelungenen Anlauf
# als Fehler: "hat nicht geantwortet, wie erwartet (angelegt INSERT 0 1)". Der
# Benutzer war da, das Skript sagte nein, und der Aufrufer versuchte es nicht
# noch einmal.
ANTWORT=$(printf "%s\n" "$ERGEBNIS" | head -n1)
case "$ANTWORT" in
  angelegt|aktualisiert)
    echo "pruefbenutzer: Benutzer $BENUTZER $ANTWORT (Administrator, aktiv, eigenes Passwort)."
    ;;
  *)
    echo "pruefbenutzer: die Datenbank hat nicht geantwortet, wie erwartet (${ERGEBNIS:0:120})." >&2
    exit 5
    ;;
esac
'
# `\x27` statt eines Apostrophs: der Text oben steht selbst in Apostrophen.
#
# UND DER ERSATZ STEHT IN EINER VARIABLEN, nicht als `\'` in der Ersetzung.
# `"${x//\\x27/\'}"` sieht richtig aus und ist es nicht: der Text steht in
# doppelten Anfuehrungszeichen, dort ist ein Backslash vor einem Apostroph
# nichts Besonderes, und bash setzt beide Zeichen ein. Aus `\x27pruefer\x27`
# wurde damit `\'pruefer\'`, psql bekam `\'pruefer` zu sehen und antwortete
# "invalid command \'pruefer" -- auf beiden Wegen, am Geraet wie ueber ssh.
# Gefunden beim ersten Aufruf, der wirklich einen Benutzer anlegen sollte
# (28.08.2026, Phase G1); der Selbsttest kannte bis dahin nur den Weg, auf dem
# das Geraet gar nicht antwortet.
APOSTROPH=\'
AM_GERAET="${AM_GERAET//\\x27/$APOSTROPH}"

if [ "$(docker inspect -f '{{.State.Running}}' "${PREFIX}dashboard-backend" 2>/dev/null)" = "true" ]; then
  printf '%s\n' "$PASSWORT" | BENUTZER="$BENUTZER" PREFIX="$PREFIX" bash -c "$AM_GERAET"
else
  echo "pruefbenutzer: kein Container hier, gehe ueber ssh $GERAET."
  printf '%s\n' "$PASSWORT" | ssh -o BatchMode=yes -o ConnectTimeout=15 "$GERAET" \
    "BENUTZER=$(printf '%q' "$BENUTZER") PREFIX=$(printf '%q' "$PREFIX") bash -c $(printf '%q' "$AM_GERAET")"
fi
