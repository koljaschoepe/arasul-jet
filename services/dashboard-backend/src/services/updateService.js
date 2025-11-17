/**
 * Update Service - Core update orchestration
 * Handles signature verification, backup, update application, and rollback
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const logger = require('../utils/logger');
const db = require('../database');
const dockerService = require('./docker');

const execAsync = promisify(exec);

const UPDATE_STATE_FILE = '/arasul/updates/update_state.json';
const BACKUP_DIR = '/arasul/backups';
const UPDATES_DIR = '/arasul/updates';

class UpdateService {
    constructor() {
        this.currentUpdate = null;
        this.updateInProgress = false;
    }

    /**
     * Verify digital signature of update package with comprehensive checks
     */
    async verifySignature(updateFilePath, signatureFilePath) {
        try {
            const publicKeyPath = process.env.UPDATE_PUBLIC_KEY_PATH || '/arasul/config/public_update_key.pem';

            // Check if public key exists
            try {
                await fs.access(publicKeyPath);
            } catch (error) {
                logger.error(`Public key not found at ${publicKeyPath}`);
                return { valid: false, error: 'Public key not found - update system not configured' };
            }

            // Read public key
            const publicKey = await fs.readFile(publicKeyPath, 'utf8');

            // Validate public key format
            if (!publicKey.includes('-----BEGIN PUBLIC KEY-----') &&
                !publicKey.includes('-----BEGIN RSA PUBLIC KEY-----')) {
                logger.error('Invalid public key format');
                return { valid: false, error: 'Invalid public key format' };
            }

            // Check if signature file exists
            try {
                await fs.access(signatureFilePath);
            } catch (error) {
                logger.error(`Signature file not found at ${signatureFilePath}`);
                return { valid: false, error: 'Signature file not found' };
            }

            // Read signature
            const signature = await fs.readFile(signatureFilePath);

            // Validate signature is not empty
            if (signature.length === 0) {
                logger.error('Signature file is empty');
                return { valid: false, error: 'Empty signature file' };
            }

            // Check update file exists and is not empty
            try {
                const stats = await fs.stat(updateFilePath);
                if (stats.size === 0) {
                    logger.error('Update file is empty');
                    return { valid: false, error: 'Empty update file' };
                }
                logger.info(`Verifying signature for update file (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            } catch (error) {
                logger.error(`Update file not accessible: ${error.message}`);
                return { valid: false, error: 'Update file not accessible' };
            }

            // Read update file in chunks for large files
            const updateData = await fs.readFile(updateFilePath);

            // Calculate hash of update file for logging
            const hashSum = crypto.createHash('sha256');
            hashSum.update(updateData);
            const fileHash = hashSum.digest('hex');
            logger.info(`Update file SHA256: ${fileHash}`);

            // Verify signature using RSA-SHA256
            const verify = crypto.createVerify('RSA-SHA256');
            verify.update(updateData);
            verify.end();

            const isValid = verify.verify(publicKey, signature);

            if (isValid) {
                logger.info(`Signature verification successful for ${path.basename(updateFilePath)}`);

                // Log verification event to database
                try {
                    await db.query(
                        `INSERT INTO update_events (version_from, version_to, status, source, details)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [
                            process.env.SYSTEM_VERSION || 'unknown',
                            'pending',
                            'signature_verified',
                            'dashboard',
                            JSON.stringify({ file_hash: fileHash, file_size: updateData.length })
                        ]
                    );
                } catch (dbError) {
                    logger.warn(`Failed to log verification event: ${dbError.message}`);
                }

                return { valid: true, hash: fileHash };
            } else {
                logger.error(`Signature verification FAILED for ${path.basename(updateFilePath)}`);
                logger.error(`This update package may be tampered with or corrupted`);

                // Log failed verification
                try {
                    await db.query(
                        `INSERT INTO update_events (version_from, version_to, status, source, error)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [
                            process.env.SYSTEM_VERSION || 'unknown',
                            'unknown',
                            'signature_verification_failed',
                            'dashboard',
                            'Invalid signature - possible tampering'
                        ]
                    );
                } catch (dbError) {
                    logger.warn(`Failed to log failed verification: ${dbError.message}`);
                }

                return { valid: false, error: 'Invalid signature - update rejected' };
            }

        } catch (error) {
            logger.error(`Signature verification error: ${error.message}`);
            return { valid: false, error: `Verification failed: ${error.message}` };
        }
    }

    /**
     * Extract manifest from update package
     */
    async extractManifest(updateFilePath) {
        try {
            const tempDir = path.join('/tmp', `update_extract_${Date.now()}`);
            await fs.mkdir(tempDir, { recursive: true });

            // Try tar first, then zip
            try {
                await execAsync(`tar -xzf "${updateFilePath}" -C "${tempDir}" manifest.json`);
            } catch (tarError) {
                try {
                    await execAsync(`unzip -j "${updateFilePath}" manifest.json -d "${tempDir}"`);
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

            // 4. Check version compatibility
            const currentVersion = process.env.SYSTEM_VERSION || '1.0.0';

            if (this.compareVersions(manifest.version, currentVersion) <= 0) {
                return {
                    valid: false,
                    error: `Update version ${manifest.version} is not newer than current version ${currentVersion}`
                };
            }

            if (this.compareVersions(currentVersion, manifest.min_version) < 0) {
                return {
                    valid: false,
                    error: `Current version ${currentVersion} is below minimum required version ${manifest.min_version}`
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
     * Create backup before update
     */
    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(BACKUP_DIR, `backup_${timestamp}`);

            await fs.mkdir(backupPath, { recursive: true });

            logger.info(`Creating backup at ${backupPath}`);

            // 1. Backup database
            const dbBackupPath = path.join(backupPath, 'database.sql');
            await execAsync(
                `docker exec postgres-db pg_dump -U arasul -d arasul_db > "${dbBackupPath}"`
            );

            // 2. Save current container versions
            const { stdout: psOutput } = await execAsync('docker ps --format "{{.Names}}:{{.Image}}"');
            const containerVersions = {};
            psOutput.split('\n').filter(Boolean).forEach(line => {
                const [name, image] = line.split(':');
                containerVersions[name] = image;
            });

            await fs.writeFile(
                path.join(backupPath, 'container_versions.json'),
                JSON.stringify(containerVersions, null, 2)
            );

            // 3. Backup docker-compose.yml
            await execAsync(`cp /arasul/docker-compose.yml "${path.join(backupPath, 'docker-compose.yml')}"`);

            // 4. Backup .env
            await execAsync(`cp /arasul/config/.env "${path.join(backupPath, '.env')}"`);

            // 5. Save current system version
            await fs.writeFile(
                path.join(backupPath, 'version.txt'),
                process.env.SYSTEM_VERSION || '1.0.0'
            );

            logger.info(`Backup created successfully: ${backupPath}`);
            return { success: true, backupPath };

        } catch (error) {
            logger.error(`Backup creation failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Load Docker images from update package
     */
    async loadDockerImages(updateFilePath, manifest) {
        try {
            const tempDir = path.join('/tmp', `update_images_${Date.now()}`);
            await fs.mkdir(tempDir, { recursive: true });

            logger.info('Extracting Docker images from update package...');

            // Extract payload directory
            await execAsync(`tar -xzf "${updateFilePath}" -C "${tempDir}" payload/`);

            const payloadDir = path.join(tempDir, 'payload');

            // Load each Docker image
            for (const component of manifest.components) {
                if (component.type === 'docker_image') {
                    const imagePath = path.join(payloadDir, component.file);

                    try {
                        await fs.access(imagePath);
                        logger.info(`Loading Docker image: ${component.name}`);

                        await execAsync(`docker load -i "${imagePath}"`);

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
    async runMigrations(updateFilePath, manifest) {
        try {
            const tempDir = path.join('/tmp', `update_migrations_${Date.now()}`);
            await fs.mkdir(tempDir, { recursive: true });

            logger.info('Extracting migrations from update package...');

            // Extract migrations
            await execAsync(`tar -xzf "${updateFilePath}" -C "${tempDir}" payload/migrations/ 2>/dev/null || true`);

            const migrationsDir = path.join(tempDir, 'payload', 'migrations');

            // Check if migrations exist
            try {
                await fs.access(migrationsDir);
            } catch (error) {
                logger.info('No migrations to run');
                return { success: true };
            }

            // Get migration files and sort them
            const migrationFiles = (await fs.readdir(migrationsDir))
                .filter(f => f.endsWith('.sql'))
                .sort();

            // Run each migration
            for (const migrationFile of migrationFiles) {
                const migrationPath = path.join(migrationsDir, migrationFile);
                logger.info(`Running migration: ${migrationFile}`);

                await execAsync(
                    `docker exec -i postgres-db psql -U arasul -d arasul_db < "${migrationPath}"`
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
                'n8n',
                'dashboard-frontend',
                'dashboard-backend',
                'reverse-proxy',
                'embedding-service',
                'llm-service',
                'metrics-collector'
            ];

            for (const service of stopOrder) {
                if (manifest.components.some(c => c.service === service)) {
                    logger.info(`Stopping service: ${service}`);
                    await execAsync(`docker-compose -f /arasul/docker-compose.yml stop ${service}`);
                }
            }

            // Start services in correct dependency order
            const startOrder = stopOrder.reverse();

            for (const service of startOrder) {
                if (manifest.components.some(c => c.service === service)) {
                    logger.info(`Starting service: ${service}`);
                    await execAsync(`docker-compose -f /arasul/docker-compose.yml up -d ${service}`);

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
                const { stdout } = await execAsync(
                    `docker inspect --format='{{.State.Health.Status}}' ${serviceName} 2>/dev/null || echo "no-healthcheck"`
                );

                const status = stdout.trim();

                if (status === 'healthy' || status === 'no-healthcheck') {
                    logger.info(`Service ${serviceName} is healthy`);
                    return true;
                }

                // Wait 2 seconds before next check
                await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (error) {
                // Service might not be running yet
                await new Promise(resolve => setTimeout(resolve, 2000));
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

        this.updateInProgress = true;
        let backupPath = null;

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
                currentStep: 'backup'
            });

            // 3. Create backup
            const backupResult = await this.createBackup();
            if (!backupResult.success) {
                throw new Error(`Backup failed: ${backupResult.error}`);
            }
            backupPath = backupResult.backupPath;

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
                endTime: new Date().toISOString()
            });

            // Log to database
            await db.query(
                `INSERT INTO update_events (version_from, version_to, status, source, components_updated)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    backupResult.backupPath ?
                        await fs.readFile(path.join(backupPath, 'version.txt'), 'utf8') :
                        '1.0.0',
                    manifest.version,
                    'completed',
                    'dashboard',
                    JSON.stringify(manifest.components)
                ]
            );

            logger.info(`Update completed successfully: ${manifest.version}`);
            this.updateInProgress = false;

            return {
                success: true,
                version: manifest.version,
                requiresReboot: manifest.requires_reboot || false
            };

        } catch (error) {
            logger.error(`Update failed: ${error.message}`);

            // Attempt rollback
            if (backupPath) {
                logger.info('Attempting automatic rollback...');
                const rollbackResult = await this.rollback(backupPath);

                if (rollbackResult.success) {
                    logger.info('Rollback completed successfully');
                } else {
                    logger.error('Rollback failed - manual intervention required');
                }
            }

            await this.saveUpdateState({
                status: 'failed',
                error: error.message,
                endTime: new Date().toISOString()
            });

            this.updateInProgress = false;
            return { success: false, error: error.message };
        }
    }

    /**
     * Rollback to previous version
     */
    async rollback(backupPath) {
        try {
            logger.info(`Starting rollback from backup: ${backupPath}`);

            // 1. Stop all application services
            await execAsync('docker-compose -f /arasul/docker-compose.yml stop');

            // 2. Restore database
            const dbBackupPath = path.join(backupPath, 'database.sql');
            await execAsync(
                `docker exec -i postgres-db psql -U arasul -d arasul_db < "${dbBackupPath}"`
            );

            // 3. Restore docker-compose.yml
            await execAsync(`cp "${path.join(backupPath, 'docker-compose.yml')}" /arasul/docker-compose.yml`);

            // 4. Restore .env
            await execAsync(`cp "${path.join(backupPath, '.env')}" /arasul/config/.env`);

            // 5. Load previous container versions
            const containerVersionsPath = path.join(backupPath, 'container_versions.json');
            const containerVersions = JSON.parse(
                await fs.readFile(containerVersionsPath, 'utf8')
            );

            // Pull previous images if needed (they should still be in Docker cache)
            logger.info('Restoring previous container versions...');

            // 6. Restart services
            await execAsync('docker-compose -f /arasul/docker-compose.yml up -d');

            // 7. Wait for services to be healthy with timeout
            // HIGH-003 FIX: Poll for service health instead of fixed delay
            const MAX_WAIT_MS = 30000; // 30 seconds max
            const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds
            const startTime = Date.now();
            let allHealthy = false;

            logger.info('Waiting for services to become healthy after rollback...');

            while (Date.now() - startTime < MAX_WAIT_MS) {
                allHealthy = await this.checkAllServicesHealthy();
                if (allHealthy) {
                    logger.info(`All services healthy after ${Math.round((Date.now() - startTime) / 1000)}s`);
                    break;
                }

                logger.debug(`Waiting for services... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
            }

            if (!allHealthy) {
                const elapsed = Math.round((Date.now() - startTime) / 1000);
                logger.error(`Services failed to become healthy after ${elapsed}s`);
                throw new Error('Services failed to become healthy after rollback');
            }

            // 8. Restore system version
            // BUG-008 FIX: Write version to file instead of modifying process.env
            const previousVersion = await fs.readFile(path.join(backupPath, 'version.txt'), 'utf8');
            await fs.writeFile('/arasul/config/version.txt', previousVersion.trim(), 'utf8');

            logger.info(`Rollback completed successfully to version ${previousVersion.trim()}`);

            // Log rollback event
            await db.query(
                `INSERT INTO update_events (version_from, version_to, status, source)
                 VALUES ($1, $2, $3, $4)`,
                ['failed_update', previousVersion, 'rolled_back', 'automatic']
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
                'dashboard-frontend'
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
                lastUpdate: new Date().toISOString()
            };

            await fs.writeFile(
                UPDATE_STATE_FILE,
                JSON.stringify(newState, null, 2)
            );

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
     * HIGH-003 FIX: Check if all critical services are healthy
     * @returns {Promise<boolean>} true if all services healthy, false otherwise
     */
    async checkAllServicesHealthy() {
        try {
            const services = await dockerService.getAllServicesStatus();

            // Critical services that must be healthy
            const criticalServices = ['llm', 'embeddings', 'postgres', 'minio', 'dashboard_backend'];

            for (const serviceName of criticalServices) {
                const service = services[serviceName];
                if (!service || service.status !== 'healthy') {
                    logger.warn(`Service ${serviceName} is not healthy: ${service?.status || 'unknown'}`);
                    return false;
                }
            }

            logger.debug('All critical services are healthy');
            return true;
        } catch (error) {
            logger.error(`Error checking service health: ${error.message}`);
            return false;
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

            if (part1 > part2) return 1;
            if (part1 < part2) return -1;
        }

        return 0;
    }
}

module.exports = new UpdateService();
