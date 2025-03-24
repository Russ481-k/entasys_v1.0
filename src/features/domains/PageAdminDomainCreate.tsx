import React from 'react';

import { Button, Heading } from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Form } from '@/components/Form';
import { useToastError, useToastSuccess } from '@/components/Toast';
import { AdminBackButton } from '@/features/admin/AdminBackButton';
import { AdminCancelButton } from '@/features/admin/AdminCancelButton';
import {
  AdminLayoutPage,
  AdminLayoutPageContent,
  AdminLayoutPageTopBar,
} from '@/features/admin/AdminLayoutPage';
import { DomainForm } from '@/features/domains/DomainForm';
import { FormFieldDomain, zFormFieldsDomain } from '@/features/domains/schemas';
import { trpc } from '@/lib/trpc/client';

export default function PageAdminDomainCreate() {
  const { t } = useTranslation(['common', 'domains']);
  const router = useRouter();
  const trpcUtils = trpc.useUtils();

  const toastSuccess = useToastSuccess();
  const toastError = useToastError();

  const createDomain = trpc.domains.createDomain.useMutation({
    onSuccess: async () => {
      await trpcUtils.domains.getDomains.invalidate();
      toastSuccess({
        title: t('domains:messages.createSuccess'),
      });
      router.back();
    },
    onError: () => {
      toastError({
        title: t('domains:messages.error'),
      });
    },
  });

  const form = useForm<FormFieldDomain>({
    resolver: zodResolver(zFormFieldsDomain()),
    defaultValues: {
      name: '',
      description: '',
      isActive: true,
    },
  });

  return (
    <Form
      {...form}
      onSubmit={(values) => {
        createDomain.mutate(values);
      }}
    >
      <AdminLayoutPage w="100%">
        <AdminLayoutPageTopBar
          leftActions={<AdminBackButton withConfirm={form.formState.isDirty} />}
          rightActions={
            <>
              <AdminCancelButton withConfirm={form.formState.isDirty} />
              <Button
                type="submit"
                variant="@primary"
                isLoading={createDomain.isLoading || createDomain.isSuccess}
              >
                {t('domains:create.action.save')}
              </Button>
            </>
          }
        >
          <Heading size="sm">{t('domains:create.title')}</Heading>
        </AdminLayoutPageTopBar>
        <AdminLayoutPageContent>
          <DomainForm />
        </AdminLayoutPageContent>
      </AdminLayoutPage>
    </Form>
  );
}
