#!/bin/bash
# =============================================================================
# Der Schluessel, mit dem das Ara-Kit auf dieses Geraet rollt (Phase C5)
# =============================================================================
# Ein Partner, der eine App auf ein Geraet bringt, braucht genau einen
# Berechtigungsnachweis: einen API-Schluessel mit dem Bereich `app:deploy`.
# Kein Passwort, kein SSH-Zugang, keine Sitzung. Er steht in derselben Tabelle
# wie jeder andere Schluessel (`api_keys`), gehoert dem Administrator und ist
# von ihm jederzeit widerrufbar.
#
# WARUM DIESES SKRIPT UND NICHT DIE SCHNITTSTELLE: `POST /api/v1/external/api-keys`
# gibt es, aber es verlangt eine angemeldete Sitzung. Der Installer hat keine --
# er hat das Geraet gerade erst hochgefahren. Dieses Skript geht deshalb den
# kurzen Weg: es laesst den Backend-Container selbst einen Schluessel anlegen,
# mit seiner eigenen Datenbankverbindung und derselben Funktion
# (`middleware/apiKeyAuth.js`), die auch die Schnittstelle ruft. Eine zweite
# Art, Schluessel zu erzeugen, gibt es damit nicht.
#
# DER KLARTEXT ERSCHEINT GENAU EINMAL. In der Datenbank steht nur der
# bcrypt-Abdruck. Wer ihn verliert, legt einen neuen an und widerruft den
# alten; ihn nachzuschlagen geht nicht, und das ist der Sinn der Sache.
#
# LAEUFT AUF DEM GERAET:
#   ssh jetson
#   cd ~/arasul/arasul-jet
#   bash scripts/util/kit-schluessel.sh anlegen "Kit von Firma Meier"
#   bash scripts/util/kit-schluessel.sh liste
#   bash scripts/util/kit-schluessel.sh widerrufen aras_ab12cd3
#
# Rueckgabe 0 bei Erfolg.
# =============================================================================
set -uo pipefail

CONTAINER="${ARASUL_BACKEND_CONTAINER:-dashboard-backend}"
BEFEHL="${1:-hilfe}"
NAME="${2:-Ara-Kit}"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Kein Container \"$CONTAINER\". Laeuft die Plattform? docker compose ps"
  exit 1
fi

# Das Programm laeuft IM Backend-Container: dort liegen die Zugangsdaten zur
# Datenbank und dort liegt der Quelltext, der Schluessel erzeugt. `node -e`
# bekommt es als Argument, damit es hier als lesbarer Text stehen kann und
# nicht als eine Zeile mit Semikolons.
lauf() {
  docker exec -i -e ARASUL_KIT_BEFEHL="$1" -e ARASUL_KIT_NAME="$2" -e ARASUL_KIT_ZIEL="${3:-}" \
    "$CONTAINER" node -e "$PROGRAMM"
}

read -r -d '' PROGRAMM <<'NODE'
const db = require('/app/apps/dashboard-backend/src/database');
const { generateApiKey } = require('/app/apps/dashboard-backend/src/middleware/apiKeyAuth');

const befehl = process.env.ARASUL_KIT_BEFEHL;
const name = process.env.ARASUL_KIT_NAME;
const ziel = process.env.ARASUL_KIT_ZIEL;

// Der Schluessel gehoert einem Menschen, naemlich dem Administrator. Ohne
// `created_by` koennte niemand ihn ueber die Schnittstelle wieder loswerden
// (`DELETE /api/v1/external/api-keys/:id` widerruft nur eigene), und ein
// Schluessel, den man nicht widerrufen kann, ist kein Schluessel, sondern eine
// Hintertuer.
async function administrator() {
  const { rows } = await db.query(
    "SELECT id, username FROM admin_users WHERE role = 'admin' AND is_active ORDER BY id LIMIT 1"
  );
  if (rows.length === 0) {
    throw new Error('Kein Administrator am Geraet. Erst das Geraet einrichten.');
  }
  return rows[0];
}

async function main() {
  if (befehl === 'anlegen') {
    const admin = await administrator();
    const { key, keyPrefix, keyId } = await generateApiKey(
      name,
      'Deploy-Schluessel fuer das Ara-Kit (app:deploy). Angelegt mit scripts/util/kit-schluessel.sh.',
      admin.id,
      { allowedEndpoints: ['app:deploy'], rateLimitPerMinute: 60 }
    );
    console.log('');
    console.log('  Schluessel  ' + key);
    console.log('  Praefix     ' + keyPrefix + '   (Nummer ' + keyId + ')');
    console.log('  Bereich     app:deploy');
    console.log('  Gehoert     ' + admin.username);
    console.log('');
    console.log('  Er erscheint genau EINMAL. Ins Kit eintragen, hier nicht aufheben.');
    console.log('');
    return;
  }

  if (befehl === 'liste') {
    const { rows } = await db.query(
      `SELECT id, key_prefix, name, created_at, last_used_at, is_active
         FROM public.api_keys
        WHERE 'app:deploy' = ANY(allowed_endpoints)
        ORDER BY created_at DESC`
    );
    if (rows.length === 0) {
      console.log('Kein Kit-Schluessel am Geraet.');
      return;
    }
    for (const z of rows) {
      console.log(
        [
          z.is_active ? 'gueltig  ' : 'widerrufen',
          String(z.id).padStart(4),
          z.key_prefix,
          (z.name || '').slice(0, 40).padEnd(40),
          'angelegt ' + new Date(z.created_at).toISOString().slice(0, 10),
          z.last_used_at ? 'zuletzt ' + new Date(z.last_used_at).toISOString().slice(0, 10) : 'nie benutzt',
        ].join('  ')
      );
    }
    return;
  }

  if (befehl === 'widerrufen') {
    // Nummer oder Praefix: der Mensch hat das eine oder das andere vor sich.
    const { rows } = await db.query(
      `UPDATE public.api_keys
          SET is_active = false
        WHERE 'app:deploy' = ANY(allowed_endpoints)
          AND (key_prefix = $1 OR id::text = $1)
      RETURNING id, key_prefix, name`,
      [ziel]
    );
    if (rows.length === 0) {
      throw new Error('Kein Kit-Schluessel mit "' + ziel + '". Erst: kit-schluessel.sh liste');
    }
    for (const z of rows) {
      console.log('widerrufen  ' + z.key_prefix + '  ' + (z.name || ''));
    }
    return;
  }

  throw new Error('Unbekannter Befehl: ' + befehl);
}

main()
  .then(() => process.exit(0))
  .catch(fehler => {
    console.error(fehler.message);
    process.exit(1);
  });
NODE

case "$BEFEHL" in
  anlegen)
    lauf anlegen "$NAME"
    ;;
  liste)
    lauf liste "$NAME"
    ;;
  widerrufen)
    if [ -z "${2:-}" ]; then
      echo "Aufruf: $0 widerrufen <praefix|nummer>"
      exit 2
    fi
    lauf widerrufen "$NAME" "$2"
    ;;
  *)
    cat <<'HILFE'
Aufruf:
  kit-schluessel.sh anlegen [Name]        einen Deploy-Schluessel erzeugen (erscheint einmal)
  kit-schluessel.sh liste                 alle Kit-Schluessel am Geraet
  kit-schluessel.sh widerrufen <praefix>  einen Schluessel entwerten

Der Schluessel geht in das Ara-Kit; damit rollt ein Partner eine App auf dieses
Geraet, ohne SSH und ohne Passwort. Was er darf, steht in docs/features/APP-PAKET.md.
HILFE
    exit 2
    ;;
esac
