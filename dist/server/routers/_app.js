import { createTRPCRouter } from '@/server/config/trpc';

import { accountRouter } from './account';
import { authRouter } from './auth';
import { dashboardRouter } from './dashboard';
import { domainsRouter } from './domains';
import { downloadRouter } from './download';
import { integrityRouter } from './integrity';
import { projectsRouter } from './projects';
import { searchSessionRouter } from './search-sessions';
import { usersRouter } from './users';

export const appRouter = createTRPCRouter({
  download: downloadRouter,
  searchSessions: searchSessionRouter,
  account: accountRouter,
  auth: authRouter,
  dashboard: dashboardRouter,
  domains: domainsRouter,
  users: usersRouter,
  integrity: integrityRouter,
  projects: projectsRouter,
});
