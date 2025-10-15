import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DecomposerAgent } from '@/core/agents/interfaces';
import type { PlanV2 } from '@/types/schemas-v2';

import { SpecificationService } from '../specification-service';

describe('SpecificationService', () => {
  let service: SpecificationService;
  let mockAgent: DecomposerAgent;
  let mockCodebaseAnalysisService: {
    analyze: (cwd: string) => Promise<{
      examples: unknown;
      findings: unknown;
      observations: string[];
      relatedFeatures: Array<{
        description?: string;
        files: string[];
        name: string;
        relevance?: string;
      }>;
      summary: string;
    }>;
  };

  beforeEach(() => {
    // Mock agent
    mockAgent = {
      decompose: vi.fn(),
    };

    // Mock codebase analysis service
    mockCodebaseAnalysisService = {
      analyze: vi.fn(),
    };

    service = new SpecificationService(mockAgent, mockCodebaseAnalysisService);
  });

  describe('generate', () => {
    it('should generate specification from brief prompt', async () => {
      // Arrange
      const prompt = 'Add dark mode toggle to settings';
      const cwd = '/test/repo';

      const mockCodebaseAnalysis = {
        summary: '# Test Project\n\nA TypeScript project with React.',
        findings: { techStack: { languages: ['TypeScript'], frameworks: ['React'] } },
        observations: ['Uses React Context', 'TypeScript strict mode'],
        examples: {},
        relatedFeatures: [
          {
            name: 'Theme System',
            files: ['src/theme/provider.tsx'],
            description: 'Manages theme',
            relevance: 'Similar pattern',
          },
        ],
      };

      const mockPlan: PlanV2 = {
        name: 'Dark Mode Specification',
        description: `# Feature Specification: Dark Mode

## Overview

Add dark mode toggle to application settings for improved user experience.

## Background

### Current State

The application currently only supports light theme.

### Problems

- Users cannot switch to dark mode
- No theme persistence

### Goals

- Implement dark mode toggle
- Persist user preference

## Requirements

### Functional Requirements

**FR1.1: Theme Toggle**

The application MUST provide a toggle switch in settings to enable/disable dark mode.

**FR1.2: Theme Persistence**

The application MUST persist the user's theme preference across sessions.

**FR1.3: Theme Detection**

The application SHOULD detect system theme preference on first load.

**FR1.4: Smooth Transitions**

Theme changes MUST animate smoothly without jarring visual transitions.

**FR1.5: Accessibility**

All theme variants MUST maintain WCAG 2.1 AA contrast ratios.

**FR1.6: Component Support**

All existing components MUST support both light and dark themes.

**FR1.7: CSS Variables**

Theme colors MUST be defined using CSS custom properties for easy customization.

**FR1.8: Theme Context**

A React Context MUST provide theme state and toggle function throughout the app.

**FR1.9: Default Theme**

The application MUST default to light theme if no preference is stored.

**FR1.10: Theme Validation**

The application MUST validate theme preference values to prevent invalid states.

### Non-Functional Requirements

**NFR1.1: Performance**

Theme switching MUST complete in under 50ms to ensure smooth user experience.

**NFR1.2: Bundle Size**

Dark mode implementation MUST add less than 5KB gzipped to the bundle.

**NFR1.3: Browser Support**

Dark mode MUST work in all browsers supporting CSS custom properties (95%+ coverage).

**NFR1.4: Test Coverage**

All theme-related code MUST have at least 95% test coverage.

## Design

### Architecture

\`\`\`
┌─────────────────┐
│ Settings Page   │
│  ┌──────────┐   │
│  │  Toggle  │   │
│  └────┬─────┘   │
└───────┼─────────┘
        │
        ▼
┌─────────────────┐
│ ThemeContext    │
│  - state        │
│  - toggle()     │
└───────┬─────────┘
        │
        ▼
┌─────────────────┐
│ localStorage    │
│  theme: 'dark'  │
└─────────────────┘
\`\`\`

### File Structure

- src/contexts/ThemeContext.tsx - Theme context provider
- src/hooks/useTheme.ts - Custom hook for theme access
- src/components/ThemeToggle.tsx - Toggle switch component
- src/styles/themes.css - Theme CSS variables
- src/types/theme.ts - Theme type definitions

## Implementation Plan

1. Create theme types and constants
2. Implement ThemeContext with localStorage
3. Create ThemeToggle component
4. Define CSS variables for themes
5. Update existing components
6. Add comprehensive tests

## Success Metrics

### Quantitative

- Test coverage: 95%+ for theme code
- Theme switch time: <50ms
- Bundle size increase: <5KB gzipped
- Zero visual regressions

### Qualitative

- Smooth visual transitions
- Intuitive toggle placement
- Consistent theme application
- Clear documentation

## Risks & Mitigations

**Risk 1: CSS Specificity Conflicts**
- Likelihood: Medium
- Impact: Medium
- Mitigation: Use CSS custom properties and avoid !important

**Risk 2: Browser Compatibility**
- Likelihood: Low
- Impact: High
- Mitigation: Test in target browsers, provide fallbacks

**Risk 3: Performance Impact**
- Likelihood: Low
- Impact: Medium
- Mitigation: Benchmark theme switching, optimize if needed

## Acceptance Criteria

- [ ] Dark mode toggle appears in settings page
- [ ] Clicking toggle switches between light and dark themes
- [ ] Theme preference persists across browser sessions
- [ ] All components render correctly in both themes
- [ ] WCAG 2.1 AA contrast ratios maintained in both themes
- [ ] Theme switching completes in under 50ms
- [ ] Test coverage is at least 95%
- [ ] Documentation updated with theme usage
`,
        strategy: 'sequential',
        tasks: [],
      };

      vi.mocked(mockCodebaseAnalysisService.analyze).mockResolvedValue(mockCodebaseAnalysis);
      vi.mocked(mockAgent.decompose).mockResolvedValue(mockPlan);

      // Act
      const result = await service.generate({ prompt, cwd });

      // Assert
      expect(result).toBe(mockPlan.description);
      expect(result).toContain('## Overview');
      expect(result).toContain('## Background');
      expect(result).toContain('## Requirements');
      expect(result).toContain('## Design');
      expect(result).toContain('## Success Metrics');
      expect(result).toContain('## Acceptance Criteria');
      expect(result.length).toBeGreaterThan(800);
      expect(mockCodebaseAnalysisService.analyze).toHaveBeenCalledWith(cwd);
      expect(mockAgent.decompose).toHaveBeenCalledWith(
        expect.stringContaining(prompt),
        cwd,
        expect.objectContaining({ verbose: false }),
      );
    });

    it('should reject empty prompt', async () => {
      // Arrange
      const prompt = '';
      const cwd = '/test/repo';

      // Act & Assert
      await expect(service.generate({ prompt, cwd })).rejects.toThrow(
        'Prompt is required and cannot be empty',
      );
    });

    it('should reject prompt that is too short', async () => {
      // Arrange
      const prompt = 'short';
      const cwd = '/test/repo';

      // Act & Assert
      await expect(service.generate({ prompt, cwd })).rejects.toThrow(
        'Prompt too short: 5 characters (minimum 10)',
      );
    });

    it('should reject specification with placeholder text', async () => {
      // Arrange
      const prompt = 'Add dark mode toggle to settings';
      const cwd = '/test/repo';

      const mockCodebaseAnalysis = {
        summary: '# Test Project',
        findings: {},
        observations: [],
        examples: {},
        relatedFeatures: [],
      };

      const mockPlan: PlanV2 = {
        name: 'Dark Mode',
        description: `# Feature Specification

## Overview

TODO: Add overview

## Background

TBD

## Requirements

[fill this in]

## Design

???

## Success Metrics

Quantitative: TBD

## Acceptance Criteria

- [ ] TODO: Add criteria
`,
        strategy: 'sequential',
        tasks: [],
      };

      vi.mocked(mockCodebaseAnalysisService.analyze).mockResolvedValue(mockCodebaseAnalysis);
      vi.mocked(mockAgent.decompose).mockResolvedValue(mockPlan);

      // Act & Assert
      await expect(service.generate({ prompt, cwd })).rejects.toThrow(
        'Specification contains placeholder text',
      );
    });

    it('should reject specification missing required sections', async () => {
      // Arrange
      const prompt = 'Add dark mode toggle to settings';
      const cwd = '/test/repo';

      const mockCodebaseAnalysis = {
        summary: '# Test Project',
        findings: {},
        observations: [],
        examples: {},
        relatedFeatures: [],
      };

      const mockPlan: PlanV2 = {
        name: 'Dark Mode',
        description: `# Feature Specification

## Overview

Add dark mode to the application.

## Background

Current state and goals.
`,
        strategy: 'sequential',
        tasks: [],
      };

      vi.mocked(mockCodebaseAnalysisService.analyze).mockResolvedValue(mockCodebaseAnalysis);
      vi.mocked(mockAgent.decompose).mockResolvedValue(mockPlan);

      // Act & Assert
      await expect(service.generate({ prompt, cwd })).rejects.toThrow(
        'Specification missing required sections',
      );
    });

    it('should retry on agent failure and succeed on second attempt', async () => {
      // Arrange
      const prompt = 'Add dark mode toggle to settings';
      const cwd = '/test/repo';

      const mockCodebaseAnalysis = {
        summary: '# Test Project',
        findings: {},
        observations: [],
        examples: {},
        relatedFeatures: [],
      };

      const validPlan: PlanV2 = {
        name: 'Dark Mode',
        description: `# Feature Specification

## Overview

Add dark mode toggle to application settings for improved user experience.
This feature will allow users to switch between light and dark themes.

## Background

### Current State

The application currently only supports light theme.

### Problems

- Users cannot switch to dark mode
- No theme persistence
- Limited accessibility options

### Goals

- Implement dark mode toggle
- Persist user preference
- Maintain WCAG compliance

## Requirements

### Functional Requirements

**FR1.1: Theme Toggle**

The application MUST provide a toggle switch in settings.

**FR1.2: Theme Persistence**

The application MUST persist theme preference.

**FR1.3: Theme Detection**

The application SHOULD detect system theme.

**FR1.4: Smooth Transitions**

Theme changes MUST animate smoothly.

**FR1.5: Accessibility**

All themes MUST maintain WCAG 2.1 AA contrast.

**FR1.6: Component Support**

All components MUST support both themes.

**FR1.7: CSS Variables**

Theme colors MUST use CSS custom properties.

**FR1.8: Theme Context**

React Context MUST provide theme state.

**FR1.9: Default Theme**

Application MUST default to light theme.

**FR1.10: Theme Validation**

Application MUST validate theme values.

### Non-Functional Requirements

**NFR1.1: Performance**

Theme switching MUST complete in under 50ms.

**NFR1.2: Bundle Size**

Implementation MUST add less than 5KB gzipped.

**NFR1.3: Browser Support**

MUST work in browsers with CSS custom properties.

## Design

### Architecture

\`\`\`
┌──────────┐
│ Settings │
└─────┬────┘
      │
      ▼
┌──────────┐
│  Theme   │
│ Context  │
└──────────┘
\`\`\`

### File Structure

- src/contexts/ThemeContext.tsx
- src/hooks/useTheme.ts
- src/components/ThemeToggle.tsx

## Success Metrics

### Quantitative

- Test coverage: 95%+
- Theme switch: <50ms
- Bundle: <5KB gzipped

### Qualitative

- Smooth transitions
- Intuitive interface
- Consistent application

## Risks & Mitigations

**Risk 1: CSS Conflicts**
- Likelihood: Medium
- Impact: Medium
- Mitigation: Use CSS custom properties

## Acceptance Criteria

- [ ] Dark mode toggle in settings
- [ ] Theme preference persists
- [ ] All components support both themes
- [ ] WCAG 2.1 AA maintained
- [ ] 95%+ test coverage
`,
        strategy: 'sequential',
        tasks: [],
      };

      vi.mocked(mockCodebaseAnalysisService.analyze).mockResolvedValue(mockCodebaseAnalysis);
      vi.mocked(mockAgent.decompose)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(validPlan);

      // Act
      const result = await service.generate({ prompt, cwd });

      // Assert
      expect(result).toBe(validPlan.description);
      expect(mockAgent.decompose).toHaveBeenCalledTimes(2);
    });

    it('should fail after 3 retry attempts', async () => {
      // Arrange
      const prompt = 'Add dark mode toggle to settings';
      const cwd = '/test/repo';

      const mockCodebaseAnalysis = {
        summary: '# Test Project',
        findings: {},
        observations: [],
        examples: {},
        relatedFeatures: [],
      };

      vi.mocked(mockCodebaseAnalysisService.analyze).mockResolvedValue(mockCodebaseAnalysis);
      vi.mocked(mockAgent.decompose).mockRejectedValue(new Error('Persistent error'));

      // Act & Assert
      await expect(service.generate({ prompt, cwd })).rejects.toThrow(
        'Failed to generate specification after 3 attempts',
      );
      expect(mockAgent.decompose).toHaveBeenCalledTimes(3);
    });

    it('should include codebase context in generation prompt', async () => {
      // Arrange
      const prompt = 'Add dark mode toggle';
      const cwd = '/test/repo';

      const mockCodebaseAnalysis = {
        summary: '# TypeScript React Project\n\nModern web application.',
        findings: { techStack: { languages: ['TypeScript'], frameworks: ['React', 'Vitest'] } },
        observations: ['Uses Vite', 'Strict TypeScript'],
        examples: { component: 'export const Comp: React.FC = () => {}' },
        relatedFeatures: [
          {
            name: 'Auth System',
            files: ['src/auth/provider.tsx', 'src/hooks/useAuth.ts'],
            description: 'Manages authentication',
            relevance: 'Similar context pattern',
          },
        ],
      };

      const mockPlan: PlanV2 = {
        name: 'Dark Mode',
        description: `# Feature Specification

## Overview

Add dark mode toggle to application settings. This feature enables users to switch
between light and dark themes for improved accessibility and user preference support.

## Background

### Current State

The application uses a fixed light theme without user customization options.

### Problems

- No dark mode support limits accessibility
- Users cannot customize appearance
- Missing modern UX feature

### Goals

- Implement theme toggle functionality
- Support system preference detection
- Persist user theme choice

## Requirements

### Functional Requirements

**FR1.1: Theme Toggle UI**

The settings page MUST display a toggle switch for theme selection.

**FR1.2: Theme State Management**

Application MUST maintain theme state using React Context.

**FR1.3: Theme Persistence**

Theme preference MUST persist in localStorage across sessions.

**FR1.4: System Theme Detection**

Application SHOULD detect and respect system theme preference on first load.

**FR1.5: Theme Transition**

Theme changes MUST animate smoothly without layout shift.

**FR1.6: Component Theming**

All UI components MUST support both light and dark color schemes.

**FR1.7: CSS Variable System**

Theme colors MUST be defined as CSS custom properties.

**FR1.8: Accessibility Compliance**

Both themes MUST meet WCAG 2.1 AA contrast requirements.

**FR1.9: Default Behavior**

Application MUST default to light theme if no preference exists.

**FR1.10: Input Validation**

Theme values MUST be validated before applying.

### Non-Functional Requirements

**NFR1.1: Performance Target**

Theme switching MUST complete within 50 milliseconds.

**NFR1.2: Bundle Impact**

Dark mode code MUST add less than 5KB gzipped to bundle.

**NFR1.3: Browser Compatibility**

Feature MUST work in all modern browsers (95%+ market share).

## Design

### Architecture

\`\`\`
┌───────────────────┐
│  SettingsPage     │
│  ┌─────────────┐  │
│  │ ThemeToggle │  │
│  └──────┬──────┘  │
└─────────┼─────────┘
          │
          ▼
┌─────────────────────┐
│   ThemeContext      │
│   - theme: string   │
│   - toggle()        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   localStorage      │
│   key: 'app-theme'  │
└─────────────────────┘
\`\`\`

### File Structure

- src/contexts/ThemeContext.tsx - Theme provider and context
- src/hooks/useTheme.ts - Custom hook for theme access
- src/components/ThemeToggle.tsx - Toggle UI component
- src/styles/themes.css - Theme CSS variables
- src/types/theme.ts - TypeScript type definitions

## Success Metrics

### Quantitative

- Test coverage: 95%+ for theme-related code
- Theme switch performance: <50ms
- Bundle size impact: <5KB gzipped
- Zero accessibility violations

### Qualitative

- Smooth visual transitions between themes
- Intuitive toggle control placement
- Consistent theme application across components
- Clear usage documentation

## Risks & Mitigations

**Risk 1: CSS Specificity Issues**
- Likelihood: Medium
- Impact: Medium
- Mitigation: Use CSS custom properties, avoid !important

**Risk 2: Browser Support**
- Likelihood: Low
- Impact: High
- Mitigation: Test in target browsers, provide graceful fallbacks

## Acceptance Criteria

- [ ] Theme toggle appears in settings page
- [ ] Toggle switches between light and dark themes
- [ ] Theme preference persists across sessions
- [ ] System theme detection works on first load
- [ ] All components render correctly in both themes
- [ ] WCAG 2.1 AA contrast maintained
- [ ] Theme switch completes in <50ms
- [ ] 95%+ test coverage achieved
`,
        strategy: 'sequential',
        tasks: [],
      };

      vi.mocked(mockCodebaseAnalysisService.analyze).mockResolvedValue(mockCodebaseAnalysis);
      vi.mocked(mockAgent.decompose).mockResolvedValue(mockPlan);

      // Act
      await service.generate({ prompt, cwd });

      // Assert
      const generationCall = vi.mocked(mockAgent.decompose).mock.calls[0];
      expect(generationCall).toBeDefined();

      if (generationCall !== undefined) {
        const [generationPrompt] = generationCall;
        expect(generationPrompt).toContain('TypeScript React Project');
        expect(generationPrompt).toContain('Auth System');
        expect(generationPrompt).toContain('Uses Vite');
      }
    });

    it('should handle plan without description field', async () => {
      // Arrange
      const prompt = 'Add feature';
      const cwd = '/test/repo';

      const mockCodebaseAnalysis = {
        summary: '# Test',
        findings: {},
        observations: [],
        examples: {},
        relatedFeatures: [],
      };

      const mockPlan = {
        name: 'Feature',
        strategy: 'sequential',
        tasks: [],
        // No description field
      };

      vi.mocked(mockCodebaseAnalysisService.analyze).mockResolvedValue(mockCodebaseAnalysis);
      vi.mocked(mockAgent.decompose).mockResolvedValue(mockPlan as PlanV2);

      // Act
      const result = await service.generate({ prompt, cwd });

      // Assert
      expect(result).toBeTruthy();
      expect(result).toContain('## Overview');
      expect(result).toContain('## Background');
      expect(result).toContain('## Requirements');
    });
  });
});
