/**
 * Telegram Voice Service
 *
 * Handles voice message processing:
 * - Download voice files from Telegram
 * - Transcribe via OpenAI Whisper API
 * - Temp file management + cleanup
 *
 * Extracted from telegramIntegrationService.js for maintainability.
 */

const fs = require('fs');
const path = require('path');
const database = require('../../database');
const logger = require('../../utils/logger');
const cryptoService = require('../core/cryptoService');

// =============================================================================
// Constants
// =============================================================================

const MAX_VOICE_DURATION_SECONDS = parseInt(process.env.TELEGRAM_MAX_VOICE_DURATION) || 120;
const VOICE_ENABLED = process.env.TELEGRAM_VOICE_ENABLED !== 'false';
const WHISPER_MODEL = process.env.TELEGRAM_WHISPER_MODEL || 'whisper-1';
const TEMP_DIR = '/tmp/telegram-voice';

const TELEGRAM_API = 'https://api.telegram.org/bot';
const TELEGRAM_FILE_API = 'https://api.telegram.org/file/bot';
const OPENAI_API = 'https://api.openai.com/v1/audio/transcriptions';

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Periodic cleanup of stale voice files (every 15 minutes)
setInterval(
  async () => {
    try {
      if (!fs.existsSync(TEMP_DIR)) {
        return;
      }
      const files = await fs.promises.readdir(TEMP_DIR);
      const now = Date.now();
      const maxAge = 30 * 60 * 1000; // 30 minutes
      for (const file of files) {
        const filePath = path.join(TEMP_DIR, file);
        const stats = await fs.promises.stat(filePath);
        if (now - stats.mtimeMs > maxAge) {
          await fs.promises.unlink(filePath);
          logger.debug(`[Voice cleanup] Removed stale file: ${file}`);
        }
      }
    } catch (err) {
      logger.warn('[Voice cleanup] Error during periodic cleanup:', err.message);
    }
  },
  15 * 60 * 1000
);

// =============================================================================
// Voice Functions
// =============================================================================

/**
 * Check if voice feature is enabled
 * @returns {boolean}
 */
function isVoiceEnabled() {
  return VOICE_ENABLED;
}

/**
 * Get OpenAI API key for a bot
 * @param {number} botId - Bot ID
 * @returns {Promise<string|null>}
 */
async function getOpenAIKey(botId) {
  try {
    const result = await database.query(
      `SELECT openai_api_key_encrypted, openai_api_key_iv, openai_api_key_auth_tag
       FROM telegram_bots WHERE id = $1`,
      [botId]
    );

    if (result.rows.length > 0 && result.rows[0].openai_api_key_encrypted) {
      const row = result.rows[0];
      return cryptoService.decrypt(
        row.openai_api_key_encrypted,
        row.openai_api_key_iv,
        row.openai_api_key_auth_tag
      );
    }

    // Fall back to global OpenAI key
    const globalKey = process.env.OPENAI_API_KEY;
    if (globalKey) {
      return globalKey;
    }

    return null;
  } catch (error) {
    logger.error('Error getting OpenAI key:', error);
    return null;
  }
}

/**
 * Download voice file from Telegram
 * @param {string} token - Bot token
 * @param {string} fileId - Telegram file ID
 * @returns {Promise<string>} Local file path
 */
async function downloadVoiceFile(token, fileId) {
  try {
    const fileInfoResponse = await fetch(`${TELEGRAM_API}${token}/getFile?file_id=${fileId}`);
    const fileInfo = await fileInfoResponse.json();

    if (!fileInfo.ok) {
      throw new Error(fileInfo.description || 'Failed to get file info');
    }

    const filePath = fileInfo.result.file_path;
    const fileUrl = `${TELEGRAM_FILE_API}${token}/${filePath}`;

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();

    const localPath = path.join(TEMP_DIR, `voice_${Date.now()}_${fileId}.ogg`);
    await fs.promises.writeFile(localPath, Buffer.from(buffer));

    logger.debug(`Voice file downloaded: ${localPath}`);
    return localPath;
  } catch (error) {
    logger.error('Error downloading voice file:', error);
    throw error;
  }
}

/**
 * Transcribe audio file using OpenAI Whisper API
 * @param {string} filePath - Local file path
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<string>} Transcription text
 */
async function transcribeWithWhisper(filePath, apiKey) {
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), fileName);
    formData.append('model', WHISPER_MODEL);
    formData.append('language', 'de');
    formData.append('response_format', 'json');

    const response = await fetch(OPENAI_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Whisper API error: ${response.status}`);
    }

    const data = await response.json();
    return data.text || '';
  } catch (error) {
    logger.error('Error transcribing with Whisper:', error);
    throw error;
  }
}

/**
 * Clean up temporary voice file
 * @param {string} filePath - File to delete
 */
function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug(`Cleaned up voice file: ${filePath}`);
    }
  } catch (error) {
    logger.warn('Failed to cleanup voice file:', error);
  }
}

/**
 * Process a voice message
 * @param {number} botId - Bot ID
 * @param {string} token - Bot token
 * @param {Object} voice - Telegram voice object
 * @returns {Promise<{success: boolean, text?: string, error?: string}>}
 */
async function processVoiceMessage(botId, token, voice) {
  if (!VOICE_ENABLED) {
    return {
      success: false,
      error: 'Sprachnachrichten sind deaktiviert.',
    };
  }

  if (voice.duration > MAX_VOICE_DURATION_SECONDS) {
    return {
      success: false,
      error: `Sprachnachricht zu lang. Maximum: ${MAX_VOICE_DURATION_SECONDS} Sekunden.`,
    };
  }

  const apiKey = await getOpenAIKey(botId);
  if (!apiKey) {
    return {
      success: false,
      error: 'Kein OpenAI API-Key konfiguriert. Bitte setze einen API-Key fuer Sprachnachrichten.',
    };
  }

  let localFilePath = null;

  try {
    localFilePath = await downloadVoiceFile(token, voice.file_id);
    const text = await transcribeWithWhisper(localFilePath, apiKey);

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: 'Keine Sprache erkannt. Bitte versuche es erneut.',
      };
    }

    logger.info(`Voice transcription complete: ${text.substring(0, 50)}...`);

    return {
      success: true,
      text: text.trim(),
    };
  } catch (error) {
    logger.error('Voice processing error:', error);
    return {
      success: false,
      error: error.message || 'Fehler bei der Sprachverarbeitung.',
    };
  } finally {
    if (localFilePath) {
      cleanupFile(localFilePath);
    }
  }
}

/**
 * Clean up old voice files (for cron job)
 * @param {number} maxAgeMinutes - Max age in minutes
 */
async function cleanupOldFiles(maxAgeMinutes = 30) {
  try {
    if (!fs.existsSync(TEMP_DIR)) {
      return;
    }

    const files = await fs.promises.readdir(TEMP_DIR);
    const now = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = await fs.promises.stat(filePath);

      if (now - stats.mtimeMs > maxAge) {
        await fs.promises.unlink(filePath);
        logger.debug(`Cleaned up old voice file: ${file}`);
      }
    }
  } catch (error) {
    logger.warn('Error cleaning up old voice files:', error);
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  isVoiceEnabled,
  processVoiceMessage,
  cleanupOldFiles,
  MAX_VOICE_DURATION_SECONDS,
};
