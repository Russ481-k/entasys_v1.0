import React from 'react';

import {
  Button,
  Flex,
  HStack,
  Heading,
  LinkBox,
  LinkOverlay,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useQueryState } from 'nuqs';
import { Trans, useTranslation } from 'react-i18next';
import { LuPlus } from 'react-icons/lu';

import {
  DataList,
  DataListCell,
  DataListEmptyState,
  DataListErrorState,
  DataListLoadingState,
  DataListRow,
  DataListText,
} from '@/components/DataList';
import { DateAgo } from '@/components/DateAgo';
import { ResponsiveIconButton } from '@/components/ResponsiveIconButton';
import { SearchInput } from '@/components/SearchInput';
import {
  AdminLayoutPage,
  AdminLayoutPageContent,
} from '@/features/admin/AdminLayoutPage';
import { LinkAdmin } from '@/features/admin/LinkAdmin';
import { AdminNav } from '@/features/management/ManagementNav';
import { trpc } from '@/lib/trpc/client';

import { DomainActions } from './DomainActions';
import { DomainStatus } from './DomainStatus';

export default function PageAdminDomains() {
  const { t } = useTranslation(['domains']);
  const [searchTerm, setSearchTerm] = useQueryState('s', { defaultValue: '' });

  const domains = trpc.domains.getDomains.useInfiniteQuery(
    { searchTerm },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  return (
    <AdminLayoutPage containerMaxWidth="container.xl" nav={<AdminNav />}>
      <AdminLayoutPageContent>
        <Stack spacing={4}>
          <HStack spacing={4} alignItems={{ base: 'end', md: 'center' }}>
            <Flex
              direction={{ base: 'column', md: 'row' }}
              rowGap={2}
              columnGap={4}
              alignItems={{ base: 'start', md: 'center' }}
              flex={1}
            >
              <Heading flex="none" size="md">
                {t('domains:list.title')}
              </Heading>
              <SearchInput
                size="sm"
                value={searchTerm}
                onChange={(value) => setSearchTerm(value || null)}
                maxW={{ base: 'none', md: '20rem' }}
              />
            </Flex>
            <ResponsiveIconButton
              as={LinkAdmin}
              href="/management/domains/create"
              variant="@primary"
              size="sm"
              icon={<LuPlus />}
            >
              {t('domains:list.actions.create')}
            </ResponsiveIconButton>
          </HStack>

          <DataList>
            {domains.isLoading && <DataListLoadingState />}
            {domains.isError && (
              <DataListErrorState
                title={t('domains:messages.error')}
                retry={() => domains.refetch()}
              />
            )}
            {domains.isSuccess &&
              !domains.data.pages.flatMap((p) => p.items).length && (
                <DataListEmptyState searchTerm={searchTerm} />
              )}
            {domains.data?.pages
              .flatMap((p) => p.items)
              .map((domain) => (
                <DataListRow as={LinkBox} key={domain.id} withHover>
                  <DataListCell flex={2}>
                    <DataListText fontWeight="bold">
                      <LinkOverlay
                        as={LinkAdmin}
                        href={`/management/domains/${domain.id}`}
                      >
                        {domain.name}
                      </LinkOverlay>
                    </DataListText>
                    <DataListText color="text-dimmed">
                      {domain.description}
                    </DataListText>
                  </DataListCell>
                  <DataListCell
                    pointerEvents="none"
                    display={{ base: 'none', md: 'flex' }}
                  >
                    <DataListText
                      noOfLines={2}
                      pointerEvents="auto"
                      color="text-dimmed"
                    >
                      <Trans
                        i18nKey="domains:data.createdAt.ago"
                        t={t}
                        components={{
                          dateAgo: <DateAgo date={domain.createdAt} />,
                        }}
                      />
                    </DataListText>
                  </DataListCell>
                  <DataListCell w={{ base: 'auto', md: '14ch' }} align="center">
                    <DomainStatus
                      isActive={domain.isActive}
                      showLabelBreakpoint="md"
                    />
                  </DataListCell>
                  <DataListCell w="auto">
                    <DomainActions domain={domain} />
                  </DataListCell>
                </DataListRow>
              ))}
            {domains.isSuccess && (
              <DataListRow mt="auto">
                <DataListCell w="auto">
                  <Button
                    size="sm"
                    onClick={() => domains.fetchNextPage()}
                    isLoading={domains.isFetchingNextPage}
                    isDisabled={!domains.hasNextPage}
                  >
                    {t('domains:list.loadMore.button')}
                  </Button>
                </DataListCell>
                <DataListCell>
                  {domains.isSuccess && !!domains.data.pages[0]?.total && (
                    <Text fontSize="xs" color="text-dimmed">
                      <Trans
                        i18nKey="domains:list.loadMore.display"
                        t={t}
                        values={{
                          loaded: domains.data.pages.flatMap((p) => p.items)
                            .length,
                          total: domains.data.pages[0].total,
                        }}
                      />
                    </Text>
                  )}
                </DataListCell>
              </DataListRow>
            )}
          </DataList>
        </Stack>
      </AdminLayoutPageContent>
    </AdminLayoutPage>
  );
}
