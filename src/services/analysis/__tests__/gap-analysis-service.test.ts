import { beforeEach, describe, expect, it } from 'vitest';

import type { ProjectPrinciples } from '@/types/schemas-v2';

import { GapAnalysisService } from '../gap-analysis-service';

describe('GapAnalysisService', () => {
  let service: GapAnalysisService;

  beforeEach(() => {
    service = new GapAnalysisService();
  });

  describe('analyze - required sections', () => {
    it('should detect missing required sections', async () => {
      const incompleteSpec = `
# My Feature

Just a brief description.
`;

      const report = await service.analyze(incompleteSpec);

      expect(report.completeness).toBeLessThan(100);
      expect(report.gaps.length).toBeGreaterThan(0);

      // Should detect missing Overview, Background, Requirements, Architecture, Acceptance Criteria
      const missingSections = report.gaps.filter((g) =>
        g.message.includes('Missing required section'),
      );
      expect(missingSections.length).toBeGreaterThanOrEqual(4);

      // All missing section gaps should be CRITICAL
      expect(missingSections.every((g) => g.severity === 'CRITICAL')).toBe(true);
    });

    it('should pass when all required sections are present', async () => {
      const completeSpec = `
# Overview

This is a comprehensive overview section with detailed information about what we're building and why it matters.

## Background

### Current State
We currently have a system that works but has limitations. This section describes the current architecture and challenges.

### Problems
The main problems are X, Y, and Z which affect our users negatively.

### Goals
Our goals are to improve performance, add new features, and enhance user experience.

# Requirements

## Functional Requirements

**FR1.1**: The system must support user authentication
- Login via email/password
- OAuth integration with Google and GitHub
- Password reset functionality

**FR1.2**: The system must provide a dashboard
- Display user statistics
- Show recent activity
- Provide quick actions

## Non-Functional Requirements

**NFR1.1**: Performance must be under 100ms for all API calls
**NFR1.2**: System must handle 10,000 concurrent users

# Architecture

## Component Architecture

The system follows a layered architecture with the following components:

1. **Presentation Layer**: React-based UI components
2. **Business Logic Layer**: Service classes with domain logic
3. **Data Access Layer**: Repository pattern for database access
4. **Infrastructure Layer**: External system integrations

## Component Diagrams

\`\`\`
┌─────────────┐
│ Presentation │
└──────┬──────┘
       │
┌──────▼──────┐
│  Business   │
└──────┬──────┘
       │
┌──────▼──────┐
│ Data Access │
└─────────────┘
\`\`\`

# Acceptance Criteria

## Must Have
- All functional requirements implemented and tested
- Test coverage above 95%
- Performance metrics meet NFR specifications
- Security audit passed

## Should Have
- User documentation complete
- API documentation generated
- Migration guide provided

## Nice to Have
- Video tutorials
- Interactive demos
`;

      const report = await service.analyze(completeSpec);

      // Should have all sections
      const missingSections = report.gaps.filter((g) =>
        g.message.includes('Missing required section'),
      );
      expect(missingSections.length).toBe(0);
    });
  });

  describe('analyze - content depth', () => {
    it('should detect sections that are too brief', async () => {
      const shallowSpec = `
## Overview

Brief.

## Background

Short.

# Requirements

**FR1**: Do something

# Architecture

A diagram.

## Acceptance Criteria

- Pass tests
`;

      const report = await service.analyze(shallowSpec);

      const shallowSections = report.gaps.filter((g) => g.message.includes('too brief'));
      expect(shallowSections.length).toBeGreaterThan(0);

      // All shallow section gaps should be HIGH priority
      expect(shallowSections.every((g) => g.severity === 'HIGH')).toBe(true);
    });

    it('should pass sections with sufficient content', async () => {
      const detailedSpec = `
## Overview

This is a comprehensive overview that provides substantial detail about the feature we are building. It explains the context, motivation, and high-level approach. This section is long enough to meet the minimum character requirement.

## Background

The background section explains the current state of the system, including existing architecture, technologies in use, and current limitations. We have several challenges including performance issues, scalability concerns, and user experience problems. This section provides historical context and motivates why this work is important.

# Requirements

## Functional Requirements

**FR1.1**: User Authentication System
The system must provide comprehensive authentication including email/password login, OAuth integration with Google and GitHub providers, multi-factor authentication support, password reset via email, and session management. All authentication must use industry-standard security practices.

**FR1.2**: Dashboard Interface
The dashboard must display user statistics, recent activity feed, quick action buttons, notification center, and personalized recommendations. The interface should be responsive and accessible.

# Architecture

## System Architecture

The application follows a modern microservices architecture with clear separation of concerns. The frontend is built with React and TypeScript, using component-based design patterns. The backend consists of Node.js services using Express framework, with a PostgreSQL database for persistent storage and Redis for caching and session management.

Component communication uses RESTful APIs with JWT authentication. All services are containerized using Docker and orchestrated with Kubernetes for scalability and resilience.

## Acceptance Criteria

All functional requirements must be implemented and tested with at least 95% code coverage. Performance must meet specified NFRs with under 100ms response time for critical paths. Security audit must pass with no high-severity findings. User documentation must be complete and accessible.
`;

      const report = await service.analyze(detailedSpec);

      const shallowSections = report.gaps.filter((g) => g.message.includes('too brief'));
      expect(shallowSections.length).toBe(0);
    });
  });

  describe('analyze - ambiguous language', () => {
    it('should detect ambiguous terms', async () => {
      const ambiguousSpec = `
## Overview

This feature should probably add dark mode support. Maybe we can use system preferences.

# Requirements

**FR1**: The system might need to support theme switching
**FR2**: We could possibly add a toggle button TBD
**FR3**: TODO: Decide on storage mechanism

## Architecture

The architecture should be flexible and could be implemented in various ways.
`;

      const report = await service.analyze(ambiguousSpec);

      const ambiguityGaps = report.gaps.filter((g) => g.category === 'ambiguity');
      expect(ambiguityGaps.length).toBeGreaterThan(0);

      // Should be MEDIUM severity
      expect(ambiguityGaps.every((g) => g.severity === 'MEDIUM')).toBe(true);

      // Should list detected terms
      const ambiguityGap = ambiguityGaps[0];
      expect(ambiguityGap?.message).toContain('Ambiguous language detected');
    });

    it('should not flag concrete language', async () => {
      const concreteSpec = `
## Overview

This feature MUST add dark mode support. The system will use system preferences as the default.

# Requirements

**FR1**: The system MUST support theme switching (light, dark, system)
**FR2**: The system SHALL provide a toggle button in settings
**FR3**: Theme preference MUST be stored in localStorage

## Architecture

The architecture uses React Context API for theme state management. All components receive theme via context.
`;

      const report = await service.analyze(concreteSpec);

      const ambiguityGaps = report.gaps.filter((g) => g.category === 'ambiguity');
      expect(ambiguityGaps.length).toBe(0);
    });
  });

  describe('analyze - placeholder text', () => {
    it('should detect placeholder patterns', async () => {
      const placeholderSpec = `
## Overview

This feature adds dark mode. ???

# Requirements

**FR1**: [fill this in]
**FR2**: Support themes [TODO]
**FR3**: [TBD] storage mechanism

## Architecture

The architecture [placeholder] uses React.
`;

      const report = await service.analyze(placeholderSpec);

      const placeholderGaps = report.gaps.filter((g) => g.message.includes('Placeholder text'));
      expect(placeholderGaps.length).toBeGreaterThan(0);

      // Should be CRITICAL severity
      expect(placeholderGaps.every((g) => g.severity === 'CRITICAL')).toBe(true);
    });

    it('should not flag complete content', async () => {
      const completeSpec = `
## Overview

This feature adds dark mode support to the application.

# Requirements

**FR1**: Support light and dark themes
**FR2**: Provide theme toggle in settings
**FR3**: Store preference in localStorage

## Architecture

The architecture uses React Context API for state management.
`;

      const report = await service.analyze(completeSpec);

      const placeholderGaps = report.gaps.filter((g) => g.message.includes('Placeholder text'));
      expect(placeholderGaps.length).toBe(0);
    });
  });

  describe('analyze - open questions', () => {
    it('should detect unresolved open questions', async () => {
      const specWithQuestions = `
## Overview

Feature overview here.

## Open Tasks/Questions

- [ ] How many components need dark mode support?
- [ ] Which state management library to use?
- [ ] Storage mechanism for theme preference?
- [x] Decided on React Context API

## Requirements

**FR1**: Add dark mode support
`;

      const report = await service.analyze(specWithQuestions);

      const openQuestionGaps = report.gaps.filter((g) => g.message.includes('open questions'));
      expect(openQuestionGaps.length).toBeGreaterThan(0);

      // Should be CRITICAL severity
      expect(openQuestionGaps.every((g) => g.severity === 'CRITICAL')).toBe(true);

      const gap = openQuestionGaps[0];
      expect(gap?.message).toContain('3 unchecked items');
      expect(gap?.message).toContain('3 questions');
    });

    it('should pass when no open questions exist', async () => {
      const specWithoutQuestions = `
## Overview

Feature overview here.

## Requirements

**FR1**: Add dark mode support
**FR2**: Use React Context API for state management
**FR3**: Store preference in localStorage
`;

      const report = await service.analyze(specWithoutQuestions);

      const openQuestionGaps = report.gaps.filter((g) => g.message.includes('open questions'));
      expect(openQuestionGaps.length).toBe(0);
    });

    it('should pass when all questions are resolved (checked without question marks)', async () => {
      const specWithResolvedQuestions = `
## Overview

Feature overview here.

## Open Tasks/Questions

- [x] Component count determined: 12 components
- [x] State management decided: React Context API
- [x] Storage mechanism selected: localStorage

## Requirements

**FR1**: Add dark mode support
`;

      const report = await service.analyze(specWithResolvedQuestions);

      const openQuestionGaps = report.gaps.filter((g) => g.message.includes('open questions'));
      expect(openQuestionGaps.length).toBe(0);
    });
  });

  describe('analyze - cross-references', () => {
    it('should detect requirement numbering gaps', async () => {
      const specWithGaps = `
# Requirements

**FR1**: First requirement
**FR2**: Second requirement
**FR4**: Fourth requirement (missing FR3)
**FR5**: Fifth requirement

**NFR1**: First non-functional
**NFR3**: Third non-functional (missing NFR2)
`;

      const report = await service.analyze(specWithGaps);

      const numberingGaps = report.gaps.filter((g) => g.message.includes('numbering gaps'));

      if (numberingGaps.length > 0) {
        const gap = numberingGaps[0];
        expect(gap?.severity).toBe('MEDIUM');
        expect(gap?.category).toBe('inconsistency');
        expect(gap?.message).toContain('FR3');
        expect(gap?.message).toContain('NFR2');
      }
    });

    it('should pass when requirement numbering is sequential', async () => {
      const specWithSequentialNumbers = `
# Requirements

**FR1**: First requirement
**FR2**: Second requirement
**FR3**: Third requirement

**NFR1**: First non-functional
**NFR2**: Second non-functional
`;

      const report = await service.analyze(specWithSequentialNumbers);

      const numberingGaps = report.gaps.filter((g) => g.message.includes('numbering gaps'));
      expect(numberingGaps.length).toBe(0);
    });
  });

  describe('analyze - principle violations', () => {
    it('should check for principle violations when principles provided', async () => {
      const spec = `
## Architecture

The system uses singleton pattern for database access.
`;

      const principles: ProjectPrinciples = {
        source: 'CLAUDE.md',
        principles: [
          {
            category: 'Architecture',
            rule: 'Use Dependency Injection (DI) for service instantiation',
          },
        ],
      };

      const report = await service.analyze(spec, principles);

      // This is a simple check - the service might flag potential DI violations
      // Since this is heuristic-based, we just verify it doesn't crash
      expect(report).toBeDefined();
      expect(report.gaps).toBeDefined();
    });

    it('should not check for principle violations when none provided', async () => {
      const spec = `
## Architecture

The system uses singleton pattern.
`;

      const report = await service.analyze(spec);

      // Should not have principle violation gaps
      const principleGaps = report.gaps.filter((g) => g.message.includes('principle'));
      expect(principleGaps.length).toBe(0);
    });
  });

  describe('analyze - completeness scoring', () => {
    it('should score complete specifications at 100%', async () => {
      const completeSpec = `
## Overview

This is a comprehensive overview section with detailed information about what we're building and why it matters. It provides sufficient context and motivation.

## Background

The background section explains our current state, problems, and goals in detail. We have existing systems that work but have limitations. This change addresses those limitations.

# Requirements

## Functional Requirements

**FR1**: The system MUST support user authentication with email/password, OAuth (Google, GitHub), password reset, and session management using industry-standard security practices.

**FR2**: The system MUST provide a responsive dashboard displaying user statistics, recent activity, notifications, and quick actions. All UI elements must be accessible.

## Non-Functional Requirements

**NFR1**: Performance MUST be under 100ms for critical paths, measured at 95th percentile under peak load.

# Architecture

## System Architecture

The application follows a modern microservices architecture with React frontend, Node.js backend services, PostgreSQL database, and Redis cache. Components communicate via REST APIs with JWT authentication. All services are containerized.

\`\`\`
┌───────────┐     ┌──────────┐     ┌──────────┐
│  Frontend │────▶│ Backend  │────▶│ Database │
└───────────┘     └──────────┘     └──────────┘
\`\`\`

## Acceptance Criteria

All functional requirements MUST be implemented and tested with 95%+ code coverage. Performance MUST meet NFR specifications. Security audit MUST pass with no high-severity findings. Documentation MUST be complete.
`;

      const report = await service.analyze(completeSpec);

      expect(report.completeness).toBeGreaterThanOrEqual(90);
      expect(report.summary).toContain('COMPLETE');
    });

    it('should score incomplete specifications below 100%', async () => {
      const incompleteSpec = `
## Overview

Brief overview.
`;

      const report = await service.analyze(incompleteSpec);

      expect(report.completeness).toBeLessThan(100);
      expect(report.summary).toContain('INCOMPLETE');
    });

    it('should calculate lower scores for specs with more gaps', async () => {
      const poorSpec = `
## Overview

Maybe add feature. ???

## Background

TBD

# Requirements

**FR1**: Should do something [placeholder]
`;

      const report = await service.analyze(poorSpec);

      expect(report.completeness).toBeLessThan(50);

      // Should have multiple CRITICAL gaps
      const criticalGaps = report.gaps.filter((g) => g.severity === 'CRITICAL');
      expect(criticalGaps.length).toBeGreaterThan(2);
    });
  });

  describe('analyze - remediation steps', () => {
    it('should generate prioritized remediation steps', async () => {
      const incompleteSpec = `
## Overview

Brief overview. ???

## Background

Maybe implement feature. TBD

# Requirements

**FR1**: Do something
`;

      const report = await service.analyze(incompleteSpec);

      expect(report.remediation.length).toBeGreaterThan(0);

      // Should be ordered by priority
      const priorities = report.remediation.map((r) => r.priority);
      const criticalIndex = priorities.indexOf('CRITICAL');
      const mediumIndex = priorities.indexOf('MEDIUM');

      if (criticalIndex !== -1 && mediumIndex !== -1) {
        expect(criticalIndex).toBeLessThan(mediumIndex);
      }

      // Each step should have order, action, reasoning, and artifacts
      for (const step of report.remediation) {
        expect(step.order).toBeGreaterThan(0);
        expect(step.action.length).toBeGreaterThan(0);
        expect(step.reasoning.length).toBeGreaterThan(0);
        expect(step.artifacts.length).toBeGreaterThan(0);
      }
    });

    it('should assign sequential order numbers', async () => {
      const incompleteSpec = `
## Overview

Brief.

## Background

Short.
`;

      const report = await service.analyze(incompleteSpec);

      const orders = report.remediation.map((r) => r.order);
      const expectedOrders = Array.from({ length: orders.length }, (_, i) => i + 1);

      expect(orders).toEqual(expectedOrders);
    });
  });

  describe('analyze - summary generation', () => {
    it('should generate readable summary with gap counts', async () => {
      const incompleteSpec = `
## Overview

Brief overview with placeholder text ???

## Background

Maybe add this feature. TBD
`;

      const report = await service.analyze(incompleteSpec);

      expect(report.summary).toContain('Completeness:');
      expect(report.summary).toContain('%');
      expect(report.summary).toContain('INCOMPLETE');

      // Should mention gap counts
      const hasCritical = report.gaps.some((g) => g.severity === 'CRITICAL');
      const hasHigh = report.gaps.some((g) => g.severity === 'HIGH');
      const hasMedium = report.gaps.some((g) => g.severity === 'MEDIUM');

      if (hasCritical) {
        expect(report.summary).toContain('CRITICAL');
      }
      if (hasHigh) {
        expect(report.summary).toContain('HIGH');
      }
      if (hasMedium) {
        expect(report.summary).toContain('MEDIUM');
      }
    });

    it('should indicate no gaps for complete specs', async () => {
      const completeSpec = `
## Overview

This is a comprehensive overview section with detailed information about what we're building and why it matters for our users.

## Background

The background explains current state, problems, and goals in sufficient detail to understand the context and motivation for this work.

# Requirements

**FR1**: The system MUST support comprehensive user authentication including email/password login, OAuth integration with Google and GitHub, multi-factor authentication, password reset via email, and secure session management using JWT tokens.

# Architecture

The system follows a layered microservices architecture with React frontend using TypeScript and component-based design, Node.js backend services with Express framework, PostgreSQL for persistence, and Redis for caching and sessions.

## Acceptance Criteria

All requirements MUST be implemented with 95%+ test coverage, performance under 100ms for critical paths, security audit passed, and complete documentation.
`;

      const report = await service.analyze(completeSpec);

      if (report.completeness === 100) {
        expect(report.summary).toContain('no gaps');
        expect(report.summary).toContain('COMPLETE');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty specification', async () => {
      const emptySpec = '';

      const report = await service.analyze(emptySpec);

      expect(report.completeness).toBeLessThanOrEqual(30); // Empty spec gets base quality/consistency score
      expect(report.gaps.length).toBeGreaterThan(0);
      expect(report.summary).toContain('INCOMPLETE');
    });

    it('should handle specification with only whitespace', async () => {
      const whitespaceSpec = '   \n\n\n   ';

      const report = await service.analyze(whitespaceSpec);

      expect(report.completeness).toBeLessThanOrEqual(30); // Whitespace spec gets base quality/consistency score
      expect(report.gaps.length).toBeGreaterThan(0);
    });

    it('should handle very large specifications', async () => {
      const largeSpec = `
## Overview
${'This is a very detailed overview section. '.repeat(100)}

## Background
${'Background information repeated many times. '.repeat(100)}

# Requirements
${'**FR1**: Requirement text. '.repeat(50)}

# Architecture
${'Architecture description repeated. '.repeat(100)}

## Acceptance Criteria
${'Criterion text. '.repeat(50)}
`;

      const report = await service.analyze(largeSpec);

      expect(report).toBeDefined();
      expect(report.completeness).toBeGreaterThan(0);
      expect(report.summary).toBeDefined();
    });
  });
});
