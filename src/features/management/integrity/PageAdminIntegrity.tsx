import React, { useEffect, useState } from 'react';

import { CloseIcon, DownloadIcon, InfoIcon } from '@chakra-ui/icons';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Grid,
  HStack,
  Heading,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
  Select,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  useColorMode,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';

import {
  DataList,
  DataListCell,
  DataListEmptyState,
  DataListErrorState,
  DataListLoadingState,
  DataListRow,
  DataListText,
} from '@/components/DataList';
import {
  AdminLayoutPage,
  AdminLayoutPageContent,
} from '@/features/admin/AdminLayoutPage';
import { AdminNav } from '@/features/management/ManagementNav';
import { trpc } from '@/lib/trpc/client';

interface IntegrityCheckResult {
  totalLogs: number;
  matchedLogs: number;
  unmatchedLogs: number;
  details: {
    domain: string;
    total: number;
    matched: number;
    unmatched: number;
    percentage: number;
    sampleLogs: {
      id: string;
      timestamp: string;
      sourceIp: string;
      destinationIp: string;
      sourceCountry: string;
      destinationCountry: string;
      status: string;
    }[];
  }[];
}

interface Domain {
  id: string;
  name: string;
}

export const PageAdminIntegrity: React.FC = () => {
  const { t } = useTranslation(['management']);
  const { colorMode } = useColorMode();
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<IntegrityCheckResult | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [checkProgress, setCheckProgress] = useState<{
    [key: string]: {
      status: 'pending' | 'checking' | 'completed' | 'error';
      progress: number;
      result?: IntegrityCheckResult;
    };
  }>({});
  const [domainCounts, setDomainCounts] = useState<Record<string, number>>({});

  const { data: domains } = trpc.domains.getDomains.useQuery({});
  const { data: domainLogCounts, refetch: refetchDomainCounts } =
    trpc.integrity.getDomainCounts.useQuery({
      timeRange: timeRange as '24h' | '7d' | '30d',
    });

  useEffect(() => {
    console.log('Domain log counts received:', domainLogCounts);
    if (domainLogCounts) {
      const counts = domainLogCounts.reduce(
        (acc, { domain, count }) => {
          acc[domain] = count;
          return acc;
        },
        {} as Record<string, number>
      );
      console.log('Processed domain counts:', counts);
      setDomainCounts(counts);
    }
  }, [domainLogCounts]);

  useEffect(() => {
    console.log('Refetching domain counts for timeRange:', timeRange);
    refetchDomainCounts();
  }, [timeRange, refetchDomainCounts]);

  const checkIntegrity = trpc.integrity.checkIntegrity.useMutation({
    onSuccess: (data: IntegrityCheckResult, variables) => {
      setCheckProgress((prev) => ({
        ...prev,
        [variables.domain]: {
          status: 'completed',
          progress: 100,
          result: data,
        },
      }));
    },
    onError: (error, variables) => {
      setCheckProgress((prev) => ({
        ...prev,
        [variables.domain]: {
          status: 'error',
          progress: 0,
        },
      }));
      toast({
        title: t('management:integrity.error'),
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    },
  });

  const handleCheck = () => {
    if (selectedDomains.length === 0) {
      toast({
        title: t('management:integrity.domainRequired'),
        description: t('management:integrity.domainRequiredDescription'),
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsChecking(true);
    setCheckProgress(
      selectedDomains.reduce(
        (acc, domain) => ({
          ...acc,
          [domain]: { status: 'pending', progress: 0 },
        }),
        {}
      )
    );

    // 각 도메인에 대해 순차적으로 검증 실행
    Promise.all(
      selectedDomains.map((domain) => {
        setCheckProgress((prev) => ({
          ...prev,
          [domain]: { status: 'checking', progress: 0 },
        }));
        return checkIntegrity.mutateAsync({ domain, timeRange });
      })
    ).then((results) => {
      // 결과 병합
      const mergedResult: IntegrityCheckResult = {
        totalLogs: results.reduce((sum, r) => sum + r.totalLogs, 0),
        matchedLogs: results.reduce((sum, r) => sum + r.matchedLogs, 0),
        unmatchedLogs: results.reduce((sum, r) => sum + r.unmatchedLogs, 0),
        details: results.flatMap((r) => r.details),
      };
      setResult(mergedResult);
      setIsChecking(false);
      toast({
        title: t('management:integrity.checkComplete'),
        description: t('management:integrity.checkCompleteDescription'),
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    });
  };

  const handleExport = () => {
    if (!result) return;

    const csvContent = [
      [
        'Domain',
        'Total Logs',
        'Matched Logs',
        'Unmatched Logs',
        'Percentage',
        'Status',
      ],
      ...result.details.map((detail) => [
        detail.domain,
        detail.total,
        detail.matched,
        detail.unmatched,
        `${detail.percentage.toFixed(2)}%`,
        detail.percentage >= 95
          ? 'Good'
          : detail.percentage >= 90
            ? 'Warning'
            : 'Error',
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `integrity-check-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <AdminLayoutPage containerMaxWidth="container.xl" nav={<AdminNav />}>
      <AdminLayoutPageContent>
        <Stack spacing={6}>
          <HStack spacing={4} alignItems={{ base: 'end', md: 'center' }}>
            <Flex
              direction={{ base: 'column', md: 'row' }}
              rowGap={2}
              columnGap={4}
              alignItems={{ base: 'start', md: 'center' }}
              flex={1}
            >
              <Heading flex="none" size="md">
                {t('management:integrity.title')}
              </Heading>
              <Tooltip label={t('management:integrity.infoTooltip')}>
                <IconButton
                  aria-label="Info"
                  icon={<InfoIcon />}
                  onClick={onOpen}
                  variant="ghost"
                  colorScheme="blue"
                />
              </Tooltip>
            </Flex>
          </HStack>

          <DataList>
            <DataListRow>
              <DataListCell>
                <Stack spacing={6}>
                  <Box>
                    <Flex justify="space-between" align="center" mb={2}>
                      <Text fontWeight="medium">
                        {t('management:integrity.selectDomain')}
                      </Text>
                      <Button
                        size="sm"
                        variant="ghost"
                        colorScheme="blue"
                        onClick={() => setSelectedDomains([])}
                      >
                        {t('management:integrity.clearSelection')}
                      </Button>
                    </Flex>
                    <Select
                      placeholder={t(
                        'management:integrity.selectDomainPlaceholder'
                      )}
                      value=""
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value && !selectedDomains.includes(value)) {
                          setSelectedDomains([...selectedDomains, value]);
                        }
                      }}
                      bg={colorMode === 'light' ? 'white' : 'gray.800'}
                      borderColor={
                        colorMode === 'light' ? 'gray.200' : 'whiteAlpha.300'
                      }
                    >
                      {domains?.items
                        .filter(
                          (domain) => !selectedDomains.includes(domain.name)
                        )
                        .map((domain: Domain) => {
                          const logCount = domainCounts[domain.name] || 0;
                          return (
                            <option key={domain.id} value={domain.name}>
                              {domain.name}
                            </option>
                          );
                        })}
                    </Select>
                  </Box>

                  {selectedDomains.length > 0 && (
                    <Box>
                      <Text fontSize="sm" color="text-dimmed" mb={2}>
                        {t('management:integrity.selectedDomains')}
                      </Text>
                      <Stack spacing={3}>
                        {selectedDomains.map((domain) => {
                          const logCount = domainCounts[domain] || 0;
                          return (
                            <Box
                              key={domain}
                              p={3}
                              borderRadius="md"
                              bg={
                                colorMode === 'light'
                                  ? 'gray.50'
                                  : 'whiteAlpha.100'
                              }
                              borderWidth="1px"
                              borderColor={
                                colorMode === 'light'
                                  ? 'gray.200'
                                  : 'whiteAlpha.300'
                              }
                            >
                              <Flex justify="space-between" align="center">
                                <Box>
                                  <Text fontWeight="medium">{domain}</Text>
                                  <Text fontSize="sm" color="text-dimmed">
                                    {logCount.toLocaleString()} logs
                                  </Text>
                                </Box>
                                <IconButton
                                  aria-label="Remove domain"
                                  icon={<CloseIcon />}
                                  size="sm"
                                  variant="ghost"
                                  colorScheme="blue"
                                  onClick={() =>
                                    setSelectedDomains(
                                      selectedDomains.filter(
                                        (d) => d !== domain
                                      )
                                    )
                                  }
                                />
                              </Flex>
                              {checkProgress[domain] && (
                                <Box mt={2}>
                                  <Flex justify="space-between" mb={1}>
                                    <Text fontSize="sm" color="text-dimmed">
                                      {checkProgress[domain].status ===
                                        'pending' && '대기 중'}
                                      {checkProgress[domain].status ===
                                        'checking' && '검사 중'}
                                      {checkProgress[domain].status ===
                                        'completed' && '완료'}
                                      {checkProgress[domain].status ===
                                        'error' && '오류'}
                                    </Text>
                                    {checkProgress[domain].status ===
                                      'completed' &&
                                      checkProgress[domain].result
                                        ?.details[0] && (
                                        <Badge
                                          colorScheme={
                                            checkProgress[domain].result
                                              .details[0].percentage >= 95
                                              ? 'green'
                                              : checkProgress[domain].result
                                                    .details[0].percentage >= 90
                                                ? 'yellow'
                                                : 'red'
                                          }
                                        >
                                          {checkProgress[
                                            domain
                                          ].result.details[0].percentage.toFixed(
                                            2
                                          )}
                                          %
                                        </Badge>
                                      )}
                                  </Flex>
                                  <Progress
                                    value={checkProgress[domain].progress}
                                    colorScheme={
                                      checkProgress[domain].status ===
                                      'completed'
                                        ? 'green'
                                        : checkProgress[domain].status ===
                                            'error'
                                          ? 'red'
                                          : 'blue'
                                    }
                                    size="sm"
                                    borderRadius="full"
                                  />
                                </Box>
                              )}
                            </Box>
                          );
                        })}
                      </Stack>
                    </Box>
                  )}

                  <Flex gap={4} align="center">
                    <Select
                      value={timeRange}
                      onChange={(e) =>
                        setTimeRange(e.target.value as '24h' | '7d' | '30d')
                      }
                      width="120px"
                      bg={colorMode === 'light' ? 'white' : 'gray.800'}
                      borderColor={
                        colorMode === 'light' ? 'gray.200' : 'whiteAlpha.300'
                      }
                    >
                      <option value="24h">24h</option>
                      <option value="7d">7d</option>
                      <option value="30d">30d</option>
                    </Select>
                    <Button
                      colorScheme="blue"
                      onClick={handleCheck}
                      isLoading={isChecking}
                      loadingText={t('management:integrity.checking')}
                    >
                      {t('management:integrity.startCheck')}
                    </Button>
                  </Flex>
                </Stack>
              </DataListCell>
            </DataListRow>
          </DataList>

          {result && (
            <DataList>
              <DataListRow>
                <DataListCell>
                  <Stack spacing={6}>
                    <Flex justify="space-between" align="center">
                      <Box>
                        <Heading size="md" mb={1}>
                          {t('management:integrity.results')}
                        </Heading>
                        <Text color="text-dimmed" fontSize="sm">
                          {t('management:integrity.checkComplete')}
                        </Text>
                      </Box>
                      <Button
                        leftIcon={<DownloadIcon />}
                        colorScheme="green"
                        onClick={handleExport}
                        size="sm"
                      >
                        {t('management:integrity.export')}
                      </Button>
                    </Flex>

                    <Grid templateColumns="repeat(3, 1fr)" gap={6}>
                      <Box
                        p={6}
                        borderRadius="lg"
                        bg={
                          colorMode === 'light' ? 'gray.50' : 'whiteAlpha.100'
                        }
                        borderWidth="1px"
                        borderColor={
                          colorMode === 'light' ? 'gray.200' : 'whiteAlpha.300'
                        }
                      >
                        <Stack spacing={2}>
                          <Text fontSize="sm" color="text-dimmed">
                            {t('management:integrity.totalLogs')}
                          </Text>
                          <Text fontSize="3xl" fontWeight="bold">
                            {result.totalLogs.toLocaleString()}
                          </Text>
                        </Stack>
                      </Box>
                      <Box
                        p={6}
                        borderRadius="lg"
                        bg={colorMode === 'light' ? 'green.50' : 'green.900'}
                        borderWidth="1px"
                        borderColor={
                          colorMode === 'light' ? 'green.200' : 'green.800'
                        }
                      >
                        <Stack spacing={2}>
                          <Text fontSize="sm" color="text-dimmed">
                            {t('management:integrity.matchedLogs')}
                          </Text>
                          <Text
                            fontSize="3xl"
                            fontWeight="bold"
                            color="green.500"
                          >
                            {result.matchedLogs.toLocaleString()}
                          </Text>
                        </Stack>
                      </Box>
                      <Box
                        p={6}
                        borderRadius="lg"
                        bg={colorMode === 'light' ? 'red.50' : 'red.900'}
                        borderWidth="1px"
                        borderColor={
                          colorMode === 'light' ? 'red.200' : 'red.800'
                        }
                      >
                        <Stack spacing={2}>
                          <Text fontSize="sm" color="text-dimmed">
                            {t('management:integrity.unmatchedLogs')}
                          </Text>
                          <Text
                            fontSize="3xl"
                            fontWeight="bold"
                            color="red.500"
                          >
                            {result.unmatchedLogs.toLocaleString()}
                          </Text>
                        </Stack>
                      </Box>
                    </Grid>

                    <Box>
                      <Heading size="md" mb={4}>
                        {t('management:integrity.details')}
                      </Heading>
                      <Accordion allowMultiple>
                        {result.details.map((detail) => (
                          <AccordionItem key={detail.domain}>
                            <AccordionButton>
                              <Box flex="1" textAlign="left">
                                <Flex align="center" gap={3}>
                                  <Text fontWeight="bold">{detail.domain}</Text>
                                  <Badge
                                    colorScheme={
                                      detail.percentage >= 95
                                        ? 'green'
                                        : detail.percentage >= 90
                                          ? 'yellow'
                                          : 'red'
                                    }
                                    fontSize="sm"
                                    px={2}
                                    py={1}
                                  >
                                    {detail.percentage.toFixed(2)}%
                                  </Badge>
                                </Flex>
                              </Box>
                              <AccordionIcon />
                            </AccordionButton>
                            <AccordionPanel pb={4}>
                              <Stack spacing={4}>
                                <Grid templateColumns="repeat(3, 1fr)" gap={4}>
                                  <Box
                                    p={4}
                                    borderRadius="md"
                                    bg={
                                      colorMode === 'light'
                                        ? 'gray.50'
                                        : 'whiteAlpha.100'
                                    }
                                  >
                                    <Text fontSize="sm" color="text-dimmed">
                                      {t('management:integrity.totalLogs')}
                                    </Text>
                                    <Text fontSize="lg" fontWeight="bold">
                                      {detail.total.toLocaleString()}
                                    </Text>
                                  </Box>
                                  <Box
                                    p={4}
                                    borderRadius="md"
                                    bg={
                                      colorMode === 'light'
                                        ? 'green.50'
                                        : 'green.900'
                                    }
                                  >
                                    <Text fontSize="sm" color="text-dimmed">
                                      {t('management:integrity.matchedLogs')}
                                    </Text>
                                    <Text
                                      fontSize="lg"
                                      fontWeight="bold"
                                      color="green.500"
                                    >
                                      {detail.matched.toLocaleString()}
                                    </Text>
                                  </Box>
                                  <Box
                                    p={4}
                                    borderRadius="md"
                                    bg={
                                      colorMode === 'light'
                                        ? 'red.50'
                                        : 'red.900'
                                    }
                                  >
                                    <Text fontSize="sm" color="text-dimmed">
                                      {t('management:integrity.unmatchedLogs')}
                                    </Text>
                                    <Text
                                      fontSize="lg"
                                      fontWeight="bold"
                                      color="red.500"
                                    >
                                      {detail.unmatched.toLocaleString()}
                                    </Text>
                                  </Box>
                                </Grid>

                                <Box>
                                  <Text fontSize="md" fontWeight="bold" mb={3}>
                                    {t('management:integrity.sampleLogs')}
                                  </Text>
                                  <Table variant="simple" size="sm">
                                    <Thead>
                                      <Tr>
                                        <Th>
                                          {t('management:integrity.timestamp')}
                                        </Th>
                                        <Th>
                                          {t('management:integrity.sourceIp')}
                                        </Th>
                                        <Th>
                                          {t(
                                            'management:integrity.destinationIp'
                                          )}
                                        </Th>
                                        <Th>
                                          {t(
                                            'management:integrity.sourceCountry'
                                          )}
                                        </Th>
                                        <Th>
                                          {t(
                                            'management:integrity.destinationCountry'
                                          )}
                                        </Th>
                                        <Th>
                                          {t('management:integrity.status')}
                                        </Th>
                                      </Tr>
                                    </Thead>
                                    <Tbody>
                                      {detail.sampleLogs.map((log) => (
                                        <Tr key={log.id}>
                                          <Td>
                                            {new Date(
                                              log.timestamp
                                            ).toLocaleString()}
                                          </Td>
                                          <Td>{log.sourceIp}</Td>
                                          <Td>{log.destinationIp}</Td>
                                          <Td>{log.sourceCountry}</Td>
                                          <Td>{log.destinationCountry}</Td>
                                          <Td>
                                            <Badge
                                              colorScheme={
                                                log.status === 'matched'
                                                  ? 'green'
                                                  : 'red'
                                              }
                                              fontSize="xs"
                                            >
                                              {log.status}
                                            </Badge>
                                          </Td>
                                        </Tr>
                                      ))}
                                    </Tbody>
                                  </Table>
                                </Box>
                              </Stack>
                            </AccordionPanel>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </Box>
                  </Stack>
                </DataListCell>
              </DataListRow>
            </DataList>
          )}
        </Stack>
      </AdminLayoutPageContent>

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t('management:integrity.infoTitle')}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <Box>
                <Text fontWeight="bold" mb={2}>
                  {t('management:integrity.checkCriteria')}
                </Text>
                <Text>
                  {t('management:integrity.checkCriteriaDescription')}
                </Text>
              </Box>
              <Box>
                <Text fontWeight="bold" mb={2}>
                  {t('management:integrity.statusMeaning')}
                </Text>
                <Stack spacing={2}>
                  <Flex align="center" gap={2}>
                    <Badge colorScheme="green">95% 이상</Badge>
                    <Text>{t('management:integrity.statusGood')}</Text>
                  </Flex>
                  <Flex align="center" gap={2}>
                    <Badge colorScheme="yellow">90-95%</Badge>
                    <Text>{t('management:integrity.statusWarning')}</Text>
                  </Flex>
                  <Flex align="center" gap={2}>
                    <Badge colorScheme="red">90% 미만</Badge>
                    <Text>{t('management:integrity.statusError')}</Text>
                  </Flex>
                </Stack>
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>{t('management:integrity.close')}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayoutPage>
  );
};
