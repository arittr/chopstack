import { useCallback, useEffect, useRef, useState } from 'react';

import type { TaskResult } from '@/core/execution/interfaces';
import type { ExecutionOrchestrator } from '@/services/execution/execution-orchestrator';
import type { Plan } from '@/types/decomposer';

import { isNonEmptyString, isNonNullish } from '@/validation/guards';

export type LogEntry = {
  id: string;
  message: string;
  taskId?: string;
  timestamp: Date;
  type: 'info' | 'error' | 'success' | 'stdout' | 'stderr';
};

export type TaskUIState = {
  dependencies: string[];
  id: string;
  layer?: number;
  progress: number;
  startTime?: Date;
  status: 'pending' | 'running' | 'success' | 'failure' | 'skipped';
  title: string;
};

export type ExecutionMetrics = {
  averageTaskDuration?: number;
  completedLayers: number;
  completedTasks: number;
  estimatedTimeRemaining?: number;
  failedTasks: number;
  runningTasks: number;
  startTime?: Date;
  totalLayers: number;
  totalTasks: number;
};

export type ExecutionState = {
  isComplete: boolean;
  logs: LogEntry[];
  metrics: ExecutionMetrics;
  tasks: Map<string, TaskUIState>;
};

export function useExecutionState(orchestrator: ExecutionOrchestrator, plan: Plan): ExecutionState {
  const [tasks, setTasks] = useState(() => {
    const initialTasks = new Map<string, TaskUIState>();
    for (const task of plan.tasks) {
      initialTasks.set(task.id, {
        dependencies: task.requires,
        id: task.id,
        ...(isNonNullish(task.layer) && { layer: task.layer }),
        progress: 0,
        status: 'pending',
        title: task.title,
      });
    }
    return initialTasks;
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [executionStartTime, setExecutionStartTime] = useState<Date>();
  const logIdCounter = useRef(0);
  const taskDurations = useRef<number[]>([]);

  const addLog = useCallback((log: Omit<LogEntry, 'id' | 'timestamp'>): void => {
    const newLog: LogEntry = {
      ...log,
      id: String(logIdCounter.current++),
      timestamp: new Date(),
    };
    setLogs((previous) => [...previous, newLog]);
  }, []);

  useEffect(() => {
    const handleExecutionStart = (): void => {
      const startTime = new Date();
      setExecutionStartTime(startTime);
      addLog({ message: 'Execution started', type: 'info' });
    };

    const handleExecutionComplete = (): void => {
      setIsComplete(true);
      addLog({ message: 'Execution completed successfully', type: 'success' });
    };

    const handleExecutionFailed = (error: Error): void => {
      setIsComplete(true);
      addLog({ message: `Execution failed: ${error.message}`, type: 'error' });
    };

    const handleTaskStart = ({ taskId }: { taskId: string }): void => {
      setTasks((previous) => {
        const updated = new Map(previous);
        const task = updated.get(taskId);
        if (isNonNullish(task)) {
          task.status = 'running';
          task.progress = 0;
          task.startTime = new Date();
        }
        return updated;
      });
      addLog({ message: `Starting task`, taskId, type: 'info' });
    };

    const handleTaskProgress = ({
      mode,
      taskId,
      tasks: progressTasks,
    }: {
      mode: string;
      taskId: string;
      tasks: Array<{ progress?: number }>;
    }): void => {
      if (mode === 'execute' && Array.isArray(progressTasks) && progressTasks.length > 0) {
        const avgProgress =
          progressTasks.reduce((sum, t) => sum + (t.progress ?? 0), 0) / progressTasks.length;
        setTasks((previous) => {
          const updated = new Map(previous);
          const task = updated.get(taskId);
          if (isNonNullish(task)) {
            task.progress = Math.round(avgProgress);
          }
          return updated;
        });
      }
    };

    const handleTaskComplete = ({
      result,
      taskId,
    }: {
      result: TaskResult;
      taskId: string;
    }): void => {
      setTasks((previous) => {
        const updated = new Map(previous);
        const task = updated.get(taskId);
        if (isNonNullish(task)) {
          task.status = result.status;
          task.progress = 100;

          // Track task duration for time estimates
          if (isNonNullish(task.startTime)) {
            const duration = Date.now() - task.startTime.getTime();
            taskDurations.current.push(duration);
            // Keep only last 10 durations for moving average
            if (taskDurations.current.length > 10) {
              taskDurations.current.shift();
            }
          }
        }
        return updated;
      });
      const task = tasks.get(taskId);
      const taskTitle = isNonNullish(task) && isNonEmptyString(task.title) ? task.title : 'Task';
      addLog({
        message: result.status === 'success' ? `${taskTitle} completed` : `${taskTitle} failed`,
        taskId,
        type: result.status === 'success' ? 'success' : 'error',
      });
    };

    const handleLog = ({
      level,
      message,
      taskId,
    }: {
      level: string;
      message: string;
      taskId?: string;
    }): void => {
      const type = level === 'error' ? 'error' : 'info';
      addLog({ message, ...(isNonEmptyString(taskId) && { taskId }), type });
    };

    const handleStdout = ({ data, taskId }: { data: string; taskId?: string }): void => {
      if (isNonNullish(data)) {
        addLog({ message: data, ...(isNonEmptyString(taskId) && { taskId }), type: 'stdout' });
      }
    };

    const handleStderr = ({ data, taskId }: { data: string; taskId?: string }): void => {
      if (isNonNullish(data)) {
        addLog({ message: data, ...(isNonEmptyString(taskId) && { taskId }), type: 'stderr' });
      }
    };

    // Subscribe to orchestrator events
    orchestrator.on('executionStart', handleExecutionStart);
    orchestrator.on('executionComplete', handleExecutionComplete);
    orchestrator.on('executionFailed', handleExecutionFailed);
    orchestrator.on('taskStart', handleTaskStart);
    orchestrator.on('taskProgress', handleTaskProgress);
    orchestrator.on('taskComplete', handleTaskComplete);
    orchestrator.on('log', handleLog);
    orchestrator.on('stdout', handleStdout);
    orchestrator.on('stderr', handleStderr);

    // Cleanup on unmount
    return (): void => {
      orchestrator.off('executionStart', handleExecutionStart);
      orchestrator.off('executionComplete', handleExecutionComplete);
      orchestrator.off('executionFailed', handleExecutionFailed);
      orchestrator.off('taskStart', handleTaskStart);
      orchestrator.off('taskProgress', handleTaskProgress);
      orchestrator.off('taskComplete', handleTaskComplete);
      orchestrator.off('log', handleLog);
      orchestrator.off('stdout', handleStdout);
      orchestrator.off('stderr', handleStderr);
    };
  }, [orchestrator, addLog, tasks]);

  // Calculate metrics
  const taskArray = [...tasks.values()];
  const completedTasks = taskArray.filter((t) => t.status === 'success').length;
  const failedTasks = taskArray.filter((t) => t.status === 'failure').length;
  const runningTasks = taskArray.filter((t) => t.status === 'running').length;
  const pendingTasks = taskArray.filter((t) => t.status === 'pending').length;

  // Calculate average task duration
  const averageTaskDuration =
    taskDurations.current.length > 0
      ? taskDurations.current.reduce((sum, d) => sum + d, 0) / taskDurations.current.length
      : undefined;

  // Calculate estimated time remaining
  let estimatedTimeRemaining: number | undefined;
  if (isNonNullish(averageTaskDuration) && pendingTasks > 0) {
    // Simple estimate based on average task duration and remaining tasks
    // Adjust for parallelism based on strategy
    const parallelFactor = runningTasks > 0 ? runningTasks : 1;
    estimatedTimeRemaining = (pendingTasks * averageTaskDuration) / parallelFactor;
  }

  const metrics: ExecutionMetrics = {
    ...(isNonNullish(averageTaskDuration) && { averageTaskDuration }),
    completedLayers: Math.max(
      0,
      ...taskArray
        .filter((t) => t.status === 'success' || t.status === 'failure')
        .map((t) => t.layer ?? 0),
    ),
    completedTasks,
    ...(isNonNullish(estimatedTimeRemaining) && { estimatedTimeRemaining }),
    failedTasks,
    runningTasks,
    ...(isNonNullish(executionStartTime) && { startTime: executionStartTime }),
    totalLayers: Math.max(0, ...taskArray.map((t) => t.layer ?? 0)) + 1,
    totalTasks: taskArray.length,
  };

  return {
    isComplete,
    logs,
    metrics,
    tasks,
  };
}
