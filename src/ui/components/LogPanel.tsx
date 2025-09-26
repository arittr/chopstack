import React, { type FC, useEffect, useRef } from 'react';

import { Box, Spacer, Text } from 'ink';

import type { LogEntry } from '@/ui/hooks/useExecutionState';

export type LogPanelProps = {
  logs: LogEntry[];
  maxLines?: number;
};

const getLogColor = (type: LogEntry['type']): string | undefined => {
  switch (type) {
    case 'error':
    case 'stderr': {
      return 'red';
    }
    case 'success': {
      return 'green';
    }
    case 'info': {
      return 'cyan';
    }
    case 'stdout': {
      return undefined;
    }
  }
};

const formatTimestamp = (date: Date): string => {
  return date.toTimeString().split(' ')[0] ?? ''; // HH:MM:SS
};

export const LogPanel: FC<LogPanelProps> = ({ logs, maxLines = 100 }) => {
  const bottomRef = useRef(null);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    // Scroll logic would go here if Ink supported scrolling
    // For now, we just show the latest logs that fit
  }, [logs]);

  // Get the latest logs that fit in view
  const visibleLogs = logs.slice(-maxLines);

  return (
    <Box flexDirection="column" padding={1} flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold>📋 Execution Logs</Text>
        <Spacer />
        <Text dimColor>Press 'q' to exit</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {visibleLogs.map((log) => {
          const logColor = getLogColor(log.type);
          return (
            <Box key={log.id} marginBottom={0}>
              <Text dimColor>[{formatTimestamp(log.timestamp)}]</Text>
              <Text> </Text>
              {log.taskId !== undefined && (
                <>
                  <Text color="yellow">[{log.taskId.slice(0, 8)}]</Text>
                  <Text> </Text>
                </>
              )}
              {logColor !== undefined ? (
                <Text color={logColor}>{log.message}</Text>
              ) : (
                <Text>{log.message}</Text>
              )}
            </Box>
          );
        })}
        <Box ref={bottomRef} />
      </Box>

      {logs.length === 0 && (
        <Box justifyContent="center" alignItems="center" flexGrow={1}>
          <Text dimColor>Waiting for logs...</Text>
        </Box>
      )}
    </Box>
  );
};
