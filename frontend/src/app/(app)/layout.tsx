'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import ButlerChat from '@/components/ButlerChat';
import { useAuthStore } from '@/store/auth';
import clsx from 'clsx';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/settings', label: 'Settings' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, init, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-bold tracking-tight text-brand-600">
              Virtual Butler
            </Link>
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'text-sm transition-colors',
                  pathname === href ? 'font-medium text-gray-900' : 'text-gray-500 hover:text-gray-800',
                )}
              >
                {label}
              </Link>
            ))}
          </div>
          <button onClick={logout} className="btn-ghost text-xs">
            Sign out
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>

      {/* Butler floating chat — available across all authenticated pages */}
      <ButlerChat />
    </div>
  );
}
