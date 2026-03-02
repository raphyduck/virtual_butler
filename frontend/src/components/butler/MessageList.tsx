import type { ButlerJob } from '@/lib/api';
import type { ChatMessage } from './types';
import { JobCard } from './JobCard';

type Variant = 'compact' | 'full';

export function MessageList({ messages, onJobUpdate, variant }: { messages: ChatMessage[]; onJobUpdate: (id: string, job: ButlerJob) => void; variant: Variant }) {
  const compact = variant === 'compact';

  return (
    <>
      {messages.map((msg) => {
        if (msg.kind === 'job') {
          return (
            <div key={msg.id} className={compact ? 'px-3' : 'max-w-2xl'}>
              <JobCard job={msg.job} steps={msg.steps} onUpdate={(job) => onJobUpdate(msg.id, job)} variant={variant} />
            </div>
          );
        }

        if (msg.role === 'system') {
          return <div key={msg.id} className={compact ? 'px-3 py-1 text-center text-[11px] text-gray-400' : 'py-1 text-center text-xs text-gray-400'}>{msg.content}</div>;
        }

        const user = msg.role === 'user';
        return (
          <div key={msg.id} className={`${user ? 'justify-end' : 'justify-start'} flex ${compact ? 'px-3' : ''}`}>
            <div className={`${compact ? 'max-w-[85%] px-3 py-2 text-sm' : 'max-w-2xl px-4 py-3 text-sm'} rounded-2xl leading-relaxed ${user ? 'rounded-br-sm bg-green-600 text-white' : 'rounded-bl-sm bg-gray-100 text-gray-900'}`}>
              {msg.content.split('\n').map((line, i, all) => (
                <span key={i}>{line}{i < all.length - 1 && <br />}</span>
              ))}
              {msg.streaming && <span className="ml-1 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-gray-400" />}
            </div>
          </div>
        );
      })}
    </>
  );
}
