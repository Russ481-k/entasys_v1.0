'use client';

import { Suspense } from 'react';

import PageAdminDomainCreate from '@/features/domains/PageAdminDomainCreate';

export default function Page() {
  return (
    <Suspense>
      <PageAdminDomainCreate />
    </Suspense>
  );
}
