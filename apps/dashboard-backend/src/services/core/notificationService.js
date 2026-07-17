/**
 * Notification Service
 *
 * Channel-neutral notification event recorder. Persists notification events to
 * the database via the `record_notification_event` stored procedure so that
 * events surface in the dashboard event feed. Delivery channels (if any) are
 * decoupled from this write path — this service only records the event.
 */

const db = require('../../database');
const logger = require('../../utils/logger');

class NotificationService {
  /**
   * Record a notification event in the database.
   * @param {object} eventData - event fields (event_type, event_category,
   *   source_service, severity, title, message, metadata).
   * @returns {Promise<{success: boolean, eventId?: number, error?: string}>}
   */
  async queueNotification(eventData) {
    try {
      const result = await db.query(
        `SELECT record_notification_event($1, $2, $3, $4, $5, $6, $7)`,
        [
          eventData.event_type,
          eventData.event_category,
          eventData.source_service || null,
          eventData.severity || 'info',
          eventData.title,
          eventData.message || null,
          JSON.stringify(eventData.metadata || {}),
        ]
      );

      const eventId = result.rows[0].record_notification_event;
      logger.debug(`Notification event queued with ID: ${eventId}`);

      return { success: true, eventId };
    } catch (error) {
      logger.error(`Failed to queue notification: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

// Singleton instance
const notificationService = new NotificationService();

module.exports = notificationService;
