import React, { type FC, useEffect, useState } from 'react';

import { Box, Text } from 'ink';

import { isNonNullish } from '@/validation/guards';

export type ExecutionTimerProps = {
  estimatedTimeRemaining?: number;
  startTime?: Date;
};

const formatTime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};

export const ExecutionTimer: FC<ExecutionTimerProps> = ({ startTime, estimatedTimeRemaining }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isNonNullish(startTime)) {
      return;
    }

    const interval = globalThis.setInterval(() => {
      setElapsed(Date.now() - startTime.getTime());
    }, 1000);

    return () => globalThis.clearInterval(interval);
  }, [startTime]);

  if (!isNonNullish(startTime)) {
    return <Text dimColor>Time: --:--</Text>;
  }

  return (
    <Box>
      <Text>Time: </Text>
      <Text color="magenta">{formatTime(elapsed)} elapsed</Text>
      {isNonNullish(estimatedTimeRemaining) && estimatedTimeRemaining > 0 && (
        <>
          <Text> | Est: </Text>
          <Text color="cyan">{formatTime(estimatedTimeRemaining)} remaining</Text>
        </>
      )}
    </Box>
  );
};
