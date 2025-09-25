// import type { OrchestratorTaskResult } from './types';

// /**
//  * Base error class for orchestration errors
//  */
// export abstract class OrchestrationError extends Error {
//   constructor(
//     message: string,
//     public readonly taskId: string,
//     public readonly details?: Record<string, unknown>,
//   ) {
//     super(message);
//     this.name = this.constructor.name;
//     Object.setPrototypeOf(this, new.target.prototype);
//   }
// }

// /**
//  * Error thrown when a task execution fails
//  */
// export class TaskExecutionError extends OrchestrationError {
//   constructor(
//     message: string,
//     taskId: string,
//     public readonly result?: OrchestratorTaskResult,
//     public readonly exitCode?: number,
//     details?: Record<string, unknown>,
//   ) {
//     super(message, taskId, details);
//   }
// }

// /**
//  * Error thrown when spawning a process fails
//  */
// export class ProcessSpawnError extends OrchestrationError {
//   constructor(
//     message: string,
//     taskId: string,
//     public readonly command: string,
//     public readonly args: string[],
//     public readonly originalError?: Error,
//     details?: Record<string, unknown>,
//   ) {
//     super(message, taskId, details);
//   }
// }

// /**
//  * Error thrown when command construction fails
//  */
// export class CommandBuildError extends OrchestrationError {
//   constructor(
//     message: string,
//     taskId: string,
//     public readonly mode: string,
//     details?: Record<string, unknown>,
//   ) {
//     super(message, taskId, details);
//   }
// }

// /**
//  * Error thrown when output parsing fails
//  */
// export class OutputParsingError extends OrchestrationError {
//   constructor(
//     message: string,
//     taskId: string,
//     public readonly output: string,
//     public readonly parseError?: Error,
//     details?: Record<string, unknown>,
//   ) {
//     super(message, taskId, details);
//   }
// }
