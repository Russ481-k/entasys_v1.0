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
  // 시스템 메트릭스
  const { data: systemMetrics, isLoading: isSystemMetricsLoading } =
    trpc.dashboard.getSystemMetrics.useQuery();
  const cpuUsage = systemMetrics?.cpu_usage;
  const memoryUsage = systemMetrics?.memory_usage;
  const diskUsage = systemMetrics?.disk;
  const daemonStatus = systemMetrics?.daemon_status;

  // 로그 메트릭스
  const { data: logMetrics, isLoading: isLogMetricsLoading } =
    trpc.dashboard.getLogMetrics.useQuery();
  const logsPerSecond = logMetrics?.logs_per_second;
  const logsPerDay = logMetrics?.logs_per_day;

  // 출발지/도착지 국가 세션
  const { data: sourceCountrySessions, isLoading: isSourceCountryLoading } =
    trpc.dashboard.getSourceCountrySessions.useQuery();
  const {
    data: destinationCountrySessions,
    isLoading: isDestinationCountryLoading,
  } = trpc.dashboard.getDestinationCountrySessions.useQuery();

  // 일간/월간 로그 총 수집량
  const { data: dailyLogTotals } = trpc.dashboard.getDailyLogTotals.useQuery();
  const { data: last10DaysLogTotals } =
    trpc.dashboard.getLast10DaysLogTotals.useQuery();
  const hourlyLogTotals = dailyLogTotals?.hourly_totals ?? [];
  const last10DaysData = last10DaysLogTotals?.last_10_days_daily_totals ?? [];

  // 장비별 월간 로그 총 수집량
  const { data: deviceMonthlyLogTotals } =
    trpc.dashboard.getDeviceMonthlyLogTotals.useQuery();
  const deviceMonthlyData = deviceMonthlyLogTotals?.domain_monthly_totals ?? [];
  const monthlyData = deviceMonthlyLogTotals?.monthly_totals ?? [];

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
        isLoading={isLogMetricsLoading}
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
        isLoading={isSystemMetricsLoading}
      />
      <DiskUsageCard
        diskUsage={diskUsage || { total: 0, used: 0, usage: 0 }}
        isLoading={isSystemMetricsLoading}
      />
      <CountrySessionCard
        title="도착지 국가 세션"
        subtitle="Top 10 Destination Countries"
        data={destinationCountrySessions?.destination_country_sessions ?? []}
        type="destination"
        isLoading={isDestinationCountryLoading}
      />
      <CountrySessionCard
        title="출발지 국가 세션"
        subtitle="Top 10 Source Countries"
        data={sourceCountrySessions?.source_country_sessions ?? []}
        type="source"
        isLoading={isSourceCountryLoading}
      />
      <DaemonStatusCard
        daemonStatus={daemonStatus || { dbms: 'inactive', parser: 'inactive' }}
        isLoading={isSystemMetricsLoading}
      />
      <DashboardStaticsCountsPerDayHourse data={hourlyLogTotals} />
      <DashboardStaticsCountsPer10Days data={last10DaysData} />
      <DashboardStaticsCountsPerMonth data={monthlyData} />
      <DashboardStaticsCountsPerMonthByDomain data={deviceMonthlyData} />
    </Grid>
  );
};
