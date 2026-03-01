/**
 * Telegram Voice Service
 * Handles voice message transcription using OpenAI Whisper API
 *
 * Features:
 * - Voice message download from Telegram
 * - Transcription via OpenAI Whisper API
 * - Temporary file cleanup
 * - Duration limits for voice messages
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const database = require('../database');
const cryptoService = require('./cryptoService');

// Configuration
const MAX_VOICE_DURATION_SECONDS = parseInt(process.env.TELEGRAM_MAX_VOICE_DURATION) || 120;
const VOICE_ENABLED = process.env.TELEGRAM_VOICE_ENABLED !== 'false';
const WHISPER_MODEL = process.env.TELEGRAM_WHISPER_MODEL || 'whisper-1';
const TEMP_DIR = '/tmp/telegram-voice';

// Telegram and OpenAI API URLs
const TELEGRAM_API = 'https://api.telegram.org/bot';
const TELEGRAM_FILE_API = 'https://api.telegram.org/file/bot';
const OPENAI_API = 'https://api.openai.com/v1/audio/transcriptions';

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Check if voice feature is enabled
 * @returns {boolean}
 */
function isEnabled() {
  return VOICE_ENABLED;
}

/**
 * Get OpenAI API key for a bot
 * @param {number} botId - Bot ID
 * @returns {Promise<string|null>}
 */
async function getOpenAIKey(botId) {
  try {
    // First check if bot has its own OpenAI key
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
    // Get file info from Telegram
    const fileInfoResponse = await fetch(`${TELEGRAM_API}${token}/getFile?file_id=${fileId}`);
    const fileInfo = await fileInfoResponse.json();

    if (!fileInfo.ok) {
      throw new Error(fileInfo.description || 'Failed to get file info');
    }

    const filePath = fileInfo.result.file_path;
    const fileUrl = `${TELEGRAM_FILE_API}${token}/${filePath}`;

    // Download file
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();

    // Save to temp file
    const localPath = path.join(TEMP_DIR, `voice_${Date.now()}_${fileId}.ogg`);
    fs.writeFileSync(localPath, Buffer.from(buffer));

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
    // Read file
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    // Create form data
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), fileName);
    formData.append('model', WHISPER_MODEL);
    formData.append('language', 'de'); // German by default
    formData.append('response_format', 'json');

    // Call OpenAI API
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
  // Check if voice feature is enabled
  if (!VOICE_ENABLED) {
    return {
      success: false,
      error: 'Sprachnachrichten sind deaktiviert.',
    };
  }

  // Check duration limit
  if (voice.duration > MAX_VOICE_DURATION_SECONDS) {
    return {
      success: false,
      error: `Sprachnachricht zu lang. Maximum: ${MAX_VOICE_DURATION_SECONDS} Sekunden.`,
    };
  }

  // Get OpenAI API key
  const apiKey = await getOpenAIKey(botId);
  if (!apiKey) {
    return {
      success: false,
      error: 'Kein OpenAI API-Key konfiguriert. Bitte setze einen API-Key fuer Sprachnachrichten.',
    };
  }

  let localFilePath = null;

  try {
    // Download voice file
    localFilePath = await downloadVoiceFile(token, voice.file_id);

    // Transcribe
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
    // Always cleanup
    if (localFilePath) {
      cleanupFile(localFilePath);
    }
  }
}

/**
 * Clean up old voice files (for cron job)
 * @param {number} maxAgeMinutes - Max age in minutes
 */
function cleanupOldFiles(maxAgeMinutes = 30) {
  try {
    if (!fs.existsSync(TEMP_DIR)) {
      return;
    }

    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        logger.debug(`Cleaned up old voice file: ${file}`);
      }
    }
  } catch (error) {
    logger.warn('Error cleaning up old voice files:', error);
  }
}

module.exports = {
  isEnabled,
  processVoiceMessage,
  cleanupOldFiles,
  MAX_VOICE_DURATION_SECONDS,
};
