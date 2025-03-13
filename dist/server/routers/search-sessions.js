import { z } from 'zod';

import { createTRPCRouter, protectedProcedure } from '@/server/config/trpc';
import { SearchSessionService } from '@/server/services/search-session.service';

import { prisma } from '../config/prisma';

const searchSessionService = new SearchSessionService(prisma);
export const searchSessionRouter = createTRPCRouter({
  create: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
    .input(
      z.object({
        searchId: z.string(),
        searchParams: z.object({
          timeFrom: z.string(),
          timeTo: z.string(),
          menu: z.enum(['TRAFFIC', 'THREAT', 'SYSTEM']),
          searchTerm: z.string(),
          currentPage: z.number().optional(),
          limit: z.number().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existingSession = await searchSessionService.findActiveByUserId(
        ctx.user.id
      );
      // 기존 활성 세션이 있다면 취소
      if (existingSession.length > 0) {
        await Promise.all(
          existingSession.map((session) =>
            searchSessionService.cancelSession(
              session.id,
              '새로운 검색 세션 시작으로 인한 취소'
            )
          )
        );
      }
      return searchSessionService.create({
        userId: ctx.user.id,
        clientIp: ctx.clientIp,
        userAgent: ctx.userAgent,
        searchId: input.searchId,
        searchParams: input.searchParams,
      });
    }),
  cancel: protectedProcedure()
    .input(
      z.object({
        searchId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await searchSessionService.findBySearchId(input.searchId);
      if (!session) {
        throw new Error('검색 세션을 찾을 수 없습니다.');
      }
      if (session.userId !== ctx.user.id) {
        throw new Error('권한이 없습니다.');
      }
      return searchSessionService.cancelSession(session.id, input.reason);
    }),
  getStatus: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
    .input(z.object({ searchId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await searchSessionService.findBySearchId(input.searchId);
      if (!session) {
        throw new Error('검색 세션을 찾을 수 없습니다.');
      }
      if (session.userId !== ctx.user.id) {
        throw new Error('권한이 없습니다.');
      }
      return {
        status: session.status,
        lastActivityAt: session.lastActivityAt,
      };
    }),
  cleanup: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
    .input(z.object({ maxAgeMinutes: z.number().min(1).default(30) }))
    .mutation(async ({ input }) => {
      return searchSessionService.cleanupInactiveSessions(input.maxAgeMinutes);
    }),
});
