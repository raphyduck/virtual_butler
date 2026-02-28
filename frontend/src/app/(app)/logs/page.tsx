'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getLogs, type LogEntry } from '@/lib/api';
import { getToken } from '@/lib/auth';
import clsx from 'clsx';

const LEVELS = ['ALL', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;

const WS_BASE =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_WS_URL ??
      `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8000`)
    : 'ws://localhost:8000';

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'text-gray-400',
  INFO: 'text-blue-600',
  WARNING: 'text-amber-600',
  ERROR: 'text-red-600',
  CRITICAL: 'text-red-800 font-bold',
};

export default function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch initial logs
  useEffect(() => {
    setLoading(true);
    getLogs(2000)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // WebSocket for live streaming
  useEffect(() => {
    if (!live) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    const token = getToken();
    const ws = new WebSocket(`${WS_BASE}/ws/logs${token ? `?token=${token}` : ''}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const entry: LogEntry = JSON.parse(e.data);
        setEntries((prev) => {
          const next = [...prev, entry];
          // Cap at 2000 in-memory
          return next.length > 2000 ? next.slice(-2000) : next;
        });
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      // will auto-close
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [live]);

  // Auto-scroll when live
  useEffect(() => {
    if (live) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries, live]);

  const filtered = useCallback(() => {
    return entries.filter((e) => {
      if (level !== 'ALL' && e.level !== level) return false;
      if (search && !e.message.toLowerCase().includes(search.toLowerCase()) && !e.logger.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [entries, level, search]);

  const visible = filtered();

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">System Logs</h1>
        <div className="flex items-center gap-3">
          {/* Live toggle */}
          <button
            onClick={() => setLive((v) => !v)}
            className={clsx(
              'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
              live
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            <span
              className={clsx(
                'inline-block h-2 w-2 rounded-full',
                live ? 'animate-pulse bg-green-500' : 'bg-gray-400',
              )}
            />
            {live ? 'Live' : 'Paused'}
          </button>

          {/* Level filter */}
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="Filter logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
          />

          {/* Clear */}
          <button
            onClick={() => setEntries([])}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-950 font-mono text-xs"
      >
        {loading ? (
          <p className="p-4 text-gray-500">Loading logs...</p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-gray-500">No log entries{level !== 'ALL' || search ? ' matching filter' : ''}.</p>
        ) : (
          <table className="w-full">
            <tbody>
              {visible.map((entry, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-800/50 hover:bg-gray-900/50"
                >
                  <td className="whitespace-nowrap px-3 py-1 text-gray-500">
                    {new Date(entry.ts).toLocaleTimeString()}
                  </td>
                  <td
                    className={clsx(
                      'w-20 whitespace-nowrap px-2 py-1 font-semibold',
                      LEVEL_COLORS[entry.level] ?? 'text-gray-400',
                    )}
                  >
                    {entry.level}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 text-purple-400">
                    {entry.logger}
                  </td>
                  <td className="w-full break-all px-2 py-1 text-gray-300">
                    {entry.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span>
          {visible.length} entries{visible.length !== entries.length && ` (${entries.length} total)`}
        </span>
        <span>
          {live && wsRef.current?.readyState === WebSocket.OPEN
            ? 'Connected — streaming live'
            : live
              ? 'Reconnecting...'
              : 'Paused — click Live to resume'}
        </span>
      </div>
    </div>
  );
}
