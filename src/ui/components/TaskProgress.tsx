import React, { type FC } from 'react';

import { Box, Text } from 'ink';

import type { TaskUIState } from '@/ui/hooks/useExecutionState';

export type TaskProgressProps = {
  task: TaskUIState;
};

export const TaskProgress: FC<TaskProgressProps> = ({ task }) => {
  const progressBar =
    '█'.repeat(Math.floor(task.progress / 10)) + '░'.repeat(10 - Math.floor(task.progress / 10));

  return (
    <Box>
      <Text>{task.title}: </Text>
      <Text color="cyan">[{progressBar}]</Text>
      <Text> {task.progress}%</Text>
    </Box>
  );
};
