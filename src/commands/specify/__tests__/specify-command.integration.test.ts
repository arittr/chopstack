import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { vi } from 'vitest';

import type { SpecifyCommandOptions } from '@/types/cli';
import type { PlanV2 } from '@/types/schemas-v2';

import { createDecomposerAgent } from '@/adapters/agents';
import { createDefaultDependencies } from '@/commands';
import { SpecifyCommand } from '@/commands/specify/specify-command';

// Mock only external dependencies, not our own classes
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock('@/adapters/agents');

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);
const mockCreateDecomposerAgent = vi.mocked(createDecomposerAgent);

describe('SpecifyCommand integration tests', () => {
  // Realistic specification output
  const mockSpecification = `# Feature Specification: Dark Mode Toggle

## Overview

This specification describes the implementation of a dark mode toggle feature for the application settings.
The feature will allow users to switch between light and dark color schemes, with the preference persisted
across sessions.

## Background

### Current State

The application currently supports only light mode. Users have requested a dark mode option for improved
accessibility and reduced eye strain, especially during extended use or in low-light environments.

### Problems

- No dark mode support limits accessibility
- User preference cannot be saved
- Color schemes are hardcoded without theming support

### Goals

- Implement comprehensive dark mode theming system
- Allow users to toggle between light and dark modes
- Persist user preference across sessions
- Maintain visual consistency across all components

## Requirements

### Functional Requirements

**FR1.1: Theme Toggle Control**

The system MUST provide a toggle control in the application settings that allows users to switch
between light and dark modes.

**FR1.2: Theme Persistence**

The system MUST persist the user's theme preference in localStorage and apply it on subsequent visits.

**FR1.3: System Theme Detection**

The system SHOULD detect the user's system theme preference and use it as the initial default.

**FR1.4: Theme Application**

The system MUST apply the selected theme to all application components consistently.

**FR2.1: Settings Integration**

The theme toggle MUST be integrated into the existing settings page.

**FR2.2: Immediate Visual Feedback**

Theme changes MUST be applied immediately without requiring a page refresh.

### Non-Functional Requirements

**NFR1.1: Performance**

Theme switching MUST complete in under 50ms to ensure smooth user experience.

**NFR1.2: Accessibility**

Dark mode colors MUST meet WCAG 2.1 Level AA contrast requirements (4.5:1 for text).

**NFR1.3: Maintainability**

Theme values MUST be centralized in a theme configuration file for easy updates.

## Design

### Architecture

\`\`\`
┌─────────────────────┐
│   Settings Page     │
│  (User Interface)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   ThemeProvider     │
│  (Context/State)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    localStorage     │
│  (Persistence)      │
└─────────────────────┘
\`\`\`

### Component Structure

\`\`\`
src/
├── theme/
│   ├── ThemeProvider.tsx     # Context provider for theme state
│   ├── useTheme.ts           # Custom hook for theme access
│   ├── themes.ts             # Theme configuration (light/dark)
│   └── types.ts              # Theme type definitions
├── components/
│   └── ThemeToggle.tsx       # Toggle component for settings
└── pages/
    └── SettingsPage.tsx      # Updated with theme toggle
\`\`\`

### File Structure

- \`src/theme/ThemeProvider.tsx\` - New theme context provider
- \`src/theme/useTheme.ts\` - New theme access hook
- \`src/theme/themes.ts\` - New theme configuration
- \`src/theme/types.ts\` - New theme types
- \`src/components/ThemeToggle.tsx\` - New toggle component
- \`src/pages/SettingsPage.tsx\` - Modified to add toggle

### Technology Choices

- **State Management**: React Context API (aligns with existing patterns)
- **Persistence**: localStorage (simple, synchronous)
- **Styling**: CSS variables for theme values (follows existing approach)

## Implementation Plan

1. Create theme types and configuration (S task)
2. Implement ThemeProvider context (M task)
3. Build ThemeToggle component (S task)
4. Integrate toggle into SettingsPage (S task)
5. Add tests for theme functionality (M task)
6. Update documentation (S task)

## Success Metrics

### Quantitative

- Test coverage: 90%+ for theme-related code
- Theme switch time: <50ms (measured)
- Zero regressions in existing functionality
- WCAG 2.1 Level AA contrast ratios verified

### Qualitative

- Users can easily find and use the theme toggle
- Theme transitions are smooth and visually pleasing
- Code follows project patterns and conventions
- Dark mode colors are visually consistent across components

## Risks & Mitigations

**Risk 1: Performance Impact**
- Likelihood: Low
- Impact: Medium
- Mitigation: Use CSS variables for instant re-theming without re-renders

**Risk 2: Component Coverage**
- Likelihood: Medium
- Impact: High
- Mitigation: Comprehensive component audit and testing

**Risk 3: Accessibility Issues**
- Likelihood: Low
- Impact: High
- Mitigation: Contrast ratio testing and WCAG compliance verification

## Acceptance Criteria

- [ ] Theme toggle appears in settings page
- [ ] Clicking toggle switches between light and dark modes
- [ ] Theme preference persists across browser sessions
- [ ] All components render correctly in both themes
- [ ] Dark mode meets WCAG 2.1 Level AA contrast requirements
- [ ] Theme switching completes in under 50ms
- [ ] Tests achieve 90%+ coverage for theme functionality
- [ ] Documentation updated with theme usage instructions
`;

  const mockAgent = {
    decompose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock agent that returns a plan with the specification in description
    // This simulates the real behavior where the agent generates comprehensive specs
    mockAgent.decompose = vi.fn().mockImplementation(async (_prompt: string) => {
      // Simulate real agent behavior: generate spec based on prompt + codebase context
      await Promise.resolve(); // Ensure async
      const plan: PlanV2 = {
        name: 'Specification Plan',
        description: mockSpecification,
        strategy: 'sequential',
        tasks: [], // Empty tasks array - we only care about the description
      };
      return plan;
    });

    mockCreateDecomposerAgent.mockResolvedValue(mockAgent);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate comprehensive spec from brief prompt using real services', async () => {
    const options: SpecifyCommandOptions = {
      prompt: 'Add dark mode toggle to application settings',
      verbose: false,
    };

    const deps = createDefaultDependencies();
    const command = new SpecifyCommand(deps);
    const result = await command.execute(options);

    expect(result).toBe(0);

    // Verify real agent was called
    expect(mockCreateDecomposerAgent).toHaveBeenCalledWith('claude');

    // Verify directory structure created
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('.chopstack/specs/add-dark-mode-toggle-to'),
      { recursive: true },
    );

    // Verify spec.md written
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('spec.md'),
      expect.any(String),
      'utf8',
    );

    // Verify codebase.md written
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('codebase.md'),
      expect.any(String),
      'utf8',
    );
  });

  it('should use real CodebaseAnalysisService with caching', async () => {
    const options: SpecifyCommandOptions = {
      prompt: 'Implement user authentication',
      cwd: '/test/project',
      verbose: false,
    };

    const deps = createDefaultDependencies();
    const command = new SpecifyCommand(deps);

    // Execute twice to test caching behavior
    await command.execute(options);
    await command.execute(options);

    // Files should be written twice (once per execution)
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('should use real SpecificationService with validation', async () => {
    // Mock agent returns spec with placeholder text (should be rejected)
    const invalidSpec = `# Spec\n\n## Overview\n\nTODO: Fill this in later\n\n## Requirements\n\nTBD\n`;

    // First call for codebase analysis returns normal plan
    // Second call for spec generation returns invalid spec
    mockAgent.decompose
      .mockResolvedValueOnce({
        name: 'Codebase Analysis',
        description: 'Analysis complete',
        strategy: 'sequential',
        tasks: [],
      })
      .mockResolvedValueOnce({
        name: 'Invalid Spec',
        description: invalidSpec,
        strategy: 'sequential',
        tasks: [],
      });

    const options: SpecifyCommandOptions = {
      prompt: 'Add feature',
      verbose: false,
    };

    const deps = createDefaultDependencies();
    const command = new SpecifyCommand(deps);
    const result = await command.execute(options);

    // Should fail due to validation
    expect(result).toBe(1);
  });

  it('should handle input file reading with real file operations', async () => {
    const inputContent = `Implement a comprehensive authentication system with the following requirements:

- User registration with email verification
- Login/logout functionality
- Password reset flow
- Session management
- JWT token handling
- Role-based access control

The system should integrate with the existing user service and follow security best practices.`;

    mockReadFile.mockResolvedValue(inputContent);

    const options: SpecifyCommandOptions = {
      input: 'requirements.txt',
      verbose: false,
    };

    const deps = createDefaultDependencies();
    const command = new SpecifyCommand(deps);
    const result = await command.execute(options);

    expect(result).toBe(0);

    // Verify file was read
    expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('requirements.txt'), 'utf8');

    // Verify files were written
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('should generate spec with all required sections', async () => {
    const options: SpecifyCommandOptions = {
      prompt: 'Add API rate limiting',
      verbose: false,
    };

    const deps = createDefaultDependencies();
    const command = new SpecifyCommand(deps);
    const result = await command.execute(options);

    expect(result).toBe(0);

    // Find the spec.md write call (should be second write, after codebase.md)
    const specWriteCall = mockWriteFile.mock.calls.find((call) =>
      (call[0] as string).includes('spec.md'),
    );
    const writtenSpec = specWriteCall?.[1] as string;

    // Verify all required sections are present
    expect(writtenSpec).toContain('## Overview');
    expect(writtenSpec).toContain('## Background');
    expect(writtenSpec).toContain('## Requirements');
    expect(writtenSpec).toContain('## Design');
    expect(writtenSpec).toContain('## Success Metrics');
    expect(writtenSpec).toContain('## Acceptance Criteria');
  });

  it('should handle agent retry logic on failure', async () => {
    // First call (codebase analysis) fails on first attempt but succeeds on retry
    // Second call (spec generation) succeeds immediately
    mockAgent.decompose
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({
        name: 'Codebase Analysis',
        description: 'Analysis complete',
        strategy: 'sequential',
        tasks: [],
      })
      .mockResolvedValueOnce({
        name: 'Specification',
        description: mockSpecification,
        strategy: 'sequential',
        tasks: [],
      });

    const options: SpecifyCommandOptions = {
      prompt: 'Add feature',
      verbose: false,
    };

    const deps = createDefaultDependencies();
    const command = new SpecifyCommand(deps);
    const result = await command.execute(options);

    // Should succeed on retry
    expect(result).toBe(0);
    // Verify files were written
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('should create output directory recursively', async () => {
    const options: SpecifyCommandOptions = {
      prompt: 'Add feature',
      verbose: false,
    };

    const deps = createDefaultDependencies();
    const command = new SpecifyCommand(deps);
    await command.execute(options);

    // Verify mkdir was called with recursive option
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('.chopstack/specs/add-feature'),
      { recursive: true },
    );
  });

  it('should work end-to-end with real service integration', async () => {
    const options: SpecifyCommandOptions = {
      prompt: 'Build a notification system with email and SMS support',
      cwd: '/test/project',
      verbose: true,
    };

    const deps = createDefaultDependencies();
    const command = new SpecifyCommand(deps);
    const result = await command.execute(options);

    expect(result).toBe(0);

    // Verify full workflow executed
    expect(mockCreateDecomposerAgent).toHaveBeenCalled(); // Agent created
    expect(mockMkdir).toHaveBeenCalled(); // Directory creation
    expect(mockWriteFile).toHaveBeenCalled(); // Files written

    // Verify spec quality
    const specWriteCall = mockWriteFile.mock.calls.find((call) =>
      (call[0] as string).includes('spec.md'),
    );
    const spec = specWriteCall?.[1] as string;
    expect(spec.length).toBeGreaterThan(800); // Minimum spec length
  });
});
