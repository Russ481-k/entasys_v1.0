import { t } from 'i18next';
import { z } from 'zod';

import { DEFAULT_LANGUAGE_KEY } from '@/lib/i18n/constants';
import { zu } from '@/lib/zod/zod-utils';

export const USER_AUTHORIZATIONS = ['ADMIN', 'SYSTEM_ADMIN'];
export const zUserAuthorization = () => z.enum(USER_AUTHORIZATIONS);
export const zUserAccountStatus = () =>
  z.enum(['DISABLED', 'ENABLED', 'NOT_VERIFIED']).catch('DISABLED');
export const zUser = () =>
  z.object({
    id: zu.string.nonEmpty(
      z.string({
        required_error: t('users:data.id.required'),
      })
    ),
    password: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    name: zu.string
      .nonEmpty(
        z.string({
          required_error: t('users:data.name.required'),
          invalid_type_error: t('users:data.name.invalid'),
        })
      )
      .nullish(),
    email: zu.string
      .email(z.string(), {
        invalid_type_error: t('users:data.email.invalid'),
      })
      .nullish(),
    authorizations: zu.array
      .nonEmpty(
        z.array(zUserAuthorization(), {
          required_error: t('users:data.authorizations.required'),
        })
      )
      .default(['ADMIN', 'SYSTEM_ADMIN']),
    accountStatus: zUserAccountStatus(),
    language: zu.string
      .nonEmpty(z.string().min(2))
      .default(DEFAULT_LANGUAGE_KEY),
  });
export const zFormFieldsUser = () =>
  zUser()
    .pick({
      id: true,
      name: true,
      language: true,
      email: true,
      authorizations: true,
    })
    .required();
