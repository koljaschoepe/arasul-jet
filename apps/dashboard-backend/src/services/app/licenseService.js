/**
 * License Service — Hardware-bound offline license validation
 *
 * License keys are signed JWT-like tokens (actually signed JSON) containing:
 *   - customer name, hardware fingerprint, feature tier, expiry
 *
 * The hardware fingerprint is derived from stable machine identifiers
 * (machine-id, CPU serial, board model) so that a license is bound to
 * a specific Jetson device and cannot be transferred without re-issuance.
 *
 * All validation is offline — no phone-home required.
 *
 * OHNE GUELTIGE SIGNATUR BLEIBT JEDES GERAET `community` (Auftrag J32,
 * 17.09.2026). Bis dahin gab es einen Grace-Mode: fehlte der oeffentliche
 * Schluessel am Geraet, galt jede Lizenzdatei mit einem Punkt darin als
 * `professional` -- ohne Kryptographie. Und ein Geraet ohne
 * `public_license_key.pem` war der Normalfall, nicht die Ausnahme: der Orin
 * trug keinen, das Artefakt lieferte keinen, also vergab jedes so
 * installierte Geraet die bezahlte Stufe an jeden Admin, der eine beliebige
 * Zeichenkette mit einem Punkt aktivierte.
 *
 * Seither kommt der oeffentliche Schluessel mit dem Artefakt
 * (`config/public_license_key.pem`, per Compose nach
 * `/arasul/config/public_license_key.pem` gereicht), und fehlt er trotzdem,
 * ist das ein Fehler mit Grund und keine Freischaltung. Der private
 * Schluessel liegt nie im Repo und nie am Geraet. Eine Lizenz wird GEPRUEFT,
 * BEVOR sie auf die Platte kommt: was nicht besteht, hinterlaesst keine Datei.
 * Der Grace-Mode, der bleibt, ist ein anderer: eine abgelaufene Lizenz
 * laeuft `LICENSE_GRACE_PERIOD_DAYS` lang weiter -- geprueft, nur abgelaufen.
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const logger = require('../../utils/logger');

const execFileAsync = promisify(execFile);

// Die Lizenzdatei liegt in einem EIGENEN MOUNT (`data/lizenz`, J32 vom
// 23.09.2026). Bis dahin stand sie unter `/arasul/config/license.key`, und
// dieser Pfad war kein Mount, sondern das Dateisystem des Containers: eine
// eingespielte Lizenz ueberlebte kein neues Erzeugen des Containers, also
// keinen Deploy. Und weil das Backend als `node` laeuft und Docker
// `/arasul/config` als root anlegt, kam sie dort gar nicht erst hin.
const LICENSE_FILE = process.env.LICENSE_FILE || '/arasul/lizenz/license.key';
const LICENSE_PUBLIC_KEY =
  process.env.LICENSE_PUBLIC_KEY_PATH || '/arasul/config/public_license_key.pem';
// Die machine-id des HOSTS, per Compose nur lesbar hereingereicht (J32).
const MACHINE_ID_DATEI = process.env.LICENSE_MACHINE_ID_PATH || '/arasul/host/machine-id';
const GRACE_PERIOD_DAYS = parseInt(process.env.LICENSE_GRACE_PERIOD_DAYS || '30', 10);

/**
 * Was eine Lizenzstufe freischaltet.
 *
 * DER BESCHLUSS VOM 25.09.2026 (J35): `community` traegt drei Konten und drei
 * Apps, und beides ist durchgesetzt. Die bezahlte Stufe ist `professional`,
 * ohne Grenzen. `enterprise` nimmt das Geraet weiter an -- eine Lizenz, die so
 * signiert ist, soll nicht an einem Wort scheitern --, mit denselben Rechten.
 * Zwei Stufen mit verschiedenen Rechten waeren zwei Produkte, und verkauft
 * wird eines.
 *
 * Bis dahin stand hier `maxUsers` (community 1, professional 5), und kein
 * Aufruf pruefte es: jedes Geraet ohne Lizenz trug beliebig viele Konten.
 * Seither zaehlt `benutzerService.pruefeKontenGrenze` die AKTIVEN Konten --
 * der Administrator zaehlt mit, ein stillgelegtes nicht. Stilllegen ist der
 * Weg, einen Platz freizumachen, ohne jemandes Laeufe und Protokolle zu
 * loeschen.
 *
 * `maxApps` ZAEHLT JEDE EINGESPIELTE APP, Test- und Livestand zusammen
 * (Entscheidung Kolja vom 30.08.2026, `appStore.pruefeAppGrenze`). Eine App
 * belegt einen Platz, sobald sie am Geraet steht -- sie hat dort ein Image,
 * einen Container, eine Datenbank je Stand und einen Ordner, und das alles
 * kostet das Geraet, ob ein Mitarbeiter sie benutzt oder nicht.
 *
 * Die Zahlen hier sind die VORGABE der Stufe. Traegt die signierte Nutzlast
 * selbst `maxApps` oder `maxUsers`, gilt deren Zahl (J32 fuer `maxApps`, J35
 * fuer `maxUsers`, `_pruefeLizenz`).
 *
 * `community` ist die Stufe eines Geraets OHNE Lizenzdatei. Sie ist kein
 * Verkaufspaket, sondern der Zustand vor dem ersten Schluessel.
 */
