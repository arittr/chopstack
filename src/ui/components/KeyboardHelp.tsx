import React, { type FC } from 'react';

import { Box, Text } from 'ink';

export const KeyboardHelp: FC = () => {
  return (
    <Box flexDirection="row" gap={2}>
      <Text dimColor>
        <Text bold>q</Text>: quit
      </Text>
      <Text dimColor>•</Text>
      <Text dimColor>
        <Text bold>Ctrl+C</Text>: exit
      </Text>
    </Box>
  );
};
