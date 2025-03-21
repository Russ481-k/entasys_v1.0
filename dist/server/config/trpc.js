/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */
import { Prisma } from '@prisma/client';
import { TRPCError, initTRPC } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import { randomUUID } from 'node:crypto';
import superjson from 'superjson';
import { ZodError } from 'zod';

import { env } from '@/env.mjs';
import { getServerAuthSession } from '@/server/config/auth';
import { db } from '@/server/config/db';
import { logger } from '@/server/config/logger';

/**
 * This is the actual context you will use in your router. It will be used to process every request
 * that goes through your tRPC endpoint.
 *
 * @see https://trpc.io/docs/context
 */
export const createTRPCContext = async (opts) => {
  const { req } = opts;
  const session = await getServerAuthSession();
  const apiType = new URL(req.url).pathname.startsWith('/api/rest')
    ? 'REST'
    : 'TRPC';
  // Request에서 IP와 User Agent 정보 추출
  const forwardedFor =
    req.headers instanceof Headers
      ? req.headers.get('x-forwarded-for')
      : Array.isArray(req.headers['x-forwarded-for'])
        ? req.headers['x-forwarded-for'][0]
        : req.headers['x-forwarded-for'];
  // IPv6 접두사 제거 및 IP 주소 정제
  const cleanIp =
    (forwardedFor === null || forwardedFor === void 0
      ? void 0
      : forwardedFor.toString().replace(/^::ffff:/, '')) || '';
  const userAgent =
    req.headers instanceof Headers
      ? req.headers.get('user-agent')
      : req.headers['user-agent'];
  return {
    user: session,
    clientIp: cleanIp,
    userAgent:
      (userAgent === null || userAgent === void 0
        ? void 0
        : userAgent.toString()) || '',
    apiType,
    logger,
    db,
  };
};
/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC
  .meta()
  .context()
  .create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
      return Object.assign(Object.assign({}, shape), {
        data: Object.assign(Object.assign({}, shape.data), {
          zodError:
            error.cause instanceof ZodError ? error.cause.flatten() : null,
          prismaError:
            error.cause instanceof Prisma.PrismaClientKnownRequestError
              ? error.cause.meta
              : null,
        }),
      });
    },
  });
/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */
/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;
const loggerMiddleware = t.middleware(async (opts) => {
  var _a;
  const start = Date.now();
  // Those are the default informations we want to print for all the requests
  const meta = {
    path: opts.path,
    type: opts.type,
    requestId: randomUUID(),
    userId: (_a = opts.ctx.user) === null || _a === void 0 ? void 0 : _a.id,
    apiType: opts.ctx.apiType,
  };
  logger.debug(
    Object.assign(Object.assign({}, meta), { input: opts.rawInput }),
    `${opts.rawInput ? '📨 With' : '📥 No'} input`
  );
  // We are doing the next operation in tRPC
  const result = await opts.next({
    ctx: {
      logger: logger.child(
        Object.assign(Object.assign({}, meta), { scope: 'procedure' })
      ),
    },
  });
  // This should be after the operation so we can really compute the duration
  const durationMs = Date.now() - start;
  const extendedMeta = Object.assign(Object.assign({}, meta), { durationMs });
  if (result.ok) {
    logger.info(extendedMeta, '✅ OK');
  } else {
    const logLevel = () => {
      const errorCode = getHTTPStatusCodeFromError(result.error);
      if (errorCode >= 500) return 'error';
      if (errorCode >= 400) return 'warn';
      if (errorCode >= 300) return 'info';
      return 'error';
    };
    logger[logLevel()](
      Object.assign(Object.assign({}, extendedMeta), {
        errorCode: result.error.code,
        errorMessage: result.error.message,
      }),
      `❌ KO`
    );
  }
  // Finally, return the result so tRPC can continue
  return result;
});
/** Demo Middleware */
const enforceDemo = t.middleware(({ ctx, next, type, path }) => {
  if (!env.NEXT_PUBLIC_IS_DEMO) {
    return next({
      ctx,
    });
  }
  if (
    type !== 'mutation' ||
    path === 'auth.login' ||
    path === 'auth.loginValidate' ||
    path === 'auth.logout'
  ) {
    return next({
      ctx,
    });
  }
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: '[DEMO] You cannot run mutation in Demo mode',
  });
});
/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = () =>
  t.procedure.use(enforceDemo).use(loggerMiddleware);
/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = (options = {}) =>
  publicProcedure().use(
    t.middleware(({ ctx, next }) => {
      const user = ctx.user;
      if (!user || user.accountStatus !== 'ENABLED') {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: user === null || user === void 0 ? void 0 : user.id,
        });
      }
      // Check if the user has at least one of the authorizations
      if (
        options.authorizations &&
        !options.authorizations.some((a) => user.authorizations.includes(a))
      ) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return next({
        ctx: {
          // infers the `user` as non-nullable
          user,
        },
      });
    })
  );
export const createSubscription = t.procedure.subscription;
// subscription 프로시저 추가
export const subscriptionProcedure = t.procedure.use(
  t.middleware(({ ctx, next }) => {
    const user = ctx.user;
    if (!user || user.accountStatus !== 'ENABLED') {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: user === null || user === void 0 ? void 0 : user.id,
      });
    }
    return next({ ctx: { user } });
  })
).subscription;
export const middleware = t.middleware;
