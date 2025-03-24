import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { ExtendedTRPCError } from '@/server/config/errors';
import { createTRPCRouter, protectedProcedure } from '@/server/config/trpc';
import { OpenSearchClient } from '@/server/lib/opensearch';

var __rest =
  (this && this.__rest) ||
  function (s, e) {
    var t = {};
    for (var p in s)
      if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === 'function')
      for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
        if (
          e.indexOf(p[i]) < 0 &&
          Object.prototype.propertyIsEnumerable.call(s, p[i])
        )
          t[p[i]] = s[p[i]];
      }
    return t;
  };

const zDomain = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
const zDomainCreate = zDomain.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
const zDomainUpdate = zDomainCreate.partial();
export const domainsRouter = createTRPCRouter({
  getDomainById: protectedProcedure({
    authorizations: ['ADMIN', 'SYSTEM_ADMIN'],
  })
    .meta({
      openapi: {
        method: 'GET',
        path: '/domains/{id}',
        protect: true,
        tags: ['domains'],
      },
    })
    .input(
      z.object({
        id: z.string(),
      })
    )
    .output(zDomain)
    .query(async ({ ctx, input }) => {
      ctx.logger.info('Getting domain');
      const domain = await ctx.db.domain.findUnique({
        where: { id: input.id },
      });
      if (!domain) {
        ctx.logger.warn('Unable to find domain with the provided input');
        throw new TRPCError({
          code: 'NOT_FOUND',
        });
      }
      return domain;
    }),
  getDomains: protectedProcedure({ authorizations: ['ADMIN', 'SYSTEM_ADMIN'] })
    .meta({
      openapi: {
        method: 'GET',
        path: '/domains',
        protect: true,
        tags: ['domains'],
      },
    })
    .input(
      z.object({
        searchTerm: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(10),
      })
    )
    .output(
      z.object({
        items: z.array(zDomain),
        nextCursor: z.string().nullish(),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where = input.searchTerm
        ? {
            OR: [
              {
                name: {
                  contains: input.searchTerm,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                description: {
                  contains: input.searchTerm,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {};
      const [total, items] = await Promise.all([
        ctx.db.domain.count({ where }),
        ctx.db.domain.findMany({
          where,
          take: input.limit + 1,
          cursor: input.cursor ? { id: input.cursor } : undefined,
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      let nextCursor = undefined;
      if (items.length > input.limit) {
        const nextItem = items.pop();
        nextCursor =
          nextItem === null || nextItem === void 0 ? void 0 : nextItem.id;
      }
      return {
        items,
        nextCursor,
        total,
      };
    }),
  createDomain: protectedProcedure({
    authorizations: ['ADMIN', 'SYSTEM_ADMIN'],
  })
    .meta({
      openapi: {
        method: 'POST',
        path: '/domains',
        protect: true,
        tags: ['domains'],
      },
    })
    .input(zDomainCreate)
    .output(zDomain)
    .mutation(async ({ ctx, input }) => {
      try {
        // Check if domain name already exists
        const existingDomain = await ctx.db.domain.findUnique({
          where: { name: input.name },
        });
        if (existingDomain) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Domain name "${input.name}" already exists`,
          });
        }
        // 트랜잭션으로 도메인 생성 및 OpenSearch 설정
        return await ctx.db.$transaction(async (tx) => {
          // Create domain in database
          const newDomain = await tx.domain.create({
            data: input,
          });
          // Create OpenSearch index template and ILM policy
          const opensearch = OpenSearchClient.getInstance();
          await opensearch.createILMPolicy();
          await opensearch.updateIndexTemplate(newDomain.name);
          return newDomain;
        });
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Domain name "${input.name}" already exists`,
          });
        }
        throw new ExtendedTRPCError({
          code: 'BAD_REQUEST',
          cause: error,
        });
      }
    }),
  updateDomain: protectedProcedure({
    authorizations: ['ADMIN', 'SYSTEM_ADMIN'],
  })
    .meta({
      openapi: {
        method: 'PATCH',
        path: '/domains/{id}',
        protect: true,
        tags: ['domains'],
      },
    })
    .input(z.object(Object.assign({ id: z.string() }, zDomainUpdate.shape)))
    .output(zDomain)
    .mutation(async ({ ctx, input }) => {
      const { id } = input,
        data = __rest(input, ['id']);
      try {
        // 트랜잭션으로 도메인 수정 및 OpenSearch 설정
        return await ctx.db.$transaction(async (tx) => {
          // Get old domain name
          const oldDomain = await tx.domain.findUnique({
            where: { id },
          });
          if (!oldDomain) {
            throw new TRPCError({
              code: 'NOT_FOUND',
            });
          }
          // Update domain in database
          const updated = await tx.domain.update({
            where: { id },
            data,
          });
          // If domain name changed, update OpenSearch template
          if (data.name && oldDomain.name !== data.name) {
            const opensearch = OpenSearchClient.getInstance();
            await opensearch.deleteIndexTemplate(oldDomain.name);
            await opensearch.updateIndexTemplate(data.name);
          }
          return updated;
        });
      } catch (error) {
        throw new ExtendedTRPCError({
          code: 'BAD_REQUEST',
          cause: error,
        });
      }
    }),
  deleteDomain: protectedProcedure({
    authorizations: ['ADMIN', 'SYSTEM_ADMIN'],
  })
    .meta({
      openapi: {
        method: 'DELETE',
        path: '/domains/{id}',
        protect: true,
        tags: ['domains'],
      },
    })
    .input(z.object({ id: z.string() }))
    .output(zDomain)
    .mutation(async ({ ctx, input }) => {
      try {
        // 트랜잭션으로 도메인 삭제 및 OpenSearch 설정
        return await ctx.db.$transaction(async (tx) => {
          // Get domain name before deletion
          const domain = await tx.domain.findUnique({
            where: { id: input.id },
          });
          if (!domain) {
            throw new TRPCError({
              code: 'NOT_FOUND',
            });
          }
          // Delete domain from database
          const deleted = await tx.domain.delete({
            where: { id: input.id },
          });
          // Delete OpenSearch template and indices
          const opensearch = OpenSearchClient.getInstance();
          await opensearch.deleteIndexTemplate(domain.name);
          // Delete all indices related to this domain
          const pattern = `*_${domain.name.toLowerCase()}_*`;
          const indices = await opensearch.getIndices(pattern);
          if (indices.length > 0) {
            await opensearch.deleteIndices(pattern);
          }
          return deleted;
        });
      } catch (error) {
        throw new ExtendedTRPCError({
          code: 'BAD_REQUEST',
          cause: error,
        });
      }
    }),
});
