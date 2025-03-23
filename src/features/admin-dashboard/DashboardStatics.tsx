import React from 'react';

import { Grid } from '@chakra-ui/react';

import { trpc } from '@/lib/trpc/client';

import { CountrySessionCard } from './statics/cards/CountrySessionCard';
import { CpuUsageCard } from './statics/cards/CpuUsageCard';
import { DaemonStatusCard } from './statics/cards/DaemonStatusCard';
import { DiskUsageCard } from './statics/cards/DiskUsageCard';
import { LogsCountCard } from './statics/cards/LogsCountCard';
import { DashboardStaticsCountsPer10Days } from './statics/charts/DashboardStaticsCountsPer10Days';
import { DashboardStaticsCountsPerDayHourse } from './statics/charts/DashboardStaticsCountsPerDayHourse';
import { DashboardStaticsCountsPerMonth } from './statics/charts/DashboardStaticsCountsPerMonth';
import { DashboardStaticsCountsPerMonthByDomain } from './statics/charts/DashboardStaticsCountsPerMonthByDomain';

export const DashboardStatics = () => {
  const getChartMetrics = trpc.dashboard.getChartMetrics.useQuery();
  const getSystemMetrics = trpc.dashboard.getSystemMetrics.useQuery();
  const getLogMetrics = trpc.dashboard.getLogMetrics.useQuery();
  const cpuUsage = getSystemMetrics.data?.cpu_usage;
  const memoryUsage = getSystemMetrics.data?.memory_usage;
  const diskUsage = getSystemMetrics.data?.disk;
  const daemonStatus = getSystemMetrics.data?.daemon_status;

  const logsPerSecond = getLogMetrics.data?.logs_per_second;
  const logsPerDay = getLogMetrics.data?.logs_per_day;

  // 국가별 세션 데이터 (예시 데이터, 실제 API 응답에 맞게 수정 필요)
  const sourceCountrySessions =
    getChartMetrics.data?.source_country_sessions ?? [];
  const destinationCountrySessions =
    getChartMetrics.data?.destination_country_sessions ?? [];

  // const encryptedCopyright = useMemo(() => {
  //   const text = [
  //     67, 111, 112, 121, 114, 105, 103, 104, 116, 32, 50, 48, 50, 53, 46, 32,
  //     89, 117, 110, 32, 83, 117, 45, 66, 105, 110, 32, 97, 108, 108, 32, 114,
  //     105, 103, 104, 116, 115, 32, 114, 101, 115, 101, 114, 118, 101, 100, 46,
  //   ];
  //   const key = [19, 28, 37, 46, 55, 64, 73, 82, 91];
  //   return (
  //     text
  //       // @ts-expect-error don't want to implement
  //       .map((char, i) => String.fromCharCode(char ^ key[i % key.length]))
  //       .join('')
  //   );
  // }, []);

  // const warning = useMemo(() => {
  //   if (!encryptedCopyright) return '';
  //   const text = encryptedCopyright
  //     ?.split('')
  //     .map((char) => char.charCodeAt(0));
  //   const key = [19, 28, 37, 46, 55, 64, 73, 82, 91];
  //   if (!text) return '';
  //   return (
  //     text
  //       // @ts-expect-error don't want to implement
  //       .map((char, i) => String.fromCharCode(char ^ key[i % key.length]))
  //       .join('')
  //   );
  // }, [encryptedCopyright]);

  return (
    <Grid
      height="100%"
      minHeight="60vh"
      gap={3}
      templateColumns={{
        base: 'repeat(1, 6fr)',
        sm: 'repeat(2, 6fr)',
        md: 'repeat(3, 2fr)',
        lg: 'repeat(3, 2fr)',
        xl: 'repeat(6, 1fr)',
      }}
    >
      <LogsCountCard
        title="로그 통계"
        subtitle="Logs Statistics"
        data={[
          {
            label: '초당 로그량(lps)',
            count: logsPerSecond || 0,
          },
          {
            label: '일별 로그량(lpd)',
            count: logsPerDay || 0,
          },
        ]}
      />
      <CpuUsageCard
        title="하드웨어 사용량"
        subtitle="Hardware Usage"
        data={[
          {
            label: 'CPU',
            value: cpuUsage || 0,
            unit: '%',
          },
          {
            label: 'Memory',
            value: memoryUsage || 0,
            unit: '%',
          },
        ]}
      />
      <DiskUsageCard diskUsage={diskUsage || { total: 0, used: 0, usage: 0 }} />
      <CountrySessionCard
        title="도착지 국가 세션"
        subtitle="Top 5 Destination Countries"
        data={destinationCountrySessions}
        type="destination"
      />
      <CountrySessionCard
        title="출발지 국가 세션"
        subtitle="Top 5 Source Countries"
        data={sourceCountrySessions}
        type="source"
      />
      <DaemonStatusCard
        daemonStatus={daemonStatus || { dbms: 'inactive', parser: 'inactive' }}
      />
      <DashboardStaticsCountsPerDayHourse
        data={getChartMetrics.data?.hourly_totals ?? []}
      />
      <DashboardStaticsCountsPer10Days
        data={getChartMetrics.data?.last_10_days_daily_totals ?? []}
      />
      <DashboardStaticsCountsPerMonth
        data={getChartMetrics.data?.monthly_totals ?? []}
      />
      <DashboardStaticsCountsPerMonthByDomain
        data={getChartMetrics.data?.domain_monthly_totals ?? []}
      />
      {/* <Text fontSize="xs" gridColumn="1/-1" textAlign="center" color="gray.500">
        {warning}
      </Text> */}
    </Grid>
  );
};
