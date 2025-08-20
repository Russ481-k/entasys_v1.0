import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import os from 'os';

import { env } from '@/env.mjs';

// Dayjs 타임존 설정
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Seoul');

async function generateSystemLicense() {
  const prisma = new PrismaClient();

  try {
    // 하드웨어 정보 수집
    let hardwareInfo;
    const platform = os.platform();

    if (platform === 'linux') {
      hardwareInfo = {
        cpu: execSync('cat /proc/cpuinfo').toString(),
        system: execSync('uname -a').toString(),
        network: execSync("ip link | awk '/ether/ {print $2}'").toString(),
      };
    } else if (platform === 'win32') {
      hardwareInfo = {
        cpu: execSync('wmic cpu get name').toString(),
        system: execSync('ver').toString(),
        network: execSync('getmac').toString(),
      };
    } else if (platform === 'darwin') {
      hardwareInfo = {
        cpu: execSync('sysctl -n machdep.cpu.brand_string').toString(),
        system: execSync('uname -a').toString(),
        network: execSync("ifconfig en0 | awk '/ether/ {print $2}'").toString(),
      };
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    // 하드웨어 해시 생성
    const hardwareHash = createHash('sha256')
      .update(JSON.stringify(hardwareInfo))
      .digest('hex');

    // 라이센스 만료일 설정
    const LICENSE_DURATION = env.LICENSE_DURATION || 30;
    const expiresAt = dayjs().add(LICENSE_DURATION, 'day').toDate();

    // 기존 라이센스 확인 및 업데이트 또는 생성
    const existingLicense = await prisma.systemLicense.findUnique({
      where: { hardwareHash },
    });

    let license;
    if (existingLicense) {
      license = await prisma.systemLicense.update({
        where: { hardwareHash },
        data: {
          expiresAt,
          isActive: true,
          lastCheckedAt: new Date(),
        },
      });
    } else {
      license = await prisma.systemLicense.create({
        data: {
          hardwareHash,
          expiresAt,
        },
      });
    }

    console.log('License generated successfully:', {
      id: license.id,
      expiresAt: license.expiresAt,
      hash: hardwareHash.substring(0, 8) + '...',
      duration: LICENSE_DURATION,
    });
  } catch (error) {
    console.error('Failed to generate license:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 10분 테스트용 라이센스 생성 함수 추가
async function generateTestLicense(durationInMinutes: number) {
  const prisma = new PrismaClient();
  try {
    // 기존 라이센스 비활성화
    await prisma.systemLicense.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // 테스트 라이센스 생성
    const license = await prisma.systemLicense.create({
      data: {
        hardwareHash: 'test-hash',
        expiresAt: dayjs()
          .tz('Asia/Seoul')
          .add(durationInMinutes, 'minute')
          .toDate(),
        isActive: true,
      },
    });

    console.log('Test license generated:', {
      id: license.id,
      expiresAt: license.expiresAt,
      duration: `${durationInMinutes} minutes`,
      timezone: 'Asia/Seoul',
    });
  } finally {
    await prisma.$disconnect();
  }
}

generateSystemLicense();

// 10분 테스트 실행
// generateTestLicense(10);
