import React, { useState } from 'react';

import {
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Grid,
  Heading,
  Select,
  Stack,
  Text,
  useColorMode,
  useToast,
} from '@chakra-ui/react';

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
}

interface Domain {
  id: string;
  name: string;
}

export const IntegrityCheck: React.FC = () => {
  const { colorMode } = useColorMode();
  const toast = useToast();
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<IntegrityCheckResult | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');

  const { data: domains } = trpc.domains.getDomains.useQuery({});

  const checkIntegrity = trpc.integrity.checkIntegrity.useMutation({
    onSuccess: (data: IntegrityCheckResult) => {
      setResult(data);
      setIsChecking(false);
      toast({
        title: '무결성 검증 완료',
        description: '로그 데이터의 무결성이 검증되었습니다.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    },
    onError: (error) => {
      setIsChecking(false);
      toast({
        title: '오류 발생',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    },
  });

  const handleCheck = () => {
    if (!selectedDomain) {
      toast({
        title: '도메인 선택 필요',
        description: '검증할 도메인을 선택해주세요.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsChecking(true);
    checkIntegrity.mutate({ domain: selectedDomain, timeRange });
  };

  return (
    <Box p={6}>
      <Stack spacing={6}>
        <Heading size="lg">무결성 검증</Heading>

        <Card
          bg={colorMode === 'light' ? 'white' : '#182232'}
          borderWidth="1px"
          borderColor={colorMode === 'light' ? 'gray.200' : 'whiteAlpha.300'}
        >
          <CardHeader>
            <Flex justify="space-between" align="center">
              <Text fontSize="lg" fontWeight="bold">
                검증 설정
              </Text>
              <Button
                colorScheme="blue"
                onClick={handleCheck}
                isLoading={isChecking}
                loadingText="검증 중..."
              >
                검증 시작
              </Button>
            </Flex>
          </CardHeader>
          <CardBody>
            <Stack spacing={4}>
              <Box>
                <Text mb={2}>도메인 선택</Text>
                <Select
                  placeholder="도메인을 선택하세요"
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  bg={colorMode === 'light' ? 'white' : '#182232'}
                  borderColor={
                    colorMode === 'light' ? 'gray.200' : 'whiteAlpha.300'
                  }
                >
                  {domains?.items.map((domain: Domain) => (
                    <option key={domain.id} value={domain.name}>
                      {domain.name}
                    </option>
                  ))}
                </Select>
              </Box>
            </Stack>
          </CardBody>
        </Card>

        {result && (
          <Card
            bg={colorMode === 'light' ? 'white' : '#182232'}
            borderWidth="1px"
            borderColor={colorMode === 'light' ? 'gray.200' : 'whiteAlpha.300'}
          >
            <CardHeader>
              <Text fontSize="lg" fontWeight="bold">
                검증 결과
              </Text>
            </CardHeader>
            <CardBody>
              <Grid templateColumns="repeat(3, 1fr)" gap={6}>
                <Box
                  p={4}
                  borderRadius="lg"
                  bg={colorMode === 'light' ? 'gray.50' : 'whiteAlpha.100'}
                >
                  <Text fontSize="sm" color="gray.500">
                    전체 로그
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold">
                    {result.totalLogs.toLocaleString()}
                  </Text>
                </Box>
                <Box
                  p={4}
                  borderRadius="lg"
                  bg={colorMode === 'light' ? 'green.50' : 'green.900'}
                >
                  <Text fontSize="sm" color="gray.500">
                    일치 로그
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold" color="green.500">
                    {result.matchedLogs.toLocaleString()}
                  </Text>
                </Box>
                <Box
                  p={4}
                  borderRadius="lg"
                  bg={colorMode === 'light' ? 'red.50' : 'red.900'}
                >
                  <Text fontSize="sm" color="gray.500">
                    불일치 로그
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold" color="red.500">
                    {result.unmatchedLogs.toLocaleString()}
                  </Text>
                </Box>
              </Grid>

              <Box mt={6}>
                <Text fontSize="lg" fontWeight="bold" mb={4}>
                  상세 결과
                </Text>
                <Stack spacing={4}>
                  {result.details.map((detail) => (
                    <Box
                      key={detail.domain}
                      p={4}
                      borderRadius="lg"
                      bg={colorMode === 'light' ? 'gray.50' : 'whiteAlpha.100'}
                    >
                      <Flex justify="space-between" align="center">
                        <Box>
                          <Text fontWeight="bold">{detail.domain}</Text>
                          <Text fontSize="sm" color="gray.500">
                            전체: {detail.total.toLocaleString()} | 일치:{' '}
                            {detail.matched.toLocaleString()} | 불일치:{' '}
                            {detail.unmatched.toLocaleString()}
                          </Text>
                        </Box>
                        <Box>
                          <Text
                            fontSize="lg"
                            fontWeight="bold"
                            color={
                              detail.percentage >= 95
                                ? 'green.500'
                                : detail.percentage >= 90
                                  ? 'yellow.500'
                                  : 'red.500'
                            }
                          >
                            {detail.percentage.toFixed(2)}%
                          </Text>
                        </Box>
                      </Flex>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </CardBody>
          </Card>
        )}
      </Stack>
    </Box>
  );
};
