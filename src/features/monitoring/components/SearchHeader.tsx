import { memo, useEffect } from 'react';

import { Button, Flex, Heading } from '@chakra-ui/react';
import { useToast } from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { Form, FormField } from '@/components/Form';
import { trpc } from '@/lib/trpc/client';
import { MenuType } from '@/types/project';

import MenuSetter from '../MenuSetter';
import { FormFieldsPaloLogsParams, zPaloLogsParams } from '../schemas';

interface SearchHeaderProps {
  menu: MenuType;
  onMenuChange: (menu: MenuType) => void;
  onSearch: (values: FormFieldsPaloLogsParams) => void;
  defaultValues: {
    timeFrom: string;
    timeTo: string;
    searchTerm: string;
  };
  isLoading: boolean;
  searchId?: string;
}

export const SearchHeader = memo(
  ({
    menu,
    onMenuChange,
    onSearch,
    defaultValues,
    isLoading,
    searchId,
  }: SearchHeaderProps) => {
    const form = useForm<FormFieldsPaloLogsParams>({
      mode: 'onSubmit',
      resolver: zodResolver(zPaloLogsParams()),
      defaultValues: {
        timeFrom: defaultValues.timeFrom,
        timeTo: defaultValues.timeTo,
        currentPage: 1,
        searchTerm: defaultValues.searchTerm,
      },
    });

    const toast = useToast();

    const cancelSearchMutation = trpc.projects.cancelSearch.useMutation({
      onSuccess: () => {
        toast({
          title: '검색이 취소되었습니다.',
          status: 'info',
          duration: 3000,
          isClosable: true,
          position: 'top-right',
        });
      },
      onError: (error) => {
        toast({
          title: '검색 취소 중 오류가 발생했습니다.',
          description: error.message,
          status: 'error',
          duration: 5000,
          isClosable: true,
          position: 'top-right',
        });
      },
    });

    const handleCancelSearch = async () => {
      if (!searchId) return;
      try {
        await cancelSearchMutation.mutateAsync({ searchId });
      } catch (error) {
        console.error('Failed to cancel search:', error);
      }
    };

    useEffect(() => {
      form.reset({
        timeFrom: defaultValues.timeFrom,
        timeTo: defaultValues.timeTo,
        currentPage: 1,
        searchTerm: defaultValues.searchTerm,
      });
    }, [defaultValues, form]);

    useEffect(() => {
      if (isLoading) {
        form.reset(form.getValues(), {
          keepValues: true,
        });
      }
    }, [isLoading, form]);

    return (
      <Form {...form} onSubmit={onSearch}>
        <Flex
          justifyContent="space-between"
          h="24px"
          gap={3}
          alignItems="center"
        >
          <Flex
            flexDirection={{ base: 'column', md: 'row' }}
            alignItems={{ base: 'start', md: 'center' }}
            gap={3}
          >
            <MenuSetter
              menu={menu}
              handleSetMenuChange={onMenuChange}
              disabled={isLoading}
            />
            <Flex gap={1}>
              <FormField
                control={form.control}
                name="timeFrom"
                size="xs"
                type="text"
                width="140px"
                isDisabled={isLoading}
              />
              <Heading color="gray.500" flex="none" size="xs" py="3px">
                ~
              </Heading>
              <FormField
                control={form.control}
                name="timeTo"
                size="xs"
                type="text"
                width="140px"
                isDisabled={isLoading}
              />
            </Flex>
          </Flex>
          <Flex w="100%">
            <FormField
              type="search-input"
              size="xs"
              borderRightRadius={0}
              control={form.control}
              name="searchTerm"
              isDisabled={isLoading}
            />
            {isLoading && searchId ? (
              <Button
                w="4.5rem"
                size="xs"
                borderLeftRadius={0}
                colorScheme="red"
                onClick={handleCancelSearch}
                isLoading={cancelSearchMutation.isLoading}
              >
                Cancel
              </Button>
            ) : (
              <Button
                type="submit"
                w="4.5rem"
                size="xs"
                borderLeftRadius={0}
                isDisabled={isLoading}
                isLoading={isLoading}
                aria-label="Search"
              >
                Search
              </Button>
            )}
          </Flex>
        </Flex>
      </Form>
    );
  }
);

SearchHeader.displayName = 'SearchHeader';
