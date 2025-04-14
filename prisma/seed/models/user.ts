import bcrypt from 'bcryptjs';
import { emphasis, prisma } from 'prisma/seed/utils';

import { VALIDATION_PASSWORD_MOCKED } from '@/features/auth/utils';

export async function createUsers() {
  console.log(`⏳ Seeding users`);

  let createdCounter = 0;
  const existingCount = await prisma.user.count();

  if (!(await prisma.user.findUnique({ where: { id: 'admin' } }))) {
    await prisma.user.create({
      data: {
        name: 'Admin',
        id: 'admin',
        password: bcrypt.hashSync(VALIDATION_PASSWORD_MOCKED, 8),
        authorizations: ['SYSTEM_ADMIN'],
        accountStatus: 'ENABLED',
        email: 'admin@admin.co.kr',
      },
    });
    createdCounter += 1;
  }

  console.log(
    `✅ ${existingCount} existing user 👉 ${createdCounter} users created`
  );
  console.log(`👉 Admin connect with: ${emphasis('admin')}`);
}
