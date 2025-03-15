import React from 'react';

import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { LuUsers } from 'react-icons/lu';
import { TbWorld } from 'react-icons/tb';

import { Nav, NavGroup, NavItem } from '@/components/Nav';
import { LinkAdmin } from '@/features/admin/LinkAdmin';
import { ADMIN_PATH } from '@/features/admin/constants';

export const AdminNav = () => {
  const { t } = useTranslation(['management']);
  const pathname = usePathname();
  const isActive = (to: string) => pathname?.startsWith(to);
  return (
    <Nav>
      <NavGroup title={t('management:nav.title')}>
        <NavItem
          as={LinkAdmin}
          href="/management/users"
          isActive={isActive(`${ADMIN_PATH}/management/users`)}
          icon={LuUsers}
        >
          {t('management:nav.users')}
        </NavItem>
        <NavItem
          as={LinkAdmin}
          href="/management/domains"
          isActive={isActive(`${ADMIN_PATH}/management/domains`)}
          icon={TbWorld}
        >
          {t('management:nav.domains')}
        </NavItem>
        {/* add menu NavItem */}
        {/* <NavItem
          as={LinkAdmin}
          href="/management/menus"
          isActive={isActive(`${ADMIN_PATH}/management/menus`)}
          icon={LuMenu}
        >
          {t('management:nav.menus')}
        </NavItem>
        <NavItem
          as={LinkAdmin}
          href="/management/database"
          isActive={isActive(`${ADMIN_PATH}/management/database`)}
          icon={LuDatabase}
        >
          {t('management:nav.database')}
        </NavItem> */}
      </NavGroup>
    </Nav>
  );
};
