import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';

import { DomainError, DomainErrorCodes } from '../../types/errors';

/**
 * We extend the TRPCError so we can implement tRPC code based on what Prisma
 * or other tool throw as an error.
 */
export class ExtendedTRPCError extends TRPCError {
  constructor(opts) {
    var _a;
    // Prisma Conflict Error
    if (
      opts.cause instanceof Prisma.PrismaClientKnownRequestError &&
      opts.cause.code === 'P2002'
    ) {
      super({ code: 'CONFLICT', message: opts.message, cause: opts.cause });
      return;
    }
    // Domain Error
    if (opts.cause instanceof DomainError) {
      const code = ExtendedTRPCError.getDomainErrorCode(opts.cause.code);
      super({
        code,
        message: opts.message || opts.cause.message,
        cause: opts.cause,
      });
      return;
    }
    // Unknown Error
    super({
      code:
        (_a = opts.code) !== null && _a !== void 0
          ? _a
          : 'INTERNAL_SERVER_ERROR',
      message: opts.message,
      cause: opts.cause,
    });
  }
  static getDomainErrorCode(errorCode) {
    switch (errorCode) {
      case DomainErrorCodes.DOMAIN_NOT_FOUND:
        return 'NOT_FOUND';
      case DomainErrorCodes.DOMAIN_ALREADY_EXISTS:
        return 'CONFLICT';
      case DomainErrorCodes.DOMAIN_VALIDATION_ERROR:
        return 'BAD_REQUEST';
      case DomainErrorCodes.DOMAIN_UPDATE_ERROR:
      case DomainErrorCodes.DOMAIN_DELETE_ERROR:
        return 'INTERNAL_SERVER_ERROR';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
