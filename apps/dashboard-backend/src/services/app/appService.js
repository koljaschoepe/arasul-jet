/**
 * App Store Service - Facade
 *
 * Thin facade that re-exports all methods from the sub-services.
 * Consumers require this file and get the same API as before.
 *
 * Sub-services:
 *   manifestService  - Manifest loading, caching, app/category listing
 *   containerService - Docker container lifecycle, config building, image management
 *   installService   - App install/uninstall, dependency checks, system sync
 *   configService    - App configuration, Claude auth, n8n credentials, event logging
 */

const manifestService = require('./manifestService');
const containerService = require('./containerService');
const installService = require('./installService');
const configService = require('./configService');

module.exports = {
  ...manifestService,
  ...containerService,
  ...installService,
  ...configService,
};
