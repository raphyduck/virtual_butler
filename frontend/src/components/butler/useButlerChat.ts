import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  getAppSettings,
  type ButlerConversationSummary,
  type ButlerJob,
  createButlerConversation,
  getButlerConversation,
  getModifyJob,
  listButlerConversations,
  updateAppSettings,
} from '@/lib/api';
import { ButlerWebSocket, type ButlerWsEvent } from '@/lib/ws';
import { toChatMessages, uid } from './constants';
import type { ChatMessage } from './types';

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-5',
  google: 'gemini-2.5-pro',
  ollama: 'llama3.1',
};

function upsertJob(prev: ChatMessage[], eventJob: ButlerJob, resetSteps = false): ChatMessage[] {
  let found = false;
  const next: ChatMessage[] = [];
  for (const message of prev) {
    if (message.kind !== 'job') {
      next.push(message);
      continue;
    }
    if (message.job.id !== eventJob.id) {
      next.push(message);
      continue;
    }
    if (!found) {
      next.push({ ...message, job: eventJob, ...(resetSteps ? { steps: [] } : {}) });
      found = true;
    }
  }

  if (!found) next.push({ id: uid(), kind: 'job', job: eventJob, steps: [] });
  return next;
}

export function useButlerChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [conversations, setConversations] = useState<ButlerConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('anthropic');
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-6');
  const [sessionProvider, setSessionProvider] = useState<string | null>(null);
  const [sessionModel, setSessionModel] = useState<string | null>(null);

  const wsRef = useRef<ButlerWebSocket | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const refreshVisibleJobs = useCallback(async () => {
    const visibleJobs = messages.filter((message): message is Extract<ChatMessage, { kind: 'job' }> =>
      message.kind === 'job' && !['done', 'failed', 'cancelled'].includes(message.job.status));
    if (visibleJobs.length === 0) return;

    const refreshed = await Promise.all(
      visibleJobs.map(async (message) => {
        try {
          return [message.job.id, await getModifyJob(message.job.id)] as const;
        } catch {
          return null;
        }
      }),
    );

    const nextJobs = new Map(refreshed.filter((entry): entry is readonly [string, ButlerJob] => entry !== null));
    if (nextJobs.size === 0) return;

    setMessages((prev) => prev.map((message) => (
      message.kind === 'job' ? { ...message, job: nextJobs.get(message.job.id) ?? message.job } : message
    )));
  }, [messages]);

  const refreshConversations = useCallback(async () => {
    try {
      const list = await listButlerConversations();
      setConversations(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  const handleWsEvent = useCallback((event: ButlerWsEvent) => {
    if (event.type === 'chunk') {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.kind === 'text' && last.role === 'butler' && last.streaming) {
          return [...prev.slice(0, -1), { ...last, content: last.content + event.content }];
        }
        return [...prev, { id: uid(), kind: 'text', role: 'butler', content: event.content, streaming: true }];
      });
      return;
    }

    if (event.type === 'done') {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.kind === 'text' && last.role === 'butler' && last.streaming) {
          return [...prev.slice(0, -1), { ...last, streaming: false }];
        }
        return prev;
      });
      setSending(false);
      refreshConversations().then((list) => {
        if (list.length > 0) {
          setActiveConversationId((current) => current ?? list[0].id);
        }
      });
      return;
    }

    if (event.type === 'error') {
      setMessages((prev) => [...prev, { id: uid(), kind: 'text', role: 'system', content: `⚠ ${event.detail}` }]);
      setSending(false);
      return;
    }

    if (event.type === 'connected') setConnected(true);
    if (event.type === 'disconnected') setConnected(false);

    if (event.type === 'reconnected') {
      setConnected(true);
      setSending(false);
      setMessages((prev) => [...prev, { id: uid(), kind: 'text', role: 'system', content: 'Reconnected' }]);
      void refreshVisibleJobs();
      return;
    }

    if (event.type === 'modify_started' || event.type === 'modify_snapshot') {
      setMessages((prev) => upsertJob(prev, event.job, event.type === 'modify_started'));
      return;
    }

    if (event.type === 'modify_step') {
      setMessages((prev) => prev.map((m) => (m.kind === 'job' && m.job.id === event.job_id ? { ...m, steps: [...m.steps, event.step] } : m)));
      return;
    }

    if (event.type === 'modify_update' || event.type === 'modify_done') {
      setMessages((prev) => upsertJob(prev, event.job));
    }
  }, [refreshConversations, refreshVisibleJobs]);

  const connectWs = useCallback((conversationId: string | null) => {
    wsRef.current?.close();
    setConnected(false);
    const ws = new ButlerWebSocket(handleWsEvent, conversationId);
    wsRef.current = ws;
    ws.connect();
  }, [handleWsEvent]);

  useEffect(() => {
    async function init() {
      setLoadingConversations(true);
      try {
        const [list, settings] = await Promise.all([
          listButlerConversations(),
          getAppSettings().catch(() => null),
        ]);
        setConversations(list);
        if (settings?.butler_provider) setSelectedProvider(settings.butler_provider);
        if (settings?.butler_model) setSelectedModel(settings.butler_model);
        if (list.length > 0) {
          const latest = list[0];
          setActiveConversationId(latest.id);
          setSessionProvider(latest.provider);
          setSessionModel(latest.model);
          try {
            const conversation = await getButlerConversation(latest.id);
            setMessages(toChatMessages(conversation.messages));
            setSessionProvider(conversation.provider);
            setSessionModel(conversation.model);
          } catch {}
          connectWs(latest.id);
          return;
        }
        connectWs(null);
      } finally {
        setLoadingConversations(false);
      }
    }

    init();
    return () => wsRef.current?.close();
  }, [connectWs]);

  const selectConversation = useCallback(async (id: string) => {
    if (id === activeConversationId) return;
    setActiveConversationId(id);
    setMessages([]);
    setSending(false);
    try {
      const conversation = await getButlerConversation(id);
      setMessages(toChatMessages(conversation.messages));
      setSessionProvider(conversation.provider);
      setSessionModel(conversation.model);
    } catch {}
    connectWs(id);
  }, [activeConversationId, connectWs]);

  const startNewConversation = useCallback(async () => {
    try {
      const conversation = await createButlerConversation({ provider: selectedProvider, model: selectedModel });
      setConversations((prev) => [{
        id: conversation.id,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        provider: conversation.provider,
        model: conversation.model,
        preview: null,
      }, ...prev]);
      setActiveConversationId(conversation.id);
      setSessionProvider(conversation.provider);
      setSessionModel(conversation.model);
      setMessages([]);
      setSending(false);
      connectWs(conversation.id);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch {}
  }, [connectWs, selectedModel, selectedProvider]);

  const updateJobMessage = useCallback((msgId: string, updatedJob: ButlerJob) => {
    setMessages((prev) => prev.map((m) => (m.kind === 'job' && m.id === msgId ? { ...m, job: updatedJob } : m)));
  }, []);

  const setProvider = useCallback((provider: string) => {
    const nextModel = DEFAULT_MODELS[provider] ?? selectedModel;
    setSelectedProvider(provider);
    setSelectedModel(nextModel);
    updateAppSettings({ butler_provider: provider || null, butler_model: nextModel || null }).catch(() => {});
  }, [selectedModel]);

  const setModel = useCallback((model: string) => {
    setSelectedModel(model);
    updateAppSettings({ butler_model: model || null }).catch(() => {});
  }, []);

  const send = useCallback(() => {
    const content = input.trim();
    if (!content || sending) return;

    setMessages((prev) => [...prev, { id: uid(), kind: 'text', role: 'user', content }]);
    setInput('');
    setSending(true);

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setConnected(false);
      setMessages((prev) => [...prev, {
        id: uid(),
        kind: 'text',
        role: 'system',
        content: '⚠ Not connected — reconnecting automatically…',
      }]);
      setSending(false);
      return;
    }

    wsRef.current.send(content);
  }, [input, sending]);

  const onInputKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }, [send]);

  return {
    activeConversationId,
    connected,
    conversations,
    input,
    inputRef,
    loadingConversations,
    messages,
    onInputKeyDown,
    selectConversation,
    send,
    sending,
    selectedModel,
    selectedProvider,
    sessionModel,
    sessionProvider,
    setInput,
    setModel,
    setProvider,
    startNewConversation,
    updateJobMessage,
  };
}
