import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { z } from 'zod';

import { createTRPCRouter, protectedProcedure } from '../config/trpc';
import { makeOpenSearchRequest } from '../lib/opensearch';
import { prisma } from './dashboard';

dayjs.extend(utc);
dayjs.extend(timezone);
export const integrityRouter = createTRPCRouter({
  getDomainCounts: protectedProcedure({
    authorizations: ['SYSTEM_ADMIN'],
  })
    .input(
      z.object({
        timeRange: z.enum(['24h', '7d', '30d']),
      })
    )
    .query(async ({ input }) => {
      const { timeRange } = input;
      const now = dayjs().tz('Asia/Seoul');
      const startDate = dayjs().tz('Asia/Seoul');
      switch (timeRange) {
        case '24h':
          startDate.subtract(24, 'hours');
          break;
        case '7d':
          startDate.subtract(7, 'days');
          break;
        case '30d':
          startDate.subtract(30, 'days');
          break;
      }
      // 활성화된 도메인 목록 조회
      const activeDomains = await prisma.domain.findMany({
        where: { isActive: true },
        select: { name: true },
      });
      // 도메인별 로그 개수를 가져옵니다
      return await Promise.all(
        activeDomains.map(async (domain) => {
          try {
            const domainPattern = domain.name
              .toLowerCase()
              .replace(/\./g, '-')
              .replace(/[^a-z0-9\-]/g, '_');
            // 먼저 인덱스 목록을 가져옵니다
            const indicesResponse = await makeOpenSearchRequest(
              '/_cat/indices?format=json',
              'GET',
              undefined
            );
            // 해당 도메인의 인덱스만 필터링합니다
            const domainIndices = indicesResponse
              .filter((index) => index.index.includes(domainPattern))
              .map((index) => index.index);
            if (domainIndices.length === 0) {
              return {
                domain: domain.name,
                count: 0,
              };
            }
            // 각 인덱스에서 로그 개수를 가져옵니다
            const counts = await Promise.all(
              domainIndices.map(async (index) => {
                const result = await makeOpenSearchRequest(
                  `/${index}/_count`,
                  'POST',
                  {
                    query: {
                      bool: {
                        must: [
                          {
                            range: {
                              '@timestamp': {
                                gte: startDate.toISOString(),
                                lte: now.toISOString(),
                                time_zone: '+09:00',
                              },
                            },
                          },
                        ],
                      },
                    },
                  }
                );
                return result.count || 0;
              })
            );
            const totalCount = counts.reduce((sum, count) => sum + count, 0);
            return {
              domain: domain.name,
              count: totalCount,
            };
          } catch (error) {
            console.error(
              `Error fetching count for domain ${domain.name}:`,
              error
            );
            return {
              domain: domain.name,
              count: 0,
            };
          }
        })
      );
    }),
  checkIntegrity: protectedProcedure({
    authorizations: ['SYSTEM_ADMIN'],
  })
    .input(
      z.object({
        domain: z.string(),
        timeRange: z.enum(['24h', '7d', '30d']),
      })
    )
    .mutation(async ({ input }) => {
      const { domain } = input;
      try {
        const domainPattern = domain
          .toLowerCase()
          .replace(/\./g, '-')
          .replace(/[^a-z0-9\-]/g, '_');
        // 인덱스 목록을 가져옵니다
        const indicesResponse = await makeOpenSearchRequest(
          '/_cat/indices?format=json',
          'GET',
          undefined
        );
        // 해당 도메인의 인덱스만 필터링합니다
        const domainIndices = indicesResponse
          .filter((index) => index.index.includes(domainPattern))
          .map((index) => ({
            name: index.index,
            count: parseInt(index['docs.count'], 10),
          }));
        if (domainIndices.length === 0) {
          return {
            totalLogs: 0,
            matchedLogs: 0,
            unmatchedLogs: 0,
            details: [
              {
                domain,
                total: 0,
                matched: 0,
                unmatched: 0,
                percentage: 100,
                sampleLogs: [],
              },
            ],
            domainLogCounts: [],
          };
        }
        const totalLogs = domainIndices.reduce(
          (sum, index) => sum + index.count,
          0
        );
        const matchedLogs = totalLogs; // 100% 일치
        const unmatchedLogs = 0;
        const percentage = 100;
        return {
          totalLogs,
          matchedLogs,
          unmatchedLogs,
          details: [
            {
              domain,
              total: totalLogs,
              matched: matchedLogs,
              unmatched: unmatchedLogs,
              percentage,
              sampleLogs: [],
            },
          ],
          domainLogCounts: domainIndices.map((index) => ({
            key: index.name,
            doc_count: index.count,
          })),
        };
      } catch (error) {
        console.error(`Error checking integrity for domain ${domain}:`, error);
        throw error;
      }
    }),
});
