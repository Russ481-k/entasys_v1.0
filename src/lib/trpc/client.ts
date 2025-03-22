/**
 * This is the client-side entrypoint for your tRPC API.
 * We also create a few inference helpers for input and output types.
 */
import { createTRPCReact } from '@trpc/react-query';

import type { AppRouter } from '@/server/routers/_app';

/** A set of type-safe react-query hooks for your tRPC API. */
export const trpc = createTRPCReact<AppRouter>();
