export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  action?: 'unlock' | 'lock';
}

export interface ContextSettings {
  currentTime: string;
  unlockSceneDesc: string;
  supplementaryTips: string;
  userInfo: string;
}

export interface UnlockAllowance {
  scenario: string;
  durationMinutes?: number;
  expiresAt?: string;
  notes?: string;
}

export interface AssistantReply {
  reply: string;
  followUpQuestion?: string;
  action?: 'unlock' | 'lock';
  allowance?: UnlockAllowance | null;
}
