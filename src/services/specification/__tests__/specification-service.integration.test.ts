import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DecomposerAgent } from '@/core/agents/interfaces';
import type { PlanV2 } from '@/types/schemas-v2';

import { CodebaseAnalysisService } from '@/services/analysis/codebase-analysis-service';

import { SpecificationService } from '../specification-service';

describe('SpecificationService Integration', () => {
  let testDir: string;
  let service: SpecificationService;
  let mockAgent: DecomposerAgent;
  let codebaseAnalysisService: CodebaseAnalysisService;

  beforeEach(() => {
    // Create temporary test directory
    testDir = join(tmpdir(), `chopstack-spec-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Initialize Git repository
    mkdirSync(join(testDir, '.git'), { recursive: true });
    writeFileSync(join(testDir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    mkdirSync(join(testDir, '.git', 'refs', 'heads'), { recursive: true });
    writeFileSync(join(testDir, '.git', 'refs', 'heads', 'main'), 'abc123\n');

    // Create package.json
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-project',
          description: 'Test project for specification generation',
          version: '1.0.0',
          dependencies: {
            react: '^18.0.0',
            'ts-pattern': '^5.0.0',
          },
          devDependencies: {
            typescript: '^5.0.0',
            vitest: '^1.0.0',
            tsup: '^8.0.0',
          },
          packageManager: 'pnpm@9.0.0',
        },
        null,
        2,
      ),
    );

    // Create basic directory structure
    mkdirSync(join(testDir, 'src', 'services'), { recursive: true });
    mkdirSync(join(testDir, 'src', 'types'), { recursive: true });
    mkdirSync(join(testDir, 'src', 'components'), { recursive: true });

    // Mock agent with realistic responses
    mockAgent = {
      decompose: vi.fn().mockResolvedValue({
        name: 'Feature Specification',
        description: `# Feature Specification: Dark Mode Toggle

## Overview

This specification describes the implementation of a dark mode toggle feature for the
application settings page. The feature enables users to switch between light and dark
color themes, improving accessibility and user experience for users who prefer darker
interfaces or work in low-light environments.

## Background

### Current State

The application currently uses a fixed light color theme with no ability for users to
customize the appearance. All UI components use hardcoded light theme colors, and there
is no infrastructure for managing theme state or persistence.

### Problems This Solves

1. **Accessibility Limitations**: Users with light sensitivity or who work at night have
   no way to reduce screen brightness through a dark theme.

2. **Missing Modern UX Feature**: Dark mode is now a standard feature in modern applications,
   and its absence makes the application feel dated.

3. **User Preference Ignored**: No mechanism exists to respect user preference or system
   theme settings.

### Goals

1. Implement a theme toggle control in application settings
2. Support both light and dark color schemes across all components
3. Persist user theme preference across browser sessions
4. Detect and respect system theme preference on first load
5. Maintain WCAG 2.1 AA accessibility standards in both themes

## Requirements

### Functional Requirements

**FR1.1: Theme Toggle Control**

The settings page MUST display a toggle switch component that allows users to switch
between light and dark themes. The toggle MUST clearly indicate the current theme state.

**FR1.2: Theme State Management**

The application MUST implement a React Context to manage theme state globally. This
context MUST provide the current theme value and a function to toggle between themes.

**FR1.3: Theme Persistence**

When a user changes the theme, the preference MUST be saved to browser localStorage
with key 'app-theme-preference'. The saved preference MUST be restored on subsequent
visits.

**FR1.4: System Theme Detection**

On first visit (no saved preference), the application SHOULD detect the system theme
preference using the 'prefers-color-scheme' media query and apply it automatically.

**FR1.5: Smooth Theme Transitions**

Theme changes MUST animate smoothly using CSS transitions. The transition MUST NOT
cause layout shift or flash of incorrect colors.

**FR1.6: Component Theme Support**

All existing UI components MUST support both light and dark themes. Components MUST
read theme values from CSS custom properties.

**FR1.7: CSS Variable Architecture**

All theme-specific colors MUST be defined as CSS custom properties (CSS variables).
The application MUST have separate variable definitions for light and dark themes.

**FR1.8: Theme Context Provider**

A ThemeProvider component MUST wrap the application root. This provider MUST load
the saved theme preference on mount and apply it to the document.

**FR1.9: Default Theme Fallback**

If no theme preference is saved and system preference cannot be detected, the
application MUST default to the light theme.

**FR1.10: Theme Value Validation**

The application MUST validate theme values before applying them. Only 'light' and
'dark' values MUST be accepted. Invalid values MUST default to 'light'.

### Non-Functional Requirements

**NFR1.1: Performance Requirement**

Theme switching MUST complete within 50 milliseconds from toggle click to visual
update completion. This ensures a responsive, instantaneous feel.

**NFR1.2: Bundle Size Impact**

The dark mode implementation (including CSS, context, and components) MUST add less
than 5 kilobytes gzipped to the application bundle.

**NFR1.3: Browser Compatibility**

The feature MUST work in all modern browsers that support CSS custom properties:
Chrome 49+, Firefox 31+, Safari 9.1+, Edge 15+. This covers 95%+ of users.

**NFR1.4: Test Coverage Target**

All theme-related code (context, hooks, components, utilities) MUST have at least
95% test coverage including edge cases and error conditions.

## Design

### Architecture

\`\`\`
┌─────────────────────────────────────────────────┐
│              Application Root                   │
│  ┌───────────────────────────────────────────┐  │
│  │        ThemeProvider                      │  │
│  │  - Loads saved preference                 │  │
│  │  - Detects system preference              │  │
│  │  - Provides theme state & toggle()        │  │
│  └─────────────────┬───────────────────────┬─┘  │
│                    │                       │    │
│                    ▼                       ▼    │
│          ┌──────────────────┐    ┌──────────────────┐
│          │  Settings Page   │    │  Other Pages     │
│          │  ┌────────────┐  │    │  - Read theme    │
│          │  │ThemeToggle │  │    │  - Auto updates  │
│          │  └────────────┘  │    └──────────────────┘
│          └──────────────────┘                        │
└──────────────────────────────────────────────────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │   localStorage      │
         │  'app-theme-       │
         │   preference'       │
         └─────────────────────┘
\`\`\`

### Component Specifications

#### ThemeProvider Component

**Responsibilities:**
- Load theme preference from localStorage on mount
- Detect system theme if no preference saved
- Provide theme state via React Context
- Provide toggle function to switch themes
- Apply theme to document root element

**State:**
- Current theme: 'light' | 'dark'

**Methods:**
- toggleTheme(): void - Switches between light and dark

#### useTheme Hook

**Returns:**
- theme: 'light' | 'dark' - Current theme
- toggleTheme: () => void - Function to toggle theme

**Usage:**
\`\`\`typescript
const { theme, toggleTheme } = useTheme();
\`\`\`

#### ThemeToggle Component

**Props:** None (uses useTheme hook internally)

**Behavior:**
- Displays current theme icon (sun/moon)
- Calls toggleTheme on click
- Shows visual feedback on hover/click

### File Structure

\`\`\`
src/
├── contexts/
│   └── ThemeContext.tsx          # Theme context and provider
├── hooks/
│   └── useTheme.ts               # Custom hook for theme access
├── components/
│   ├── ThemeToggle.tsx           # Toggle switch component
│   └── __tests__/
│       └── ThemeToggle.test.tsx  # Component tests
├── styles/
│   └── themes.css                # Theme CSS variables
└── types/
    └── theme.ts                  # TypeScript type definitions
\`\`\`

### Technology Choices

- **React Context**: For global theme state (aligns with existing patterns)
- **localStorage**: For preference persistence (simple, synchronous)
- **CSS Custom Properties**: For theme values (performant, browser-native)
- **prefers-color-scheme**: For system detection (web standard)

## Implementation Plan

### Phase 1: Foundation (Sequential)

1. **Create theme types** (S complexity)
   - Define Theme type
   - Define ThemeContextValue type
   - Export from types/theme.ts

2. **Implement ThemeContext** (M complexity)
   - Create context with initial values
   - Implement ThemeProvider component
   - Add localStorage integration
   - Add system theme detection

### Phase 2: UI Components (Parallel)

3. **Create useTheme hook** (S complexity)
   - Implement hook that consumes ThemeContext
   - Add error handling for context usage outside provider

4. **Create ThemeToggle component** (M complexity)
   - Build toggle UI with icons
   - Connect to useTheme hook
   - Add accessibility attributes

### Phase 3: Styling (Parallel with Phase 2)

5. **Define CSS theme variables** (M complexity)
   - Create light theme variables
   - Create dark theme variables
   - Add smooth transitions

### Phase 4: Testing & Documentation (Sequential)

6. **Write comprehensive tests** (L complexity)
   - Unit tests for context and provider
   - Component tests for ThemeToggle
   - Integration tests for full flow

7. **Update documentation** (S complexity)
   - Add usage guide to README
   - Document theme customization
   - Add troubleshooting section

## Success Metrics

### Quantitative Metrics

- **Test Coverage**: 95%+ coverage for all theme-related code
- **Performance**: Theme switch completes in <50ms (measured with performance.now())
- **Bundle Size**: Dark mode adds <5KB gzipped (measured with webpack-bundle-analyzer)
- **Accessibility**: Zero WCAG 2.1 AA violations (validated with axe-core)
- **Browser Support**: Works in 95%+ browsers (tested in BrowserStack)

### Qualitative Metrics

- **Visual Quality**: Smooth transitions with no flashing or layout shift
- **User Experience**: Toggle is intuitive and discoverable in settings
- **Code Quality**: Implementation follows existing project patterns
- **Documentation**: Clear usage instructions and examples provided
- **Maintainability**: Future developers can easily customize or extend themes

## Risks & Mitigations

### Risk 1: CSS Specificity Conflicts

**Likelihood**: Medium
**Impact**: Medium - Could cause inconsistent theming in some components
**Mitigation**:
- Use CSS custom properties at :root level
- Avoid !important declarations
- Test all components thoroughly in both themes
- Document CSS specificity rules

### Risk 2: Browser Compatibility Issues

**Likelihood**: Low
**Impact**: High - Could break functionality in older browsers
**Mitigation**:
- Test in target browsers (Chrome, Firefox, Safari, Edge)
- Provide graceful fallback for unsupported browsers
- Use feature detection for localStorage and prefers-color-scheme
- Consider polyfills if needed

### Risk 3: Performance Degradation

**Likelihood**: Low
**Impact**: Medium - Slow theme switching would hurt UX
**Mitigation**:
- Benchmark theme switching performance
- Use CSS transitions instead of JavaScript animations
- Optimize re-render performance with React.memo if needed
- Profile with React DevTools

### Risk 4: Incomplete Component Coverage

**Likelihood**: Medium
**Impact**: Medium - Some components might not theme correctly
**Mitigation**:
- Audit all components for hardcoded colors
- Create visual regression tests
- Manual testing checklist for all pages
- Gradual rollout with feature flag

## Acceptance Criteria

### Must Have (MUST)

- [ ] Theme toggle switch appears in settings page
- [ ] Clicking toggle switches between light and dark themes
- [ ] Theme preference persists across browser sessions (localStorage)
- [ ] System theme preference detected on first visit
- [ ] All UI components render correctly in both themes
- [ ] WCAG 2.1 AA contrast ratios maintained in both themes (4.5:1 text, 3:1 UI)
- [ ] Theme switching completes in under 50 milliseconds
- [ ] Test coverage reaches at least 95% for theme code
- [ ] No console errors or warnings during theme switching

### Should Have (SHOULD)

- [ ] Smooth CSS transitions between theme changes (200ms duration)
- [ ] Theme toggle shows visual feedback (hover, active states)
- [ ] Documentation includes usage guide and customization instructions
- [ ] Settings page has a "Theme" section with clear label

### Nice to Have (NICE_TO_HAVE)

- [ ] Keyboard shortcut for theme toggle (e.g., Ctrl+Shift+T)
- [ ] Theme preview before applying
- [ ] Additional theme variants (high contrast, reduced motion)
- [ ] Theme synchronization across browser tabs
`,
        strategy: 'phased-parallel',
        tasks: [],
      } satisfies PlanV2),
    };

    // Create real CodebaseAnalysisService
    codebaseAnalysisService = new CodebaseAnalysisService(mockAgent);

    // Create SpecificationService with real codebase analysis
    service = new SpecificationService(mockAgent, codebaseAnalysisService);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should generate specification with real codebase analysis', async () => {
    // Arrange
    const prompt = 'Add dark mode toggle to application settings';

    // Act
    const result = await service.generate({ prompt, cwd: testDir });

    // Assert
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(800);

    // Verify structure
    expect(result).toContain('## Overview');
    expect(result).toContain('## Background');
    expect(result).toContain('## Requirements');
    expect(result).toContain('## Design');
    expect(result).toContain('## Success Metrics');
    expect(result).toContain('## Acceptance Criteria');

    // Verify no placeholders
    expect(result).not.toContain('TODO');
    expect(result).not.toContain('TBD');
    expect(result).not.toContain('???');
    expect(result).not.toContain('[fill this in]');

    // Verify agent was called with codebase context
    expect(mockAgent.decompose).toHaveBeenCalledWith(
      expect.stringContaining('Test project for specification generation'),
      testDir,
      expect.any(Object),
    );
  });

  it('should include technology stack from codebase in generation prompt', async () => {
    // Arrange
    const prompt = 'Add user authentication';

    // Act
    await service.generate({ prompt, cwd: testDir });

    // Assert
    const decomposeCalls = vi.mocked(mockAgent.decompose).mock.calls;
    expect(decomposeCalls.length).toBeGreaterThan(0);

    if (decomposeCalls[0] !== undefined) {
      const [generationPrompt] = decomposeCalls[0];
      // Should include tech stack from package.json
      expect(generationPrompt).toContain('React');
      expect(generationPrompt).toContain('TypeScript');
      expect(generationPrompt).toContain('Vitest');
    }
  });

  it('should handle brief prompt and expand into comprehensive spec', async () => {
    // Arrange
    const briefPrompt = 'Add search functionality';

    // Act
    const result = await service.generate({ prompt: briefPrompt, cwd: testDir });

    // Assert
    expect(result).toBeTruthy();
    // Expanded specification should be much longer than brief prompt
    expect(result.length).toBeGreaterThan(briefPrompt.length * 50);

    // Should have detailed requirements
    expect(result).toMatch(/FR\d+\.\d+:/); // Functional requirements
    expect(result).toMatch(/NFR\d+\.\d+:/); // Non-functional requirements

    // Should have architecture diagrams
    expect(result).toContain('```'); // Code blocks for diagrams

    // Should have acceptance criteria
    expect(result).toMatch(/- \[ ]/); // Checkbox items
  });

  it('should validate all acceptance criteria from task definition', async () => {
    // Arrange
    const prompt = 'Add notification system';

    // Act
    const result = await service.generate({ prompt, cwd: testDir });

    // Assert - Check against task acceptance criteria
    // 1. Generates 800+ character specifications from brief prompts (comprehensive content)
    expect(result.length).toBeGreaterThan(800); // Minimum 800 characters for comprehensive spec

    // 2. Includes all required sections
    expect(result).toContain('## Overview');
    expect(result).toContain('## Background');
    expect(result).toContain('## Requirements');
    expect(result).toContain('## Design'); // or ## Architecture
    expect(result).toContain('## Success Metrics');
    expect(result).toContain('## Acceptance Criteria');

    // 3. No placeholder text
    expect(result).not.toContain('TODO');
    expect(result).not.toContain('TBD');
    expect(result).not.toContain('???');

    // 4. Agent was called (retry would happen on failure)
    expect(mockAgent.decompose).toHaveBeenCalled();
  });
});
