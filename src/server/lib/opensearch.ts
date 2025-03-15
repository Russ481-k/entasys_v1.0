import * as http from 'http';

import { env } from '@/env.mjs';
import { prisma } from '@/server/config/prisma';
// 공유 Prisma 인스턴스 사용
import { SearchSessionService } from '@/server/services/search-session.service';
import { OpenSearchHit } from '@/types/project';

export interface OpenSearchOptions {
  hostname?: string;
  port?: number;
  path: string;
  method: string;
  body?: object;
  headers?: {
    'Content-Type': string;
    Authorization: string;
  };
  ca?: Buffer;
  rejectUnauthorized?: boolean;
  timeout?: number;
}

export interface OpenSearchCountResponse {
  count?: number;
  index?: string;
  [key: string]: string | number | undefined;
}

export interface OpenSearchIndicesResponse {
  index: string;
  health: string;
  status: string;
  [key: string]: string | number | undefined;
}

export interface ScrollSearchOptions {
  index: string;
  body: object;
  scrollTime?: string;
  size?: number;
  sessionId: string;
}

export interface PaginatedScrollOptions extends ScrollSearchOptions {
  page: number;
  pageSize: number;
}

export interface OpenSearchResponse {
  data?: string | null;
  firstReceiveTime?: string;
  lastReceiveTime?: string;
  searchAfter?: string[];
  hits: {
    total: {
      value: number;
      relation?: string;
    };
    hits: OpenSearchHit[];
  };
  _scroll_id: string;
  took?: number;
  timed_out?: boolean;
}

export interface ScrollResponse {
  hits: OpenSearchHit[];
  total: number;
  scrollId?: string;
}

export class OpenSearchClient {
  private static instance: OpenSearchClient;
  private readonly baseOptions: http.RequestOptions;
  private searchSessionService: SearchSessionService;
  private activeScrolls: Map<string, string>; // sessionId -> scrollId 매핑

  private constructor() {
    const opensearchPort = Number(env.OPENSEARCH_PORT);
    const opensearchUsername = env.OPENSEARCH_USERNAME;
    const opensearchPassword = env.OPENSEARCH_PASSWORD;

    this.baseOptions = {
      hostname: env.OPENSEARCH_URL.replace(/^https?:\/\//, ''),
      port: opensearchPort,
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          'Basic ' +
          Buffer.from(`${opensearchUsername}:${opensearchPassword}`).toString(
            'base64'
          ),
      },
    };

    this.searchSessionService = new SearchSessionService(prisma);
    this.activeScrolls = new Map();
  }

  public static getInstance(): OpenSearchClient {
    if (!OpenSearchClient.instance) {
      OpenSearchClient.instance = new OpenSearchClient();
    }
    return OpenSearchClient.instance;
  }

  public async count(params: {
    index: string;
    body: object;
  }): Promise<{ count: number }> {
    return this.request<{ count: number }>({
      path: `/${params.index}/_count`,
      method: 'POST',
      body: params.body,
    });
  }

