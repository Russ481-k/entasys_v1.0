'use client';

import { Suspense } from 'react';

import PageAdminDomainUpdate from '@/features/domains/PageAdminDomainUpdate';

export default function Page() {
  return (
    <Suspense>
      <PageAdminDomainUpdate />
    </Suspense>
  );
}
