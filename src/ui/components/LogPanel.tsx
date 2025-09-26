import React, { type FC, useCallback, useEffect, useMemo, useState } from 'react';

import { Box, Spacer, Text, useInput } from 'ink';

import type { LogEntry } from '@/ui/hooks/useExecutionState';

import { theme } from '@/ui/theme';
import { isNonEmptyString, isNonNullish } from '@/validation/guards';

export type LogPanelProps = {
  filterTaskId?: string;
  logs: LogEntry[];
  maxLines?: number;
};

const getLogColor = (type: LogEntry['type']): string | undefined => {
  switch (type) {
    case 'error': {
      return theme.logError;
    }
    case 'stderr': {
      return theme.logStderr;
    }
    case 'success': {
      return theme.logSuccess;
    }
    case 'info': {
      return theme.logInfo;
    }
    case 'stdout': {
      return theme.logStdout;
    }
    case 'status': {
      return theme.logStatus;
    }
    default: {
      return undefined;
    }
  }
};

const formatTimestamp = (date: Date): string => {
  return date.toTimeString().split(' ')[0] ?? ''; // HH:MM:SS
};

const truncateMessage = (message: string, maxWidth: number): string => {
  // Account for timestamp [HH:MM:SS] (11 chars) + taskId [12345678] (11 chars) + spaces (3 chars) = 25 chars overhead
  const overhead = 25;
  const availableWidth = Math.max(20, maxWidth - overhead);

  if (message.length <= availableWidth) {
    return message;
  }

  return `${message.slice(0, availableWidth - 3)}...`;
};

export const LogPanel: FC<LogPanelProps> = ({ logs, maxLines = 20, filterTaskId }) => {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [selectedTaskFilter, setSelectedTaskFilter] = useState<string | undefined>(filterTaskId);
  const [terminalWidth, setTerminalWidth] = useState(
    isNonNullish(process.stdout.columns) ? process.stdout.columns : 120,
  );

  // Update terminal width on resize
  useEffect(() => {
    const handleResize = (): void => {
      setTerminalWidth(isNonNullish(process.stdout.columns) ? process.stdout.columns : 120);
    };

    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  // Filter logs by task ID if specified
  const filteredLogs = useMemo(() => {
    if (!isNonEmptyString(selectedTaskFilter)) {
      return logs;
    }
    return logs.filter((log) => log.taskId === selectedTaskFilter);
  }, [logs, selectedTaskFilter]);

  // Calculate visible window
  const visibleLogs = useMemo(() => {
    const totalLogs = filteredLogs.length;
    if (isAutoScrollEnabled || scrollOffset === 0) {
      // Show latest logs
      return filteredLogs.slice(-maxLines);
    }
    // Manual scroll position
    const start = Math.max(0, totalLogs - maxLines - scrollOffset);
    const end = start + maxLines;
    return filteredLogs.slice(start, end);
  }, [filteredLogs, maxLines, scrollOffset, isAutoScrollEnabled]);

  // Auto-scroll to bottom when new logs are added (if enabled)
  useEffect(() => {
    if (isAutoScrollEnabled && scrollOffset !== 0) {
      setScrollOffset(0);
    }
  }, [filteredLogs.length, isAutoScrollEnabled]);

  // Keyboard input handling
  useInput((input, key) => {
    // Scroll controls
    if (key.upArrow) {
      setIsAutoScrollEnabled(false);
      setScrollOffset((previous) =>
        Math.min(previous + 1, Math.max(0, filteredLogs.length - maxLines)),
      );
    } else if (key.downArrow) {
      setScrollOffset((previous) => {
        const newOffset = Math.max(0, previous - 1);
        if (newOffset === 0) {
          setIsAutoScrollEnabled(true);
        }
        return newOffset;
      });
    } else if (key.pageUp) {
      setIsAutoScrollEnabled(false);
      setScrollOffset((previous) =>
        Math.min(previous + Math.floor(maxLines / 2), Math.max(0, filteredLogs.length - maxLines)),
      );
    } else if (key.pageDown) {
      setScrollOffset((previous) => {
        const newOffset = Math.max(0, previous - Math.floor(maxLines / 2));
        if (newOffset === 0) {
          setIsAutoScrollEnabled(true);
        }
        return newOffset;
      });
    }

    // Auto-scroll toggle
    if (input === 'a') {
      setIsAutoScrollEnabled((previous) => !previous);
      if (!isAutoScrollEnabled) {
        setScrollOffset(0);
      }
    }

    // Clear filter
    if (input === 'c') {
      setSelectedTaskFilter(undefined);
    }

    // Home/End keys
    if (input === 'g') {
      setIsAutoScrollEnabled(false);
      setScrollOffset(Math.max(0, filteredLogs.length - maxLines));
    } else if (input === 'G') {
      setIsAutoScrollEnabled(true);
      setScrollOffset(0);
    }
  });

  const scrollIndicator = useCallback(() => {
    const totalLogs = filteredLogs.length;
    if (totalLogs <= maxLines) {
      return null;
    }

    const currentPosition = totalLogs - scrollOffset;
    const percentage = Math.round((currentPosition / totalLogs) * 100);

    return (
      <Box gap={1}>
        <Text dimColor>
          {currentPosition}/{totalLogs} ({percentage}%)
        </Text>
        {!isAutoScrollEnabled && <Text color="yellow">[PAUSED]</Text>}
        {isNonEmptyString(selectedTaskFilter) && (
          <Text color="cyan">[Filter: {selectedTaskFilter.slice(0, 8)}]</Text>
        )}
      </Box>
    );
  }, [filteredLogs.length, scrollOffset, isAutoScrollEnabled, selectedTaskFilter, maxLines]);

  return (
    <Box flexDirection="column" padding={1} height="100%">
      <Box marginBottom={1}>
        <Text bold>📋 Execution Logs</Text>
        <Spacer />
        {scrollIndicator()}
        <Spacer />
        <Text dimColor>↑/↓ scroll • a: auto • c: clear filter</Text>
      </Box>

      <Box flexDirection="column" height={maxLines}>
        {filteredLogs.length === 0 ? (
          <Box justifyContent="center" alignItems="center" height="100%">
            <Text dimColor>
              {isNonEmptyString(selectedTaskFilter)
                ? `No logs for task ${selectedTaskFilter.slice(0, 8)}`
                : 'Waiting for logs...'}
            </Text>
          </Box>
        ) : (
          visibleLogs.map((log) => {
            const logColor = getLogColor(log.type);
            return (
              <Box key={log.id} marginBottom={0}>
                <Text dimColor>[{formatTimestamp(log.timestamp)}]</Text>
                <Text> </Text>
                {isNonEmptyString(log.taskId) && (
                  <>
                    <Text color={theme.warning}>[{log.taskId.slice(0, 8)}]</Text>
                    <Text> </Text>
                  </>
                )}
                {logColor !== undefined ? (
                  <Text color={logColor}>{truncateMessage(log.message, terminalWidth)}</Text>
                ) : (
                  <Text>{truncateMessage(log.message, terminalWidth)}</Text>
                )}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
};
