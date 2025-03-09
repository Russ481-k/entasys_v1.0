import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import fs from 'fs';
import { NextResponse } from 'next/server';
import os from 'os';
import path from 'path';
import { z } from 'zod';

import { createTRPCRouter, protectedProcedure } from '@/server/config/trpc';

import { makeOpenSearchRequest } from '../lib/opensearch';

// Dayjs 설정
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Seoul');
const domains = [
  'vision-seoul-fw-seoulfw_1',
  'vision-seoul-fw-seoulfw_2',
  'vision-seoul-fw-seoulfw_3',
];
// 전역 상수
export const prisma = new PrismaClient();
// 다운로드 파일 정리 함수
async function cleanupDownloadFiles() {
  try {
    const downloadDir = './downloads';
    console.log('다운로드 파일 정리를 시작합니다...');
    // downloads 디렉토리가 존재하는 경우에만 처리
    if (fs.existsSync(downloadDir)) {
      const files = await fs.promises.readdir(downloadDir);
      for (const file of files) {
        const filePath = path.join(downloadDir, file);
        await fs.promises.unlink(filePath);
        console.log(`파일 삭제됨: ${file}`);
      }
      console.log('다운로드 파일 정리 완료');
    }
  } catch (error) {
    console.error('다운로드 파일 정리 중 오류 발생:', error);
  }
}
// 매일 자정에 다운로드 파일 정리 실행
function scheduleCleanup() {
  const now = dayjs().tz('Asia/Seoul');
  const midnight = now.endOf('day');
  const msUntilMidnight = midnight.diff(now);
  // 자정까지 대기 후 실행
  setTimeout(async () => {
    await cleanupDownloadFiles();
    // 다음 자정 스케줄링
    scheduleCleanup();
  }, msUntilMidnight);
}
// 초기 스케줄링 시작
scheduleCleanup();
// 시스템 터링 관련 함수
async function getDiskUsage() {
  return new Promise((resolve) => {
    // OpenSearch Docker 볼륨의 디스크 사용량 확인
    exec(
      "docker exec opensearch df -BG /usr/share/opensearch/data | tail -1 | awk '{print $2,$3,$5}'",
      (_, stdout) => {
        const [total, used, usagePercent] = stdout.trim().split(/\s+/);
        const totalGB = parseInt(
          total !== null && total !== void 0 ? total : '0'
        );
        const usedGB = parseInt(used !== null && used !== void 0 ? used : '0');
        const usage = parseInt(
          usagePercent !== null && usagePercent !== void 0 ? usagePercent : '0'
        );
        resolve({
          total: isNaN(totalGB) ? 0 : totalGB,
          used: isNaN(usedGB) ? 0 : usedGB,
          usage: isNaN(usage) ? 0 : usage,
        });
      }
    );
  });
}
async function checkDaemonStatus() {
  return new Promise((resolve) => {
    exec(
      "docker inspect opensearch | jq '.[0].State.Health.Status'",
      (_, stdout) => {
        const dbmsActive =
          stdout.trim() === `"healthy"` ? 'active' : 'inactive';
        exec(
          "docker inspect logstash | jq '.[0].State.Status'",
          (_, stdout) => {
            const parserActive =
              stdout.trim() === `"running"` ? 'active' : 'inactive';
            resolve({ dbms: dbmsActive, parser: parserActive });
          }
        );
      }
    );
  });
}
// 인덱스 삭제 작업 상태를 추적하기 위한 변수
let isCleanupInProgress = false;
async function deleteIndex(indexName) {
  var _a;
  try {
    console.log(`[${indexName}] 삭제 요청 전송...`);
    await makeOpenSearchRequest(`/${indexName}`, 'DELETE');
    console.log(`[${indexName}] 삭제 완료`);
    return true;
  } catch (error) {
    const opensearchError = error;
    if (
      (_a = opensearchError.message) === null || _a === void 0
        ? void 0
        : _a.includes('index_not_found_exception')
    ) {
      console.log(`[${indexName}] 이미 삭제된 인덱스입니다.`);
      return true;
    }
    console.error(`[${indexName}] 삭제 실패:`, error);
    return false;
  }
}
async function checkDiskUsageAndDeleteOldLogs() {
  if (isCleanupInProgress) {
    console.log('이미 인덱스 삭제 작업이 진행 중입니다.');
    return;
  }
  let diskUsage = await getDiskUsage();
  if (diskUsage.usage >= 80) {
    try {
      isCleanupInProgress = true;
      console.log(
        `OpenSearch 디스크 사용량이 ${diskUsage.usage}%로 80%를 초과했습니다. 오래된 로그 삭제를 시작합니다...`
      );
      console.log(
        `총 디스크: ${diskUsage.total}GB, 사용 중: ${diskUsage.used}GB`
      );
      const indices = await listIndices();
      const validIndices = indices
        .filter((index) => index.startsWith('20'))
        .sort();
      console.log(`전체 인덱스 수: ${indices.length}`);
      console.log(`삭제 대상 인덱스 수: ${validIndices.length}`);
      console.log('삭제 대상 인덱스 목록:', validIndices.join(', '));
      let deletedCount = 0;
      for (const index of validIndices) {
        const deleteSuccess = await deleteIndex(index);
        if (!deleteSuccess) {
          console.log(`[${index}] 삭제 실패, 다음 인덱스로 진행합니다.`);
          continue;
        }
        console.log(`[${index}] 삭제 시도`);
        deletedCount++;
        // 3개의 인덱스를 삭제할 때마다 디스크 공간 회수 작업 수행
        if (deletedCount % 3 === 0) {
          diskUsage = await getDiskUsage();
          console.log(`현재 OpenSearch 디스크 사용량: ${diskUsage.usage}%`);
          console.log(`사용 중인 디스크: ${diskUsage.used}GB`);
          if (diskUsage.usage < 75) {
            console.log(
              `디스크 사용량이 ${diskUsage.usage}%로 75% 미만으로 감소했습니다.`
            );
            break;
          }
        }
      }
      diskUsage = await getDiskUsage();
      console.log(`최종 OpenSearch 디스크 사용량: ${diskUsage.usage}%`);
      console.log(`최종 사용 중인 디스크: ${diskUsage.used}GB`);
      return;
    } catch (error) {
      console.error('인덱스 삭제 작업 중 오류 발생:', error);
    } finally {
      isCleanupInProgress = false;
      console.log('인덱스 삭제 작업이 완료되었습니다.');
    }
  }
}
async function listIndices() {
  const result = await makeOpenSearchRequest(
    '/_cat/indices?format=json',
    'GET'
  );
  return result
    .filter((item) => item.index && typeof item.index === 'string')
    .map((item) => item.index);
}
// 1초마다 디스크 용량 체크
setInterval(async () => {
  try {
    await checkDiskUsageAndDeleteOldLogs();
  } catch (error) {
    console.error('Error checking disk usage:', error);
  }
}, 1000);
// 시스템 메트릭스 관련 함수
async function getCpuUsage() {
  return new Promise((resolve) => {
    exec(
      // 모든 활성 상태의 CPU 사용률을 합산
      "mpstat 1 1 | grep 'Average:' | awk '{print $3 + $4 + $5 + $6 + $7 + $8 + $9}'",
      (_, stdout) => {
        const cpuUsage = parseFloat(stdout.trim());
        if (isNaN(cpuUsage) || cpuUsage < 0 || cpuUsage > 100) {
          resolve(0);
        } else {
          resolve(Number(cpuUsage.toFixed(1)));
        }
      }
    );
  });
}
async function getMemoryUsage() {
  return new Promise((resolve) => {
    exec("free | grep Mem | awk '{print ($3/$2) * 100}'", (_, stdout) => {
      const memUsage = parseFloat(stdout.trim());
      resolve(isNaN(memUsage) ? 0 : memUsage);
    });
  });
}
export const dashboardRouter = createTRPCRouter({
  getDomains: protectedProcedure()
    .output(z.object({ domains: z.array(z.string()) }))
    .query(async () => {
      return { domains };
    }),
  // 시스템 메트릭스 조회
  getSystemMetrics: protectedProcedure()
    .output(
      z.object({
        cpu_usage: z.number(),
        memory_usage: z.number(),
        disk: z.object({
          total: z.number(),
          used: z.number(),
          usage: z.number(),
        }),
        daemon_status: z.object({
          dbms: z.enum(['active', 'inactive']),
          parser: z.enum(['active', 'inactive']),
        }),
      })
    )
    .query(async () => {
      const [cpuUsage, memoryUsage, disk, daemon_status] = await Promise.all([
        getCpuUsage(),
        getMemoryUsage(),
        getDiskUsage(),
        checkDaemonStatus(),
      ]);
      return {
        cpu_usage: cpuUsage,
        memory_usage: memoryUsage,
        disk,
        daemon_status,
      };
    }),
  // 로그 트릭스 조회
  getLogMetrics: protectedProcedure()
    .output(
      z.object({
        logs_per_second: z.number(),
        logs_per_day: z.number(),
      })
    )
    .query(async () => {
      const now = dayjs().tz('Asia/Seoul');
      const thirtySecondsAgo = now.subtract(30, 'second');
      const oneMinuteAgo = thirtySecondsAgo.subtract(60, 'second');
      const currentHour = now.format('YYYY.MM.DD.HH');
      // 초당 로그 수 계산
      const logsPerSecondPromises = domains.map(async (domain) => {
        const domainPattern = domain
          .toLowerCase()
          .replace(/\./g, '-')
          .replace(/[^a-z0-9\-]/g, '_');
        const result = await makeOpenSearchRequest(
          `/${currentHour}*_${domainPattern}/_count`,
          'POST',
          {
            query: {
              bool: {
                must: [
                  {
                    range: {
                      '@timestamp': {
                        gte: oneMinuteAgo.toISOString(),
                        lt: thirtySecondsAgo.toISOString(),
                        time_zone: '+09:00',
                      },
                    },
                  },
                ],
              },
            },
          }
        );
        return !!result.count ? result.count / 60 : 0; // 60초 동안의 로그를 초당 평균으로 변환
      });
      // 일간 로그 수 계산
      const currentDate = now.format('YYYY.MM.DD');
      const logsPerDayPromises = domains.map(async (domain) => {
        var _a;
        const domainPattern = domain
          .toLowerCase()
          .replace(/\./g, '-')
          .replace(/[^a-z0-9\-]/g, '_');
        const indices = `${currentDate}*_${domainPattern}`;
        const result = await makeOpenSearchRequest(`/${indices}/_count`, 'GET');
        return (_a = result.count) !== null && _a !== void 0 ? _a : 0;
      });
      const logsPerSecond = await Promise.all(logsPerSecondPromises);
      const logsPerDay = await Promise.all(logsPerDayPromises);
      return {
        logs_per_second: Math.round(logsPerSecond.reduce((a, b) => a + b, 0)),
        logs_per_day: logsPerDay.reduce((a, b) => a + b, 0),
      };
    }),
  getChartMetrics: protectedProcedure().query(async () => {
    var _a, _b, _c;
    const now = dayjs().tz('Asia/Seoul');
    // 시간별 데이터 (최근 24시간)
    const hourlyResult = await makeOpenSearchRequest('/_search', 'POST', {
      size: 0,
      query: {
        range: {
          '@timestamp': {
            gte: now.subtract(24, 'hours').format(),
            lte: now.format(),
            time_zone: '+09:00',
          },
        },
      },
      aggs: {
        logs_per_hour: {
          date_histogram: {
            field: '@timestamp',
            fixed_interval: '1h',
            time_zone: '+09:00',
            format: 'yyyy-MM-dd HH:mm:ss',
            extended_bounds: {
              min: now.subtract(24, 'hours').valueOf(),
              max: now.valueOf(),
            },
            min_doc_count: 0,
          },
        },
      },
    });
    // 일별 데이터 (최근 10일)
    const dailyResult = await makeOpenSearchRequest('/_search', 'POST', {
      size: 0,
      query: {
        range: {
          '@timestamp': {
            gte: 'now-10d/d',
            lte: 'now/d',
            time_zone: '+09:00',
          },
        },
      },
      aggs: {
        logs_per_day: {
          date_histogram: {
            field: '@timestamp',
            calendar_interval: 'day',
            time_zone: '+09:00',
            format: 'yyyy-MM-dd',
            extended_bounds: {
              min: 'now-10d/d',
              max: 'now/d',
            },
            min_doc_count: 0,
          },
        },
      },
    });
    // 월별 데이터 (최근 12개월)
    const monthlyResult = await makeOpenSearchRequest('/_search', 'POST', {
      size: 0,
      query: {
        range: {
          '@timestamp': {
            gte: 'now-1y/M',
            lte: 'now/M',
            time_zone: '+09:00',
          },
        },
      },
      aggs: {
        logs_per_month: {
          date_histogram: {
            field: '@timestamp',
            calendar_interval: 'month',
            time_zone: '+09:00',
            format: 'yyyy-MM',
            extended_bounds: {
              min: 'now-1y/M',
              max: 'now/M',
            },
            min_doc_count: 0,
          },
        },
      },
    });
    // 도메인별 월간 데이터 (최근 12개월)
    const domainMonthlyPromises = domains.map(async (domain) => {
      const domainPattern = domain
        .toLowerCase()
        .replace(/\./g, '-')
        .replace(/[^a-z0-9\-]/g, '_');
      // 최근 12개월의 데이터를 가져오기
      const monthlyPromises = Array.from({ length: 12 }, async (_, i) => {
        var _a;
        const targetMonth = now.subtract(11 - i, 'months');
        const monthPattern = targetMonth.format('YYYY.MM');
        const result = await makeOpenSearchRequest(
          `/${monthPattern}*_${domainPattern}*/_count`,
          'GET'
        );
        return {
          time: targetMonth.format('YYYY-MM'),
          total: (_a = result.count) !== null && _a !== void 0 ? _a : 0,
        };
      });
      const monthlyData = await Promise.all(monthlyPromises);
      return {
        domain,
        data: monthlyData,
      };
    });
    const domainMonthlyResults = await Promise.all(domainMonthlyPromises);
    return {
      hourly_totals:
        ((_a = hourlyResult.aggregations.logs_per_hour) === null ||
        _a === void 0
          ? void 0
          : _a.buckets.map((bucket) => ({
              time: bucket.key_as_string,
              total: bucket.doc_count,
            }))) || [],
      last_10_days_daily_totals:
        ((_b = dailyResult.aggregations.logs_per_day) === null || _b === void 0
          ? void 0
          : _b.buckets.map((bucket) => ({
              time: bucket.key_as_string,
              total: bucket.doc_count,
            }))) || [],
      monthly_totals:
        ((_c = monthlyResult.aggregations.logs_per_month) === null ||
        _c === void 0
          ? void 0
          : _c.buckets.map((bucket) => ({
              time: bucket.key_as_string,
              total: bucket.doc_count,
            }))) || [],
      domain_monthly_totals: domainMonthlyResults,
    };
  }),
});
export async function GET() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const usagePercentage = ((usedMemory / totalMemory) * 100).toFixed(3);
  const response = {
    total: totalMemory,
    used: usedMemory,
    free: freeMemory,
    usagePercentage,
  };
  return NextResponse.json(response);
}
