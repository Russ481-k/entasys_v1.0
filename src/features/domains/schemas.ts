import { t } from 'i18next';
import { z } from 'zod';

import { zu } from '@/lib/zod/zod-utils';

export const zDomain = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const zDomainCreate = zDomain.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const zDomainUpdate = zDomainCreate.partial();

export type Domain = z.infer<typeof zDomain>;
export type FormFieldDomain = z.infer<typeof zDomainCreate>;

export const zFormFieldsDomain = () =>
  z.object({
    name: zu.string.nonEmpty(z.string(), {
      required_error: t('domains:data.name.required'),
    }),
    description: z.string().nullable(),
    isActive: z.boolean(),
  });
