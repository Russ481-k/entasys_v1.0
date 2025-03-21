import { t } from 'i18next';
import { z } from 'zod';

import { DEFAULT_LANGUAGE_KEY } from '@/lib/i18n/constants';
import { zu } from '@/lib/zod/zod-utils';

export const USER_AUTHORIZATIONS = ['ADMIN', 'SYSTEM_ADMIN'] as const;
export type UserAuthorization = z.infer<ReturnType<typeof zUserAuthorization>>;
export const zUserAuthorization = () => z.enum(USER_AUTHORIZATIONS);

export type UserAccountStatus = z.infer<ReturnType<typeof zUserAccountStatus>>;
export const zUserAccountStatus = () =>
  z.enum(['DISABLED', 'ENABLED', 'NOT_VERIFIED']).catch('DISABLED');

export type User = z.infer<ReturnType<typeof zUser>>;
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
    accountStatus: zUserAccountStatus(),
    image: z.string().nullable(),
    authorizations: z.array(zUserAuthorization()),
    language: zu.string
      .nonEmpty(z.string().min(2))
      .default(DEFAULT_LANGUAGE_KEY),
    lastLoginAt: z.date().nullable(),
    // Audit fields
    createdBy: z.string().nullable(),
    createdIp: z.string().nullable(),
    updatedBy: z.string().nullable(),
    updatedIp: z.string().nullable(),
  });

export type FormFieldUser = z.infer<ReturnType<typeof zFormFieldsUser>>;
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

export const zUserCreate = () =>
  z.object({
    name: z.string().nullable(),
    email: z.string(),
    language: z.string(),
    authorizations: z.array(zUserAuthorization()),
  });
