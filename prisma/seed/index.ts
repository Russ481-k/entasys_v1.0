import { createMenus } from 'prisma/seed/models/menu';
import { createUsers } from 'prisma/seed/models/user';
import { prisma } from 'prisma/seed/utils';

import { createDomains } from './models/domain';
import { createProjects } from './models/project';

async function main() {
  await createUsers();
  await createMenus();
  await createProjects();
  await createDomains();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
