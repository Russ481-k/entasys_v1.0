import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { z } from 'zod';

import { getColumnNames } from '@/features/monitoring/columns';
import { zPaloLogs, zPaloLogsParams } from '@/features/monitoring/schemas';
import { createTRPCRouter, protectedProcedure } from '@/server/config/trpc';
import { OpenSearchClient } from '@/server/lib/opensearch';
import {
  buildOpenSearchQuery,
  parseWhereClause,
} from '@/server/lib/queryParser';
import { getCurrentVersion } from '@/utils/version';

dayjs.extend(utc);
dayjs.extend(timezone);
export async function searchOpenSearchWithScroll({
  searchBody,
  menu,
  currentPage,
  limit,
  searchId,
  onProgress,
}) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const client = OpenSearchClient.getInstance();
  try {
    const rangeQuery =
      (_d =
        (_c =
          (_b =
            (_a = searchBody.query.bool) === null || _a === void 0
              ? void 0
              : _a.must) === null || _b === void 0
            ? void 0
            : _b[0]) === null || _c === void 0
          ? void 0
          : _c.range) === null || _d === void 0
        ? void 0
        : _d['@timestamp'];
    const modifiedSearchBody = {
      track_total_hits: true,
      query: {
        bool: {
          must: [
            {
              range: {
                '@timestamp': {
                  gte:
                    rangeQuery === null || rangeQuery === void 0
                      ? void 0
                      : rangeQuery.gte,
                  lte:
                    rangeQuery === null || rangeQuery === void 0
                      ? void 0
                      : rangeQuery.lte,
                  format: 'strict_date_time',
                  time_zone: '+09:00',
                },
              },
            },
            {
              match: {
                logType: menu !== null && menu !== void 0 ? menu : 'TRAFFIC',
              },
            },
            ...(((_f =
              (_e = searchBody.query.bool) === null || _e === void 0
                ? void 0
                : _e.must) === null || _f === void 0
              ? void 0
              : _f.slice(1)) || []),
          ],
        },
      },
      sort: [{ '@timestamp': { order: 'desc' } }],
    };
    // 모든 인덱스의 총 문서 수를 가져오는 쿼리
    const countQuery = {
      index: '*', // 모든 인덱스 대상
      body: {
        query: {
          bool: {
            must: [
              {
                range: {
                  '@timestamp': {
                    gte:
                      rangeQuery === null || rangeQuery === void 0
                        ? void 0
                        : rangeQuery.gte,
                    lte:
                      rangeQuery === null || rangeQuery === void 0
                        ? void 0
                        : rangeQuery.lte,
                    format: 'strict_date_time',
                    time_zone: '+09:00',
                  },
                },
              },
              {
                match: {
                  logType: menu !== null && menu !== void 0 ? menu : 'TRAFFIC',
                },
              },
              ...(((_h =
                (_g = searchBody.query.bool) === null || _g === void 0
                  ? void 0
                  : _g.must) === null || _h === void 0
                ? void 0
                : _h.slice(1)) || []),
            ],
          },
        },
      },
    };
    // 전체 문서 수 조회
    const countResult = await client.count(countQuery);
    const totalCount = countResult.count || 0;
    const result = await client.scrollWithPagination({
      index: '*',
      body: modifiedSearchBody,
      page: currentPage,
      pageSize: limit,
      scrollTime: '2m',
      size: 1000,
      searchId: searchId || '',
    });
    if (onProgress) {
      onProgress({
        current: result.total,
        total: totalCount,
        status: 'complete',
      });
    }
    return {
      initialResponse: {
        hits: {
          total: { value: totalCount },
          hits: result.hits,
        },
        _scroll_id: result.scrollId || '',
        took: 0,
        timed_out: false,
      },
      scrollResponse: result.hits,
    };
  } catch (error) {
    console.error('Search error:', error);
    throw error;
  }
}
export const projectsRouter = createTRPCRouter({
  getAll: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
    .input(
      zPaloLogsParams().extend({
        menu: z.enum(['TRAFFIC', 'THREAT', 'SYSTEM']).optional(),
      })
    )
    .output(
      z.object({
        logs: z.array(zPaloLogs().nullish()),
        pagination: z.object({
          currentPage: z.number().min(1).default(1),
          pageLength: z.number().min(0),
          totalCnt: z.number().min(0).default(0),
        }),
        loadingStatus: z.object({
          current: z.number(),
          total: z.number(),
          status: z.enum(['ready', 'loading', 'complete', 'error']),
        }),
        scrollId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      var _a, _b, _c;
      let loadingStatus = {
        current: 0,
        total: 0,
        status: 'loading',
      };
      try {
        // 세션 ID 생성
        const sessionId = randomUUID();
        console.log('[Search] Creating new search session with ID:', sessionId);
        // 검색 세션 생성을 별도 트랜잭션으로 분리
        const searchSession = await ctx.db.$transaction(
          async (tx) => {
            const activeSessions = await tx.searchSession.findMany({
              where: {
                userId: ctx.user.id,
                status: 'ACTIVE',
              },
            });
            const sessionsToCancel = activeSessions.filter(
              (session) => session.status === 'ACTIVE'
            );
            if (sessionsToCancel.length > 0) {
              await tx.searchSession.updateMany({
                where: {
                  id: {
                    in: sessionsToCancel.map((s) => s.id),
                  },
                },
                data: {
                  status: 'CANCELLED',
                  cancelReason: '새로운 검색 시작으로 인한 취소',
                  lastActivityAt: new Date(),
                },
              });
            }
            return tx.searchSession.create({
              data: {
                userId: ctx.user.id,
                clientIp: ctx.clientIp,
                userAgent: ctx.userAgent,
                searchId: sessionId,
                status: 'ACTIVE',
                searchParams: input,
                lastActivityAt: new Date(),
              },
            });
          },
          {
            timeout: 30000, // 30초 타임아웃
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          }
        );
        console.log('[Search] Created new search session:', {
          id: searchSession.id,
          searchId: searchSession.searchId,
          status: searchSession.status,
        });
        const timeFrom = dayjs.tz(input.timeFrom, 'Asia/Seoul');
        const timeTo = dayjs.tz(input.timeTo, 'Asia/Seoul');
        const searchBody = {
          size: input.limit,
          query: {
            bool: {
              must: [
                {
                  range: {
                    '@timestamp': {
                      gte: timeFrom.toISOString(),
                      lte: timeTo.toISOString(),
                      format: 'strict_date_time',
                      time_zone: '+09:00',
                    },
                  },
                },
              ],
            },
          },
          sort: [{ '@timestamp': { order: 'desc' } }],
        };
        // searchTerm이 있을 경우 쿼리 조건 추가
        if (input.searchTerm) {
          try {
            // WHERE 절 형식인지 확인 (trim()으로 앞뒤 공백 제거 후 검사)
            const trimmedSearchTerm = input.searchTerm.trim();
            if (trimmedSearchTerm.toUpperCase().startsWith('AND')) {
              // AND로 시작하는 경우 WHERE 절 파싱
              const whereClause = trimmedSearchTerm.substring(3).trim(); // 'AND ' 제거
              console.log('Parsing where clause:', whereClause);
              const parsedQuery = parseWhereClause(whereClause);
              const opensearchQueries = buildOpenSearchQuery(parsedQuery);
              console.log(
                'Parsed OpenSearch queries:',
                JSON.stringify(opensearchQueries, null, 2)
              );
              if (
                (_a = searchBody.query.bool) === null || _a === void 0
                  ? void 0
                  : _a.must
              ) {
                searchBody.query.bool.must.push(...opensearchQueries);
              }
            } else {
              // 기존 multi_match 쿼리 사용
              const searchTermQuery = {
                multi_match: {
                  query: input.searchTerm,
                  fields: ['*'],
                  type: 'phrase',
                },
              };
              console.log(
                'Using multi_match query:',
                JSON.stringify(searchTermQuery, null, 2)
              );
              if (
                (_b = searchBody.query.bool) === null || _b === void 0
                  ? void 0
                  : _b.must
              ) {
                searchBody.query.bool.must.push(searchTermQuery);
              }
            }
          } catch (parseError) {
            console.error('Error parsing search term:', parseError);
            // 파싱 에러 시 기본 multi_match 쿼리로 폴백
            const searchTermQuery = {
              multi_match: {
                query: input.searchTerm,
                fields: ['*'],
                type: 'phrase',
              },
            };
            if (
              (_c = searchBody.query.bool) === null || _c === void 0
                ? void 0
                : _c.must
            ) {
              searchBody.query.bool.must.push(searchTermQuery);
            }
          }
        }
        // 검색 작업은 트랜잭션 외부에서 실행
        const searchResult = await searchOpenSearchWithScroll({
          searchBody,
          menu: input.menu,
          currentPage: input.currentPage,
          limit: input.limit,
          searchId: sessionId,
          onProgress: (progress) => {
            loadingStatus = {
              current: progress.current,
              total: progress.total,
              status: progress.status,
            };
          },
        });
        // 검색 결과 업데이트를 별도 트랜잭션으로 처리
        const updatedSession = await ctx.db.$transaction(
          async (tx) => {
            const session = await tx.searchSession.findUnique({
              where: { id: searchSession.id },
              select: { id: true, searchId: true, status: true },
            });
            if (!session) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: '검색 세션을 찾을 수 없습니다.',
              });
            }
            if (session.status === 'COMPLETED') {
              return session;
            }
            return tx.searchSession.update({
              where: { id: session.id },
              data: {
                status:
                  searchResult.scrollResponse.length > 0
                    ? 'COMPLETED'
                    : 'ERROR',
                lastActivityAt: new Date(),
              },
            });
          },
          {
            timeout: 30000, // 30초 타임아웃
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          }
        );
        console.log('[Search] Search completed:', {
          sessionId: updatedSession.id,
          status: updatedSession.status,
          hitsCount: searchResult.scrollResponse.length,
        });
        const currentVersion = getCurrentVersion();
        const columnNames = getColumnNames(currentVersion);
        // 검색 결과가 있는 경우에만 매핑 수행
        const logs =
          searchResult.scrollResponse.length > 0
            ? searchResult.scrollResponse.map((hit) =>
                columnNames.reduce((acc, col) => {
                  var _a, _b;
                  let value =
                    (_b =
                      (_a = hit._source) === null || _a === void 0
                        ? void 0
                        : _a[col]) !== null && _b !== void 0
                      ? _b
                      : null;
                  // null 값 처리
                  if (value === null || value === undefined) {
                    return Object.assign(Object.assign({}, acc), {
                      [col]: null,
                    });
                  }
                  // 타임스탬프 처리
                  if (col === '@timestamp') {
                    value = dayjs(value)
                      .tz('Asia/Seoul')
                      .format('YYYY-MM-DD HH:mm:ss');
                  } else {
                    // 배열인 경우 join으로 문자열로 변환
                    if (Array.isArray(value)) {
                      value = value.join(', ');
                    }
                    // 나머지 모든 값을 문자열로 변환
                    value = String(value);
                  }
                  return Object.assign(Object.assign({}, acc), {
                    [col]: value,
                  });
                }, {})
              )
            : [];
        return {
          pagination: {
            currentPage: input.currentPage,
            pageLength: Math.ceil(
              (searchResult.initialResponse.hits.total.value || 0) / input.limit
            ),
            totalCnt: searchResult.initialResponse.hits.total.value || 0,
          },
          logs,
          loadingStatus,
          scrollId: searchSession.searchId,
        };
      } catch (error) {
        console.error('Query Error:', error);
        loadingStatus = {
          current: 0,
          total: 0,
          status: 'error',
        };
        return {
          logs: [],
          pagination: {
            currentPage: input.currentPage,
            pageLength: 0,
            totalCnt: 0,
          },
          loadingStatus,
          scrollId: '',
        };
      }
    }),
  cancelSearch: protectedProcedure({
    authorizations: ['ADMIN', 'SYSTEM_ADMIN'],
  })
    .input(z.object({ searchId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      console.log('[CancelSearch] Attempting to cancel search:', {
        searchId: input.searchId,
        userId: ctx.user.id,
        timestamp: new Date().toISOString(),
      });
      return ctx.db.$transaction(
        async (tx) => {
          const currentSession = await tx.searchSession.findUnique({
            where: { searchId: input.searchId },
            select: {
              id: true,
              userId: true,
              status: true,
              searchId: true,
              lastActivityAt: true,
            },
          });
          console.log('[CancelSearch] Found session:', {
            session: currentSession,
            timestamp: new Date().toISOString(),
          });
          if (!currentSession) {
            console.log('[CancelSearch] Session not found:', input.searchId);
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: '검색 세션을 찾을 수 없습니다.',
            });
          }
          if (currentSession.userId !== ctx.user.id) {
            console.log('[CancelSearch] Unauthorized cancel attempt:', {
              sessionUserId: currentSession.userId,
              requestUserId: ctx.user.id,
            });
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: '권한이 없습니다.',
            });
          }
          if (currentSession.status !== 'ACTIVE') {
            console.log(
              `[CancelSearch] Session ${input.searchId} is already ${currentSession.status}`,
              {
                currentStatus: currentSession.status,
                lastActivityAt: currentSession.lastActivityAt,
                timestamp: new Date().toISOString(),
              }
            );
            return currentSession;
          }
          const updatedSession = await tx.searchSession.update({
            where: { id: currentSession.id },
            data: {
              status: 'CANCELLED',
              lastActivityAt: new Date(),
              cancelReason: '사용자에 의한 검색 취소',
            },
          });
          console.log('[CancelSearch] Session cancelled successfully:', {
            id: updatedSession.id,
            status: updatedSession.status,
            lastActivityAt: updatedSession.lastActivityAt,
            timestamp: new Date().toISOString(),
          });
          return updatedSession;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000, // 30초 타임아웃
        }
      );
    }),
});
