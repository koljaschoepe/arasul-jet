/**
 * Update Service - Core update orchestration
 * Handles signature verification, backup, update application, and rollback
 */

const fs = require('fs').promises;
const path = require('path');
const {
  versionFuerVergleich,
  versionBekannt,
  istReleaseNummer,
} = require('../../utils/version');
const { execFile } = require('child_process');
const { promisify } = require('util');
const logger = require('../../utils/logger');
const db = require('../../database');
const { spawnFromFile } = require('../../utils/processHelpers');
const { verifySignature } = require('./updateSignatureService');

const execFileAsync = promisify(execFile);

const axios = require('axios');

const UPDATE_STATE_FILE = '/arasul/updates/update_state.json';
const UPDATES_DIR = '/arasul/updates';
const UPDATE_SERVER_URL = process.env.UPDATE_SERVER_URL || 'https://updates.arasul.de';
const UPDATE_CHANNEL = process.env.UPDATE_CHANNEL || 'stable';

class UpdateService {
  constructor() {
    this.currentUpdate = null;
    this.updateInProgress = false;
  }

  /**
   * Verify digital signature of update package (delegated to updateSignatureService)
   */
  verifySignature(updateFilePath, signatureFilePath) {
    return verifySignature(updateFilePath, signatureFilePath);
  }

