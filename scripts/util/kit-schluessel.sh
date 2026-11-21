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
#   bash scripts/util/kit-schluessel.sh anlegen "Update 0.8.15" system:update
#   bash scripts/util/kit-schluessel.sh anlegen "Rueckmeldungen" feedback:agent
#   bash scripts/util/kit-schluessel.sh liste
#   bash scripts/util/kit-schluessel.sh widerrufen aras_ab12cd3
#
# DER ZWEITE BEREICH (J39): `system:update` erlaubt, DIESES GERAET auf eine neue
# Fassung zu bringen (`/api/v1/external/update`). Er steht in einem eigenen
# Schluessel und nie im Deploy-Schluessel des Kits: wer eine App einspielen
# darf, darf damit nicht das ganze Geraet austauschen. Der Schluessel dafuer
# wird fuer den Anlass angelegt und danach widerrufen.
#
# DER DRITTE BEREICH (J43): `feedback:agent` liest die Rueckmeldungen einer App
# und setzt ihren Stand (`/api/v1/external/apps/:id/rueckmeldungen`). Ebenfalls
# ein eigener Schluessel: wer ausrollen darf, liest damit keine Meldungen.
#
# EINE LISTE DER BEREICHE (21.11.2026): `liste` und `widerrufen` kannten bis
# dahin nur `app:deploy` und `system:update`. Ein Schluessel mit
# `feedback:agent` liess sich anlegen, aber weder sehen noch widerrufen (Fund
# aus Kit-PR 120). Seitdem lesen Pruefung, Liste und Widerruf dieselbe Zeile
# `KIT_BEREICHE`; ein vierter Bereich wird dort eingetragen und sonst nirgends.
#
# Rueckgabe 0 bei Erfolg.
# =============================================================================
set -uo pipefail

CONTAINER="${ARASUL_BACKEND_CONTAINER:-dashboard-backend}"
BEFEHL="${1:-hilfe}"
NAME="${2:-Ara-Kit}"
BEREICH="${3:-app:deploy}"

# Die Bereiche, die dieses Skript anlegt, zeigt und widerruft. Nur hier.
KIT_BEREICHE="app:deploy system:update feedback:agent"

case " $KIT_BEREICHE " in
  *" $BEREICH "*) ;;
  *)
    echo "Unbekannter Bereich: $BEREICH (erlaubt: ${KIT_BEREICHE// /, })"
    exit 2
    ;;
esac

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
    -e ARASUL_KIT_BEREICH="$BEREICH" -e ARASUL_KIT_BEREICHE="$KIT_BEREICHE" \
    "$CONTAINER" node -e "$PROGRAMM"
}

read -r -d '' PROGRAMM <<'NODE'
// Der Quelltext liegt im Container unter /app; ARASUL_KIT_QUELLE gibt es nur
// fuer den Test (`__tests__/unit/kitSchluesselSkript.test.js`).
const quelle = process.env.ARASUL_KIT_QUELLE || '/app/apps/dashboard-backend/src';
const db = require(quelle + '/database');
const { generateApiKey } = require(quelle + '/middleware/apiKeyAuth');
const bereiche = (process.env.ARASUL_KIT_BEREICHE || 'app:deploy').split(' ').filter(Boolean);

const befehl = process.env.ARASUL_KIT_BEFEHL;
const name = process.env.ARASUL_KIT_NAME;
const ziel = process.env.ARASUL_KIT_ZIEL;
const bereich = process.env.ARASUL_KIT_BEREICH || 'app:deploy';

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
      'Schluessel fuer das Ara-Kit (' + bereich + '). Angelegt mit scripts/util/kit-schluessel.sh.',
      admin.id,
      { allowedEndpoints: [bereich], rateLimitPerMinute: 60 }
    );
    console.log('');
    console.log('  Schluessel  ' + key);
    console.log('  Praefix     ' + keyPrefix + '   (Nummer ' + keyId + ')');
    console.log('  Bereich     ' + bereich);
    console.log('  Gehoert     ' + admin.username);
    console.log('');
    console.log('  Er erscheint genau EINMAL. Ins Kit eintragen, hier nicht aufheben.');
    console.log('');
    return;
  }

  // Datum UND Uhrzeit, in der Ortszeit des Geraets.
  //
  // Der zweite Fremdtest am 29.08.2026 fand acht gueltige Kit-Schluessel auf
  // einem Orin, drei davon mit demselben Namen und alle mit demselben Datum:
  // welcher davon der eigene war, sagte die Liste nicht. Die Uhrzeit sagt es.
  // Ortszeit und nicht UTC, weil der Mensch davorsteht und weil die ISO-Form
  // nach 22 Uhr sogar den falschen Tag nannte.
  const wann = wert => new Date(wert).toLocaleString('sv-SE').slice(0, 16);

  if (befehl === 'liste') {
    const { rows } = await db.query(
      `SELECT id, key_prefix, name, created_at, last_used_at, is_active, allowed_endpoints
         FROM public.api_keys
        WHERE allowed_endpoints && $1::text[]
        ORDER BY created_at DESC`,
      [bereiche]
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
          (z.allowed_endpoints || []).filter(e => bereiche.includes(e)).join(',').padEnd(14),
          (z.name || '').slice(0, 40).padEnd(40),
          'angelegt ' + wann(z.created_at),
          z.last_used_at ? 'zuletzt ' + wann(z.last_used_at) : 'nie benutzt',
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
        WHERE allowed_endpoints && $2::text[]
          AND (key_prefix = $1 OR id::text = $1)
      RETURNING id, key_prefix, name`,
      [ziel, bereiche]
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
  kit-schluessel.sh anlegen [Name] [Bereich]
                                          einen Schluessel erzeugen (erscheint einmal);
                                          Bereich app:deploy (Vorgabe), system:update
                                          oder feedback:agent
  kit-schluessel.sh liste                 alle Kit-Schluessel am Geraet, jeder Bereich
  kit-schluessel.sh widerrufen <praefix>  einen Schluessel entwerten

Der Schluessel geht in das Ara-Kit; damit rollt ein Partner eine App auf dieses
Geraet, ohne SSH und ohne Passwort. Was er darf, steht in docs/features/APP-PAKET.md.
HILFE
    exit 2
    ;;
esac
