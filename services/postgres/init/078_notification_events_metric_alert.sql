-- Migration 078: Whitelist 'metric_alert' for Telegram notifications.
-- alertEngine now queues metric_alert events via telegramNotificationService
-- (Phase 5.1a). Without this, shouldSendNotification() in the backend filters
-- them out for existing admins because their event_types column was seeded in
-- 019 before metric_alert existed.

-- 1. Backfill: append 'metric_alert' to every row that doesn't already have it.
UPDATE notification_settings
SET event_types = array_append(event_types, 'metric_alert')
WHERE NOT ('metric_alert' = ANY(event_types));

-- 2. Forward-compat: change the column default so fresh rows include it too.
ALTER TABLE notification_settings
    ALTER COLUMN event_types
    SET DEFAULT ARRAY['service_status', 'workflow_event', 'system_boot', 'self_healing', 'metric_alert'];
