import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  type ButlerConversationSummary,
  type ButlerJob,
  createButlerConversation,
  getButlerConversation,
  listButlerConversations,
} from '@/lib/api';
import { ButlerWebSocket, type ButlerWsEvent } from '@/lib/ws';
import { toChatMessages, uid } from './constants';
import type { ChatMessage } from './types';

export function useButlerChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [conversations, setConversations] = useState<ButlerConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);

  const wsRef = useRef<ButlerWebSocket | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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
      return;
    }

    if (event.type === 'modify_started' || event.type === 'modify_snapshot') {
      setMessages((prev) => {
        const resetSteps = event.type === 'modify_started';
        const exists = prev.some((m) => m.kind === 'job' && m.job.id === event.job.id);
        if (exists) {
          return prev.map((m) => (
            m.kind === 'job' && m.job.id === event.job.id
              ? { ...m, job: event.job, ...(resetSteps ? { steps: [] } : {}) }
              : m
          ));
        }
        return [...prev, { id: uid(), kind: 'job', job: event.job, steps: [] }];
      });
      return;
    }

    if (event.type === 'modify_step') {
      setMessages((prev) => prev.map((m) => (m.kind === 'job' && m.job.id === event.job_id ? { ...m, steps: [...m.steps, event.step] } : m)));
      return;
    }

    if (event.type === 'modify_update' || event.type === 'modify_done') {
      setMessages((prev) => prev.map((m) => (m.kind === 'job' && m.job.id === event.job.id ? { ...m, job: event.job } : m)));
    }
  }, [refreshConversations]);

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
        const list = await listButlerConversations();
        setConversations(list);
        if (list.length > 0) {
          const latest = list[0];
          setActiveConversationId(latest.id);
          try {
            const conversation = await getButlerConversation(latest.id);
            setMessages(toChatMessages(conversation.messages));
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
    } catch {}
    connectWs(id);
  }, [activeConversationId, connectWs]);

  const startNewConversation = useCallback(async () => {
    try {
      const conversation = await createButlerConversation();
      setConversations((prev) => [{
        id: conversation.id,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        preview: null,
      }, ...prev]);
      setActiveConversationId(conversation.id);
      setMessages([]);
      setSending(false);
      connectWs(conversation.id);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch {}
  }, [connectWs]);

  const updateJobMessage = useCallback((msgId: string, updatedJob: ButlerJob) => {
    setMessages((prev) => prev.map((m) => (m.kind === 'job' && m.id === msgId ? { ...m, job: updatedJob } : m)));
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
    setInput,
    startNewConversation,
    updateJobMessage,
  };
}
