'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  Flex,
  Heading,
  Stack,
  Text,
  useColorMode,
  useToast,
} from '@chakra-ui/react';
import { CellClickedEvent, ValueFormatterParams } from 'ag-grid-community';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

import {
  AdminLayoutPage,
  AdminLayoutPageContent,
} from '@/features/admin/AdminLayoutPage';
import { useLicense } from '@/hooks/useLicense';
import { trpc } from '@/lib/trpc/client';
import { MenuType } from '@/types/project';

import { GridSection } from './components/GridSection';
import { ProjectsFooter } from './components/ProjectsFooter';
import { SearchHeader } from './components/SearchHeader';
import { FormFieldsPaloLogsParams, zLogs } from './schemas';

// dayjs 플러그인 설정
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Seoul');

export default function PageProjects() {
  const { colorMode } = useColorMode();
  const toast = useToast();
  const license = useLicense();
  const cancelSearchMutation = trpc.projects.cancelSearch.useMutation();

  const now = dayjs().subtract(1, 'minute').format('YYYY-MM-DD HH:mm:ss');
  const beforeMinuteTime = dayjs()
    .subtract(2, 'minute')
    .format('YYYY-MM-DD HH:mm:ss');

  const [menu, setMenu] = useState<MenuType>('TRAFFIC');
  const [pageLengthBuf, setPageLengthBuf] = useState<number>(1);
  const [limit, setLimit] = useState<number>(100);
  const [nextCurrentPage, setNextCurrentPage] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedFromDate, setSelectedFromDate] =
    useState<string>(beforeMinuteTime);
  const [selectedToDate, setSelectedToDate] = useState<string>(now);
  const [progress, setProgress] = useState<{
    progress: number;
    current: number;
    total: number;
    status: 'ready' | 'loading' | 'complete' | 'error' | 'cancelled';
  }>({
    progress: 0,
    current: 0,
    total: 0,
    status: 'loading',
  });
  const [searchId, setSearchId] = useState<string>('');

  const { data, isLoading, isFetching } = trpc.projects.getAll.useInfiniteQuery(
    {
      menu,
      timeFrom: dayjs(selectedFromDate).format('YYYY-MM-DD HH:mm:ss'),
      timeTo: dayjs(selectedToDate).format('YYYY-MM-DD HH:mm:ss'),
      searchTerm,
      currentPage: nextCurrentPage,
      limit,
    },
    {
      enabled: progress.status !== 'cancelled',
      onSuccess: (data) => {
        console.log('[PageProjects] OpenSearch response:', data);
        const metaScrollId = data.pages[0]?.scrollId;
        if (metaScrollId) {
          console.log(
            '[PageProjects] Found scroll ID in metadata:',
            metaScrollId
          );
          setSearchId(metaScrollId);
          return;
        }

        const scrollId = data.pages[0]?.logs[0]?._scroll_id;
        if (scrollId) {
          setSearchId(scrollId);
        } else {
          console.warn('[PageProjects] No scroll ID found in response');
        }
      },
      onSettled: () => {
        setProgress((prev) => ({
          ...prev,
          progress: 100,
          current: 0,
          total: 0,
          status: prev.status === 'cancelled' ? 'cancelled' : 'complete',
        }));
      },
      onError: () => {
        setProgress({
          progress: 0,
          current: 0,
          total: 0,
          status: 'error',
        });
      },
    }
  );

  const pageLength = data?.pages[0]?.pagination.pageLength;
  const totalCnt = data?.pages[0]?.pagination.totalCnt ?? 0;

  const validateTimeFormat = useCallback((timeStr: string) => {
    const date = dayjs(timeStr);
    return (
      date.isValid() && timeStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    );
  }, []);

  const isDataLoading = isLoading || isFetching;

  const onSubmit = useCallback(
    (values: FormFieldsPaloLogsParams) => {
      if (isDataLoading) {
        toast({
          position: 'top-right',
          title: '검색 진행 중',
          description: '이전 검색이 완료될 때까지 기다려주세요.',
          status: 'warning',
          duration: 3000,
          isClosable: true,
        });
        return;
      }

      // 동일한 검색 조건 체크
      const isSameSearch =
        values.timeFrom === selectedFromDate &&
        values.timeTo === selectedToDate &&
        values.searchTerm === searchTerm &&
        values.currentPage === nextCurrentPage;

      if (isSameSearch) {
        toast({
          position: 'top-right',
          title: '동일한 검색 조건',
          description: '이전 검색과 동일한 조건입니다.',
          status: 'info',
          duration: 3000,
          isClosable: true,
        });
        return;
      }

      if (
        !validateTimeFormat(values.timeFrom) ||
        !validateTimeFormat(values.timeTo)
      ) {
        toast({
          position: 'top-right',
          title: '잘못된 시간 형식',
          description: '올바른 시간 형식(YYYY-MM-DD HH:mm:ss)이 아닙니다.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        return;
      }

      const fromDate = dayjs(values.timeFrom);
      const toDate = dayjs(values.timeTo);

      if (fromDate.isAfter(toDate)) {
        toast({
          position: 'top-right',
          title: '시간 범위 오류',
          description: '시작 시간이 종료 시간보다 늦을 수 없습니다.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        return;
      }

      setSelectedFromDate(values.timeFrom);
      setSelectedToDate(values.timeTo);
      setSearchTerm(values.searchTerm);
      setNextCurrentPage(values.currentPage);
    },
    [
      validateTimeFormat,
      toast,
      isDataLoading,
      selectedFromDate,
      selectedToDate,
      searchTerm,
      nextCurrentPage,
    ]
  );

  const onRowLoadLimitChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setLimit(Number(e.target.value));
    },
    []
  );

  const onCurrentPageChange = useCallback(
    (page: number) => {
      if (page > pageLengthBuf) {
        setNextCurrentPage(pageLengthBuf);
      } else {
        setNextCurrentPage(page);
      }
    },
    [pageLengthBuf]
  );

  const handleSetMenuChange = useCallback((newMenu: MenuType) => {
    setMenu(newMenu);
  }, []);

  const onCellClicked = useCallback(
    (event: CellClickedEvent<zLogs>) => {
      if (isDataLoading) return;

      const eventValue = event.value;
      const eventColDef = event.colDef.field;
      if (!eventValue || !eventColDef) return;

      const newTerm = ` AND ${eventColDef} = '${eventValue}'`;
      const currentSearchTerm = searchTerm;

      if (currentSearchTerm.includes(newTerm)) {
        toast({
          position: 'top-right',
          title: '중복된 검색 조건',
          description: '이미 추가된 검색 조건입니다.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      } else {
        toast({
          position: 'top-right',
          title: '검색 조건 추가',
          description: '검색 조건이 추가되었습니다.',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
        setSearchTerm(currentSearchTerm + newTerm);
      }
    },
    [isDataLoading, searchTerm, toast]
  );

  useEffect(() => {
    if (!!pageLength) {
      setPageLengthBuf(pageLength);
      setNextCurrentPage(nextCurrentPage);
    }
  }, [pageLength, nextCurrentPage]);

  useEffect(() => {
    if (isDataLoading) {
      setProgress({
        progress: 0,
        current: 0,
        total: 0,
        status: 'loading',
      });
    }
  }, [isDataLoading]);

  const handleCancelSearch = useCallback(async () => {
    if (!searchId) return;

    setProgress((prev) => ({
      ...prev,
      status: 'cancelled',
    }));

    try {
      await cancelSearchMutation.mutateAsync({ searchId });
      toast({
        title: '검색이 취소되었습니다.',
        status: 'info',
        duration: 3000,
        isClosable: true,
        position: 'top-right',
      });
    } catch (error) {
      console.error('Failed to cancel search:', error);
      setProgress((prev) => ({
        ...prev,
        status: 'error',
      }));
    }
  }, [searchId, cancelSearchMutation, toast]);

  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (searchId && isDataLoading && progress.status === 'loading') {
        await handleCancelSearch();
      }
    };

    const handleVisibilityChange = async () => {
      if (
        document.visibilityState === 'hidden' &&
        searchId &&
        isDataLoading &&
        progress.status === 'loading'
      ) {
        await handleCancelSearch();
      }
    };

    if (isDataLoading && progress.status === 'loading') {
      window.addEventListener('beforeunload', handleBeforeUnload);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        document.removeEventListener(
          'visibilitychange',
          handleVisibilityChange
        );
      };
    }

    return undefined;
  }, [searchId, isDataLoading, progress.status, handleCancelSearch]);
  console.log(searchTerm);

  const timeFormatter = useCallback((params: ValueFormatterParams) => {
    // 디버깅을 위한 로그 (필요시 주석 해제)
    // const colId = params.column?.getColId() || '';
    // console.log(`Formatting time for ${colId}:`, params.value);

    if (!params.value) return '';

    // 이미 포맷된 날짜인지 확인 (YYYY-MM-DD HH:mm:ss 형식)
    if (
      typeof params.value === 'string' &&
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(params.value)
    ) {
      return params.value;
    }

    try {
      // 다양한 날짜 형식 처리
      let dateValue = params.value;

      // 문자열 처리 개선
      if (typeof dateValue === 'string') {
        // 특수 형식 처리 (예: "Mar 12 15:30:45" 같은 syslog 형식)
        const syslogMatch = dateValue.match(
          /([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})/
        );
        if (syslogMatch && syslogMatch.length >= 6) {
          const monthStr = syslogMatch[1] || '';
          const month = [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
          ].indexOf(monthStr);
          const day = parseInt(syslogMatch[2] || '1');
          const hour = parseInt(syslogMatch[3] || '0');
          const minute = parseInt(syslogMatch[4] || '0');
          const second = parseInt(syslogMatch[5] || '0');

          if (month !== -1) {
            const year = new Date().getFullYear();
            dateValue = new Date(
              year,
              month,
              day,
              hour,
              minute,
              second
            ).toISOString();
          }
        }
      }

      // 숫자인 경우 (타임스탬프) 변환
      if (typeof dateValue === 'number') {
        // 밀리초 단위인지 확인 (13자리)
        if (dateValue.toString().length >= 13) {
          dateValue = new Date(dateValue).toISOString();
        } else {
          // 초 단위인 경우 (10자리)
          dateValue = new Date(dateValue * 1000).toISOString();
        }
      }

      // ISO 형식의 날짜 문자열을 파싱
      const date = dayjs(dateValue);

      if (!date.isValid()) {
        // console.warn(`Invalid date in column ${colId}:`, params.value);
        return params.value;
      }

      // 한국 시간대로 변환하고 지정된 형식으로 포맷팅
      return date.tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
    } catch (error) {
      console.error('Time formatting error:', error, params.value);
      return params.value;
    }
  }, []);

  // 라이센스가 만료된 경우 페이지 렌더링을 막습니다
  if (license?.isExpired) {
    return (
      <AdminLayoutPage>
        <AdminLayoutPageContent>
          <Flex
            direction="column"
            align="center"
            justify="center"
            h="100vh"
            gap={4}
          >
            <Heading size="lg">라이센스가 만료되었습니다</Heading>
            <Text>서비스를 계속 사용하시려면 관리자에게 문의하세요.</Text>
          </Flex>
        </AdminLayoutPageContent>
      </AdminLayoutPage>
    );
  }

  return (
    <AdminLayoutPage>
      <AdminLayoutPageContent>
        <Stack spacing={2} h="calc(100vh - 100px)">
          <SearchHeader
            menu={menu}
            onMenuChange={handleSetMenuChange}
            onSearch={onSubmit}
            defaultValues={{
              timeFrom: selectedFromDate,
              timeTo: selectedToDate,
              searchTerm: searchTerm,
            }}
            isLoading={isDataLoading}
            searchId={searchId}
          />
          <GridSection
            data={data?.pages[0]?.logs ?? []}
            isLoading={isDataLoading}
            menu={menu}
            onCellClicked={onCellClicked}
            colorMode={colorMode}
            timeFormatter={timeFormatter}
          />
          <ProjectsFooter
            isLoading={isDataLoading}
            nextCurrentPage={nextCurrentPage}
            pageLength={pageLengthBuf}
            totalCnt={totalCnt}
            onChangeLimit={onRowLoadLimitChange}
            onCurrentPageChange={onCurrentPageChange}
            searchId={searchId}
            searchParams={{
              timeFrom: selectedFromDate,
              timeTo: selectedToDate,
              menu,
              searchTerm,
            }}
            loadingProgress={progress}
          />
        </Stack>
      </AdminLayoutPageContent>
    </AdminLayoutPage>
  );
}
