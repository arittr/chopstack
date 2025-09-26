import React, { type FC } from 'react';

import { Box, Text } from 'ink';

export type LayerIndicatorProps = {
  completedLayers: number;
  totalLayers: number;
};

export const LayerIndicator: FC<LayerIndicatorProps> = ({ totalLayers, completedLayers }) => {
  const percentage = totalLayers > 0 ? Math.round((completedLayers / totalLayers) * 100) : 0;
  const filledBars = Math.floor(percentage / 5);
  const emptyBars = 20 - filledBars;

  return (
    <Box>
      <Text>Layers: </Text>
      <Box width={20}>
        <Text color="green">
          [{'█'.repeat(filledBars)}
          {'░'.repeat(emptyBars)}]
        </Text>
      </Box>
      <Text>
        {' '}
        {completedLayers}/{totalLayers} ({percentage}%)
      </Text>
    </Box>
  );
};
