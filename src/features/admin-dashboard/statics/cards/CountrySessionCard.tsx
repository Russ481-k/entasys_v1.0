import React from 'react';

import {
  Box,
  Flex,
  GridItem,
  Text,
  VStack,
  useColorMode,
} from '@chakra-ui/react';

interface CountrySession {
  country: string;
  count: number;
}

interface CountrySessionCardProps {
  title: string;
  subtitle: string;
  data: CountrySession[];
  type: 'source' | 'destination';
  isLoading: boolean;
}

export const CountrySessionCard: React.FC<CountrySessionCardProps> = ({
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
        height="220px"
      >
        <Box>
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
        <Box flex="1" overflowY="auto" height="120px">
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
    </GridItem>
  );
};
