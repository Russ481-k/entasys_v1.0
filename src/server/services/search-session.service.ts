import { Prisma, PrismaClient } from '@prisma/client';

import {
  CreateSearchSessionInput,
  SearchSession,
  UpdateSearchSessionInput,
} from '@/types/search-session';

export class SearchSessionService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  async create(input: CreateSearchSessionInput): Promise<SearchSession> {
    const session = await this.prisma.searchSession.create({
      data: {
        userId: input.userId,
        clientIp: input.clientIp,
        userAgent: input.userAgent,
        searchId: input.searchId,
        status: 'ACTIVE',
        searchParams: input.searchParams as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      ...session,
      searchParams:
        session.searchParams as unknown as SearchSession['searchParams'],
    };
  }

  async update(
    id: string,
    input: UpdateSearchSessionInput
  ): Promise<SearchSession> {
    const session = await this.prisma.searchSession.update({
      where: { id },
      data: {
        ...input,
        updatedAt: new Date(),
      },
    });

    return {
      ...session,
      searchParams:
        session.searchParams as unknown as SearchSession['searchParams'],
    };
  }

  async findById(id: string): Promise<SearchSession | null> {
    const session = await this.prisma.searchSession.findUnique({
      where: { id },
    });

    if (!session) return null;

    return {
      ...session,
      searchParams:
        session.searchParams as unknown as SearchSession['searchParams'],
    };
  }

  async findBySearchId(searchId: string): Promise<SearchSession | null> {
    console.log(`[SearchSession] Finding session by searchId: ${searchId}`);

    const session = await this.prisma.$transaction(
      async (tx) => {
        const result = await tx.searchSession.findUnique({
          where: { searchId },
          select: {
            id: true,
            userId: true,
            clientIp: true,
            userAgent: true,
            searchId: true,
            status: true,
            searchParams: true,
            createdAt: true,
            updatedAt: true,
            lastActivityAt: true,
            cancelReason: true,
          },
        });

        if (!result) {
          console.log(
            `[SearchSession] No session found for searchId: ${searchId}`
          );
          return null;
        }

        // 상태가 CANCELLED로 변경되었는지 한번 더 확인
        const latestStatus = await tx.searchSession.findUnique({
          where: { id: result.id },
          select: { status: true },
        });

        if (latestStatus?.status !== result.status) {
          console.log(
            `[SearchSession] Session status changed during transaction:`,
            {
              from: result.status,
              to: latestStatus?.status,
            }
          );
          return {
            ...result,
            status: latestStatus?.status,
          };
        }

        return result;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 2000,
      }
    );

    return session
      ? {
          ...session,
          searchParams:
            session.searchParams as unknown as SearchSession['searchParams'],
          status: session.status ?? 'ERROR',
        }
      : null;
  }

  async findActiveByUserId(userId: string): Promise<SearchSession[]> {
    const sessions = await this.prisma.searchSession.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
    });

    return sessions.map((session) => ({
      ...session,
      searchParams:
        session.searchParams as unknown as SearchSession['searchParams'],
    }));
  }

  async cancelSession(id: string, reason?: string): Promise<SearchSession> {
    console.log(`[SearchSession] Attempting to cancel session: ${id}`);

    const result = await this.prisma.$transaction(
      async (tx) => {
        const currentSession = await tx.searchSession.findUnique({
          where: { id },
        });

        console.log(`[SearchSession] Current session state before cancel:`, {
          id: currentSession?.id,
          status: currentSession?.status,
          lastActivityAt: currentSession?.lastActivityAt,
        });

        const updatedSession = await tx.searchSession.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelReason: reason,
            lastActivityAt: new Date(),
          },
        });

        console.log(`[SearchSession] Session updated to cancelled:`, {
          id: updatedSession.id,
          status: updatedSession.status,
          lastActivityAt: updatedSession.lastActivityAt,
        });

        return updatedSession;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    return {
      ...result,
      searchParams:
        result.searchParams as unknown as SearchSession['searchParams'],
    };
  }

  async cancelSessionBySearchId(
    searchId: string,
    reason?: string
  ): Promise<SearchSession | null> {
    console.log(
      `[SearchSession] Attempting to cancel session with searchId: ${searchId}`
    );

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // 세션 조회 (FOR UPDATE)
          const session = await tx.searchSession.findUnique({
            where: { searchId },
            select: {
              id: true,
              status: true,
              searchId: true,
              userId: true,
              clientIp: true,
              userAgent: true,
              searchParams: true,
              cancelReason: true,
              createdAt: true,
              updatedAt: true,
              lastActivityAt: true,
            },
          });

          if (!session) {
            console.log(
              `[SearchSession] Session not found for searchId: ${searchId}`
            );
            return null;
          }

          if (session.status !== 'ACTIVE') {
            console.log(`[SearchSession] Session is already ${session.status}`);
            return {
              ...session,
              searchParams:
                session.searchParams as unknown as SearchSession['searchParams'],
            };
          }

          // 상태 업데이트
          const updatedSession = await tx.searchSession.update({
            where: { id: session.id },
            data: {
              status: 'CANCELLED',
              cancelReason: reason,
              lastActivityAt: new Date(),
            },
          });

          console.log(`[SearchSession] Successfully cancelled session:`, {
            id: updatedSession.id,
            status: updatedSession.status,
            searchId: updatedSession.searchId,
          });

          return {
            ...updatedSession,
            searchParams:
              updatedSession.searchParams as unknown as SearchSession['searchParams'],
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000, // 30초 타임아웃
        }
      );
    } catch (error) {
      console.error('[SearchSession] Failed to cancel session:', error);
      throw error;
    }
  }

  async cleanupInactiveSessions(maxAgeMinutes: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    const result = await this.prisma.searchSession.deleteMany({
      where: {
        OR: [
          { status: 'COMPLETED' },
          { status: 'CANCELLED' },
          { status: 'ERROR' },
          {
            AND: [{ status: 'ACTIVE' }, { lastActivityAt: { lt: cutoffDate } }],
          },
        ],
      },
    });
    return result.count;
  }

  // 테스트용 유틸리티 함수
  async getSessionStats(): Promise<{
    active: number;
    cancelled: number;
    completed: number;
    error: number;
  }> {
    const [active, cancelled, completed, error] = await Promise.all([
      this.prisma.searchSession.count({ where: { status: 'ACTIVE' } }),
      this.prisma.searchSession.count({ where: { status: 'CANCELLED' } }),
      this.prisma.searchSession.count({ where: { status: 'COMPLETED' } }),
      this.prisma.searchSession.count({ where: { status: 'ERROR' } }),
    ]);

    return {
      active,
      cancelled,
      completed,
      error,
    };
  }

  async getActiveSessionsByUser(userId: string): Promise<{
    count: number;
    sessions: SearchSession[];
  }> {
    const sessions = await this.prisma.searchSession.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      orderBy: {
        lastActivityAt: 'desc',
      },
    });

    return {
      count: sessions.length,
      sessions: sessions.map((session) => ({
        ...session,
        searchParams:
          session.searchParams as unknown as SearchSession['searchParams'],
      })),
    };
  }
}
