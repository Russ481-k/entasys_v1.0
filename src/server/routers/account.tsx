import { TRPCError } from '@trpc/server';
import bcrypt from 'bcrypt';
import dayjs from 'dayjs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { zUserAccount } from '@/features/account/schemas';
import { VALIDATION_TOKEN_EXPIRATION_IN_MINUTES } from '@/features/auth/utils';
import { validate } from '@/server/config/auth';
import { createTRPCRouter, protectedProcedure } from '@/server/config/trpc';

export const accountRouter = createTRPCRouter({
  get: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
    .meta({
      openapi: {
        method: 'GET',
        path: '/accounts/me',
        protect: true,
        tags: ['accounts'],
      },
    })
    .input(z.void())
    .output(zUserAccount())
    .query(async ({ ctx }) => {
      ctx.logger.info('Getting user');
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          authorizations: true,
          language: true,
        },
      });

      if (!user) {
        ctx.logger.warn('User not found');
        throw new TRPCError({
          code: 'NOT_FOUND',
        });
      }

      return user;
    }),

  update: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
    .meta({
      openapi: {
        method: 'PUT',
        path: '/accounts/me',
        protect: true,
        tags: ['accounts'],
      },
    })
    .input(
      zUserAccount()
        .required()
        .pick({
          id: true,
          email: true,
          name: true,
          language: true,
          authorizations: true,
        })
        .extend({
          password: z.string(),
        })
    )
    .output(zUserAccount())
    .mutation(async ({ ctx, input }) => {
      const { verificationToken } = await validate({
        ctx,
        id: input.id,
        password: input.password,
      });

      if (!verificationToken.userId) {
        ctx.logger.error('verificationToken does not contain an userId');
        throw new TRPCError({
          code: 'UNAUTHORIZED',
        });
      }

      try {
        ctx.logger.info('Updating the user');
        return await ctx.db.user.update({
          where: { id: verificationToken.userId },
          data: {
            email: { set: input.email || undefined },
            name: input.name,
            authorizations: input.authorizations,
          },
        });
      } catch (e) {
        ctx.logger.warn('An error occured while updating the user');
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Failed to authenticate the user',
        });
      }
    }),

  updateId: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
    .meta({
      openapi: {
        method: 'PUT',
        path: '/accounts/update-id/',
        protect: true,
        tags: ['accounts'],
      },
    })
    .input(
      zUserAccount().pick({
        id: true,
        password: true,
        name: true,
        email: true,
        authorizations: true,
        language: true,
      })
    )
    .output(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      ctx.logger.info('Checking existing id');
      if (ctx.user.id === input.id) {
        ctx.logger.warn('Same id for current user and input');
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Same id for current user and input',
        });
      }

      const token = randomUUID();

      ctx.logger.info('Checking if new id is already used');
      const existingId = await ctx.db.user.findUnique({
        where: {
          id: input.id,
        },
      });

      if (existingId) {
        ctx.logger.warn('Id already used, silent error for security reasons');
        return {
          token,
        };
      }

      // If we got here, the user can update the id
      // and we send the id to verify the new id.

      ctx.logger.info('Creating verification token in database');
      await ctx.db.verificationToken.create({
        data: {
          userId: ctx.user.id,
          token,
          expires: dayjs()
            .add(VALIDATION_TOKEN_EXPIRATION_IN_MINUTES, 'minutes')
            .toDate(),
        },
      });

      return {
        token,
      };
    }),

  updatePassword: protectedProcedure({
    authorizations: ['ADMIN', 'SYSTEM_ADMIN'],
  })
    .meta({
      openapi: {
        method: 'PUT',
        path: '/accounts/update-password/',
        protect: true,
        tags: ['accounts'],
      },
    })
    .input(
      zUserAccount()
        .required()
        .pick({
          id: true,
        })
        .extend({
          password: z.string(),
          newPassword: z.string(),
          passwordConfirm: z.string(),
        })
    )
    .output(zUserAccount())
    .mutation(async ({ ctx, input }) => {
      if (input.newPassword !== input.passwordConfirm) {
        ctx.logger.error('Passwords do not match');
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Passwords do not match',
        });
      }
      console.log(input);
      ctx.logger.info(input);
      const { verificationToken } = await validate({
        ctx,
        id: input.id,
        password: input.password,
      });

      if (!verificationToken.userId) {
        ctx.logger.error('verificationToken does not contain an userId');
        throw new TRPCError({
          code: 'UNAUTHORIZED',
        });
      }

      try {
        ctx.logger.info('Updating the user');
        return await ctx.db.user.update({
          where: { id: verificationToken.userId },
          data: {
            password: bcrypt.hashSync(input.newPassword, 8),
          },
        });
      } catch (e) {
        ctx.logger.warn('An error occured while updating the user');
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Failed to authenticate the user',
        });
      }
    }),
});