  async request<T>({ path, method, body }: OpenSearchOptions): Promise<T> {
    const options: http.RequestOptions = {
      ...this.baseOptions,
      path,
      method,
      timeout: 30000, // 30초 타임아웃 설정
    };

    return new Promise((resolve, reject) => {
      console.log('[OpenSearch] Request details:', {
        url: `http://${options.hostname}:${options.port}${path}`,
        method,
        headers: options.headers,
        body: JSON.stringify(body, null, 2),
      });

      const req = http.request(options, (res) => {
        let data = '';

        // 타임아웃 설정
        res.setTimeout(30000, () => {
          req.destroy();
          reject(new Error('Response timeout'));
        });

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              console.error('[OpenSearch] Request failed:', {
                statusCode: res.statusCode,
                statusMessage: res.statusMessage,
                data,
              });
              reject(
                new Error(
                  `OpenSearch request failed with status ${res.statusCode}: ${data}`
                )
              );
              return;
            }
            const parsedData = JSON.parse(data);
            resolve(parsedData);
          } catch (e) {
            console.error('[OpenSearch] Failed to parse response:', e);
            console.error('[OpenSearch] Raw data that failed to parse:', data);
            reject(new Error(`Failed to parse OpenSearch response: ${e}`));
          }
        });
      });

      // 요청 타임아웃 설정
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.on('error', (e) => {
        console.error('[OpenSearch] Network error:', {
          message: e.message,
          stack: e.stack,
        });
        reject(new Error(`OpenSearch request failed: ${e.message}`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  // 스크롤 검색 초기화
  async initScroll({
    index,
    body,
    scrollTime = '1m',
    size = 1000,
    sessionId, // 세션 ID 추가
  }: ScrollSearchOptions & { sessionId: string }): Promise<OpenSearchResponse> {
    const path = `/${index}/_search?scroll=${scrollTime}&size=${size}`;
    const response = await this.request<OpenSearchResponse>({
      path,
      method: 'POST',
      body,
    });

    if (sessionId && response._scroll_id) {
      this.activeScrolls.set(sessionId, response._scroll_id);
      console.log(
        `[ScrollSearch] Initialized scroll for session ${sessionId} with scroll ID ${response._scroll_id}`
      );
    }

    return response;
  }

  // 스크롤 종료
  async clearScroll(sessionId: string): Promise<{ succeeded: boolean }> {
    try {
      const scrollId = this.activeScrolls.get(sessionId);
      if (!scrollId) {
        console.log(
          `[ScrollSearch] No active scroll found for session ${sessionId}`
        );
        return { succeeded: false };
      }

      console.log(
        `[ScrollSearch] Clearing scroll for session ${sessionId} with scroll ID ${scrollId}`
      );

      await this.request({
        path: '/_search/scroll',
        method: 'DELETE',
        body: {
          scroll_id: scrollId,
        },
      });

      this.activeScrolls.delete(sessionId);
      console.log(`[ScrollSearch] Cleared scroll for session ${sessionId}`);
      return { succeeded: true };
    } catch (error) {
      console.error('[ScrollSearch] Failed to clear scroll:', error);
      return { succeeded: false };
    }
  }

  // 스크롤 계속
  async scroll(
    scrollId: string,
    scrollTime = '1m',
    sessionId?: string
  ): Promise<OpenSearchResponse> {
    console.log(
      `[ScrollSearch] Continuing scroll for session ${sessionId} with scroll ID ${scrollId}`
    );

    const response = await this.request<OpenSearchResponse>({
      path: '/_search/scroll',
      method: 'POST',
      body: {
        scroll: scrollTime,
        scroll_id: scrollId,
      },
    });

    if (sessionId && response._scroll_id) {
      this.activeScrolls.set(sessionId, response._scroll_id);
      console.log(
        `[ScrollSearch] Updated scroll ID for session ${sessionId}: ${response._scroll_id}`
      );
    }

    return response;
  }

  // 전체 결과를 가져오는 헬퍼 메서드
  async scrollAll(options: ScrollSearchOptions): Promise<OpenSearchHit[]> {
    try {
      const initialResponse = await this.initScroll({
        ...options,
        sessionId: options.sessionId,
      });
      let results = [...initialResponse.hits.hits];
      let currentScrollId = initialResponse._scroll_id;

      while (true) {
        const response = await this.scroll(
          currentScrollId,
          options.scrollTime,
          options.sessionId
        );
        if (!response.hits.hits.length) break;

        results = [...results, ...response.hits.hits];
        currentScrollId = response._scroll_id;
      }

      await this.clearScroll(options.sessionId);
      return results;
    } catch (error) {
      console.error('Scroll search error:', error);
      if (options.sessionId) {
        await this.clearScroll(options.sessionId);
      }
      throw error;
    }
  }

  // 페이지네이션된 스크롤 검색
  async scrollWithPagination({
    index,
    body,
    page,
    pageSize,
    scrollTime = '2m',
    size = 1000,
    searchId,
  }: {
    index: string;
    body: object;
    page: number;
    pageSize: number;
    scrollTime?: string;
    size?: number;
    searchId: string;
  }): Promise<ScrollResponse> {
    let currentScrollId: string | undefined;
    let shouldStop = false;
    let lastCheckTime = 0;
    const CHECK_INTERVAL = 500; // 0.5초마다 상태 확인하도록 변경

    const checkSessionStatus = async () => {
      const now = Date.now();
      if (now - lastCheckTime < CHECK_INTERVAL) {
        return !shouldStop; // 이미 중지 신호가 있으면 false 반환
      }

      if (!searchId) return true;

      try {
        const session =
          await this.searchSessionService.findBySearchId(searchId);
        lastCheckTime = now;

        if (!session) {
          console.log(`[ScrollSearch] Session ${searchId} not found`);
          shouldStop = true;
          return false;
        }

        if (session.status !== 'ACTIVE') {
          console.log(
            `[ScrollSearch] Session ${searchId} status changed to ${session.status}`
          );
          shouldStop = true;

          if (currentScrollId) {
            await this.clearScroll(searchId).catch((error) => {
              console.error('[ScrollSearch] Failed to clear scroll:', error);
            });
          }
          return false;
        }

        // 세션 활성 시간 업데이트
        await this.searchSessionService.update(session.id, {
          lastActivityAt: new Date(),
        });

        return true;
      } catch (error) {
        console.error('[ScrollSearch] Error checking session status:', error);
        shouldStop = true;
        return false;
      }
    };

    try {
      // 초기 검색 전 세션 상태 확인
      if (!(await checkSessionStatus())) {
        return { hits: [], total: 0, scrollId: undefined };
      }

      const response = await this.initScroll({
        index,
        body,
        scrollTime,
        size,
        sessionId: searchId,
      });

      currentScrollId = response._scroll_id;
      let hits = response.hits.hits;
      const total = response.hits.total.value;
      let allHits: OpenSearchHit[] = [...hits];

      // 매 스크롤마다 세션 상태 확인
      while (hits.length > 0 && allHits.length < page * pageSize) {
        // 상태 체크 먼저 수행
        const isActive = await checkSessionStatus();
        if (!isActive || shouldStop) {
          console.log(
            '[ScrollSearch] Session became inactive, stopping scroll'
          );
          await this.clearScroll(searchId);
          return { hits: [], total: 0, scrollId: undefined };
        }

        // 스크롤 요청 수행
        const scrollResponse = await this.scroll(
          currentScrollId!,
          scrollTime,
          searchId
        );
        currentScrollId = scrollResponse._scroll_id;
        hits = scrollResponse.hits.hits;
        if (!hits.length) break;

        allHits = [...allHits, ...hits];
      }

      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const paginatedHits = allHits.slice(start, Math.min(end, allHits.length));

      return {
        hits: paginatedHits,
        total,
        scrollId: currentScrollId,
      };
    } catch (error) {
      console.error('[ScrollSearch] Search error:', error);
      await this.clearScroll(searchId);
      throw error;
    }
  }
}

// 로그 수집 관련 함수
export async function makeOpenSearchRequest<T>(
  path: string,
  method: string,
  body?: object
): Promise<T> {
  const options: OpenSearchOptions = {
    hostname: env.OPENSEARCH_URL.replace(/^http?:\/\//, ''),
    port: Number(env.OPENSEARCH_PORT),
    path,
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from('admin:admin').toString('base64'),
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode && res.statusCode >= 400) {
            console.error('OpenSearch request failed:', {
              statusCode: res.statusCode,
              data,
              path,
              method,
            });
            reject(
              new Error(
                `OpenSearch request failed with status ${res.statusCode}: ${data}`
              )
            );
            return;
          }
          resolve(JSON.parse(data));
        } catch (e) {
          console.error('Failed to parse OpenSearch response:', e);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('OpenSearch request error:', {
        error: e,
        path,
        method,
      });
      reject(e);
    });

    // 타임아웃 처리
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}
