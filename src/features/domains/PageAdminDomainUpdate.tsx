import React from 'react';

import { Button, Flex, Heading, SkeletonText } from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ErrorPage } from '@/components/ErrorPage';
import { Form } from '@/components/Form';
import { LoaderFull } from '@/components/LoaderFull';
import { useToastError, useToastSuccess } from '@/components/Toast';
import { AdminBackButton } from '@/features/admin/AdminBackButton';
import { AdminCancelButton } from '@/features/admin/AdminCancelButton';
import {
  AdminLayoutPage,
  AdminLayoutPageContent,
  AdminLayoutPageTopBar,
} from '@/features/admin/AdminLayoutPage';
import { DomainForm } from '@/features/domains/DomainForm';
import { DomainStatus } from '@/features/domains/DomainStatus';
import { FormFieldDomain, zFormFieldsDomain } from '@/features/domains/schemas';
import { trpc } from '@/lib/trpc/client';

export default function PageAdminDomainUpdate() {
  const { t } = useTranslation(['common', 'domains']);
  const trpcUtils = trpc.useUtils();

  const params = useParams();
  const router = useRouter();
  const domain = trpc.domains.getDomainById.useQuery(
    {
      id: params?.id?.toString() ?? '',
    },
    {
      staleTime: Infinity,
    }
  );

  const toastSuccess = useToastSuccess();
  const toastError = useToastError();

  const domainUpdate = trpc.domains.updateDomain.useMutation({
    onSuccess: async () => {
      await trpcUtils.domains.invalidate();
      toastSuccess({
        title: t('domains:messages.updateSuccess'),
      });
      router.back();
    },
    onError: () => {
      toastError({
        title: t('domains:messages.error'),
      });
    },
  });

  const isReady = !domain.isFetching;

  const form = useForm<FormFieldDomain>({
    resolver: zodResolver(zFormFieldsDomain()),
    values: {
      name: domain.data?.name ?? '',
      description: domain.data?.description ?? '',
      isActive: domain.data?.isActive ?? false,
    },
  });

  return (
    <Form
      {...form}
      onSubmit={(values) => {
        if (!domain.data?.id) return;
        domainUpdate.mutate({
          id: domain.data.id,
          ...values,
        });
      }}
    >
      <AdminLayoutPage w="100%">
        <AdminLayoutPageTopBar
          w="100%"
          leftActions={<AdminBackButton withConfirm={form.formState.isDirty} />}
          rightActions={
            <>
              <AdminCancelButton withConfirm={form.formState.isDirty} />
              <Button
                type="submit"
                variant="@primary"
                isLoading={domainUpdate.isLoading || domainUpdate.isSuccess}
              >
                {t('domains:update.action.save')}
              </Button>
            </>
          }
        >
          {domain.isLoading || domain.isError ? (
            <SkeletonText maxW="6rem" noOfLines={2} />
          ) : (
            <Flex
              flexDirection={{ base: 'column', md: 'row' }}
              alignItems={{ base: 'start', md: 'center' }}
              rowGap={1}
              columnGap={4}
            >
              <Heading size="sm">{domain.data.name}</Heading>
              <DomainStatus isActive={domain.data.isActive} />
            </Flex>
          )}
        </AdminLayoutPageTopBar>
        {!isReady && <LoaderFull />}
        {isReady && domain.isError && <ErrorPage />}
        {isReady && domain.isSuccess && (
          <AdminLayoutPageContent>
            <DomainForm />
          </AdminLayoutPageContent>
        )}
      </AdminLayoutPage>
    </Form>
  );
}
