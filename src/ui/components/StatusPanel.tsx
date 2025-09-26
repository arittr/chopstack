import React, { type FC } from 'react';

import { Alert, Badge, ProgressBar, Spinner } from '@inkjs/ui';
import { Box, Text } from 'ink';

import type { ExecutionOptions } from '@/core/execution/types';
import type { ExecutionMetrics, TaskUIState } from '@/ui/hooks/useExecutionState';

import { theme } from '@/ui/theme';
import { isNonEmptyString, isNonNullish } from '@/validation/guards';

import { ExecutionTimer } from './ExecutionTimer';
import { KeyboardHelp } from './KeyboardHelp';
import { LayerIndicator } from './LayerIndicator';
import { TaskProgress } from './TaskProgress';

export type StatusPanelProps = {
  metrics: ExecutionMetrics;
  options: ExecutionOptions;
  tasks: Map<string, TaskUIState>;
};

export const StatusPanel: FC<StatusPanelProps> = ({ tasks, metrics, options }) => {
  const runningTasks = [...tasks.values()].filter((t) => t.status === 'running');
  const completionPercentage =
    metrics.totalTasks > 0 ? (metrics.completedTasks / metrics.totalTasks) * 100 : 0;

  // Calculate current layer (highest layer with running tasks)
  const currentLayer = Math.max(0, ...runningTasks.map((t) => t.layer ?? 0));

  // Determine overall status
  const hasFailures = metrics.failedTasks > 0;
  const isComplete = metrics.completedTasks + metrics.failedTasks === metrics.totalTasks;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1} flexDirection="row" justifyContent="space-between">
        <Box>
          <Text bold color={theme.primary}>
            📊 ChopStack Execution
          </Text>
          <Box marginLeft={2}>
            <Text dimColor>
              {options.strategy} • {options.mode} •{' '}
              {isNonEmptyString(options.agent) ? options.agent : 'claude'}
            </Text>
          </Box>
        </Box>
        <KeyboardHelp />
      </Box>

      {/* Overall Progress */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold>Overall: </Text>
          <ProgressBar value={completionPercentage} />
          <Text>
            {' '}
            {metrics.completedTasks}/{metrics.totalTasks} tasks
          </Text>
        </Box>

        {/* Layer Progress */}
        <Box marginTop={1}>
          <LayerIndicator
            totalLayers={metrics.totalLayers}
            completedLayers={metrics.completedLayers}
            currentLayer={currentLayer}
          />
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
          <Box>
            <Text bold>Active Tasks </Text>
            <Badge color={theme.warning}>{runningTasks.length}</Badge>
          </Box>
          {runningTasks.slice(0, 3).map((task) => (
            <Box key={task.id} marginLeft={1} gap={1}>
              <Spinner />
              <TaskProgress task={task} />
            </Box>
          ))}
          {runningTasks.length > 3 && (
            <Box marginLeft={1}>
              <Text dimColor>... and {runningTasks.length - 3} more</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Status Messages */}
      {isComplete && (
        <Box marginTop={1}>
          {hasFailures ? (
            <Alert variant="error">Execution completed with {metrics.failedTasks} failure(s)</Alert>
          ) : (
            <Alert variant="success">All tasks completed successfully!</Alert>
          )}
        </Box>
      )}

      {/* Stats Summary */}
      <Box marginTop={1} gap={1}>
        {metrics.completedTasks > 0 && (
          <Badge color={theme.success}>✓ {metrics.completedTasks}</Badge>
        )}
        {metrics.failedTasks > 0 && <Badge color={theme.error}>✗ {metrics.failedTasks}</Badge>}
        {metrics.runningTasks > 0 && (
          <Badge color={theme.warning}>↻ {metrics.runningTasks} running</Badge>
        )}
        {metrics.totalTasks - metrics.completedTasks - metrics.failedTasks - metrics.runningTasks >
          0 && (
          <Text dimColor>
            ○{' '}
            {metrics.totalTasks -
              metrics.completedTasks -
              metrics.failedTasks -
              metrics.runningTasks}{' '}
            pending
          </Text>
        )}
      </Box>
    </Box>
  );
};
