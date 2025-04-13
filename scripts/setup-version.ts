import fs from 'fs-extra';
import inquirer from 'inquirer';
import { execSync } from 'node:child_process';
import path from 'node:path';

import { type PANOSVersion, VERSIONS } from '../src/config/versions.js';

function resolvePath(relativePath: string) {
  return path.isAbsolute(relativePath)
    ? relativePath
    : path.join(process.cwd(), relativePath.replace(/^\.\//, ''));
}

async function checkDockerAccess() {
  try {
    await execSync('docker ps', { encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

function backupConfig(filePath: string) {
  if (fs.existsSync(filePath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.${timestamp}.backup`;
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  }
  return null;
}

async function checkAndRestartContainer(containerName: string) {
  if (!(await checkDockerAccess())) {
    console.warn('No Docker access. Please restart containers manually.');
    return false;
  }

  try {
    console.log(`Checking if ${containerName} container is running...`);
    const isRunning = execSync(`docker ps -q -f name=${containerName}`, {
      encoding: 'utf8',
    }).trim();

    if (isRunning) {
      console.log(`Restarting ${containerName} container...`);
      execSync(`docker restart ${containerName}`, { encoding: 'utf8' });
      console.log(`${containerName} container restarted successfully`);
      return true;
    } else {
      console.log(`${containerName} container is not running`);
      return false;
    }
  } catch (error) {
    console.warn(`Failed to restart ${containerName} container:`, error);
    console.log(
      `Please restart the ${containerName} container manually if needed`
    );
    return false;
  }
}

async function setupVersion() {
  const { version } = await inquirer.prompt<{ version: PANOSVersion }>([
    {
      type: 'list',
      name: 'version',
      message: 'Select PAN-OS version:',
      choices: VERSIONS.map((v) => ({
        name: `${v.version} - ${v.description}`,
        value: v.version,
      })),
    },
  ]);

  const configPath = resolvePath('./src/config');
  const versionConfigPath = path.join(configPath, 'version.json');

  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(configPath, { recursive: true });
  }

  fs.writeJsonSync(versionConfigPath, { version }, { spaces: 2 });

  // Producer 설정 파일 복사
  const producerSrc = resolvePath(
    path.join('./logstash/pipeline/producer', `producer_${version}.conf`)
  );
  const producerDest = resolvePath(
    path.join('./logstash/pipeline/producer', 'producer.conf')
  );

  if (fs.existsSync(producerSrc)) {
    // 백업 먼저 생성
    if (fs.existsSync(producerDest)) {
      const backupPath = backupConfig(producerDest);
      if (backupPath) {
        console.log(`Backup created at: ${backupPath}`);
      }
    }

    fs.copyFileSync(producerSrc, producerDest);
    console.log(`Logstash producer configuration copied from ${producerSrc}`);
  } else {
    console.error(
      `Logstash producer configuration file not found: ${producerSrc}`
    );
    throw new Error(
      `Missing Logstash producer configuration for version ${version}`
    );
  }

  // Consumer 설정 파일 복사
  const consumerSrc = resolvePath(
    path.join('./logstash/pipeline/consumer', `consumer_${version}.conf`)
  );
  const consumerDest = resolvePath(
    path.join('./logstash/pipeline/consumer', 'consumer.conf')
  );

  if (fs.existsSync(consumerSrc)) {
    // 백업 먼저 생성
    if (fs.existsSync(consumerDest)) {
      const backupPath = backupConfig(consumerDest);
      if (backupPath) {
        console.log(`Backup created at: ${backupPath}`);
      }
    }

    fs.copyFileSync(consumerSrc, consumerDest);
    console.log(`Logstash consumer configuration copied from ${consumerSrc}`);

    await checkAndRestartContainer('logstash');
  } else {
    console.error(
      `Logstash consumer configuration file not found: ${consumerSrc}`
    );
    throw new Error(
      `Missing Logstash consumer configuration for version ${version}`
    );
  }

  console.log(`Configuration updated for PAN-OS ${version}`);
}

setupVersion().catch(console.error);
