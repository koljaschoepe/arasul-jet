'use strict';

const fs = require('fs');

/**
 * Resolve Docker secrets from _FILE environment variables.
 *
 * For each variable name, checks if VAR_FILE exists and points to a readable file.
 * If so, reads the file content and sets process.env[VAR] to that value.
 * This allows all existing code to keep using process.env.VAR unchanged.
 */
function resolveSecrets() {
  // `FIRMENORDNER_ADMIN_PASSWORT` steht seit dem 22.09.2026 dabei (J33): das
  // Backend meldet sich damit an der Graph-API des Dateidienstes an. Es kommt
  // aus derselben Datei, die der Dienst selbst liest -- ein Geheimnis, ein
  // Ort. Fehlt die Datei (Geraet ohne Firmenordner), bleibt der Wert leer und
  // `ordnerdienst.istAn()` sagt Nein.
  const vars = ['POSTGRES_PASSWORD', 'JWT_SECRET', 'ADMIN_PASSWORD', 'FIRMENORDNER_ADMIN_PASSWORT'];

  for (const name of vars) {
    const filePath = process.env[`${name}_FILE`];
    if (filePath && fs.existsSync(filePath)) {
      process.env[name] = fs.readFileSync(filePath, 'utf8').trim();
    }
  }
}

module.exports = resolveSecrets;
