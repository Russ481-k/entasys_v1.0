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

export interface OpenSearchScrollResponse {
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

export interface OpenSearchActionResponse {
  acknowledged: boolean;
  shards_acknowledged?: boolean;
  index?: string;
}

export interface OpenSearchResponse {
  acknowledged?: boolean;
  shards_acknowledged?: boolean;
  index?: string;
  hits?: {
    total: {
      value: number;
      relation?: string;
    };
    hits: OpenSearchHit[];
  };
  _scroll_id?: string;
  took?: number;
  timed_out?: boolean;
}

export interface ScrollResponse {
  hits: OpenSearchHit[];
  total: number;
  scrollId?: string;
}

export interface OpenSearchClusterHealth {
  cluster_name: string;
  status: string;
  number_of_nodes: number;
  number_of_data_nodes: number;
  active_primary_shards: number;
  active_shards: number;
  relocating_shards: number;
  initializing_shards: number;
  unassigned_shards: number;
  delayed_unassigned_shards: number;
  number_of_pending_tasks: number;
  number_of_in_flight_fetch: number;
  task_max_waiting_in_queue_millis: number;
  active_shards_percent_as_number: number;
}

export interface OpenSearchClusterStats {
  cluster_name: string;
  cluster_uuid: string;
  version: {
    number: string;
    build_type: string;
    build_hash: string;
    build_date: string;
    build_snapshot: boolean;
    lucene_version: string;
    minimum_wire_compatibility_version: string;
    minimum_index_compatibility_version: string;
  };
  nodes: {
    count: {
      total: number;
      data: number;
      coordinating_only: number;
      master: number;
      ingest: number;
    };
    versions: string[];
    os: {
      available_processors: number;
      allocated_processors: number;
      names: Array<{
        name: string;
        count: number;
      }>;
      mem: {
        total_in_bytes: number;
        free_in_bytes: number;
        used_in_bytes: number;
        free_percent: number;
        used_percent: number;
      };
    };
    process: {
      cpu: {
        percent: number;
      };
      open_file_descriptors: {
        min: number;
        max: number;
        avg: number;
      };
    };
    jvm: {
      max_uptime_in_millis: number;
      versions: Array<{
        version: string;
        vm_name: string;
        vm_version: string;
        vm_vendor: string;
        count: number;
      }>;
      mem: {
        heap_used_in_bytes: number;
        heap_used_percent: number;
        heap_max_in_bytes: number;
        non_heap_used_in_bytes: number;
        non_heap_max_in_bytes: number;
      };
      gc: {
        collectors: {
          [key: string]: {
            collection_count: number;
            collection_time_in_millis: number;
          };
        };
      };
    };
    fs: {
      total_in_bytes: number;
      free_in_bytes: number;
      available_in_bytes: number;
    };
    plugins: Array<{
      name: string;
      version: string;
      description: string;
      classname: string;
      licensed: boolean;
    }>;
  };
  indices: {
    count: number;
    shards: {
      total: number;
      primaries: number;
      replication: number;
    };
    docs: {
      count: number;
      deleted: number;
    };
    store: {
      size_in_bytes: number;
      total_data_set_size_in_bytes: number;
      reserved_in_bytes: number;
    };
    indexing: {
      index_total: number;
      index_time_in_millis: number;
      index_current: number;
      index_failed: number;
      delete_total: number;
      delete_time_in_millis: number;
      delete_current: number;
      noop_update_total: number;
      is_throttled: boolean;
      throttle_time_in_millis: number;
    };
    get: {
      total: number;
      time_in_millis: number;
      exists_total: number;
      exists_time_in_millis: number;
      missing_total: number;
      missing_time_in_millis: number;
      current: number;
    };
    search: {
      open_contexts: number;
      query_total: number;
      query_time_in_millis: number;
      query_current: number;
      fetch_total: number;
      fetch_time_in_millis: number;
      fetch_current: number;
      scroll_total: number;
      scroll_time_in_millis: number;
      scroll_current: number;
      suggest_total: number;
      suggest_time_in_millis: number;
      suggest_current: number;
    };
    merges: {
      current: number;
      current_docs: number;
      current_size_in_bytes: number;
      total: number;
      total_docs: number;
      total_size_in_bytes: number;
      total_stopped_time_in_millis: number;
      total_throttled_time_in_millis: number;
      total_auto_throttle_in_bytes: number;
    };
    refresh: {
      total: number;
      total_time_in_millis: number;
      listeners: number;
    };
    flush: {
      total: number;
      periodic: number;
      total_time_in_millis: number;
    };
    warmer: {
      current: number;
      total: number;
      total_time_in_millis: number;
    };
    query_cache: {
      memory_size_in_bytes: number;
      total_count: number;
      hit_count: number;
      miss_count: number;
      cache_size: number;
      cache_count: number;
      evictions: number;
    };
    fielddata: {
      memory_size_in_bytes: number;
      evictions: number;
    };
    completion: {
      size_in_bytes: number;
    };
    segments: {
      count: number;
      memory_in_bytes: number;
      terms_memory_in_bytes: number;
      stored_fields_memory_in_bytes: number;
      term_vectors_memory_in_bytes: number;
      norms_memory_in_bytes: number;
      points_memory_in_bytes: number;
      doc_values_memory_in_bytes: number;
      index_writer_memory_in_bytes: number;
      version_map_memory_in_bytes: number;
      fixed_bit_set_memory_in_bytes: number;
      max_unsafe_auto_id_timestamp: number;
      file_sizes: Record<string, unknown>;
    };
    translog: {
      operations: number;
      size_in_bytes: number;
      uncommitted_operations: number;
      uncommitted_size_in_bytes: number;
      earliest_last_modified_age: number;
    };
    request_cache: {
      memory_size_in_bytes: number;
      evictions: number;
      hit_count: number;
      miss_count: number;
    };
    recovery: {
      current_as_source: number;
      current_as_target: number;
      throttle_time_in_millis: number;
    };
  };
}

export interface OpenSearchIndexStats {
  index: string;
  health: string;
  status: string;
  uuid: string;
  pri: number;
  rep: number;
  'docs.count': string;
  'docs.deleted': string;
  'store.size': string;
  'store.total_data_set_size': string;
  'store.reserved': string;
  'indexing.index_total': string;
  'indexing.index_time_in_millis': string;
  'indexing.index_current': string;
  'indexing.index_failed': string;
  'indexing.delete_total': string;
  'indexing.delete_time_in_millis': string;
  'indexing.delete_current': string;
  'indexing.noop_update_total': string;
  'indexing.is_throttled': string;
  'indexing.throttle_time_in_millis': string;
  'get.total': string;
  'get.time_in_millis': string;
  'get.exists_total': string;
  'get.exists_time_in_millis': string;
  'get.missing_total': string;
  'get.missing_time_in_millis': string;
  'get.current': string;
  'search.open_contexts': string;
  'search.query_total': string;
  'search.query_time_in_millis': string;
  'search.query_current': string;
  'search.fetch_total': string;
  'search.fetch_time_in_millis': string;
  'search.fetch_current': string;
  'search.scroll_total': string;
  'search.scroll_time_in_millis': string;
  'search.scroll_current': string;
  'search.suggest_total': string;
  'search.suggest_time_in_millis': string;
  'search.suggest_current': string;
  'merges.current': string;
  'merges.current_docs': string;
  'merges.current_size_in_bytes': string;
  'merges.total': string;
  'merges.total_docs': string;
  'merges.total_size_in_bytes': string;
  'merges.total_stopped_time_in_millis': string;
  'merges.total_throttled_time_in_millis': string;
  'merges.total_auto_throttle_in_bytes': string;
  'refresh.total': string;
  'refresh.total_time_in_millis': string;
  'refresh.listeners': string;
  'flush.total': string;
  'flush.periodic': string;
  'flush.total_time_in_millis': string;
  'warmer.current': string;
  'warmer.total': string;
  'warmer.total_time_in_millis': string;
  'query_cache.memory_size_in_bytes': string;
  'query_cache.total_count': string;
  'query_cache.hit_count': string;
  'query_cache.miss_count': string;
  'query_cache.cache_size': string;
  'query_cache.cache_count': string;
  'query_cache.evictions': string;
  'fielddata.memory_size_in_bytes': string;
  'fielddata.evictions': string;
  'completion.size_in_bytes': string;
  'segments.count': string;
  'segments.memory_in_bytes': string;
  'segments.terms_memory_in_bytes': string;
  'segments.stored_fields_memory_in_bytes': string;
  'segments.term_vectors_memory_in_bytes': string;
  'segments.norms_memory_in_bytes': string;
  'segments.points_memory_in_bytes': string;
  'segments.doc_values_memory_in_bytes': string;
  'segments.index_writer_memory_in_bytes': string;
  'segments.version_map_memory_in_bytes': string;
  'segments.fixed_bit_set_memory_in_bytes': string;
  'segments.max_unsafe_auto_id_timestamp': string;
  'translog.operations': string;
  'translog.size_in_bytes': string;
  'translog.uncommitted_operations': string;
  'translog.uncommitted_size_in_bytes': string;
  'translog.earliest_last_modified_age': string;
  'request_cache.memory_size_in_bytes': string;
  'request_cache.evictions': string;
  'request_cache.hit_count': string;
  'request_cache.miss_count': string;
  'recovery.current_as_source': string;
  'recovery.current_as_target': string;
  'recovery.throttle_time_in_millis': string;
}

export interface OpenSearchShardStats {
  index: string;
  shard: string;
  prirep: string;
  state: string;
  docs: string;
  store: string;
  ip: string;
  node: string;
}

export interface OpenSearchLogDetails {
  duration?: string;
  statusCode?: number;
  [key: string]: unknown;
}

export interface OpenSearchError {
  message: string;
  code?: string;
  status?: number;
  [key: string]: unknown;
}

export class OpenSearchClient {
  private static instance: OpenSearchClient;
  private readonly baseOptions: http.RequestOptions;
  private searchSessionService: SearchSessionService;
  private activeScrolls: Map<string, string>; // sessionId -> scrollId 매핑
  private readonly logger: Console;

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
    this.logger = console;
  }

