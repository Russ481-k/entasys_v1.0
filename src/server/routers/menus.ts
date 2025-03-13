// import { Prisma } from '@prisma/client';
// import { TRPCError } from '@trpc/server';
// import { z } from 'zod';

// import { zMenu } from '@/features/menus/schemas';
// import { ExtendedTRPCError } from '@/server/config/errors';
// import { createTRPCRouter, protectedProcedure } from '@/server/config/trpc';

// export const menusRouter = createTRPCRouter({
//   getById: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
//     .meta({
//       openapi: {
//         method: 'GET',
//         path: '/menus/{name}',
//         protect: true,
//         tags: ['menus'],
//       },
//     })
//     .input(
//       zMenu().pick({
//         name: true,
//       })
//     )
//     .output(zMenu())
//     .query(async ({ ctx, input }) => {
//       ctx.logger.info('Getting menu');
//       const menu = await ctx.db.menu.findUnique({
//         where: {
//           name: input.name ?? '',
//         },
//       });

//       if (!menu) {
//         ctx.logger.warn('Unable to find menu with the provided input');
//         throw new TRPCError({
//           code: 'NOT_FOUND',
//         });
//       }

//       return menu;
//     }),

//   getAll: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
//     .meta({
//       openapi: {
//         method: 'GET',
//         path: '/menus',
//         protect: true,
//         tags: ['menus'],
//       },
//     })
//     .input(
//       z
//         .object({
//           cursor: z.string().cuid().optional(),
//           limit: z.number().min(1).max(100).default(20),
//           searchTerm: z.string().optional(),
//         })
//         .default({})
//     )
//     .output(
//       z.object({
//         items: z.array(zMenu()),
//         nextCursor: z.string().cuid().optional(),
//         total: z.number(),
//       })
//     )
//     .query(async ({ ctx, input }) => {
//       ctx.logger.info('Getting menus from database');

//       const where = {
//         OR: [
//           {
//             name: {
//               contains: input.searchTerm,
//               mode: 'insensitive',
//             },
//           },
//           {
//             description: {
//               contains: input.searchTerm,
//               mode: 'insensitive',
//             },
//           },
//         ],
//       } satisfies Prisma.MenuWhereInput;

//       const [total, items] = await ctx.db.$transaction([
//         ctx.db.menu.count({
//           where,
//         }),
//         ctx.db.menu.findMany({
//           // Get an extra item at the end which we'll use as next cursor
//           take: input.limit + 1,
//           cursor: input.cursor ? { name: input.cursor } : undefined,
//           orderBy: {
//             name: 'desc',
//           },
//           where,
//         }),
//       ]);

//       let nextCursor: typeof input.cursor | undefined = undefined;
//       if (items.length > input.limit) {
//         const nextItem = items.pop();
//         nextCursor = nextItem?.name;
//       }

//       return {
//         items,
//         nextCursor,
//         total,
//       };
//     }),

//   create: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
//     .meta({
//       openapi: {
//         method: 'POST',
//         path: '/menus',
//         protect: true,
//         tags: ['menus'],
//       },
//     })
//     .input(
//       zMenu().required().pick({
//         description: true,
//         name: true,
//       })
//     )
//     .output(zMenu())
//     .mutation(async ({ ctx, input }) => {
//       ctx.logger.info('Creating menu');
//       try {
//         return await ctx.db.menu.create({
//           data: input,
//         });
//       } catch (e) {
//         throw new ExtendedTRPCError({
//           cause: e,
//         });
//       }
//     }),

//   deactivate: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
//     .meta({
//       openapi: {
//         method: 'POST',
//         path: '/menus/{name}/deactivate',
//         protect: true,
//         tags: ['menus'],
//       },
//     })
//     .input(
//       zMenu().pick({
//         name: true,
//       })
//     )
//     .output(zMenu())
//     .mutation(async ({ ctx, input }) => {
//       if (ctx.user.id === String(input.name)) {
//         ctx.logger.warn('Logged menu cannot deactivate itself');
//         throw new TRPCError({
//           code: 'FORBIDDEN',
//           message: 'You cannot deactivate yourself',
//         });
//       }

//       ctx.logger.info('Deactivating menu');
//       return await ctx.db.menu.update({
//         where: { name: input.name },
//         data: {
//           description: 'DISABLED',
//         },
//       });
//     }),

//   activate: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
//     .meta({
//       openapi: {
//         method: 'POST',
//         path: '/menus/{name}/activate',
//         protect: true,
//         tags: ['menus'],
//       },
//     })
//     .input(
//       zMenu().pick({
//         name: true,
//       })
//     )
//     .output(zMenu())
//     .mutation(async ({ ctx, input }) => {
//       if (ctx.user.id === String(input.name)) {
//         ctx.logger.warn('Logged menu cannot activate itself');
//         throw new TRPCError({
//           code: 'FORBIDDEN',
//           message: 'You cannot activate yourself',
//         });
//       }

//       ctx.logger.info('Activating menu');
//       return await ctx.db.menu.update({
//         where: { name: input.name },
//         data: {
//           description: 'ENABLED',
//         },
//       });
//     }),

//   updateById: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
//     .meta({
//       openapi: {
//         method: 'PUT',
//         path: '/menus/{name}',
//         protect: true,
//         tags: ['menus'],
//       },
//     })
//     .input(
//       zMenu().required().pick({
//         name: true,
//         description: true,
//       })
//     )
//     .output(zMenu())
//     .mutation(async ({ ctx, input }) => {
//       ctx.logger.info({ input }, 'Updating menu');
//       try {
//         return await ctx.db.menu.update({
//           where: { name: input.name },
//           data: input,
//         });
//       } catch (e) {
//         throw new ExtendedTRPCError({
//           cause: e,
//         });
//       }
//     }),

//   removeById: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
//     .meta({
//       openapi: {
//         method: 'DELETE',
//         path: '/menus/{name}',
//         protect: true,
//         tags: ['menus'],
//       },
//     })
//     .input(
//       zMenu().required().pick({
//         name: true,
//       })
//     )
//     .output(zMenu())
//     .mutation(async ({ ctx, input }) => {
//       if (ctx.user.id === String(input.name)) {
//         ctx.logger.warn('Logged menu cannot delete itself');
//         throw new TRPCError({
//           code: 'FORBIDDEN',
//           message: 'You cannot remove yourself',
//         });
//       }

//       ctx.logger.info({ input }, 'Removing menu');
//       return await ctx.db.menu.delete({
//         where: { name: input.name },
//       });
//     }),
// });
