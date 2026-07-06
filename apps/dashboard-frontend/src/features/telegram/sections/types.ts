export interface Bot {
  id: string;
  name: string;
  username?: string;
  isActive: boolean;
  llmProvider?: string;
  llmModel?: string;
  chatCount?: number;
  messageCount?: number;
  ragEnabled?: boolean;
  ragSpaceIds?: string[];
  toolsEnabled?: boolean;
  voiceEnabled?: boolean;
  restrictUsers?: boolean;
}

export interface AppStatus {
  isEnabled?: boolean;
}

export interface SystemConfig {
  bot_token: string;
  chat_id: string;
  enabled: boolean;
}

export interface SystemMessage {
  type: 'success' | 'error';
  text: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  username?: string;
  chat_id?: string;
  command?: string;
  message_text?: string;
  interaction_type?: string;
  success: boolean;
}

export interface BotsResponse {
  bots?: Bot[];
}

export interface TelegramConfigResponse {
  chat_id?: string;
  enabled?: boolean;
  configured?: boolean;
}

export interface SaveConfigResponse {
  has_token?: boolean;
  success?: boolean;
}

export interface AuditLogsResponse {
  logs?: AuditLog[];
}

export interface ToggleBotResponse {
  bot?: { isActive?: boolean };
}
