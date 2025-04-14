import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { VALIDATION_PASSWORD_MOCKED } from '@/features/auth/utils';
import { zUser, zUserAuthorization } from '@/features/users/schemas';
import {
  AUTH_COOKIE_NAME,
  deleteUsedCode,
  setAuthCookie,
  validate,
} from '@/server/config/auth';
import { ExtendedTRPCError } from '@/server/config/errors';
import { createTRPCRouter, publicProcedure } from '@/server/config/trpc';

export const authRouter = createTRPCRouter({
  checkAuthenticated: publicProcedure()
    .meta({
      openapi: {
        method: 'GET',
        path: '/auth/check',
        tags: ['auth'],
      },
    })
    .input(z.void())
    .output(
      z.object({
        isAuthenticated: z.boolean(),
        authorizations: z.array(zUserAuthorization()).optional(),
      })
    )
    .query(async ({ ctx }) => {
      ctx.logger.info(`User ${ctx.user ? 'is' : 'is not'} logged`);

      if (ctx.user) {
        const cookieToken = cookies().get(AUTH_COOKIE_NAME)?.value;
        if (cookieToken) {
          setAuthCookie(cookieToken);
        }
      }

      return {
        isAuthenticated: !!ctx.user,
        authorizations: ctx.user?.authorizations,
      };
    }),

  login: publicProcedure()
    .meta({
      openapi: {
        method: 'POST',
        path: '/admin/login',
        tags: ['auth'],
      },
    })
    .input(
      zUser().pick({
        id: true,
        password: true,
        name: true,
        language: true,
      })
    )
    .output(
      z.object({
        verificationToken: z.object({
          userId: z.string(),
          token: z.string(),
          lastAttemptAt: z.date(),
          attempts: z.number(),
        }),
        userJwt: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      ctx.logger.info('Retrieving user info');
      ctx.logger.info('Creating token');
      ctx.logger.info(bcrypt.hashSync(VALIDATION_PASSWORD_MOCKED, 8));

      const { verificationToken, userJwt } = await validate({
        ctx,
        id: input.id,
        password: input.password,
      });

      try {
        await ctx.db.user.update({
          where: { id: verificationToken.userId },
          data: {
            lastLoginAt: new Date(),
          },
        });
      } catch (e) {
        ctx.logger.warn('Failed to update the user, probably not enabled');
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Failed to authenticate the user ',
        });
      }

      await deleteUsedCode({ ctx, token: verificationToken.token });

      ctx.logger.info('Set auth cookie');
      setAuthCookie(userJwt);

      return { verificationToken, userJwt };
    }),

  logout: publicProcedure()
    .meta({
      openapi: {
        method: 'POST',
        path: '/auth/logout',
        tags: ['auth'],
      },
    })
    .input(z.void())
    .output(z.void())
    .mutation(async ({ ctx }) => {
      ctx.logger.info('Delete auth cookie');
      cookies().delete('auth');
    }),

  register: publicProcedure()
    .meta({
      openapi: {
        method: 'POST',
        path: '/auth/register',
        tags: ['auth'],
      },
    })
    .input(
      zUser().required().pick({
        id: true,
        name: true,
        email: true,
        language: true,
      })
    )
    .output(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      ctx.logger.info('Checking if the user exists');
      const user = await ctx.db.user.findUnique({
        where: {
          id: input.id,
        },
      });

      ctx.logger.info('Creating token');
      const token = randomUUID();
      let newUser;
      if (!user) {
        try {
          ctx.logger.info('Creating a new user');
          const hashedPassword = bcrypt.hashSync(VALIDATION_PASSWORD_MOCKED, 8);
          newUser = await ctx.db.user.create({
            data: {
              id: input.id,
              password: hashedPassword,
              name: input.name,
              language: input.language,
              email: input.id,
            },
          });
        } catch (e) {
          ctx.logger.warn('Failed to create user');
          throw new ExtendedTRPCError({
            cause: e,
          });
        }
      }

      if (!newUser) {
        ctx.logger.error(
          'An error occured while creating or updating the user, the address may already exists, silent error for security reasons'
        );
        return {
          token,
        };
      }

      return {
        token,
      };
    }),
});
