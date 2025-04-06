import React, { useMemo } from 'react';

import {
  Box,
  Flex,
  GridItem,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorMode,
} from '@chakra-ui/react';
import { AgChartOptions } from 'ag-charts-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

import { AgChartsThemeChanged } from '@/components/AgChartsThemeChanged';

export const DiskUsageCard = ({
  diskUsage,
  isLoading,
}: {
  diskUsage: { total: number; used: number; usage: number };
  isLoading: boolean;
}) => {
  const { colorMode } = useColorMode();
  const cpuUsageDataDonut = useMemo<AgChartOptions>(
    () => ({
      data: [
        {
          asset: 'available',
          amount: 100 - diskUsage.usage,
        },
        {
          asset: 'used',
          amount: diskUsage.usage,
        },
      ],
      series: [
        {
          type: 'donut',
          angleKey: 'amount',
          innerRadiusRatio: 0.85,
          innerLabels: [
            {
              text: String(diskUsage.usage.toFixed(1)) + '%',
              spacing: 0,
              fontSize: 16,
              fontWeight: 'bold',
            },
          ],
        },
      ],
      legend: {
        enabled: false,
      },
      height: 160,
      width: 160,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diskUsage, colorMode]
  );

  return (
    <GridItem
      borderRadius="lg"
      bg={colorMode === 'light' ? 'white' : '#182232'}
      borderWidth={1}
      borderColor={colorMode === 'light' ? 'gray.200' : 'whiteAlpha.300'}
      colSpan={1}
      overflow="hidden"
      w="100%"
      height={{
        base: '220px',
        sm: '220px',
        md: '220px',
        lg: '220px',
        xl: '220px',
      }}
    >
      <Box
        display="grid"
        m="auto"
        alignItems="center"
        textAlign="center"
        justifyContent="center"
        height="220px"
      >
        <Box
          m="auto"
          alignItems="center"
          textAlign="center"
          justifyContent="center"
        >
          <Text fontSize="lg" fontWeight="bold">
            Disk 사용량
          </Text>
          <Text fontSize="sm" fontWeight="regular">
            Disk Usage
          </Text>
        </Box>
        <Flex justifyContent="center" alignItems="center" w="100%" h="100px">
          <Table size="xs" variant="simple" w="30%" mt="-40px" zIndex={1}>
            <Thead>
              <Tr>
                <Th fontSize="xs">Total</Th>
              </Tr>
            </Thead>
            <Tbody>
              <Tr>
                <Td fontSize="xs" textAlign="right">
                  {diskUsage.total >= 1048576
                    ? `${(diskUsage.total / 1048576).toFixed(1)} PB`
                    : diskUsage.total >= 1024
                      ? `${(diskUsage.total / 1024).toFixed(1)} TB`
                      : `${diskUsage.total.toFixed(1)} GB`}
                </Td>
              </Tr>
            </Tbody>
            <Thead>
              <Tr>
                <Th fontSize="xs">Used</Th>
              </Tr>
            </Thead>
            <Tbody>
              <Tr>
                <Td fontSize="xs" textAlign="right">
                  {diskUsage.used >= 1048576
                    ? `${(diskUsage.used / 1048576).toFixed(1)} PB`
                    : diskUsage.used >= 1024
                      ? `${(diskUsage.used / 1024).toFixed(1)} TB`
                      : `${diskUsage.used.toFixed(1)} GB`}
                </Td>
              </Tr>
            </Tbody>
          </Table>
          <Box w="70%" ml="0px" mt="10px" mr="-10px" py="50px">
            <AgChartsThemeChanged
              colorMode={colorMode}
              options={cpuUsageDataDonut}
            />
          </Box>
        </Flex>
        <Box />
      </Box>
    </GridItem>
  );
};
