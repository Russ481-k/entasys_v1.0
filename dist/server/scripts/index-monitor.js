#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

import { OpenSearchClient } from '../lib/opensearch.js';

class IndexMonitor {
  constructor() {
    this.MAX_INDICES = 2800; // 3000보다 여유있게 설정
    this.WARNING_THRESHOLD = 2500;
    this.opensearch = OpenSearchClient.getInstance();
    this.prisma = new PrismaClient();
  }
  async getIndexCount() {
    try {
      const indices = await this.opensearch.getIndices();
      return indices.length;
    } catch (error) {
      console.error('Error getting index count:', error);
      return 0;
    }
  }
  async getAllIndices() {
    try {
      const response = await this.opensearch.request({
        path: '/_cat/indices?format=json&h=index,health,status,uuid,pri,rep,docs.count,docs.deleted,store.size,pri.store.size',
        method: 'GET',
      });
      return response;
    } catch (error) {
      console.error('Error getting indices:', error);
      return [];
    }
  }
  async getIndexCreationDate(indexName) {
    var _a, _b;
    try {
      const response = await this.opensearch.request({
        path: `/${indexName}/_settings`,
        method: 'GET',
      });
      const settings =
        (_b =
          (_a = response[indexName]) === null || _a === void 0
            ? void 0
            : _a.settings) === null || _b === void 0
          ? void 0
          : _b.index;
      if (
        settings === null || settings === void 0
          ? void 0
          : settings.creation_date
      ) {
        return new Date(parseInt(settings.creation_date));
      }
      return null;
    } catch (error) {
      console.error(`Error getting creation date for ${indexName}:`, error);
      return null;
    }
  }
  // 정리 전략 1: 오래된 인덱스 우선 삭제
  createOldestFirstStrategy() {
    return {
      name: 'oldest_first',
      description: '가장 오래된 인덱스부터 삭제',
      execute: async (indices) => {
        const indicesWithDates = await Promise.all(
          indices.map(async (index) =>
            Object.assign(Object.assign({}, index), {
              creationDate: await this.getIndexCreationDate(index.index),
            })
          )
        );
        // 날짜별로 정렬 (오래된 것부터)
        const sortedIndices = indicesWithDates
          .filter((index) => index.creationDate !== null)
          .sort((a, b) => a.creationDate.getTime() - b.creationDate.getTime());
        const toDelete = sortedIndices.slice(0, 300); // 300개 삭제
        return toDelete.map((index) => index.index);
      },
    };
  }
  // 정리 전략 2: 작은 인덱스 우선 삭제 (문서 수 기준)
  createSmallestFirstStrategy() {
    return {
      name: 'smallest_first',
      description: '문서 수가 가장 적은 인덱스부터 삭제',
      execute: async (indices) => {
        const sortedIndices = indices
          .filter((index) => index['docs.count'] !== '0')
          .sort(
            (a, b) => parseInt(a['docs.count']) - parseInt(b['docs.count'])
          );
        const toDelete = sortedIndices.slice(0, 300);
        return toDelete.map((index) => index.index);
      },
    };
  }
  // 정리 전략 3: 도메인별 균등 삭제
  createBalancedDomainStrategy() {
    return {
      name: 'balanced_domain',
      description: '각 도메인에서 균등하게 오래된 인덱스 삭제',
      execute: async (indices) => {
        // 도메인별로 그룹화
        const domainGroups = {};
        for (const index of indices) {
          // alias_ 접두사 제거하고 도메인 추출
          const domain =
            index.index.replace(/^alias_/, '').split('_')[0] || 'unknown';
          if (!domainGroups[domain]) {
            domainGroups[domain] = [];
          }
          domainGroups[domain].push(index);
        }
        const toDelete = [];
        const deletePerDomain = Math.ceil(
          300 / Object.keys(domainGroups).length
        );
        for (const [domain, domainIndices] of Object.entries(domainGroups)) {
          const indicesWithDates = await Promise.all(
            domainIndices.map(async (index) =>
              Object.assign(Object.assign({}, index), {
                creationDate: await this.getIndexCreationDate(index.index),
              })
            )
          );
          const sortedDomainIndices = indicesWithDates
            .filter((index) => index.creationDate !== null)
            .sort(
              (a, b) => a.creationDate.getTime() - b.creationDate.getTime()
            );
          const domainToDelete = sortedDomainIndices
            .slice(0, Math.min(deletePerDomain, sortedDomainIndices.length))
            .map((index) => index.index);
          toDelete.push(...domainToDelete);
        }
        return toDelete.slice(0, 300); // 최대 300개로 제한
      },
    };
  }
  async deleteIndices(indicesToDelete) {
    console.log(`🗑️  Deleting ${indicesToDelete.length} indices...`);
    for (const indexName of indicesToDelete) {
      try {
        await this.opensearch.request({
          path: `/${indexName}`,
          method: 'DELETE',
        });
        console.log(`✅ Deleted index: ${indexName}`);
      } catch (error) {
        console.error(`❌ Failed to delete index ${indexName}:`, error);
      }
    }
  }
  async checkAndCleanup() {
    const indexCount = await this.getIndexCount();
    console.log(`📊 Current index count: ${indexCount}`);
    if (indexCount >= this.MAX_INDICES) {
      console.log(
        `🚨 Index count (${indexCount}) exceeded maximum (${this.MAX_INDICES}). Starting cleanup...`
      );
      const allIndices = await this.getAllIndices();
      // 시스템 인덱스 제외 (., security, kibana 등으로 시작하는 인덱스)
      const userIndices = allIndices.filter(
        (index) =>
          !index.index.startsWith('.') &&
          !index.index.startsWith('security') &&
          !index.index.startsWith('kibana')
      );
      console.log(`📈 User indices count: ${userIndices.length}`);
      // 정리 전략 선택 (균등 삭제 우선 적용)
      const strategy = this.createBalancedDomainStrategy();
      console.log(`🎯 Using cleanup strategy: ${strategy.description}`);
      const indicesToDelete = await strategy.execute(userIndices);
      if (indicesToDelete.length > 0) {
        await this.deleteIndices(indicesToDelete);
        const newCount = await this.getIndexCount();
        console.log(`✅ Cleanup completed. New index count: ${newCount}`);
        // 정리 기록을 DB에 저장
        await this.logCleanupOperation(
          indexCount,
          newCount,
          indicesToDelete.length,
          strategy.name
        );
      }
    } else if (indexCount >= this.WARNING_THRESHOLD) {
      console.log(
        `⚠️  Index count (${indexCount}) approaching maximum. Consider manual cleanup.`
      );
    } else {
      console.log(`✅ Index count is within normal range.`);
    }
  }
  async logCleanupOperation(beforeCount, afterCount, deletedCount, strategy) {
    try {
      // 간단한 로그 기록 (실제 테이블이 있다면 DB에 저장)
      const logEntry = {
        timestamp: new Date().toISOString(),
        beforeCount,
        afterCount,
        deletedCount,
        strategy,
      };
      console.log('📝 Cleanup log:', JSON.stringify(logEntry, null, 2));
      // 파일로도 기록
      const fs = await import('fs/promises');
      const logFile = './index-cleanup.log';
      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('Error logging cleanup operation:', error);
    }
  }
  async startMonitoring(intervalMinutes = 10) {
    console.log(
      `🕐 Starting index monitoring every ${intervalMinutes} minutes...`
    );
    // 즉시 한 번 실행
    await this.checkAndCleanup();
    // 주기적 실행
    setInterval(
      async () => {
        try {
          await this.checkAndCleanup();
        } catch (error) {
          console.error('Error in monitoring cycle:', error);
        }
      },
      intervalMinutes * 60 * 1000
    );
  }
  async getIndexStatistics() {
    const allIndices = await this.getAllIndices();
    const userIndices = allIndices.filter(
      (index) =>
        !index.index.startsWith('.') &&
        !index.index.startsWith('security') &&
        !index.index.startsWith('kibana')
    );
    console.log('\n📊 Index Statistics:');
    console.log(`Total indices: ${allIndices.length}`);
    console.log(`User indices: ${userIndices.length}`);
    console.log(`System indices: ${allIndices.length - userIndices.length}`);
    // 도메인별 통계
    const domainStats = {};
    for (const index of userIndices) {
      const domain =
        index.index.replace(/^alias_/, '').split('_')[0] || 'unknown';
      domainStats[domain] = (domainStats[domain] || 0) + 1;
    }
    console.log('\n📈 Indices by domain:');
    Object.entries(domainStats)
      .sort(([, a], [, b]) => b - a)
      .forEach(([domain, count]) => {
        console.log(`  ${domain}: ${count}`);
      });
  }
}
// CLI 실행 부분
if (require.main === module) {
  const monitor = new IndexMonitor();
  const command = process.argv[2];
  switch (command) {
    case 'check':
      monitor.checkAndCleanup().then(() => process.exit(0));
      break;
    case 'stats':
      monitor.getIndexStatistics().then(() => process.exit(0));
      break;
    case 'monitor':
      const intervalMinutes = parseInt(process.argv[3] || '10');
      monitor.startMonitoring(intervalMinutes);
      break;
    default:
      console.log('Usage:');
      console.log(
        '  tsx index-monitor.ts check     - One-time check and cleanup'
      );
      console.log('  tsx index-monitor.ts stats     - Show index statistics');
      console.log(
        '  tsx index-monitor.ts monitor [interval] - Start monitoring (default: 10 minutes)'
      );
      process.exit(1);
  }
}
export { IndexMonitor };