const UNBEGRENZT = {
  maxUsers: -1,
  maxApps: -1,
  externalApi: true,
  customModels: true,
};
const FEATURE_TIERS = {
  community: {
    maxUsers: 3,
    maxApps: 3,
    externalApi: false,
    customModels: false,
    priority: 0,
  },
  professional: { ...UNBEGRENZT, priority: 1 },
  enterprise: { ...UNBEGRENZT, priority: 1 },
};

/**
 * Die Grenzen, die eine signierte Nutzlast selbst nennen darf. Jede ist eine
 * ganze Zahl ab 1 oder -1 fuer unbegrenzt; eine Null oder ein Bruch waere
 * eine Lizenz, die weniger erlaubt als gar keine.
 */
const GRENZEN_AUS_NUTZLAST = ['maxApps', 'maxUsers'];

class LicenseService {
  constructor() {
    this._cachedLicense = null;
    this._cacheExpiry = 0;
    this._cacheKennung = null;
    this._hardwareFingerprint = null;
  }

  /**
   * Generate a stable hardware fingerprint from machine identifiers.
   * Uses machine-id + CPU serial + board model, hashed to a fixed-length string.
   * Falls back gracefully when identifiers aren't available (dev machines).
   */
  async getHardwareFingerprint() {
    if (this._hardwareFingerprint) {
      return this._hardwareFingerprint;
    }

    const components = [];

    // 1. Machine ID (systemd) -- DIE DES HOSTS, nicht die des Containers.
    //
    // Im Container gibt es weder `/etc/machine-id` noch den Device-Tree noch
    // eine CPU-Seriennummer (am Orin 23.09.2026 gemessen). Bis dahin fiel der
    // Fingerabdruck deshalb IMMER auf Hostname und MAC zurueck -- und die MAC
    // wuerfelt Docker bei jedem neuen Container neu. Eine an das Geraet
    // gebundene Lizenz galt damit bis zum naechsten Deploy und danach als
    // "bound to a different device" (J32). Compose reicht die machine-id des
    // Hosts nur lesbar herein; `/etc/machine-id` bleibt als Rueckfall fuer
    // einen Dienst, der ohne Container laeuft.
    for (const pfad of [MACHINE_ID_DATEI, '/etc/machine-id']) {
      try {
        const machineId = (await fs.readFile(pfad, 'utf8')).trim();
        if (machineId) {
          components.push(`mid:${machineId}`);
          break;
        }
      } catch {
        /* not available */
      }
    }

    // 2. CPU serial (Jetson-specific, from /proc/cpuinfo)
    try {
      const cpuinfo = await fs.readFile('/proc/cpuinfo', 'utf8');
      const serialMatch = cpuinfo.match(/Serial\s*:\s*([0-9a-fA-F]+)/);
      if (serialMatch) {
        components.push(`cpu:${serialMatch[1]}`);
      }
    } catch {
      /* not available */
    }

    // 3. Board model (device-tree)
    try {
      const model = (await fs.readFile('/proc/device-tree/model', 'utf8'))
        .replace(/\0/g, '')
        .trim();
      if (model) {
        components.push(`model:${model}`);
      }
    } catch {
      /* not available */
    }

    // 4. Board serial (Jetson)
    try {
      const serial = (await fs.readFile('/proc/device-tree/serial-number', 'utf8'))
        .replace(/\0/g, '')
        .trim();
      if (serial) {
        components.push(`serial:${serial}`);
      }
    } catch {
      /* not available */
    }

    // Fallback: hostname + MAC address
    if (components.length === 0) {
      const os = require('os');
      components.push(`host:${os.hostname()}`);
      const interfaces = os.networkInterfaces();
      for (const iface of Object.values(interfaces)) {
        for (const addr of iface) {
          if (!addr.internal && addr.mac !== '00:00:00:00:00:00') {
            components.push(`mac:${addr.mac}`);
            break;
          }
        }
      }
    }

    const raw = components.sort().join('|');
    this._hardwareFingerprint = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
    return this._hardwareFingerprint;
  }

