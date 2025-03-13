import { PrismaClient } from '@prisma/client';
import { Logger } from 'pino';

type UserContext = {
  id: string;
  language: string;
  authorizations: ('ADMIN' | 'SYSTEM_ADMIN')[];
  accountStatus: 'DISABLED' | 'ENABLED' | 'NOT_VERIFIED';
  email?: string | null;
  name?: string | null;
} | null;

export interface AppContext {
  user: UserContext;
  apiType: 'REST' | 'TRPC';
  logger: Logger;
  db: PrismaClient;
  license?: {
    daysLeft: number;
    isExpired: boolean;
    shouldWarn: boolean;
  };
}
