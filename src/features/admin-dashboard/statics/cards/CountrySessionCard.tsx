import React from 'react';

import { Box, Flex, Text, VStack, useColorMode } from '@chakra-ui/react';

interface CountrySession {
  country: string;
  count: number;
}

interface CountrySessionCardProps {
  title: string;
  subtitle: string;
  data: CountrySession[];
  type: 'source' | 'destination';
}

export const CountrySessionCard: React.FC<CountrySessionCardProps> = ({
  title,
  subtitle,
  data,
}) => {
  const { colorMode } = useColorMode();

  return (
    <Box
      bg={colorMode === 'light' ? 'white' : '#182232'}
      borderWidth="1px"
      borderColor={colorMode === 'light' ? 'gray.200' : 'whiteAlpha.300'}
      borderRadius="lg"
      p={4}
      height="100%"
      display="flex"
      flexDirection="column"
    >
      <Box
        display="grid"
        m="auto"
        alignItems="center"
        textAlign="center"
        justifyContent="center"
      >
        <Text fontSize="lg" fontWeight="bold">
          {title}
        </Text>
        <Text
          fontSize="sm"
          color={colorMode === 'light' ? 'gray.800' : 'white'}
        >
          {subtitle}
        </Text>
      </Box>

      <Box flex="1" overflowY="auto" maxH="140px">
        <VStack gap={0} align="stretch">
          {data.map((country, index) => (
            <Flex
              key={country.country}
              justify="space-between"
              align="center"
              px={6}
              py={2}
            >
              <Text
                fontSize="sm"
                noOfLines={1}
                maxW="200px"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
                {index + 1}. {country.country}
              </Text>
              <Text
                fontSize="sm"
                fontWeight="bold"
                minW="100px"
                textAlign="right"
              >
                {country.count.toLocaleString()}
              </Text>
            </Flex>
          ))}
        </VStack>
      </Box>
    </Box>
  );
};
