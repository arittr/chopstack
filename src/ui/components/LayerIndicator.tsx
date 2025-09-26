import React, { type FC } from 'react';

import { ProgressBar } from '@inkjs/ui';
import { Box, Text } from 'ink';

export type LayerIndicatorProps = {
  completedLayers: number;
  currentLayer?: number;
  totalLayers: number;
};

export const LayerIndicator: FC<LayerIndicatorProps> = ({
  totalLayers,
  completedLayers,
  currentLayer,
}) => {
  const percentage = totalLayers > 0 ? (completedLayers / totalLayers) * 100 : 0;

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>Layers: </Text>
        <ProgressBar value={percentage} />
        <Text>
          {' '}
          {completedLayers}/{totalLayers} ({Math.round(percentage)}%)
        </Text>
      </Box>
      {currentLayer !== undefined && currentLayer < totalLayers && (
        <Box marginLeft={2}>
          <Text dimColor>Currently executing layer {currentLayer}</Text>
        </Box>
      )}
    </Box>
  );
};
