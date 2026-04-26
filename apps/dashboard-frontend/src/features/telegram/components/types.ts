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
