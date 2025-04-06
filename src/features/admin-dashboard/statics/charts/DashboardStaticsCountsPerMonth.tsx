import React, { useEffect, useMemo, useState } from 'react';

import { GridItem, useColorMode } from '@chakra-ui/react';
import { AgBarSeriesOptions, AgChartOptions } from 'ag-charts-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

import { AgChartsThemeChanged } from '@/components/AgChartsThemeChanged';

interface Props {
  data: { time: string; total: number }[];
}

export const DashboardStaticsCountsPerMonth = ({ data }: Props) => {
  const { colorMode } = useColorMode();
  const [chartHeight, setChartHeight] = useState<number>(0);

  useEffect(() => {
    const updateHeight = () => {
      setChartHeight((window.innerHeight - 380) / 2);
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const countsPerDay = useMemo<AgChartOptions>(
    () => ({
      title: {
        text: '월간 로그 총 수집량',
      },
      data: data,
      series: [
        {
          type: 'bar',
          xKey: 'time',
          yKey: 'total',
          yName: 'Total',
        } as AgBarSeriesOptions,
      ],
      axes: [
        {
          type: 'category',
          position: 'bottom',
        },
        {
          position: 'left',
          type: 'number',
          label: {
            formatter: (params) => {
              return `${(params.value / 1000000).toFixed(1)}M`;
            },
          },
          keys: ['total'],
          title: {
            text: 'Total (M)',
          },
        },
        {
          position: 'right',
          type: 'number',
          keys: ['countsPerMonth'],
          title: {
            text: 'Counts Per Month',
          },
        },
      ],
      height: chartHeight,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, colorMode, chartHeight]
  );

  return (
    <GridItem
      borderRadius="lg"
      bg="blackAlpha.200"
      borderWidth={1}
      borderColor={colorMode === 'light' ? 'gray.200' : 'whiteAlpha.300'}
      colSpan={{ base: 1, sm: 2, md: 3, lg: 3, xl: 3 }}
      overflow="hidden"
      height={chartHeight}
    >
      <AgChartsThemeChanged colorMode={colorMode} options={countsPerDay} />
    </GridItem>
  );
};
