import { ReactNode, Suspense } from 'react';

import { ADMIN_PATH } from '@/features/admin/constants';
import { GuardAuthenticated } from '@/features/auth/GuardAuthenticated';

export default function ManagementLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense>
      <GuardAuthenticated
        authorizations={['SYSTEM_ADMIN']}
        loginPath={`${ADMIN_PATH}/login`}
      >
        {children}
      </GuardAuthenticated>
    </Suspense>
  );
}
