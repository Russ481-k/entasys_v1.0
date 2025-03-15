import { Tag, TagLabel, TagLeftIcon, ThemeTypings } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { LuCheck, LuX } from 'react-icons/lu';

export type DomainStatusProps = {
  isActive?: boolean;
  showLabelBreakpoint?: ThemeTypings['breakpoints'];
};

export const DomainStatus = ({
  isActive = false,
  showLabelBreakpoint = 'base',
}: DomainStatusProps) => {
  const { t } = useTranslation(['domains']);

  return (
    <Tag
      size="sm"
      colorScheme={isActive ? 'success' : 'warning'}
      gap={1}
      justifyContent="center"
      px={{ base: 0, [showLabelBreakpoint]: 2 }}
    >
      <TagLeftIcon
        as={isActive ? LuCheck : LuX}
        mr={0}
        aria-label={
          isActive
            ? t('domains:data.status.active')
            : t('domains:data.status.inactive')
        }
      />
      <TagLabel
        lineHeight={1}
        display={{ base: 'none', [showLabelBreakpoint]: 'inline' }}
        whiteSpace="nowrap"
      >
        {isActive
          ? t('domains:data.status.active')
          : t('domains:data.status.inactive')}
      </TagLabel>
    </Tag>
  );
};
