# Creating New Commands

With the new command architecture, creating commands is incredibly simple!

## Quick Start - Create a Command in 3 Steps

### 1. Create your command class

```typescript
import { RegisterCommand, BaseCommand } from '@/commands';

@RegisterCommand('my-command')
export class MyCommand extends BaseCommand {
  constructor(deps: CommandDependencies) {
    super('my-command', 'Description of my command', deps);
  }

  execute(args: MyCommandArgs): number {
    this.logger.info('Running my command!');
    // Your command logic here
    return 0; // Return 0 for success, 1 for failure
  }
}
```

### 2. Import it in the loader

Add to `src/commands/cli-dispatcher.ts`:

```typescript
await import('./my-command');
```

### 3. That's it! 🎉

Your command is now available:

```bash
chopstack my-command
```

## Benefits of This Architecture

### ✅ Zero Configuration
- No manual registration needed
- No wiring in main CLI file
- Decorator handles everything

### ✅ Automatic Dependency Injection
- Logger automatically available as `this.logger`
- Context (cwd, env) available as `this.context`
- Easy to test with mock dependencies

### ✅ Self-Documenting
- Commands show up in help automatically
- Description visible in CLI help
- Type-safe arguments

### ✅ Testable by Design
- Pass mock dependencies for testing
- No global state
- Pure command logic

## Complete Example: File Counter Command

```typescript
import { readdir } from 'node:fs/promises';
import chalk from 'chalk';
import { RegisterCommand, BaseCommand } from '@/commands';

@RegisterCommand('count-files')
export class CountFilesCommand extends BaseCommand {
  constructor(deps: CommandDependencies) {
    super('count-files', 'Count files in a directory', deps);
  }

  async execute(args: { dir?: string }): Promise<number> {
    const dir = args.dir ?? '.';

    try {
      const files = await readdir(dir);
      const count = files.length;

      this.logger.info(chalk.green(`📁 Found ${count} files in ${dir}`));
      return 0;
    } catch (error) {
      this.logger.error(chalk.red(`Failed to read directory: ${error}`));
      return 1;
    }
  }
}
```

## Advanced Features

### Using Custom Dependencies

```typescript
@RegisterCommand('db-command')
export class DatabaseCommand extends BaseCommand {
  private db: Database;

  constructor(deps: CommandDependencies & { db?: Database }) {
    super('db-command', 'Database operations', deps);
    this.db = deps.db ?? new Database();
  }
}
```

### Async Execution

```typescript
async execute(args: Args): Promise<number> {
  const data = await fetchData();
  // Async operations work seamlessly
  return 0;
}
```

### Environment-Aware Commands

```typescript
execute(args: Args): number {
  const apiKey = this.context.env.API_KEY;
  const workDir = this.context.cwd;
  // Access environment and working directory
  return 0;
}
```

## Comparison: Old vs New

### Old Way (Manual Wiring) ❌
```typescript
// command.ts
export function myCommand(args) { /* ... */ }

// cli.ts
import { myCommand } from './command';
if (command === 'my-command') {
  return myCommand(args);
}
```

### New Way (Auto-Registration) ✅
```typescript
// my-command.ts
@RegisterCommand('my-command')
export class MyCommand extends BaseCommand {
  execute(args) { /* ... */ }
}
// That's it! Auto-registered!
```

## Testing Commands

```typescript
describe('MyCommand', () => {
  it('should execute successfully', async () => {
    const mockLogger = { info: vi.fn(), error: vi.fn() };
    const deps = {
      context: {
        logger: mockLogger,
        cwd: '/test',
        env: {}
      }
    };

    const command = new MyCommand(deps);
    const result = await command.execute({ arg: 'value' });

    expect(result).toBe(0);
    expect(mockLogger.info).toHaveBeenCalled();
  });
});
```

## Summary

The new architecture makes command creation:
- **Simple**: Just extend BaseCommand and add decorator
- **Clean**: No manual wiring or registration
- **Testable**: Built-in dependency injection
- **Discoverable**: Auto-appears in help
- **Type-safe**: Full TypeScript support

Creating a new command is now a 1-minute task instead of 10 minutes of wiring!