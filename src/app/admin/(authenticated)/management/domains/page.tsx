'use client';

import { Suspense } from 'react';

import PageAdminDomains from '@/features/domains/PageAdminDomains';

export default function Page() {
  return (
    <Suspense>
      <PageAdminDomains />
    </Suspense>
  );
}
