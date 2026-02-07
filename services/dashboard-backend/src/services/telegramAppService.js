/**
 * Telegram App Service
 *
 * Manages the Telegram Bot App lifecycle:
 * - App activation/deactivation
 * - Dashboard icon visibility
 * - App-wide settings
 */

const database = require('../database');
const logger = require('../utils/logger');

class TelegramAppService {
  /**
   * Check if the Telegram app icon should be visible for a user
   * @param {number} userId - User ID
   * @returns {Promise<boolean>}
   */
  async isIconVisible(userId) {
    try {
      const result = await database.query(
        `SELECT icon_visible FROM telegram_app_status WHERE user_id = $1`,
        [userId]
      );
      return result.rows[0]?.icon_visible || false;
    } catch (error) {
      // If table doesn't exist yet, check for bots directly
      if (error.message.includes('does not exist')) {
        const botsResult = await database.query(
          `SELECT COUNT(*) as count FROM telegram_bots WHERE user_id = $1`,
          [userId]
        );
        return parseInt(botsResult.rows[0]?.count || 0) > 0;
      }
      logger.error('Error checking icon visibility:', error);
      return false;
    }
  }

  /**
   * Get comprehensive app status for a user
   * @param {number} userId - User ID
   * @returns {Promise<Object>}
   */
  async getAppStatus(userId) {
    try {
      // Ensure status record exists
      await database.query(
        `SELECT ensure_telegram_app_status($1)`,
        [userId]
      );

      // Get status
      const statusResult = await database.query(`
        SELECT
          is_enabled,
          icon_visible,
          first_bot_created_at,
          last_activity_at,
          settings
        FROM telegram_app_status
        WHERE user_id = $1
      `, [userId]);

      // Get bot counts
      const botsResult = await database.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_active = TRUE) as active
        FROM telegram_bots
        WHERE user_id = $1
      `, [userId]);

      // Get total chats and messages
      const statsResult = await database.query(`
        SELECT
          COALESCE(SUM(c.chat_count), 0) as total_chats,
          COALESCE(SUM(b.message_count), 0) as total_messages
        FROM telegram_bots b
        LEFT JOIN (
          SELECT bot_id, COUNT(*) as chat_count
          FROM telegram_bot_chats
          WHERE is_active = TRUE
          GROUP BY bot_id
        ) c ON c.bot_id = b.id
        WHERE b.user_id = $1
      `, [userId]);

      const status = statusResult.rows[0] || {
        is_enabled: false,
        icon_visible: false,
        settings: {}
      };

      return {
        isEnabled: status.is_enabled,
        iconVisible: status.icon_visible,
        firstBotCreatedAt: status.first_bot_created_at,
        lastActivityAt: status.last_activity_at,
        settings: status.settings || {},
        botCount: {
          total: parseInt(botsResult.rows[0]?.total || 0),
          active: parseInt(botsResult.rows[0]?.active || 0)
        },
        stats: {
          totalChats: parseInt(statsResult.rows[0]?.total_chats || 0),
          totalMessages: parseInt(statsResult.rows[0]?.total_messages || 0)
        }
      };
    } catch (error) {
      // Handle case where table doesn't exist
      if (error.message.includes('does not exist')) {
        logger.warn('telegram_app_status table not found, returning defaults');
        return {
          isEnabled: false,
          iconVisible: false,
          settings: {},
          botCount: { total: 0, active: 0 },
          stats: { totalChats: 0, totalMessages: 0 }
        };
      }
      logger.error('Error getting app status:', error);
      throw error;
    }
  }

  /**
   * Get data for dashboard icon display
   * @param {number} userId - User ID
   * @returns {Promise<Object|null>} App data or null if icon shouldn't show
   */
  async getDashboardAppData(userId) {
    try {
      const status = await this.getAppStatus(userId);

      // Icon always visible after first bot (per user preference)
      // If no status yet but user has bots, show icon
      if (!status.iconVisible && status.botCount.total === 0) {
        return null;
      }

      // Build description based on state
      let description;
      if (status.botCount.active > 0) {
        description = `${status.botCount.active} aktive${status.botCount.active === 1 ? 'r' : ''} Bot${status.botCount.active !== 1 ? 's' : ''}`;
      } else if (status.botCount.total > 0) {
        description = `${status.botCount.total} Bot${status.botCount.total !== 1 ? 's' : ''} konfiguriert`;
      } else {
        description = 'Bot erstellen';
      }

      return {
        id: 'telegram-bot-app',
        name: 'Telegram Bot',
        description,
        icon: 'FiSend',
        status: status.botCount.active > 0 ? 'running' : 'installed',
        hasCustomPage: true,
        customPageRoute: '/telegram-app',
        badge: status.botCount.total > 0 ? status.botCount.total.toString() : null,
        stats: status.stats
      };
    } catch (error) {
      logger.error('Error getting dashboard app data:', error);
      return null;
    }
  }

  /**
   * Activate the app for a user
   * @param {number} userId - User ID
   * @returns {Promise<boolean>}
   */
  async activateApp(userId) {
    try {
      await database.query(`SELECT activate_telegram_app($1)`, [userId]);
      logger.info(`Telegram App activated for user ${userId}`);
      return true;
    } catch (error) {
      // Fallback if function doesn't exist
      if (error.message.includes('does not exist')) {
        await database.query(`
          INSERT INTO telegram_app_status (user_id, is_enabled, icon_visible)
          VALUES ($1, TRUE, TRUE)
          ON CONFLICT (user_id) DO UPDATE SET
            is_enabled = TRUE,
            icon_visible = TRUE,
            last_activity_at = NOW()
        `, [userId]);
        logger.info(`Telegram App activated for user ${userId} (fallback)`);
        return true;
      }
      logger.error('Error activating app:', error);
      throw error;
    }
  }

  /**
   * Update app settings for a user
   * @param {number} userId - User ID
   * @param {Object} settings - Settings to update
   * @returns {Promise<Object>} Updated settings
   */
  async updateSettings(userId, settings) {
    try {
      // Merge with existing settings
      const result = await database.query(`
        UPDATE telegram_app_status
        SET settings = settings || $2::jsonb,
            last_activity_at = NOW()
        WHERE user_id = $1
        RETURNING settings
      `, [userId, JSON.stringify(settings)]);

      if (result.rows.length === 0) {
        // Create record if doesn't exist
        const insertResult = await database.query(`
          INSERT INTO telegram_app_status (user_id, settings)
          VALUES ($1, $2::jsonb)
          RETURNING settings
        `, [userId, JSON.stringify(settings)]);
        return insertResult.rows[0].settings;
      }

      return result.rows[0].settings;
    } catch (error) {
      logger.error('Error updating settings:', error);
      throw error;
    }
  }

  /**
   * Record activity (updates last_activity_at)
   * @param {number} userId - User ID
   */
  async recordActivity(userId) {
    try {
      await database.query(`
        UPDATE telegram_app_status
        SET last_activity_at = NOW()
        WHERE user_id = $1
      `, [userId]);
    } catch (error) {
      // Non-critical, just log
      logger.debug('Error recording activity:', error.message);
    }
  }

  /**
   * Get quick stats for all users (admin endpoint)
   * @returns {Promise<Object>}
   */
  async getGlobalStats() {
    try {
      const result = await database.query(`
        SELECT
          COUNT(DISTINCT user_id) as users_with_bots,
          COUNT(*) as total_bots,
          COUNT(*) FILTER (WHERE is_active = TRUE) as active_bots,
          (SELECT COUNT(*) FROM telegram_bot_chats WHERE is_active = TRUE) as total_chats
        FROM telegram_bots
      `);

      return {
        usersWithBots: parseInt(result.rows[0]?.users_with_bots || 0),
        totalBots: parseInt(result.rows[0]?.total_bots || 0),
        activeBots: parseInt(result.rows[0]?.active_bots || 0),
        totalChats: parseInt(result.rows[0]?.total_chats || 0)
      };
    } catch (error) {
      logger.error('Error getting global stats:', error);
      return {
        usersWithBots: 0,
        totalBots: 0,
        activeBots: 0,
        totalChats: 0
      };
    }
  }
}

module.exports = new TelegramAppService();