  public static getInstance(): OpenSearchClient {
    if (!OpenSearchClient.instance) {
      OpenSearchClient.instance = new OpenSearchClient();
    }
    return OpenSearchClient.instance;
  }

  private logOperation(operation: string, details?: OpenSearchLogDetails) {
    this.logger.log(`[OpenSearch] ${operation}`, details ? details : '');
  }

  private logError(operation: string, error: OpenSearchError) {
    this.logger.error(`[OpenSearch] ${operation} failed:`, error);
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

  public async request<T>({
    path,
    method,
    body,
  }: OpenSearchOptions): Promise<T> {
    const startTime = Date.now();
    this.logOperation(`${method} ${path}`, body ? { body } : undefined);

    const options: http.RequestOptions = {
      ...this.baseOptions,
      path,
      method,
      timeout: 60000,
    };

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
  async initScroll({
    index,
    body,
    scrollTime = '1m',
    size = 1000,
    sessionId,
  }: ScrollSearchOptions & {
    sessionId: string;
  }): Promise<OpenSearchScrollResponse> {
    const path = `/${index}/_search?scroll=${scrollTime}&size=${size}`;
    const response = await this.request<OpenSearchScrollResponse>({
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
  async clearScroll(sessionId: string): Promise<{ succeeded: boolean }> {
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
  async scroll(
    scrollId: string,
    scrollTime = '1m',
    sessionId?: string
  ): Promise<OpenSearchScrollResponse> {
    const response = await this.request<OpenSearchScrollResponse>({
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
          currentScrollId!,
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
      let allHits: OpenSearchHit[] = [...hits];

      while (hits.length > 0 && allHits.length < page * pageSize) {
        const isActive = await checkSessionStatus();
        if (!isActive || shouldStop) {
          await this.clearScroll(searchId);
          return { hits: [], total: 0, scrollId: undefined };
        }

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

  public async updateIndexTemplate(
    domainName: string
  ): Promise<OpenSearchActionResponse> {
    const templateName = `template_${domainName.toLowerCase()}`;
    return this.request<OpenSearchActionResponse>({
      path: `/_index_template/${templateName}`,
      method: 'PUT',
      body: {
        index_patterns: [`*_${domainName.toLowerCase()}_*`],
        template: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            refresh_interval: '30s',
            'plugins.index_state_management.policy_id': 'logs_policy',
            'plugins.index_state_management.rollover_alias': `alias_${domainName.toLowerCase()}`,
          },
        },
      },
    });
  }

  public async deleteIndexTemplate(
    domainName: string
  ): Promise<OpenSearchActionResponse> {
    try {
      const templateName = `template_${domainName.toLowerCase()}`;
      return await this.request<OpenSearchActionResponse>({
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

  public async createILMPolicy(): Promise<OpenSearchActionResponse> {
    try {
      return await this.request<OpenSearchActionResponse>({
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
                      min_doc_count: 5000000,
                      min_size: '50gb',
                      min_index_age: '1d',
                    },
                  },
                ],
                transitions: [
                  {
                    state_name: 'warm',
                    conditions: {
                      min_index_age: '2d',
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
                      min_index_age: '7d',
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
                      min_index_age: '30d',
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

  public async getIndices(
    pattern?: string
  ): Promise<OpenSearchIndicesResponse[]> {
    return this.request({
      path: `/_cat/indices/${pattern || '*'}?format=json`,
      method: 'GET',
    });
  }

  public async closeIndices(
    pattern: string
  ): Promise<OpenSearchActionResponse> {
    return this.request<OpenSearchActionResponse>({
      path: `/${pattern}/_close`,
      method: 'POST',
    });
  }

  public async deleteIndices(
    pattern: string
  ): Promise<OpenSearchActionResponse> {
    return this.request<OpenSearchActionResponse>({
      path: `/${pattern}`,
      method: 'DELETE',
    });
  }

  public async getClusterHealth(): Promise<OpenSearchClusterHealth> {
    return this.request({
      path: '/_cluster/health',
      method: 'GET',
    });
  }

  public async getClusterStats(): Promise<OpenSearchClusterStats> {
    return this.request({
      path: '/_cluster/stats',
      method: 'GET',
    });
  }

  public async getIndicesStats(
    pattern?: string
  ): Promise<OpenSearchIndexStats[]> {
    return this.request({
      path: `/_cat/indices/${pattern || '*'}?format=json&v=true`,
      method: 'GET',
    });
  }

  public async getShardStats(): Promise<OpenSearchShardStats[]> {
    return this.request({
      path: '/_cat/shards?format=json&v=true',
      method: 'GET',
    });
  }
}

// 로그 수집 관련 함수
export async function makeOpenSearchRequest<T>(
  path: string,
  method: string,
  body?: object,
  retryCount = 3
): Promise<T> {
  const client = OpenSearchClient.getInstance();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      return await client.request<T>({ path, method, body });
    } catch (error) {
      lastError = error as Error;
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
        return getEmptyResult<T>(path);
      }

      if (attempt < retryCount) {
        const delay = Math.min(1000 * attempt, 3000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

function getEmptyResult<T>(path: string): T {
  // 요청 경로에 따라 적절한 빈 결과 반환
  if (path.includes('/_count')) {
    return { count: 0 } as T;
  }
  if (path.includes('/_search')) {
    return {
      hits: {
        total: { value: 0 },
        hits: [],
      },
      aggregations: {},
    } as T;
  }
  return {} as T;
}
