import type { ButlerMessageOut } from '@/lib/api';
import type { ChatMessage } from './types';

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Queued…',
  planning: 'Agent is exploring the codebase…',
  planned: 'Plan ready — review below',
  confirmed: 'Preparing to apply…',
  applying: 'Writing files…',
  committing: 'Committing…',
  pushing: 'Pushing to GitHub…',
  awaiting_merge: 'PR created — review and merge below',
  merging: 'Merging pull request…',
  building: 'Building Docker images…',
  deploying: 'Deploying new version…',
  restarting: 'Restarting the application…',
  done: 'Changes applied successfully',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  planning: 'bg-green-100 text-green-700',
  planned: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-700',
  applying: 'bg-green-100 text-green-700',
  committing: 'bg-green-100 text-green-700',
  pushing: 'bg-green-100 text-green-700',
  awaiting_merge: 'bg-blue-100 text-blue-800',
  merging: 'bg-blue-100 text-blue-700',
  building: 'bg-orange-100 text-orange-700',
  deploying: 'bg-orange-100 text-orange-700',
  restarting: 'bg-orange-100 text-orange-700',
  done: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

export const STEP_PREFIX: Record<string, string> = {
  list_files: 'ls',
  read_file: 'rd',
  search_code: 'gr',
  edit_file: 'ed',
  plan_change: '→ ',
  finish: '✓ ',
};

export const STEP_COLOR: Record<string, string> = {
  list_files: 'text-gray-400',
  read_file: 'text-gray-400',
  search_code: 'text-gray-400',
  edit_file: 'text-blue-600 font-medium',
  plan_change: 'text-green-700 font-medium',
  finish: 'text-green-700 font-medium',
};

export const uid = () => Math.random().toString(36).slice(2);

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const toChatMessages = (messages: ButlerMessageOut[]): ChatMessage[] =>
  messages.map((message) => ({
    id: message.id,
    kind: 'text',
    role: message.role === 'user' ? 'user' : 'butler',
    content: message.content,
  }));
