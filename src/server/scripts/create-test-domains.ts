#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

import { OpenSearchClient } from '../lib/opensearch.js';

const TEST_DOMAINS = [
  { name: 'seoulfw', description: 'Seoul Office Firewall' },
  { name: 'busanfw', description: 'Busan Office Firewall' },
  { name: 'daegufw', description: 'Daegu Branch Firewall' },
  { name: 'incheonfw', description: 'Incheon HQ Firewall' },
  { name: 'gwangjufw', description: 'Gwangju Sub Firewall' },
  { name: 'daejeonfw', description: 'Daejeon Main Firewall' },
  { name: 'ulsanfw', description: 'Ulsan Plant Firewall' },
  { name: 'jejufw', description: 'Jeju Branch Firewall' },
  { name: 'gangwonfw', description: 'Gangwon Office Firewall' },
  { name: 'chungbukfw', description: 'Chungbuk Department Firewall' },
];

async function createTestDomains() {
  const prisma = new PrismaClient();
  const opensearch = OpenSearchClient.getInstance();

  try {
    console.log('🏗️  Creating test domains...');

    // ILM 정책 먼저 생성
    console.log('📋 Creating ILM policy...');
    await opensearch.createILMPolicy();

    for (const domainData of TEST_DOMAINS) {
      try {
        // 도메인이 이미 존재하는지 확인
        const existingDomain = await prisma.domain.findUnique({
          where: { name: domainData.name },
        });

        if (existingDomain) {
          console.log(
            `⏭️  Domain ${domainData.name} already exists, skipping...`
          );
          continue;
        }

        // 도메인 생성
        const domain = await prisma.domain.create({
          data: {
            name: domainData.name,
            description: domainData.description,
            isActive: true,
          },
        });

        console.log(`✅ Created domain: ${domain.name}`);

        // OpenSearch 인덱스 템플릿 생성
        await opensearch.updateIndexTemplate(domain.name);
        console.log(`🔍 Created OpenSearch template for: ${domain.name}`);
      } catch (error) {
        console.error(`❌ Failed to create domain ${domainData.name}:`, error);
      }
    }

    console.log('🎉 Test domains creation completed!');
  } catch (error) {
    console.error('Error creating test domains:', error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  createTestDomains();
}

export { createTestDomains };
