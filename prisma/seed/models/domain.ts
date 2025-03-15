import { prisma } from 'prisma/seed/utils';

export async function createDomains() {
  const domains = [
    {
      name: 'vision-seoul-fw-seoulfw_1',
      description: 'Seoul Firewall 1',
      isActive: true,
    },
    {
      name: 'vision-seoul-fw-seoulfw_2',
      description: 'Seoul Firewall 2',
      isActive: true,
    },
    {
      name: 'vision-seoul-fw-seoulfw_3',
      description: 'Seoul Firewall 3',
      isActive: true,
    },
  ];

  console.log('Creating domains...');

  for (const domain of domains) {
    await prisma.domain.upsert({
      where: { name: domain.name },
      update: domain,
      create: domain,
    });
  }

  console.log('Domains created successfully');
}
