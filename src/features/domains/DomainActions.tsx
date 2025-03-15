import React from 'react';

import {
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  MenuProps,
  Portal,
  useColorMode,
} from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { LuPenLine, LuTrash2 } from 'react-icons/lu';

import { ActionsButton } from '@/components/ActionsButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Icon } from '@/components/Icons';
import { useToastError, useToastSuccess } from '@/components/Toast';
import { LinkAdmin } from '@/features/admin/LinkAdmin';
import { trpc } from '@/lib/trpc/client';

import type { Domain } from './schemas';

export type DomainActionsProps = Omit<MenuProps, 'children'> & {
  domain: Domain;
};

export const DomainActions = ({ domain, ...rest }: DomainActionsProps) => {
  const { t } = useTranslation(['common', 'domains']);
  const trpcUtils = trpc.useUtils();
  const { colorMode } = useColorMode();

  const toastSuccess = useToastSuccess();
  const toastError = useToastError();

  const { mutate: deleteDomain, isLoading: isDeleting } =
    trpc.domains.deleteDomain.useMutation({
      onSuccess: async () => {
        await trpcUtils.domains.getDomains.invalidate();
        toastSuccess({
          title: t('domains:messages.deleteSuccess'),
        });
      },
      onError: () => {
        toastError({
          title: t('domains:messages.error'),
          description: t('domains:messages.error'),
        });
      },
    });

  return (
    <Menu placement="left-start">
      <MenuButton as={ActionsButton} isLoading={isDeleting} />
      <Portal>
        <MenuList
          borderColor={colorMode === 'dark' ? 'gray.600' : 'gray.200'}
          {...rest}
        >
          <MenuItem
            as={LinkAdmin}
            href={`/management/domains/${domain.id}`}
            icon={<Icon icon={LuPenLine} fontSize="lg" color="gray.400" />}
          >
            {t('common:actions.edit')}
          </MenuItem>
          <ConfirmModal
            title={t('domains:delete.title')}
            message={t('domains:delete.description')}
            onConfirm={() => deleteDomain({ id: domain.id })}
            confirmText={t('domains:delete.action')}
            confirmVariant="@dangerSecondary"
          >
            <MenuItem
              icon={<Icon icon={LuTrash2} fontSize="lg" color="gray.400" />}
            >
              {t('common:actions.delete')}
            </MenuItem>
          </ConfirmModal>
        </MenuList>
      </Portal>
    </Menu>
  );
};
