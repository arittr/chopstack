import React, { type FC } from 'react';

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

import type { ExecutionOptions } from '@/core/execution/types';
import type { ExecutionMetrics, TaskUIState } from '@/ui/hooks/useExecutionState';

import { isNonEmptyString, isNonNullish } from '@/validation/guards';

import { ExecutionTimer } from './ExecutionTimer';
import { LayerIndicator } from './LayerIndicator';
import { TaskProgress } from './TaskProgress';

export type StatusPanelProps = {
  metrics: ExecutionMetrics;
  options: ExecutionOptions;
  tasks: Map<string, TaskUIState>;
};

export const StatusPanel: FC<StatusPanelProps> = ({ tasks, metrics, options }) => {
  const runningTasks = [...tasks.values()].filter((t) => t.status === 'running');
  const completionPercentage = Math.round((metrics.completedTasks / metrics.totalTasks) * 100);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          📊 ChopStack Progress
        </Text>
        <Box marginLeft={2}>
          <Text dimColor>
            Strategy: {options.strategy} | Mode: {options.mode} | Agent:{' '}
            {isNonEmptyString(options.agent) ? options.agent : 'claude'}
          </Text>
        </Box>
      </Box>

      {/* Progress Bars */}
      <Box flexDirection="column" marginBottom={1}>
        <LayerIndicator
          totalLayers={metrics.totalLayers}
          completedLayers={metrics.completedLayers}
        />
        <Box marginTop={1}>
          <Text>Tasks: </Text>
          <Box width={20}>
            <Text>
              [{'█'.repeat(Math.floor(completionPercentage / 5))}
              {'░'.repeat(20 - Math.floor(completionPercentage / 5))}]
            </Text>
          </Box>
          <Text>
            {' '}
            {metrics.completedTasks}/{metrics.totalTasks} ({completionPercentage}%)
          </Text>
        </Box>
      </Box>

      {/* Timer */}
      <ExecutionTimer
        {...(isNonNullish(metrics.startTime) && { startTime: metrics.startTime })}
        {...(isNonNullish(metrics.estimatedTimeRemaining) &&
          metrics.estimatedTimeRemaining > 0 && {
            estimatedTimeRemaining: metrics.estimatedTimeRemaining,
          })}
      />

      {/* Current Running Tasks */}
      {runningTasks.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Current Tasks ({runningTasks.length} running):</Text>
          {runningTasks.slice(0, 3).map((task) => (
            <Box key={task.id} marginLeft={1}>
              <Text color="yellow">├─ </Text>
              <Spinner type="dots" />
              <Text> </Text>
              <TaskProgress task={task} />
            </Box>
          ))}
          {runningTasks.length > 3 && (
            <Box marginLeft={1}>
              <Text dimColor>└─ ... and {runningTasks.length - 3} more</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Stats Summary */}
      <Box marginTop={1}>
        <Text dimColor>
          ✓ {metrics.completedTasks} completed |
          {metrics.failedTasks > 0 && <Text color="red"> ✗ {metrics.failedTasks} failed | </Text>}
          {metrics.runningTasks > 0 && (
            <Text color="yellow"> ↻ {metrics.runningTasks} running</Text>
          )}
        </Text>
      </Box>
    </Box>
  );
};
