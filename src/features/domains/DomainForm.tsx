import React from 'react';

import { Stack } from '@chakra-ui/react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormField } from '@/components/Form';

import type { Domain } from './schemas';

export const DomainForm = () => {
  const { t } = useTranslation(['domains']);
  const form = useFormContext<Domain>();

  return (
    <Stack spacing={4}>
      <FormField
        control={form.control}
        type="text"
        name="name"
        label={t('domains:fields.name')}
      />
      <FormField
        control={form.control}
        type="textarea"
        name="description"
        label={t('domains:fields.description')}
      />
      <FormField
        control={form.control}
        type="select"
        name="isActive"
        label={t('domains:data.status.label')}
        options={[
          { value: true, label: t('domains:data.status.active') },
          { value: false, label: t('domains:data.status.inactive') },
        ]}
      />
    </Stack>
  );
};
