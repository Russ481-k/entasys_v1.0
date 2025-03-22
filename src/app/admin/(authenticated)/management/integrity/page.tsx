'use client';

import { Suspense } from 'react';

import { PageAdminIntegrity } from '@/features/management/integrity/PageAdminIntegrity';

export default function Page() {
  return (
    <Suspense>
      <PageAdminIntegrity />
    </Suspense>
  );
}
