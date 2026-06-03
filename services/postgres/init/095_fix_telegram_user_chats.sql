-- 095_fix_telegram_user_chats.sql
-- telegram_user_chats was referenced by telegramCommandHandlers.js (/loeschen, /auskunft)
-- and by 092_telegram_dsgvo.sql but was never created.
-- Separate from telegram_bot_chats (bot-level): this table tracks individual
-- pseudonymised users for DSGVO consent and Auskunft flows.

CREATE TABLE IF NOT EXISTS telegram_user_chats (
  id              BIGSERIAL PRIMARY KEY,
  bot_id          INTEGER NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  chat_id         TEXT NOT NULL,
  telegram_user_id_hash TEXT,
  chat_title      TEXT,
  chat_type       TEXT,
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bot_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_user_chats_bot_id
  ON telegram_user_chats(bot_id);

CREATE INDEX IF NOT EXISTS idx_telegram_user_chats_chat_id
  ON telegram_user_chats(chat_id);

CREATE INDEX IF NOT EXISTS idx_telegram_user_chats_user_hash
  ON telegram_user_chats(telegram_user_id_hash)
  WHERE telegram_user_id_hash IS NOT NULL;
