'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSetupStatus } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, init } = useAuthStore();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    getSetupStatus()
      .then(({ setup_required }) => {
        if (setup_required) {
          router.replace('/setup');
        } else if (isAuthenticated) {
          router.replace('/dashboard');
        } else {
          router.replace('/login');
        }
      })
      .catch(() => {
        if (isAuthenticated) {
          router.replace('/dashboard');
        } else {
          router.replace('/login');
        }
      });
  }, [isAuthenticated, router]);

  return null;
}
