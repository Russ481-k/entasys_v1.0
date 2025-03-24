import { prisma } from '@/server/config/prisma';
import { OpenSearchClient } from '@/server/lib/opensearch';

async function waitForOpenSearch(retries = 5, interval = 5000) {
  const opensearch = OpenSearchClient.getInstance();
  for (let i = 0; i < retries; i++) {
    try {
      await opensearch.request({
        path: '/_cluster/health',
        method: 'GET',
      });
      console.log('[OpenSearch] Cluster is ready');
      return true;
    } catch (error) {
      console.log(
        `[OpenSearch] Waiting for cluster to be ready (attempt ${i + 1}/${retries})`
      );
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
  console.error(
    '[OpenSearch] Failed to connect to cluster after multiple attempts'
  );
  return false;
}
async function initializeOpenSearch() {
  try {
    console.log('[OpenSearch] Starting initialization...');
    // OpenSearch 클러스터가 준비될 때까지 대기
    const isReady = await waitForOpenSearch();
    if (!isReady) {
      throw new Error('OpenSearch cluster is not ready');
    }
    const opensearch = OpenSearchClient.getInstance();
    // 기본 ILM 정책 생성
    console.log('[OpenSearch] Creating ILM policy...');
    await opensearch.createILMPolicy();
    console.log('[OpenSearch] ILM policy created successfully');
    // 활성화된 도메인 목록 조회
    console.log('[OpenSearch] Fetching active domains...');
    const domains = await prisma.domain.findMany({
      where: { isActive: true },
      select: { name: true },
    });
    // 각 도메인에 대한 인덱스 템플릿 설정
    console.log(
      `[OpenSearch] Setting up index templates for ${domains.length} domains...`
    );
    for (const domain of domains) {
      try {
        await opensearch.updateIndexTemplate(domain.name);
        console.log(
          `[OpenSearch] Index template created for domain: ${domain.name}`
        );
      } catch (error) {
        console.error(
          `[OpenSearch] Failed to create index template for domain ${domain.name}:`,
          error
        );
        // 개별 도메인 실패는 전체 초기화를 중단하지 않음
      }
    }
    console.log('[OpenSearch] Initialization completed successfully');
  } catch (error) {
    console.error('[OpenSearch] Initialization failed:', error);
    throw error;
  }
}
// 스크립트가 직접 실행될 때만 초기화 실행
if (require.main === module) {
  initializeOpenSearch()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Failed to initialize OpenSearch:', error);
      process.exit(1);
    });
}
export { initializeOpenSearch };