  /**
   * Read and validate the license file.
   * License format: base64(JSON payload) + '.' + base64(RSA signature)
   * @returns {{ valid: boolean, license?: object, error?: string, graceMode?: boolean }}
   */
  async validateLicense() {
    // DER CACHE HAENGT AN DER DATEI (J35). Bis dahin galt er fuenf Minuten
    // ohne Rueckfrage, und das war richtig, solange nur dieser Prozess die
    // Datei schrieb. Seither schreibt auch `scripts/util/lizenz-geraet.sh`
    // sie, in einem EIGENEN Prozess im selben Container -- und das Backend
    // meldete danach fuenf Minuten lang die alte Stufe und liess das vierte
    // Konto nicht zu, obwohl die Lizenz schon dalag. Ein `stat` je Aufruf
    // kostet nichts; die Kryptographie bleibt im Cache. Die fuenf Minuten
    // bleiben daneben, weil ein Ablaufdatum auch ohne neue Datei eintritt.
    const kennung = await this._dateiKennung();
    if (this._cachedLicense && Date.now() < this._cacheExpiry && this._cacheKennung === kennung) {
      return this._cachedLicense;
    }
    this._cacheKennung = kennung;

    let licenseData;
    try {
      licenseData = (await fs.readFile(LICENSE_FILE, 'utf8')).trim();
    } catch {
      return this._cacheResult({
        valid: false,
        error: 'No license file found',
        tier: 'community',
        features: FEATURE_TIERS.community,
      });
    }

    return this._cacheResult(await this._pruefeLizenz(licenseData));
  }

  /** Aenderungszeit und Groesse der Lizenzdatei, oder `fehlt`. */
  async _dateiKennung() {
    try {
      const st = await fs.stat(LICENSE_FILE);
      return `${st.mtimeMs}:${st.size}`;
    } catch {
      return 'fehlt';
    }
  }

