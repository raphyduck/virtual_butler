import type { ButlerConversationSummary } from '@/lib/api';
import { formatDate } from './constants';

type Variant = 'compact' | 'full';

export function ConversationSidebar({ activeId, conversations, loading, onNew, onSelect, variant }: { activeId: string | null; conversations: ButlerConversationSummary[]; loading: boolean; onNew: () => void; onSelect: (id: string) => void; variant: Variant }) {
  const compact = variant === 'compact';
  return (
    <div className={compact ? 'flex w-44 shrink-0 flex-col border-r border-gray-100 bg-gray-50' : 'flex w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50'}>
      <div className={compact ? 'p-2' : 'p-3'}>
        <button onClick={onNew} className={compact ? 'flex w-full items-center gap-1.5 rounded-lg border border-green-200 bg-white px-2 py-1.5 text-xs font-medium text-green-700 shadow-sm transition-colors hover:border-green-300 hover:bg-green-50' : 'flex w-full items-center gap-1.5 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm font-medium text-green-700 shadow-sm transition-colors hover:border-green-300 hover:bg-green-50'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <p className={compact ? 'px-2 py-3 text-center text-[10px] text-gray-400' : 'px-3 py-4 text-center text-xs text-gray-400'}>Loading…</p>}
        {!loading && conversations.length === 0 && <p className={compact ? 'px-2 py-3 text-center text-[10px] text-gray-400' : 'px-3 py-4 text-center text-xs text-gray-400'}>No past chats</p>}
        {conversations.map((conversation) => {
          const active = conversation.id === activeId;
          const preview = conversation.preview?.trim();
          const hasPreview = preview && !['empty', '(empty)'].includes(preview.toLowerCase());
          return (
            <button key={conversation.id} onClick={() => onSelect(conversation.id)} className={compact ? `w-full px-2 py-2 text-left transition-colors hover:bg-gray-100 ${active ? 'border-r-2 border-green-500 bg-green-50' : ''}` : `w-full px-3 py-2.5 text-left transition-colors hover:bg-gray-100 ${active ? 'border-r-2 border-green-500 bg-green-50' : ''}`}>
              <p className={compact ? `text-[10px] font-medium ${active ? 'text-green-700' : 'text-gray-500'}` : `text-xs font-medium ${active ? 'text-green-700' : 'text-gray-500'}`}>{formatDate(conversation.updated_at)}</p>
              <p className={compact ? 'mt-0.5 line-clamp-2 text-[11px] leading-tight text-gray-700' : 'mt-0.5 line-clamp-2 text-xs leading-tight text-gray-700'}>{hasPreview ? preview : <span className="italic text-gray-400">Empty chat</span>}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