  /**
   * Extract manifest from update package
   */
  async extractManifest(updateFilePath) {
    try {
      const tempDir = path.join('/tmp', `update_extract_${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });

      // SECURITY: Use execFile with array args to prevent shell injection
      try {
        await execFileAsync('tar', ['-xzf', updateFilePath, '-C', tempDir, 'manifest.json']);
      } catch (tarError) {
        try {
          await execFileAsync('unzip', ['-j', updateFilePath, 'manifest.json', '-d', tempDir]);
        } catch (zipError) {
          throw new Error('Failed to extract manifest from update package');
        }
      }

      const manifestPath = path.join(tempDir, 'manifest.json');
      const manifestData = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestData);

      // Cleanup temp dir
      await fs.rm(tempDir, { recursive: true, force: true });

      return manifest;
    } catch (error) {
      logger.error(`Manifest extraction failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate update package
   */
  async validateUpdate(updateFilePath) {
    try {
      // 1. Check if signature file exists
      const signatureFilePath = `${updateFilePath}.sig`;
      try {
        await fs.access(signatureFilePath);
      } catch (error) {
        return { valid: false, error: 'Signature file not found' };
      }

      // 2. Verify signature
      const signatureResult = await this.verifySignature(updateFilePath, signatureFilePath);
      if (!signatureResult.valid) {
        return signatureResult;
      }

      // 3. Extract and validate manifest
      const manifest = await this.extractManifest(updateFilePath);

      if (!manifest.version || !manifest.min_version || !manifest.components) {
        return { valid: false, error: 'Invalid manifest structure' };
      }

      // 4. Kennt dieses Geraet seine eigene Fassung?
      //
      // Wenn nicht, laesst sich NICHTS ueber die Vertraeglichkeit sagen, und
      // das muss so dastehen. Bis zum 27.08.2026 rechnete diese Pruefung
      // stillschweigend mit `0.0.0` weiter und antwortete „Current version
      // 0.0.0 is below minimum required version 1.0.0". Wer das liest, sucht
      // den Fehler im Paket -- der Fehler ist aber, dass das Geraet keine
      // Fassung traegt. `SYSTEM_VERSION` setzt der Bau (Phase C10).
      if (!versionBekannt()) {
        return {
          valid: false,
          error:
            'Dieses Geraet kennt seine eigene Fassung nicht (SYSTEM_VERSION ist nicht gesetzt). ' +
            `Ob ${manifest.version} dazu passt, laesst sich damit nicht entscheiden -- ` +
            'weder ob es neuer ist noch ob die verlangte Mindestfassung ' +
            `(${manifest.min_version}) erreicht ist. Die Fassung kommt aus dem Bau; ` +
            'bis dahin wird an diesem Geraet nicht ueber die Schnittstelle aktualisiert.',
          versionBekannt: false,
        };
      }

      // 5. Traegt dieses Geraet eine Release-Nummer?
      //
      // Der Bau kennt zwei Formen (Phase C10): `1.2.0` aus einem Tag und
      // `JJJJMMTT-<sha>` von jedem Stand ohne Tag -- also von jedem Geraet, das
      // seinen Stand ueber den Deploy bekommt. Die zweite laesst sich nicht
      // vergleichen, und `compareVersions` warf dabei „Invalid version format:
      // 20260827-a1b2c3d". Wer das liest, sucht den Fehler im Paket.
      const currentVersion = versionFuerVergleich();

      if (!istReleaseNummer(currentVersion)) {
        return {
          valid: false,
          error:
            `Dieses Geraet traegt die Fassung ${currentVersion} aus dem Bau, keine ` +
            `Release-Nummer. Ob ${manifest.version} neuer ist, laesst sich damit nicht ` +
            'entscheiden. Pakete gelten fuer ausgelieferte Staende; dieses Geraet ' +
            'aktualisiert ueber den Deploy (scripts/deploy/deploy-local.sh).',
          versionBekannt: true,
        };
      }

      if (!istReleaseNummer(manifest.version) || !istReleaseNummer(manifest.min_version)) {
        return {
          valid: false,
          error:
            `Das Paket nennt die Fassungen ${manifest.version} / ${manifest.min_version}; ` +
            'erwartet wird je eine Release-Nummer der Form X.Y.Z.',
        };
      }

      if (this.compareVersions(manifest.version, currentVersion) <= 0) {
        return {
          valid: false,
          error: `Update version ${manifest.version} is not newer than current version ${currentVersion}`,
        };
      }

      if (this.compareVersions(currentVersion, manifest.min_version) < 0) {
        return {
          valid: false,
          error: `Current version ${currentVersion} is below minimum required version ${manifest.min_version}`,
        };
      }

      logger.info(`Update validation successful: ${manifest.version}`);
      return { valid: true, manifest };
    } catch (error) {
      logger.error(`Update validation error: ${error.message}`);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Kann dieses Geraet ein Paket ueberhaupt einspielen?
   *
   * Die Frage muss VOR der ersten Aenderung beantwortet werden, und bis zum
   * 27.08.2026 wurde sie nie gestellt. `loadDockerImages` und `updateServices`
   * rufen `docker` und `docker-compose` als PROGRAMME auf; im Backend-Image
   * gibt es beide nicht (`apk add git tzdata`, siehe Dockerfile). Der Aufruf
   * scheitert mit ENOENT -- aber erst nach der Sicherung, mitten im Lauf, und
   * `POST /api/update/apply` hatte da laengst `started` geantwortet.
   *
   * Ein Weg, der nicht gehen kann, sagt das jetzt vorher. Was am Geraet
   * WIRKLICH aktualisiert, ist der GitOps-Deploy (`.github/workflows/deploy.yml`
   * -> `scripts/deploy/deploy-local.sh`) beziehungsweise `./arasul update`.
   *
   * @returns {Promise<{moeglich: boolean, grund: string|null}>}
   */
  async wegPruefen() {
    try {
      await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}']);
    } catch (fehler) {
      const warum =
        fehler.code === 'ENOENT'
          ? 'im Backend-Container gibt es kein `docker`-Programm'
          : `docker antwortet nicht (${fehler.message})`;
      return {
        moeglich: false,
        grund:
          `Ein Paket laesst sich an diesem Geraet nicht ueber die Schnittstelle einspielen: ${warum}. ` +
          'Aktualisiert wird ueber den Deploy (scripts/deploy/deploy-local.sh) oder `./arasul update` ' +
          'am Geraet selbst. Pruefen und Herunterladen eines Pakets geht hier weiterhin.',
      };
    }
    return { moeglich: true, grund: null };
  }

  /**
   * Die Sicherung vor der Aktualisierung.
   *
   * Sie geht seit Phase C9 durch DENSELBEN Weg wie jede andere Sicherung
   * (`services/betrieb/sicherungsdienst.js` -> `backup.sh` im
   * Sicherungs-Container). Vorher stand hier eine zweite, eigene Fassung:
   * `docker exec postgres-db pg_dump` in einen Ordner unter `/arasul/backups`
   * -- ein Programm, das es im Container nicht gibt, in einen Ordner, der
   * nur-lesend eingehaengt ist. Sie hat nie funktioniert, und sie sicherte
   * ausserdem weder die Pakete der Apps noch die Flows.
   */
  async createBackup() {
    const sicherungsdienst = require('../betrieb/sicherungsdienst');
    const ergebnis = await sicherungsdienst.sichereJetzt();
    if (!ergebnis.erfolg) {
      return { success: false, error: ergebnis.ausgabe || 'Sicherung fehlgeschlagen' };
    }
    logger.info('Sicherung vor der Aktualisierung liegt vor');
    return { success: true, bericht: ergebnis.bericht };
  }

  /**
   * Load Docker images from update package
   */
  async loadDockerImages(updateFilePath, manifest) {
    try {
      const tempDir = path.join('/tmp', `update_images_${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });

      logger.info('Extracting Docker images from update package...');

      // SECURITY: Use execFile with array args to prevent shell injection
      await execFileAsync('tar', ['-xzf', updateFilePath, '-C', tempDir, 'payload/']);

      const payloadDir = path.join(tempDir, 'payload');

      // Load each Docker image
      for (const component of manifest.components) {
        if (component.type === 'docker_image') {
          const imagePath = path.join(payloadDir, component.file);

          try {
            await fs.access(imagePath);
            logger.info(`Loading Docker image: ${component.name}`);

            await execFileAsync('docker', ['load', '-i', imagePath]);

            logger.info(`Docker image loaded: ${component.name}`);
          } catch (error) {
            logger.error(`Failed to load image ${component.name}: ${error.message}`);
            throw error;
          }
        }
      }

      // Cleanup temp dir
      await fs.rm(tempDir, { recursive: true, force: true });

      return { success: true };
    } catch (error) {
      logger.error(`Docker image loading failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run database migrations
   */
  async runMigrations(updateFilePath, _manifest) {
    try {
      const tempDir = path.join('/tmp', `update_migrations_${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });

      logger.info('Extracting migrations from update package...');

      // SECURITY: Use execFile with array args to prevent shell injection
      try {
        await execFileAsync('tar', ['-xzf', updateFilePath, '-C', tempDir, 'payload/migrations/']);
      } catch {
        // No migrations directory in package - that's ok
      }

      const migrationsDir = path.join(tempDir, 'payload', 'migrations');

      // Check if migrations exist
      try {
        await fs.access(migrationsDir);
      } catch {
        logger.info('No migrations to run');
        return { success: true };
      }

      // Get migration files and sort them
      const migrationFiles = (await fs.readdir(migrationsDir))
        .filter(f => f.endsWith('.sql'))
        .sort();

      // Run each migration (pipe file to psql stdin)
      for (const migrationFile of migrationFiles) {
        const migrationPath = path.join(migrationsDir, migrationFile);
        logger.info(`Running migration: ${migrationFile}`);

        await spawnFromFile(
          'docker',
          ['exec', '-i', 'postgres-db', 'psql', '-U', 'arasul', '-d', 'arasul_db'],
          migrationPath
        );
      }

      // Cleanup temp dir
      await fs.rm(tempDir, { recursive: true, force: true });

      logger.info('All migrations completed successfully');
      return { success: true };
    } catch (error) {
      logger.error(`Migration execution failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update services orchestration
   */
  async updateServices(manifest) {
    try {
      logger.info('Updating services via docker-compose...');

      // Stop services in reverse dependency order
      const stopOrder = [
        'self-healing-agent',
        'dashboard-frontend',
        'dashboard-backend',
        'reverse-proxy',
        'embedding-service',
        'llm-service',
        'metrics-collector',
      ];

      // SECURITY: Use execFile with array args to prevent shell injection
      for (const service of stopOrder) {
        if (manifest.components.some(c => c.service === service)) {
          logger.info(`Stopping service: ${service}`);
          await execFileAsync('docker-compose', [
            '-f',
            '/arasul/docker-compose.yml',
            'stop',
            service,
          ]);
        }
      }

      // Start services in correct dependency order
      const startOrder = stopOrder.reverse();

      for (const service of startOrder) {
        if (manifest.components.some(c => c.service === service)) {
          logger.info(`Starting service: ${service}`);
          await execFileAsync('docker-compose', [
            '-f',
            '/arasul/docker-compose.yml',
            'up',
            '-d',
            service,
          ]);

          // Wait for healthcheck
          await this.waitForServiceHealth(service, 60);
        }
      }

      logger.info('All services updated successfully');
      return { success: true };
    } catch (error) {
      logger.error(`Service update failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for service to become healthy
   */
  async waitForServiceHealth(serviceName, timeoutSeconds = 60) {
    const startTime = Date.now();
    const timeout = timeoutSeconds * 1000;

    while (Date.now() - startTime < timeout) {
      try {
        let stdout;
        try {
          ({ stdout } = await execFileAsync('docker', [
            'inspect',
            '--format',
            '{{.State.Health.Status}}',
            serviceName,
          ]));
        } catch {
          stdout = 'no-healthcheck';
        }

        const status = stdout.trim();

        if (status === 'healthy' || status === 'no-healthcheck') {
          logger.info(`Service ${serviceName} is healthy`);
          return true;
        }

        // Wait 2 seconds before next check
        await new Promise(resolve => {
          setTimeout(resolve, 2000);
        });
      } catch (error) {
        // Service might not be running yet
        await new Promise(resolve => {
          setTimeout(resolve, 2000);
        });
      }
    }

    throw new Error(`Service ${serviceName} did not become healthy within ${timeoutSeconds}s`);
  }

  /**
   * Apply update
   */
  async applyUpdate(updateFilePath) {
    if (this.updateInProgress) {
      return { success: false, error: 'Update already in progress' };
    }

    // ERST fragen, ob dieser Weg an diesem Geraet ueberhaupt gangbar ist, DANN
    // etwas anfassen. Bis zum 27.08.2026 lief der Ablauf los, sicherte und
    // scheiterte danach an einem `docker`, das es im Container nicht gibt --
    // und die Antwort an den Aufrufer war laengst `started`.
    const weg = await this.wegPruefen();
    if (!weg.moeglich) {
      logger.warn(`Aktualisierung abgelehnt: ${weg.grund}`);
      return { success: false, error: weg.grund, wegMoeglich: false };
    }

    this.updateInProgress = true;
    let gesichert = false;

    try {
      // 1. Validate update
      logger.info(`Starting update application: ${updateFilePath}`);
      const validation = await this.validateUpdate(updateFilePath);

      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const manifest = validation.manifest;

      // 2. Save update state
      await this.saveUpdateState({
        status: 'in_progress',
        version: manifest.version,
        startTime: new Date().toISOString(),
        currentStep: 'backup',
      });

      // 3. Create backup
      const backupResult = await this.createBackup();
      if (!backupResult.success) {
        throw new Error(`Backup failed: ${backupResult.error}`);
      }
      gesichert = true;

      // 4. Load Docker images
      await this.saveUpdateState({ currentStep: 'loading_images' });
      const imageResult = await this.loadDockerImages(updateFilePath, manifest);
      if (!imageResult.success) {
        throw new Error(`Image loading failed: ${imageResult.error}`);
      }

      // 5. Run migrations
      await this.saveUpdateState({ currentStep: 'migrations' });
      const migrationResult = await this.runMigrations(updateFilePath, manifest);
      if (!migrationResult.success) {
        throw new Error(`Migration failed: ${migrationResult.error}`);
      }

      // 6. Update services
      await this.saveUpdateState({ currentStep: 'updating_services' });
      const updateResult = await this.updateServices(manifest);
      if (!updateResult.success) {
        throw new Error(`Service update failed: ${updateResult.error}`);
      }

      // 7. Post-update healthchecks
      await this.saveUpdateState({ currentStep: 'healthchecks' });
      const healthResult = await this.runPostUpdateHealthchecks();
      if (!healthResult.success) {
        throw new Error(`Post-update healthcheck failed: ${healthResult.error}`);
      }

      // 8. Update system version
      // BUG-008 FIX: Write version to file instead of modifying process.env
      await fs.writeFile('/arasul/config/version.txt', manifest.version, 'utf8');
      logger.info(`System version updated to ${manifest.version}`);

      // 9. Complete update
      await this.saveUpdateState({
        status: 'completed',
        currentStep: 'done',
        endTime: new Date().toISOString(),
      });

      // Log to database
      await db.query(
        `INSERT INTO update_events (version_from, version_to, status, source, components_updated)
                 VALUES ($1, $2, $3, $4, $5)`,
        [
          // Die Fassung, von der aus aktualisiert wurde. Sie kommt aus
          // derselben Quelle wie ueberall sonst; bis Phase C9 wurde sie aus
          // einer `version.txt` im Sicherungsordner gelesen, die dort nie
          // ankam, weil `createBackup` den Ordner gar nicht beschreiben
          // konnte.
          versionFuerVergleich(),
          manifest.version,
          'completed',
          'dashboard',
          JSON.stringify(manifest.components),
        ]
      );

      logger.info(`Update completed successfully: ${manifest.version}`);
      this.updateInProgress = false;

      return {
        success: true,
        version: manifest.version,
        requiresReboot: manifest.requires_reboot || false,
      };
    } catch (error) {
      logger.error(`Update failed: ${error.message}`);

      // Attempt rollback
      if (gesichert) {
        logger.info('Attempting automatic rollback...');
        const rollbackResult = await this.rollback();

        if (rollbackResult.success) {
          logger.info('Rollback completed successfully');
        } else {
          logger.error('Rollback failed - manual intervention required');
        }
      }

      await this.saveUpdateState({
        status: 'failed',
        error: error.message,
        endTime: new Date().toISOString(),
      });

      this.updateInProgress = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * Zurueck auf den Stand vor der Aktualisierung.
   *
   * Seit Phase C9 derselbe Weg wie jede andere Wiederherstellung
   * (`services/betrieb/sicherungsdienst.js` -> `wiederherstellen.sh`): die
   * Sicherung, die `createBackup` eben angelegt hat, kommt zurueck, und
   * danach baut das Backend die App-Container aus ihren Paketen neu.
   *
   * WAS DIESER RUECKWEG NICHT KANN, und das gehoert dazu gesagt: er holt
   * DATEN zurueck, keine Images. Ein Container, der schon mit einer neuen
   * Fassung laeuft, laeuft danach weiter mit ihr. Solange `applyUpdate` an
   * `wegPruefen` scheitert, ist das kein offener Fall -- es wird kein Image
   * getauscht, also muss auch keines zurueck. Wer das aendert (Phase C10),
   * aendert diese Stelle mit.
   *
   * Bis hierher stand an dieser Stelle etwas anderes: `docker-compose stop`,
   * `docker exec -i postgres-db psql`, `.env` und `docker-compose.yml`
   * zurueckkopieren. Keine dieser Zeilen konnte je laufen -- die Programme
   * fehlen im Container, und `/arasul/docker-compose.yml` ist dort nicht
   * eingehaengt. Ein Rueckweg, den niemand je gegangen ist, ist keiner.
   */
  async rollback() {
    try {
      logger.info('Rollback: die Sicherung von vor der Aktualisierung kommt zurueck');
      const sicherungsdienst = require('../betrieb/sicherungsdienst');
      const ergebnis = await sicherungsdienst.stelleWiederHer({ durch: null });

      if (!ergebnis.erfolg) {
        return { success: false, error: ergebnis.ausgabe || 'Wiederherstellung fehlgeschlagen' };
      }

      const vorher = versionFuerVergleich();
      logger.info(`Rollback fertig, Stand ${vorher}`);

      await db.query(
        `INSERT INTO update_events (version_from, version_to, status, source)
                 VALUES ($1, $2, $3, $4)`,
        ['failed_update', vorher, 'rolled_back', 'automatic']
      );

      return { success: true };
    } catch (error) {
      logger.error(`Rollback failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run post-update healthchecks
   */
  async runPostUpdateHealthchecks() {
    try {
      logger.info('Running post-update healthchecks...');

      const criticalServices = [
        'postgres-db',
        'metrics-collector',
        'llm-service',
        'dashboard-backend',
        'dashboard-frontend',
      ];

      for (const service of criticalServices) {
        try {
          await this.waitForServiceHealth(service, 60);
        } catch (error) {
          logger.error(`Healthcheck failed for ${service}: ${error.message}`);
          return { success: false, error: `Service ${service} unhealthy` };
        }
      }

      logger.info('All post-update healthchecks passed');
      return { success: true };
    } catch (error) {
      logger.error(`Post-update healthcheck error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save update state to file
   */
  async saveUpdateState(state) {
    try {
      await fs.mkdir(UPDATES_DIR, { recursive: true });

      let currentState = {};
      try {
        const existingState = await fs.readFile(UPDATE_STATE_FILE, 'utf8');
        currentState = JSON.parse(existingState);
      } catch (error) {
        // File doesn't exist yet
      }

      const newState = {
        ...currentState,
        ...state,
        lastUpdate: new Date().toISOString(),
      };

      await fs.writeFile(UPDATE_STATE_FILE, JSON.stringify(newState, null, 2));
    } catch (error) {
      logger.error(`Failed to save update state: ${error.message}`);
    }
  }

  /**
   * Get current update state
   */
  async getUpdateState() {
    try {
      const stateData = await fs.readFile(UPDATE_STATE_FILE, 'utf8');
      return JSON.parse(stateData);
    } catch (error) {
      return null;
    }
  }

  /**
   * Scan for USB devices with update packages
   * Checks /media/ and /mnt/ for mounted drives containing .araupdate files
   */
  async scanUsbDevices() {
    const results = [];
    const searchDirs = ['/media', '/mnt'];

    for (const baseDir of searchDirs) {
      try {
        const entries = await fs.readdir(baseDir);
        for (const entry of entries) {
          const mountPoint = path.join(baseDir, entry);
          try {
            const stat = await fs.stat(mountPoint);
            if (!stat.isDirectory()) {
              continue;
            }

            // Look for .araupdate files (max 2 levels deep)
            const files = await this._findUpdateFiles(mountPoint, 2);
            for (const file of files) {
              const fileStat = await fs.stat(file);
              results.push({
                path: file,
                name: path.basename(file),
                size: fileStat.size,
                mountPoint,
                device: entry,
                modified: fileStat.mtime.toISOString(),
              });
            }
          } catch {
            // Skip inaccessible directories
          }
        }
      } catch {
        // Search directory doesn't exist
      }
    }

    return results;
  }

  /**
   * Recursively find .araupdate files up to maxDepth
   */
  async _findUpdateFiles(dir, maxDepth) {
    if (maxDepth <= 0) {
      return [];
    }
    const files = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith('.araupdate')) {
          files.push(fullPath);
        } else if (entry.isDirectory() && maxDepth > 1) {
          const subFiles = await this._findUpdateFiles(fullPath, maxDepth - 1);
          files.push(...subFiles);
        }
      }
    } catch {
      // Permission denied or other error
    }
    return files;
  }

  /**
   * Check remote update server for available updates (OTA manifest check).
   * Fetches the release manifest for the configured channel and compares versions.
   * @returns {{ available: boolean, currentVersion: string, latestVersion?: string, releaseNotes?: string, downloadUrl?: string, size?: number, channel: string }}
   */
  async checkForUpdates() {
    const currentVersion = versionFuerVergleich();

    // Ohne eigene Fassung wird gar nicht erst gefragt.
    //
    // Der Aktualisierungsserver bekaeme `current_version=0.0.0` und boete
    // daraufhin jede Fassung an, die es je gab -- eine Antwort, die nichts
    // ueber dieses Geraet aussagt und die `validateUpdate` gleich darauf
    // ablehnen wuerde. Eine Frage, deren Antwort man nicht gebrauchen kann,
    // wird nicht gestellt; stattdessen steht hier, woran es liegt.
    if (!versionBekannt()) {
      return {
        available: false,
        currentVersion: null,
        versionBekannt: false,
        channel: UPDATE_CHANNEL,
        error:
          'Dieses Geraet kennt seine eigene Fassung nicht (SYSTEM_VERSION ist nicht gesetzt). ' +
          'Solange sie nicht aus dem Bau kommt, laesst sich nicht sagen, ob es etwas Neueres gibt.',
      };
    }

    // Dieselbe Frage wie in `validateUpdate`, nur frueher: mit einer Fassung
    // aus dem Bau ohne Tag (`JJJJMMTT-<sha>`) gibt es nichts zu vergleichen.
    // Der Aktualisierungsserver bekaeme eine Zahl, mit der er nichts anfangen
    // kann, und `compareVersions` wuerde die Antwort ohnehin nur mit einem
    // Wurf quittieren.
    if (!istReleaseNummer(currentVersion)) {
      return {
        available: false,
        currentVersion,
        versionBekannt: true,
        channel: UPDATE_CHANNEL,
        error:
          `Dieses Geraet traegt die Fassung ${currentVersion} aus dem Bau, keine ` +
          'Release-Nummer. Es aktualisiert ueber den Deploy, nicht ueber ein Paket.',
      };
    }

    // Collect device info for update server (helps serve correct architecture/JetPack builds)
    let deviceInfo = {};
    try {
      const modelData = await fs.readFile('/proc/device-tree/model', 'utf8').catch(() => '');
      deviceInfo = {
        arch: process.arch,
        platform: process.platform,
        model: modelData.replace(/\0/g, '').trim() || 'unknown',
      };
    } catch {
      /* ignore */
    }

    try {
      const response = await axios.get(`${UPDATE_SERVER_URL}/api/v1/releases/latest`, {
        params: {
          channel: UPDATE_CHANNEL,
          current_version: currentVersion,
          arch: deviceInfo.arch,
          model: deviceInfo.model,
        },
        timeout: 15_000,
        headers: { 'User-Agent': `Arasul/${currentVersion}` },
      });

      const release = response.data;

      if (!release || !release.version) {
        return { available: false, currentVersion, channel: UPDATE_CHANNEL };
      }

      const isNewer = this.compareVersions(release.version, currentVersion) > 0;

      // Persist check result
      await this.saveUpdateState({
        lastCheck: new Date().toISOString(),
        lastCheckResult: {
          available: isNewer,
          latestVersion: release.version,
          channel: UPDATE_CHANNEL,
        },
      });

      return {
        available: isNewer,
        currentVersion,
        latestVersion: release.version,
        releaseNotes: release.release_notes || null,
        downloadUrl: release.download_url || null,
        size: release.size || null,
        minVersion: release.min_version || null,
        requiresReboot: release.requires_reboot || false,
        channel: UPDATE_CHANNEL,
        versionBekannt: true,
      };
    } catch (error) {
      logger.warn(`Update check failed: ${error.message}`);
      return {
        available: false,
        currentVersion,
        versionBekannt: true,
        channel: UPDATE_CHANNEL,
        error:
          error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND'
            ? 'Update server not reachable (offline operation)'
            : error.message,
      };
    }
  }

  /**
   * Download update package from remote server.
   * @param {string} downloadUrl - URL to download from
   * @param {string} version - Expected version for filename
   * @returns {{ success: boolean, filePath?: string, error?: string }}
   */
  async downloadUpdate(downloadUrl, version) {
    try {
      const fileName = `ota_update_${version}_${Date.now()}.araupdate`;
      const filePath = path.join(UPDATES_DIR, fileName);
      await fs.mkdir(UPDATES_DIR, { recursive: true });

      logger.info(`Downloading update ${version} from ${downloadUrl}`);

      const response = await axios.get(downloadUrl, {
        responseType: 'stream',
        timeout: 3600_000, // 1h for large packages
        headers: { 'User-Agent': `Arasul/${versionFuerVergleich()}` },
      });

      const writer = require('fs').createWriteStream(filePath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Also download signature
      const sigResponse = await axios.get(`${downloadUrl}.sig`, {
        responseType: 'arraybuffer',
        timeout: 30_000,
      });
      await fs.writeFile(`${filePath}.sig`, sigResponse.data);

      logger.info(`Update downloaded: ${filePath}`);
      return { success: true, filePath };
    } catch (error) {
      logger.error(`Update download failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Compare semantic versions
   * @param {string} v1 - First version (e.g., "1.2.3")
   * @param {string} v2 - Second version (e.g., "1.3.0")
   * @returns {number} -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
   * @throws {Error} If version format is invalid
   */
  compareVersions(v1, v2) {
    // Validate semver format (X.Y.Z where X, Y, Z are non-negative integers)
    const semverRegex = /^\d+\.\d+\.\d+$/;

    if (!semverRegex.test(v1)) {
      throw new Error(`Invalid version format: ${v1} (expected X.Y.Z format)`);
    }

    if (!semverRegex.test(v2)) {
      throw new Error(`Invalid version format: ${v2} (expected X.Y.Z format)`);
    }

    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 > part2) {
        return 1;
      }
      if (part1 < part2) {
        return -1;
      }
    }

    return 0;
  }
}

module.exports = new UpdateService();