  /**
   * Prueft eine Lizenz-Zeichenkette gegen den oeffentlichen Schluessel des
   * Geraets. Schreibt nichts und liest keinen Cache -- `validateLicense` und
   * `activateLicense` teilen sich diese eine Pruefung, damit eine Lizenz, die
   * nicht besteht, auch nie auf die Platte kommt.
   *
   * Jede Ablehnung nennt ihren Grund: die Meldung geht ueber
   * `POST /api/license/activate` als 400 an den Menschen, der den Schluessel
   * eingegeben hat.
   */
  async _pruefeLizenz(licenseData) {
    const abgelehnt = (error, extra = {}) => ({
      valid: false,
      error,
      tier: 'community',
      features: FEATURE_TIERS.community,
      ...extra,
    });

    try {
      // Parse license: payload.signature
      const parts = licenseData.split('.');
      if (parts.length !== 2) {
        return abgelehnt(
          'Die Lizenz hat nicht die Form <Nutzlast>.<Signatur>. Das Geraet bleibt community.'
        );
      }

      const [payloadB64, signatureB64] = parts;
      const payloadBuffer = Buffer.from(payloadB64, 'base64');
      const signature = Buffer.from(signatureB64, 'base64');

      // Ohne oeffentlichen Schluessel gibt es keine Pruefung, und ohne
      // Pruefung keine Stufe. Kein Grace-Mode: der war die Freischaltung
      // fuer jeden, der einen Punkt tippen kann (J32).
      let publicKey;
      try {
        publicKey = await fs.readFile(LICENSE_PUBLIC_KEY, 'utf8');
      } catch {
        logger.warn(
          `Oeffentlicher Lizenzschluessel fehlt (${LICENSE_PUBLIC_KEY}); Geraet bleibt community`
        );
        return abgelehnt(
          `Der oeffentliche Lizenzschluessel fehlt am Geraet (${LICENSE_PUBLIC_KEY}). ` +
            'Ohne ihn laesst sich keine Lizenz pruefen; das Geraet bleibt community.'
        );
      }

      const isValid = crypto.verify(
        'sha256',
        payloadBuffer,
        { key: publicKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
        signature
      );

      if (!isValid) {
        return abgelehnt(
          'Die Signatur der Lizenz ist ungueltig: sie stammt nicht vom Lizenzschluessel ' +
            'dieses Produkts. Das Geraet bleibt community.'
        );
      }

      // Parse payload
      const license = JSON.parse(payloadBuffer.toString('utf8'));

      // Check hardware fingerprint
      const fingerprint = await this.getHardwareFingerprint();
      if (license.hardware_id && license.hardware_id !== fingerprint) {
        return abgelehnt('License is bound to a different device', {
          expectedDevice: license.hardware_id,
          currentDevice: fingerprint,
        });
      }

      // Check expiry
      const now = new Date();
      const expiresAt = new Date(license.expires_at);
      const graceDeadline = new Date(expiresAt.getTime() + GRACE_PERIOD_DAYS * 86400_000);

      if (now > graceDeadline) {
        return abgelehnt(
          `License expired on ${expiresAt.toISOString().split('T')[0]} (grace period ended)`,
          { expiredAt: license.expires_at }
        );
      }

      const tier = license.tier || 'professional';
      if (!Object.prototype.hasOwnProperty.call(FEATURE_TIERS, tier)) {
        return abgelehnt(
          `Die Lizenz nennt die Stufe "${tier}", die dieses Geraet nicht kennt ` +
            `(bekannt: ${Object.keys(FEATURE_TIERS).join(', ')}). Das Geraet bleibt community.`
        );
      }

      // DIE GRENZEN AUS DER NUTZLAST (`maxApps` seit J32, `maxUsers` seit
      // J35). Die Stufe gibt die Vorgabe, die signierte Lizenz darf die Zahl
      // selbst nennen -- sonst kennte die bezahlte Stufe nur -1, und ob eine
      // Lizenz eine Grenze wirklich hebt, liesse sich nie von oben messen. Die
      // Zahl ist unterschrieben wie alles andere darin.
      const features = { ...FEATURE_TIERS[tier] };
      for (const schluessel of GRENZEN_AUS_NUTZLAST) {
        if (license[schluessel] === undefined) {
          continue;
        }
        const zahl = license[schluessel];
        if (!Number.isInteger(zahl) || (zahl < 1 && zahl !== -1)) {
          return abgelehnt(
            `Die Lizenz nennt ${schluessel} ${JSON.stringify(zahl)}; erlaubt ist eine ganze ` +
              'Zahl ab 1 oder -1 fuer unbegrenzt. Das Geraet bleibt community.'
          );
        }
        features[schluessel] = zahl;
      }

      const isExpired = now > expiresAt;

      return {
        valid: true,
        graceMode: isExpired,
        tier,
        features,
        customer: license.customer,
        issuedAt: license.issued_at,
        expiresAt: license.expires_at,
        daysRemaining: isExpired
          ? -Math.ceil((now - expiresAt) / 86400_000)
          : Math.ceil((expiresAt - now) / 86400_000),
        warning: isExpired
          ? `License expired, grace period ends ${graceDeadline.toISOString().split('T')[0]}`
          : undefined,
      };
    } catch (error) {
      logger.error(`License validation error: ${error.message}`);
      return abgelehnt(error.message);
    }
  }

  /**
   * Check if a specific feature is allowed by the current license.
   * @param {string} feature - Feature key from FEATURE_TIERS
   * @returns {Promise<boolean>}
   */
  async isFeatureAllowed(feature) {
    const result = await this.validateLicense();
    if (!result.valid && !result.graceMode) {
      return false;
    }
    return !!result.features[feature];
  }

  /**
   * Check if a numeric limit is exceeded.
   * @param {string} limitKey - Key from FEATURE_TIERS (e.g., 'maxUsers')
   * @param {number} currentCount - Current count
   * @returns {Promise<{ allowed: boolean, limit: number, current: number }>}
   */
  async checkLimit(limitKey, currentCount) {
    const result = await this.validateLicense();
    const limit = result.features[limitKey];
    if (limit === undefined) {
      return { allowed: true, limit: -1, current: currentCount };
    }
    if (limit === -1) {
      return { allowed: true, limit: -1, current: currentCount };
    }
    return { allowed: currentCount < limit, limit, current: currentCount };
  }

  /**
   * Activate a license key: erst pruefen, dann schreiben.
   *
   * Bis J32 stand die Reihenfolge andersherum -- jede Zeichenkette zwischen
   * 10 und 4096 Zeichen kam roh auf die Platte und wurde bei Ablehnung wieder
   * geloescht. Was nicht besteht, hinterlaesst jetzt nichts, und die
   * Lizenz, die vorher galt, bleibt liegen.
   * @param {string} licenseKey - The license key string
   * @returns {{ success: boolean, license?: object, error?: string }}
   */
  async activateLicense(licenseKey) {
    const result = await this._pruefeLizenz(licenseKey.trim());
    if (!result.valid && !result.graceMode) {
      return { success: false, error: result.error };
    }

    const dir = path.dirname(LICENSE_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(LICENSE_FILE, licenseKey.trim(), 'utf8');
    this._cacheKennung = await this._dateiKennung();
    this._cacheResult(result);

    logger.info(`License activated: tier=${result.tier}, customer=${result.customer}`);
    return { success: true, license: result };
  }

  /**
   * Nimmt die Lizenz vom Geraet: die Datei faellt, der Cache auch, und das
   * Geraet steht danach auf `community`. Der Weg zurueck fuer eine
   * Testlizenz (J32) -- und fuer einen Menschen, der eine falsche Lizenz
   * eingespielt hat. Ohne Datei ist das kein Fehler: das Ergebnis ist
   * dasselbe.
   * @returns {Promise<{ entfernt: boolean, license: object }>}
   */
  async deactivateLicense() {
    let entfernt = true;
    try {
      await fs.unlink(LICENSE_FILE);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      entfernt = false;
    }
    this._cachedLicense = null;
    this._cacheExpiry = 0;
    this._cacheKennung = null;
    const license = await this.validateLicense();
    logger.info(`License removed (file present: ${entfernt}); tier now ${license.tier}`);
    return { entfernt, license };
  }

  /**
   * Get license info for display (safe, no secrets).
   */
  async getLicenseInfo() {
    const fingerprint = await this.getHardwareFingerprint();
    const license = await this.validateLicense();

    return {
      ...license,
      hardwareFingerprint: fingerprint,
      featureTiers: Object.keys(FEATURE_TIERS),
    };
  }

  /**
   * Was die Lizenz traegt und was davon belegt ist: die eine Antwort fuer die
   * Seite Lizenz in den Einstellungen und fuer `lizenz-geraet.sh status`
   * (J35). Dieselben Zaehlungen wie die beiden Riegel -- aktive Konten
   * (`benutzerService.pruefeKontenGrenze`), jede Zeile in `apps`
   * (`appStore.pruefeAppGrenze`); eine Anzeige, die anders zaehlt als der
   * Riegel, zeigt "2 von 3" und weist trotzdem ab.
   *
   * `db` wird erst hier geholt: der Dienst selbst laeuft auch ohne Datenbank
   * (`scripts/test/lizenz-signatur.js` misst ihn in einem Wegwerfordner).
   * @returns {Promise<{stufe: string, konten: {belegt: number, grenze: number},
   *   apps: {belegt: number, grenze: number}}>} -1 heisst unbegrenzt
   */
  async nutzung() {
    const db = require('../../database');
    const lizenz = await this.validateLicense();
    const [konten, apps] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS n FROM public.admin_users WHERE is_active = true'),
      db.query('SELECT COUNT(*)::int AS n FROM public.apps'),
    ]);
    return {
      stufe: lizenz.tier,
      konten: { belegt: konten.rows[0].n, grenze: lizenz.features.maxUsers },
      apps: { belegt: apps.rows[0].n, grenze: lizenz.features.maxApps },
    };
  }

  /** Cache result for 5 minutes */
  _cacheResult(result) {
    this._cachedLicense = result;
    this._cacheExpiry = Date.now() + 300_000;
    return result;
  }
}

module.exports = new LicenseService();
module.exports.FEATURE_TIERS = FEATURE_TIERS;
