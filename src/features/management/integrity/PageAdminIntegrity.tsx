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
  Text,
  Tooltip,
  useColorMode,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';

import { DataList, DataListCell, DataListRow } from '@/components/DataList';
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
  }[];
  domainLogCounts: Array<{
    key: string;
    doc_count: number;
  }>;
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
  const [checkProgress, setCheckProgress] = useState<{
    [key: string]: {
      status: 'pending' | 'checking' | 'completed' | 'error';
      progress: number;
      result?: IntegrityCheckResult;
    };
  }>({});
  const [, setDomainCounts] = useState<Record<string, number>>({});
  const [isCompleted, setIsCompleted] = useState(false);

  const { data: domains } = trpc.domains.getDomains.useQuery({});
  const { data: domainLogCounts } = trpc.integrity.getDomainCounts.useQuery({
    timeRange: '7d',
  });

  useEffect(() => {
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

  const simulateProgress = (domain: string) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 90) {
        clearInterval(interval);
        checkIntegrity.mutate({ domain, timeRange: '7d' });
        return;
      }
      setCheckProgress((prev) => ({
        ...prev,
        [domain]: {
          status: 'checking',
          progress,
          result: prev[domain]?.result,
        },
      }));
    }, 1000);
  };

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

      setTimeout(() => {
        setResult((prev) => {
          if (!prev) return data;
          return {
            totalLogs: prev.totalLogs + data.totalLogs,
            matchedLogs: prev.matchedLogs + data.matchedLogs,
            unmatchedLogs: prev.unmatchedLogs + data.unmatchedLogs,
            details: [...prev.details, ...data.details],
            domainLogCounts: [...prev.domainLogCounts, ...data.domainLogCounts],
          };
        });
        setIsCompleted(true);
        setIsChecking(false);
        toast({
          title: t('management:integrity.checkComplete'),
          description: t('management:integrity.checkCompleteDescription'),
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      }, 1000);
    },
    onError: (error, variables) => {
      setCheckProgress((prev) => ({
        ...prev,
        [variables.domain]: {
          status: 'error',
          progress: 0,
        },
      }));
      setIsChecking(false);
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
    setIsCompleted(false);
    setResult(null);
    setCheckProgress(
      selectedDomains.reduce(
        (acc, domain) => ({
          ...acc,
          [domain]: { status: 'pending', progress: 0 },
        }),
        {}
      )
    );

    selectedDomains.forEach((domain) => {
      setCheckProgress((prev) => ({
        ...prev,
        [domain]: { status: 'checking', progress: 0 },
      }));
      simulateProgress(domain);
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
        <Stack spacing={3}>
          <HStack spacing={3} alignItems={{ base: 'end', md: 'center' }}>
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
              <Text>{t('management:integrity.description')}</Text>
              <Tooltip
                label={t('management:integrity.infoTooltip')}
                hasArrow
                placement="right"
              >
                <Flex
                  h={8}
                  alignItems="center"
                  onClick={onOpen}
                  cursor="pointer"
                >
                  <InfoIcon aria-label="Info" color="text-dimmed" />
                </Flex>
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
                        isDisabled={isChecking || isCompleted}
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
                      isDisabled={isChecking || isCompleted}
                    >
                      {domains?.items
                        .filter(
                          (domain) => !selectedDomains.includes(domain.name)
                        )
                        .map((domain: Domain) => {
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
                                </Box>
                                <IconButton
                                  aria-label="Remove domain"
                                  icon={<CloseIcon />}
                                  size="sm"
                                  variant="ghost"
                                  colorScheme="blue"
                                  ml={2}
                                  onClick={() =>
                                    setSelectedDomains(
                                      selectedDomains.filter(
                                        (d) => d !== domain
                                      )
                                    )
                                  }
                                  isDisabled={isChecking || isCompleted}
                                />
                              </Flex>
                              {checkProgress[domain] && (
                                <Box mt={2}>
                                  <Flex justify="space-between" mb={1}>
                                    <Text fontSize="sm" color="text-dimmed">
                                      {checkProgress[domain]?.status ===
                                        'pending' &&
                                        t('management:integrity.settings')}
                                      {checkProgress[domain]?.status ===
                                        'checking' &&
                                        t('management:integrity.checking')}
                                      {checkProgress[domain]?.status ===
                                        'completed' &&
                                        t('management:integrity.checkComplete')}
                                      {checkProgress[domain]?.status ===
                                        'error' &&
                                        t('management:integrity.error')}
                                    </Text>
                                    {checkProgress[domain]?.status ===
                                      'completed' &&
                                      checkProgress[domain]?.result
                                        ?.details[0] && (
                                        <Badge
                                          colorScheme={
                                            (checkProgress[domain]?.result
                                              ?.details?.[0]?.percentage ??
                                              0) >= 95
                                              ? 'green'
                                              : (checkProgress[domain]?.result
                                                    ?.details?.[0]
                                                    ?.percentage ?? 0) >= 90
                                                ? 'yellow'
                                                : 'red'
                                          }
                                        >
                                          {(
                                            checkProgress[domain]?.result
                                              ?.details?.[0]?.percentage ?? 0
                                          ).toFixed(2)}
                                          %
                                        </Badge>
                                      )}
                                  </Flex>
                                  <Progress
                                    value={checkProgress[domain]?.progress ?? 0}
                                    colorScheme={
                                      checkProgress[domain]?.status ===
                                      'completed'
                                        ? 'green'
                                        : checkProgress[domain]?.status ===
                                            'error'
                                          ? 'red'
                                          : 'blue'
                                    }
                                    size="sm"
                                    borderRadius="full"
                                    transition="all 1s ease-in-out"
                                    isAnimated={
                                      checkProgress[domain]?.status ===
                                      'checking'
                                    }
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
                    <Button
                      colorScheme="blue"
                      onClick={handleCheck}
                      isLoading={isChecking}
                      loadingText={t('management:integrity.checking')}
                      isDisabled={isCompleted || selectedDomains.length === 0}
                    >
                      {isCompleted
                        ? t('management:integrity.checkComplete')
                        : t('management:integrity.startCheck')}
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
