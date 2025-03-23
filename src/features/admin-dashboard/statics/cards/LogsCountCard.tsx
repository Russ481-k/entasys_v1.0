import React from 'react';

import {
  Box,
  Flex,
  GridItem,
  Text,
  VStack,
  useColorMode,
} from '@chakra-ui/react';

interface LogsCountCardProps {
  title: string;
  subtitle: string;
  data: {
    label: string;
    count: number;
  }[];
}

export const LogsCountCard: React.FC<LogsCountCardProps> = ({
  title,
  subtitle,
  data,
}) => {
  const { colorMode } = useColorMode();

  return (
    <GridItem
      borderRadius="lg"
      bg={colorMode === 'light' ? 'white' : '#182232'}
      borderWidth={1}
      borderColor={colorMode === 'light' ? 'gray.200' : 'whiteAlpha.300'}
      colSpan={1}
      p={4}
      overflow="hidden"
      w="100%"
      height={{
        base: '220px',
        sm: '220px',
        md: '220px',
        lg: '220px',
        xl: '220px',
      }}
    >
      <Box
        display="grid"
        m="auto"
        alignItems="center"
        textAlign="center"
        justifyContent="center"
        mb={7}
      >
        <Text fontSize="lg" fontWeight="bold">
          {title}
        </Text>
        <Text fontSize="sm" fontWeight="regular">
          {subtitle}
        </Text>
      </Box>
      <Box
        flex="1"
        overflowY="auto"
        maxH="140px"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <VStack gap={0} align="stretch" w="100%">
          {data.map((item) => (
            <Flex
              key={item.label}
              justify="space-between"
              align="center"
              px={6}
              py={2}
            >
              <Text
                fontSize="lg"
                noOfLines={1}
                maxW="200px"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
                {item.label}
              </Text>
              <Text
                fontSize="lg"
                fontWeight="bold"
                minW="100px"
                textAlign="right"
              >
                {item.count >= 1000000
                  ? Math.floor(item.count / 1000000).toLocaleString() + ' M'
                  : item.count >= 100000
                    ? Math.floor(item.count / 1000).toLocaleString() + ' K'
                    : item.count.toLocaleString()}{' '}
                건
              </Text>
            </Flex>
          ))}
        </VStack>
      </Box>
    </GridItem>
  );
};
