import * as http from 'http';

import { env } from '@/env.mjs';
import { prisma } from '@/server/config/prisma';
// 공유 Prisma 인스턴스 사용
import { SearchSessionService } from '@/server/services/search-session.service';

export class OpenSearchClient {
  constructor() {
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
    this.logger = console;
  }
  static getInstance() {
    if (!OpenSearchClient.instance) {
      OpenSearchClient.instance = new OpenSearchClient();
    }
    return OpenSearchClient.instance;
  }
  logOperation(operation, details) {
    this.logger.log(`[OpenSearch] ${operation}`, details ? details : '');
  }
  logError(operation, error) {
    this.logger.error(`[OpenSearch] ${operation} failed:`, error);
  }
  async count(params) {
    return this.request({
      path: `/${params.index}/_count`,
      method: 'POST',
      body: params.body,
    });
  }
  async request({ path, method, body }) {
    const startTime = Date.now();
    this.logOperation(`${method} ${path}`, body ? { body } : undefined);
    const options = Object.assign(Object.assign({}, this.baseOptions), {
      path,
      method,
      timeout: 60000,
    });
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.setTimeout(60000, () => {
          req.destroy();
          const error = new Error('Response timeout');
          this.logError(`${method} ${path}`, { message: error.message });
          reject(error);
        });
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const duration = Date.now() - startTime;
          try {
            if (res.statusCode && res.statusCode >= 400) {
              const error = new Error(
                `OpenSearch request failed with status ${res.statusCode}: ${data}`
              );
              this.logError(`${method} ${path}`, { message: error.message });
              reject(error);
              return;
            }
            const parsedData = JSON.parse(data);
            this.logOperation(`${method} ${path} completed`, {
              duration: `${duration}ms`,
              statusCode: res.statusCode,
            });
            resolve(parsedData);
          } catch (e) {
            const error = new Error(
              `Failed to parse OpenSearch response: ${e}`
            );
            this.logError(`${method} ${path}`, { message: error.message });
            reject(error);
          }
        });
      });
      req.setTimeout(60000, () => {
        req.destroy();
        const error = new Error('Request timeout');
        this.logError(`${method} ${path}`, { message: error.message });
        reject(error);
      });
      req.on('error', (e) => {
        const error = new Error(`OpenSearch request failed: ${e.message}`);
        this.logError(`${method} ${path}`, { message: error.message });
        reject(error);
      });
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }
  // 스크롤 검색 초기화
  async initScroll({ index, body, scrollTime = '1m', size = 1000, sessionId }) {
    const path = `/${index}/_search?scroll=${scrollTime}&size=${size}`;
    const response = await this.request({
      path,
      method: 'POST',
      body,
    });
    if (sessionId && response._scroll_id) {
      this.activeScrolls.set(sessionId, response._scroll_id);
    }
    return response;
  }
  // 스크롤 종료
  async clearScroll(sessionId) {
    try {
      const scrollId = this.activeScrolls.get(sessionId);
      if (!scrollId) {
        return { succeeded: false };
      }
      await this.request({
        path: '/_search/scroll',
        method: 'DELETE',
        body: {
          scroll_id: scrollId,
        },
      });
      this.activeScrolls.delete(sessionId);
      return { succeeded: true };
    } catch (error) {
      console.error('[ScrollSearch] Failed to clear scroll:', error);
      return { succeeded: false };
    }
  }
  // 스크롤 계속
  async scroll(scrollId, scrollTime = '1m', sessionId) {
    const response = await this.request({
      path: '/_search/scroll',
      method: 'POST',
      body: {
        scroll: scrollTime,
        scroll_id: scrollId,
      },
    });
    if (sessionId && response._scroll_id) {
      this.activeScrolls.set(sessionId, response._scroll_id);
    }
    return response;
  }
  // 전체 결과를 가져오는 헬퍼 메서드
  async scrollAll(options) {
    try {
      const initialResponse = await this.initScroll(
        Object.assign(Object.assign({}, options), {
          sessionId: options.sessionId,
        })
      );
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
  }) {
    let currentScrollId;
    let shouldStop = false;
    let lastCheckTime = 0;
    const CHECK_INTERVAL = 500;
    const checkSessionStatus = async () => {
      const now = Date.now();
      if (now - lastCheckTime < CHECK_INTERVAL) {
        return !shouldStop;
      }
      if (!searchId) return true;
      try {
        const session =
          await this.searchSessionService.findBySearchId(searchId);
        lastCheckTime = now;
        if (!session) {
          shouldStop = true;
          return false;
        }
        if (session.status !== 'ACTIVE') {
          shouldStop = true;
          if (currentScrollId) {
            await this.clearScroll(searchId).catch((error) => {
              console.error('[ScrollSearch] Failed to clear scroll:', error);
            });
          }
          return false;
        }
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
      let allHits = [...hits];
      while (hits.length > 0 && allHits.length < page * pageSize) {
        const isActive = await checkSessionStatus();
        if (!isActive || shouldStop) {
          await this.clearScroll(searchId);
          return { hits: [], total: 0, scrollId: undefined };
        }
        const scrollResponse = await this.scroll(
          currentScrollId,
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
  async updateIndexTemplate(domainName) {
    const templateName = `template_${domainName.toLowerCase()}`;
    const aliasName = `alias_${domainName.toLowerCase()}`;
    // Generate a unique priority based on domain name hash
    const priority =
      Math.abs(
        domainName.split('').reduce((acc, char) => {
          return acc + char.charCodeAt(0);
        }, 0)
      ) % 1000; // Ensure priority is between 0 and 999
    // Create index template
    const templateResult = await this.request({
      path: `/_index_template/${templateName}`,
      method: 'PUT',
      body: {
        index_patterns: [`*_${domainName.toLowerCase()}`],
        priority,
        template: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            refresh_interval: '30s',
            'plugins.index_state_management.policy_id': 'logs_policy',
            'plugins.index_state_management.rollover_alias': aliasName,
          },
        },
      },
    });
    // Create initial index and alias for rollover
    try {
      const initialIndexName = `${new Date().toISOString().slice(0, 13).replace(/[-T]/g, '.').replace(':', '')}_${domainName.toLowerCase()}-000001`;
      await this.request({
        path: `/${initialIndexName}`,
        method: 'PUT',
        body: {
          aliases: {
            [aliasName]: {
              is_write_index: true,
            },
          },
        },
      });
      this.logOperation(
        `Initial index and alias created: ${initialIndexName} -> ${aliasName}`
      );
    } catch (error) {
      // Alias might already exist, which is fine
      this.logOperation(`Alias ${aliasName} might already exist: ${error}`);
    }
    return templateResult;
  }
  async deleteIndexTemplate(domainName) {
    try {
      const templateName = `template_${domainName.toLowerCase()}`;
      return await this.request({
        path: `/_index_template/${templateName}`,
        method: 'DELETE',
      });
    } catch (error) {
      // 템플릿이 없는 경우 성공으로 처리
      if (
        error instanceof Error &&
        error.message.includes('index_template_missing')
      ) {
        return { acknowledged: true };
      }
      throw error;
    }
  }
  async createILMPolicy() {
    try {
      return await this.request({
        path: '/_plugins/_ism/policies/logs_policy',
        method: 'PUT',
        body: {
          policy: {
            description: 'Hot-Warm-Cold-Delete workflow for logs',
            default_state: 'hot',
            states: [
              {
                name: 'hot',
                actions: [
                  {
                    rollover: {
                      min_doc_count: 1000000, // 100만 문서로 감소
                      min_size: '5gb', // 5GB로 감소
                      min_index_age: '12h', // 12시간으로 감소
                    },
                  },
                ],
                transitions: [
                  {
                    state_name: 'warm',
                    conditions: {
                      min_index_age: '1d', // 1일로 감소
                    },
                  },
                ],
              },
              {
                name: 'warm',
                actions: [
                  {
                    replica_count: {
                      number_of_replicas: 0,
                    },
                  },
                  {
                    force_merge: {
                      max_num_segments: 1,
                    },
                  },
                ],
                transitions: [
                  {
                    state_name: 'cold',
                    conditions: {
                      min_index_age: '3d', // 3일로 감소
                    },
                  },
                ],
              },
              {
                name: 'cold',
                actions: [
                  {
                    read_only: {},
                  },
                ],
                transitions: [
                  {
                    state_name: 'delete',
                    conditions: {
                      min_index_age: '7d', // 7일로 감소
                    },
                  },
                ],
              },
              {
                name: 'delete',
                actions: [
                  {
                    delete: {},
                  },
                ],
              },
            ],
          },
        },
      });
    } catch (error) {
      // 정책이 이미 존재하는 경우 성공으로 처리
      if (
        error instanceof Error &&
        error.message.includes('version_conflict_engine_exception')
      ) {
        this.logOperation('ILM policy already exists');
        return { acknowledged: true };
      }
      throw error;
    }
  }
  async getIndices(pattern) {
    return this.request({
      path: `/_cat/indices/${pattern || '*'}?format=json`,
      method: 'GET',
    });
  }
  async closeIndices(pattern) {
    return this.request({
      path: `/${pattern}/_close`,
      method: 'POST',
    });
  }
  async deleteIndices(pattern) {
    return this.request({
      path: `/${pattern}`,
      method: 'DELETE',
    });
  }
  async getClusterHealth() {
    return this.request({
      path: '/_cluster/health',
      method: 'GET',
    });
  }
  async getClusterStats() {
    return this.request({
      path: '/_cluster/stats',
      method: 'GET',
    });
  }
  async getIndicesStats(pattern) {
    return this.request({
      path: `/_cat/indices/${pattern || '*'}?format=json&v=true`,
      method: 'GET',
    });
  }
  async getShardStats() {
    return this.request({
      path: '/_cat/shards?format=json&v=true',
      method: 'GET',
    });
  }
}
// 로그 수집 관련 함수
export async function makeOpenSearchRequest(
  path,
  method,
  body,
  retryCount = 3
) {
  const client = OpenSearchClient.getInstance();
  let lastError = null;
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      return await client.request({ path, method, body });
    } catch (error) {
      lastError = error;
      console.error(
        `OpenSearch request error (attempt ${attempt}/${retryCount}):`,
        {
          error,
          path,
          method,
        }
      );
      if (
        error instanceof Error &&
        error.message.includes('index_not_found_exception')
      ) {
        return getEmptyResult(path);
      }
      if (attempt < retryCount) {
        const delay = Math.min(1000 * attempt, 3000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
function getEmptyResult(path) {
  // 요청 경로에 따라 적절한 빈 결과 반환
  if (path.includes('/_count')) {
    return { count: 0 };
  }
  if (path.includes('/_search')) {
    return {
      hits: {
        total: { value: 0 },
        hits: [],
      },
      aggregations: {},
    };
  }
  return {};
}
