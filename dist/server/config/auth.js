import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import jwt from 'jsonwebtoken';
import { cookies, headers } from 'next/headers';

import { env } from '@/env.mjs';
import {
  VALIDATION_TOKEN_EXPIRATION_IN_MINUTES,
  getValidationRetryDelayInSeconds,
} from '@/features/auth/utils';
import { zUser } from '@/features/users/schemas';
import { db } from '@/server/config/db';
import { validateLicense } from '@/utils/license';

export const AUTH_COOKIE_NAME = 'auth';
/**
 * getServerAuthSession
 */
export const getServerAuthSession = async () => {
  var _a, _b, _c;
  try {
    const token =
      (_b =
        (_a = headers().get('Authorization')) === null || _a === void 0
          ? void 0
          : _a.split('Bearer ')[1]) !== null && _b !== void 0
        ? _b
        : (_c = cookies().get(AUTH_COOKIE_NAME)) === null || _c === void 0
          ? void 0
          : _c.value;
    if (!token) {
      return null;
    }
    const jwtDecoded = decodeJwt(token);
    if (
      !(jwtDecoded === null || jwtDecoded === void 0 ? void 0 : jwtDecoded.id)
    ) {
      return null;
    }
    const userPick = {
      id: true,
      name: true,
      email: true,
      authorizations: true,
      language: true,
      accountStatus: true,
    };
    const user = await db.user.findUnique({
      where: {
        id: jwtDecoded.id,
        accountStatus: 'ENABLED',
      },
      select: userPick,
    });
    if (!user) {
      cookies().delete(AUTH_COOKIE_NAME);
      return null;
    }
    return zUser().pick(userPick).parse(user);
  } catch (error) {
    cookies().delete(AUTH_COOKIE_NAME);
    return null;
  }
};
export const setAuthCookie = (token) => {
  try {
    cookies().delete(AUTH_COOKIE_NAME);
    const cookieOptions = {
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    };
    cookies().set(cookieOptions);
  } catch (error) {
    // Silent fail
  }
};
export const removeAuthCookie = () => {
  cookies().delete(AUTH_COOKIE_NAME);
};
export const decodeJwt = (token) => {
  try {
    const jwtDecoded = jwt.verify(token, env.AUTH_SECRET);
    if (
      !jwtDecoded ||
      typeof jwtDecoded !== 'object' ||
      !('id' in jwtDecoded)
    ) {
      return null;
    }
    return jwtDecoded;
  } catch (_a) {
    return null;
  }
};
export async function validate({ ctx, id, password }) {
  var _a, _b;
  ctx.logger.info('Removing expired verification tokens from database');
  await ctx.db.verificationToken.deleteMany({
    where: { expires: { lt: new Date() } },
  });
  ctx.logger.info('Checking password');
  ctx.logger.info('Checking if verification token exists');
  const user = await ctx.db.user.findUnique({
    where: { id },
  });
  const isCorrectPassword = bcrypt.compareSync(
    password,
    (_a = user === null || user === void 0 ? void 0 : user.password) !== null &&
      _a !== void 0
      ? _a
      : ''
  );
  if (!user) {
    ctx.logger.warn('User not found, silent error for security reasons');
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Failed to authenticate the user',
    });
  }
  if (user.accountStatus !== 'ENABLED') {
    ctx.logger.warn('Invalid user, silent error for security reasons');
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Failed to authenticate the user',
    });
  }
  if (!isCorrectPassword) {
    ctx.logger.warn('Invalid user, silent error for security reasons');
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Failed to authenticate the user',
    });
  }
  ctx.logger.info('Saving token to database');
  const token = randomUUID();
  await ctx.db.verificationToken.create({
    data: {
      userId: user.id,
      expires: dayjs()
        .add(VALIDATION_TOKEN_EXPIRATION_IN_MINUTES, 'minutes')
        .toDate(),
      token,
    },
  });
  const verificationToken = await ctx.db.verificationToken.findUnique({
    where: {
      token,
    },
  });
  let retryDelayInSeconds = getValidationRetryDelayInSeconds(
    (_b =
      verificationToken === null || verificationToken === void 0
        ? void 0
        : verificationToken.attempts) !== null && _b !== void 0
      ? _b
      : 0
  );
  ctx.logger.info('Check last attempt date');
  if (
    dayjs().isBefore(
      dayjs(
        verificationToken === null || verificationToken === void 0
          ? void 0
          : verificationToken.lastAttemptAt
      ).add(retryDelayInSeconds, 'seconds')
    )
  ) {
    ctx.logger.warn('Last attempt was to close');
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Failed to authenticate the user',
    });
  }
  if (!verificationToken) {
    ctx.logger.warn('Verification token does not exist');
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Failed to authenticate the user',
    });
  }
  retryDelayInSeconds = getValidationRetryDelayInSeconds(
    verificationToken.attempts
  );
  ctx.logger.info('Check last attempt date');
  if (
    dayjs().isBefore(
      dayjs(verificationToken.lastAttemptAt).add(retryDelayInSeconds, 'seconds')
    )
  ) {
    ctx.logger.warn('Last attempt was to close');
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Failed to authenticate the user',
    });
  }
  ctx.logger.info('Encoding JWT');
  const userJwt = jwt.sign({ id: verificationToken.userId }, env.AUTH_SECRET);
  if (!userJwt) {
    ctx.logger.error('Failed to encode JWT');
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
  ctx.logger.info(
    'About to set auth cookie with JWT:',
    userJwt.substring(0, 10) + '...'
  );
  setAuthCookie(userJwt);
  ctx.logger.info('Auth cookie has been set');
  // 쿠키가 실제로 설정되었는지 확인
  const verificationCookie = cookies().get(AUTH_COOKIE_NAME);
  ctx.logger.info('Verification - Cookie exists:', !!verificationCookie);
  // 라이센스 검증 추가
  try {
    await validateLicense(ctx);
  } catch (error) {
    ctx.logger.error('License validation failed:', error);
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Invalid license',
    });
  }
  return { verificationToken, userJwt };
}
export async function deleteUsedCode({ ctx, token }) {
  ctx.logger.info('Deleting used token');
  try {
    await ctx.db.verificationToken.delete({
      where: { token },
    });
  } catch (e) {
    ctx.logger.warn('Failed to delete the used token');
  }
}
