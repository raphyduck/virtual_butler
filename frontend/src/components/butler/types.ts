import type { ButlerJob } from '@/lib/api';
import type { AgentStep } from '@/lib/ws';

export type ChatRole = 'user' | 'butler' | 'system';

export interface TextMessage {
  id: string;
  kind: 'text';
  role: ChatRole;
  content: string;
  streaming?: boolean;
}

export interface JobMessage {
  id: string;
  kind: 'job';
  job: ButlerJob;
  steps: AgentStep[];
}

export type ChatMessage = TextMessage | JobMessage;
