/**
 * @arasul/shared - Shared utilities for the Arasul Platform
 *
 * Usage (Backend):  const { MODEL_STATUS } = require('@arasul/shared');
 * Usage (Frontend): import { MODEL_STATUS } from '@arasul/shared';
 */

const constants = require('./constants');
const validation = require('./validation');
const formatting = require('./formatting');

module.exports = {
  ...constants,
  ...validation,
  ...formatting,
};
