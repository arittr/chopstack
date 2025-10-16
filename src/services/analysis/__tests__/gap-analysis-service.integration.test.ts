import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import type { ProjectPrinciples } from '@/types/schemas-v2';

import { GapAnalysisService } from '../gap-analysis-service';

describe('GapAnalysisService Integration', () => {
  let service: GapAnalysisService;

  beforeEach(() => {
    service = new GapAnalysisService();
  });

  describe('real-world specification analysis', () => {
    it('should analyze chopstack v2 phase 2 specification', async () => {
      // Load actual spec file from project
      const specPath = join(process.cwd(), 'specs/chopstack-v2_phase2/spec.md');
      const specContent = readFileSync(specPath, 'utf8');

      const report = await service.analyze(specContent);

      // Verify report structure
      expect(report).toBeDefined();
      expect(report.completeness).toBeGreaterThanOrEqual(0);
      expect(report.completeness).toBeLessThanOrEqual(100);
      expect(report.gaps).toBeInstanceOf(Array);
      expect(report.remediation).toBeInstanceOf(Array);
      expect(report.summary).toBeDefined();
      expect(report.summary.length).toBeGreaterThan(0);

      // This spec should be high quality (it was carefully written)
      expect(report.completeness).toBeGreaterThan(70);

      // Should have proper gap structure
      for (const gap of report.gaps) {
        expect(gap.id).toBeDefined();
        expect(gap.severity).toMatch(/^(CRITICAL|HIGH|MEDIUM|LOW)$/);
        expect(gap.category).toMatch(/^(gap|duplication|ambiguity|inconsistency)$/);
        expect(gap.message).toBeDefined();
        expect(gap.artifacts).toBeInstanceOf(Array);
      }

      // Should have proper remediation structure
      for (const step of report.remediation) {
        expect(step.priority).toMatch(/^(CRITICAL|HIGH|MEDIUM|LOW)$/);
        expect(step.order).toBeGreaterThan(0);
        expect(step.action).toBeDefined();
        expect(step.reasoning).toBeDefined();
        expect(step.artifacts).toBeInstanceOf(Array);
      }
    });

    it('should analyze specification with project principles', async () => {
      const specContent = `
## Overview

This feature implements a new service using dependency injection pattern and ts-pattern for control flow.

## Background

Current system lacks proper service architecture. This change introduces layered architecture with DI container.

# Requirements

**FR1**: The system MUST implement service layer using dependency injection for all business logic components.
**FR2**: The system MUST use ts-pattern for complex conditional logic instead of switch statements.
**FR3**: The system MUST achieve 95% test coverage using Vitest framework.

# Architecture

## Service Layer Architecture

All services are instantiated through DI container. Pattern:

\`\`\`typescript
class MyService {
  constructor(private readonly deps: ServiceDependencies) {}
}
\`\`\`

Control flow uses ts-pattern:

\`\`\`typescript
const result = match(command)
  .with({ type: 'create' }, handleCreate)
  .with({ type: 'update' }, handleUpdate)
  .exhaustive();
\`\`\`

## Acceptance Criteria

All requirements implemented with 95%+ test coverage. DI pattern used throughout. Pattern matching replaces all switch statements.
`;

      const principles: ProjectPrinciples = {
        source: 'CLAUDE.md',
        principles: [
          {
            category: 'Architecture',
            rule: 'Use Dependency Injection for service instantiation',
          },
          {
            category: 'Code Style',
            rule: 'Use ts-pattern for complex conditional logic instead of switch statements',
          },
          {
            category: 'Testing',
            rule: 'Unit tests should achieve 95%+ coverage',
          },
        ],
      };

      const report = await service.analyze(specContent, principles);

      // Spec follows principles, so should score well
      expect(report.completeness).toBeGreaterThan(80);

      // Should have minimal principle violation gaps
      const principleViolations = report.gaps.filter((g) =>
        g.message.toLowerCase().includes('principle'),
      );

      // The simple heuristic check might not find violations in this well-aligned spec
      expect(principleViolations.length).toBeLessThanOrEqual(1);
    });

    it('should handle incomplete real-world specification', async () => {
      const incompleteSpec = `
# Feature: Add Dark Mode

## Overview

Add dark mode to the application.

## Open Tasks/Questions

- [ ] Which components need dark mode support?
- [ ] Should we support system preferences?
- [ ] What storage mechanism to use?

# Requirements

**FR1**: Add dark mode toggle

Maybe we should support light, dark, and system modes. TBD on the exact implementation.
`;

      const report = await service.analyze(incompleteSpec);

      // Should detect multiple issues
      expect(report.completeness).toBeLessThan(70);

      // Should detect open questions
      const openQuestions = report.gaps.filter((g) => g.message.includes('open questions'));
      expect(openQuestions.length).toBeGreaterThan(0);
      expect(openQuestions[0]?.severity).toBe('CRITICAL');

      // Should detect missing sections
      const missingSections = report.gaps.filter((g) =>
        g.message.includes('Missing required section'),
      );
      expect(missingSections.length).toBeGreaterThan(0);

      // Should detect ambiguous language
      const ambiguity = report.gaps.filter((g) => g.category === 'ambiguity');
      expect(ambiguity.length).toBeGreaterThan(0);

      // Should provide actionable remediation
      expect(report.remediation.length).toBeGreaterThan(0);
      expect(report.remediation[0]?.priority).toBe('CRITICAL');
    });

    it('should handle specification with multiple requirement types', async () => {
      const specWithMixedRequirements = `
## Overview

Comprehensive feature with multiple requirement types and detailed architecture.

## Background

Current state, problems, and goals explained in detail.

# Requirements

## Functional Requirements

**FR1**: User authentication MUST support email/password login
**FR2**: Dashboard MUST display user statistics
**FR3**: System MUST send email notifications

## Non-Functional Requirements

**NFR1**: Performance MUST be under 100ms for API calls
**NFR2**: System MUST handle 10,000 concurrent users
**NFR3**: Data MUST be encrypted at rest and in transit

## Technical Requirements

**TR1**: Use PostgreSQL for data persistence
**TR2**: Use Redis for caching and session management
**TR3**: Deploy using Docker containers

# Architecture

Microservices architecture with React frontend, Node.js backend, PostgreSQL database, and Redis cache.

## Acceptance Criteria

All functional requirements implemented with 95% test coverage. Performance metrics met. Security audit passed.
`;

      const report = await service.analyze(specWithMixedRequirements);

      // Should handle multiple requirement types
      expect(report).toBeDefined();

      // Should not report numbering gaps for different prefixes
      const numberingGaps = report.gaps.filter((g) => g.message.includes('numbering gaps'));

      // Each sequence (FR, NFR, TR) is independent
      for (const gap of numberingGaps) {
        // If there are gaps, they should be within a single prefix
        expect(gap.message).toMatch(/FR\d+|NFR\d+|TR\d+/);
      }
    });

    it('should provide comprehensive analysis for complex specification', async () => {
      const complexSpec = `
# Specification: Advanced Feature Implementation

## Overview

This specification details the implementation of a complex multi-component feature that integrates with existing systems and introduces new architectural patterns. The feature addresses critical user needs and performance bottlenecks.

## Background

### Current State

The current system has several limitations including poor performance, limited scalability, and lack of modern UI patterns.

### Problems

1. API response times exceed 500ms under load
2. Database queries are not optimized
3. UI doesn't support responsive design
4. No offline capabilities

### Goals

1. Reduce API response time to under 100ms
2. Implement database query optimization
3. Create responsive UI components
4. Add offline support with service workers

# Requirements

## Functional Requirements

**FR1.1**: API Performance Optimization
The system MUST optimize all API endpoints to respond within 100ms at 95th percentile under peak load conditions.

**FR1.2**: Database Query Optimization
The system MUST implement database indexing, query optimization, and connection pooling to reduce query times by 80%.

**FR2.1**: Responsive UI Components
The system MUST provide responsive UI components that adapt to screen sizes from 320px to 4K displays.

**FR2.2**: Offline Support
The system MUST implement service workers to cache critical assets and provide offline functionality.

## Non-Functional Requirements

**NFR1.1**: Performance Targets
- API endpoints: <100ms (95th percentile)
- Database queries: <50ms average
- UI rendering: <16ms per frame (60 FPS)
- Bundle size: <500KB gzipped

**NFR1.2**: Scalability
- Support 50,000 concurrent users
- Handle 1M requests per hour
- Auto-scale based on load

**NFR2.1**: Reliability
- 99.9% uptime SLA
- Automatic failover
- Data backup every 6 hours

# Architecture

## System Architecture

The system follows a microservices architecture with the following components:

### Frontend Layer
- React 19 with TypeScript
- Component library with Storybook
- State management with Zustand
- Service workers for offline support

### API Layer
- Node.js with Express
- GraphQL API for flexible queries
- REST API for legacy support
- Rate limiting and caching

### Business Logic Layer
- Domain services with DI
- Event-driven architecture
- CQRS pattern for complex operations

### Data Layer
- PostgreSQL with read replicas
- Redis for caching
- Elasticsearch for full-text search

### Infrastructure
- Docker containerization
- Kubernetes orchestration
- AWS deployment
- CloudFlare CDN

## Component Diagrams

\`\`\`
┌─────────────────────────────────────────────┐
│              Frontend Layer                 │
│  (React + TypeScript + Service Workers)     │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│               API Layer                     │
│      (GraphQL + REST + Rate Limiting)       │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         Business Logic Layer                │
│    (Domain Services + Event Bus + CQRS)     │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│             Data Layer                      │
│  (PostgreSQL + Redis + Elasticsearch)       │
└─────────────────────────────────────────────┘
\`\`\`

# Acceptance Criteria

## Must Have

- All functional requirements (FR1.1, FR1.2, FR2.1, FR2.2) fully implemented
- Performance metrics meet NFR1.1 targets
- Test coverage above 95% for all components
- Security audit passed with no high-severity findings
- Load testing completed with 50K concurrent users
- Documentation complete and reviewed

## Should Have

- Monitoring dashboard with real-time metrics
- Automated deployment pipeline
- Feature flags for gradual rollout
- User analytics integration
- A/B testing framework

## Nice to Have

- Admin dashboard for system management
- Advanced analytics and reporting
- Mobile app companion
- Browser extensions
`;

      const report = await service.analyze(complexSpec);

      // Complex spec should score very well
      expect(report.completeness).toBeGreaterThan(90);

      // Should have all required sections
      const missingSections = report.gaps.filter((g) =>
        g.message.includes('Missing required section'),
      );
      expect(missingSections.length).toBe(0);

      // Should not have shallow sections
      const shallowSections = report.gaps.filter((g) => g.message.includes('too brief'));
      expect(shallowSections.length).toBe(0);

      // Should have minimal gaps overall
      expect(report.gaps.length).toBeLessThan(5);

      // Summary should reflect high quality
      expect(report.summary).toContain('COMPLETE');
    });
  });

  describe('gap categorization and severity', () => {
    it('should assign correct severities to different gap types', async () => {
      const specWithVariousIssues = `
## Overview

Brief overview with ambiguous language: maybe add this feature.

## Background

Short background section.

# Requirements

**FR1**: Requirement with placeholder [fill this in]
**FR2**: Another requirement ???

## Open Questions

- [ ] Unresolved question about implementation?

# Architecture

Architecture section is too brief.
`;

      const report = await service.analyze(specWithVariousIssues);

      // Check that severities are correctly assigned
      const criticalGaps = report.gaps.filter((g) => g.severity === 'CRITICAL');
      const highGaps = report.gaps.filter((g) => g.severity === 'HIGH');
      const mediumGaps = report.gaps.filter((g) => g.severity === 'MEDIUM');

      // Should have CRITICAL gaps for missing sections, placeholders, open questions
      expect(criticalGaps.length).toBeGreaterThan(0);

      // Should have HIGH gaps for shallow sections
      expect(highGaps.length).toBeGreaterThan(0);

      // Should have MEDIUM gaps for ambiguous language
      expect(mediumGaps.length).toBeGreaterThan(0);

      // Remediation should prioritize CRITICAL first
      const firstRemediation = report.remediation[0];
      expect(firstRemediation?.priority).toBe('CRITICAL');
    });
  });

  describe('performance with large specifications', () => {
    it('should handle large specifications efficiently', async () => {
      // Generate a large specification
      const sections = [
        `## Overview\n${'Detailed overview. '.repeat(500)}`,
        `## Background\n${'Background information. '.repeat(500)}`,
        `# Requirements\n${Array.from({ length: 50 }, (_, i) => `**FR${i + 1}**: Requirement ${i + 1}\n`).join('')}`,
        `# Architecture\n${'Architecture details. '.repeat(500)}`,
        `## Acceptance Criteria\n${'Criteria details. '.repeat(500)}`,
      ];

      const largeSpec = sections.join('\n\n');

      const startTime = Date.now();
      const report = await service.analyze(largeSpec);
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);

      // Should still produce valid report
      expect(report).toBeDefined();
      expect(report.completeness).toBeGreaterThanOrEqual(0);
      expect(report.completeness).toBeLessThanOrEqual(100);
    });
  });

  describe('remediation step ordering', () => {
    it('should order remediation steps by severity then sequence', async () => {
      const specWithMultipleIssues = `
## Overview

Brief overview.

## Background

TBD background section.

# Requirements

**FR1**: Requirement maybe needs work
`;

      const report = await service.analyze(specWithMultipleIssues);

      // Verify remediation is ordered correctly
      let lastPriority = 'CRITICAL';
      const priorityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

      for (const step of report.remediation) {
        const currentPriorityIndex = priorityOrder.indexOf(step.priority);
        const lastPriorityIndex = priorityOrder.indexOf(lastPriority);

        // Current priority should be >= last priority (same or lower in hierarchy)
        expect(currentPriorityIndex).toBeGreaterThanOrEqual(lastPriorityIndex);

        lastPriority = step.priority;
      }

      // Order numbers should be sequential
      const orders = report.remediation.map((r) => r.order);
      const expectedOrders = Array.from({ length: orders.length }, (_, i) => i + 1);
      expect(orders).toEqual(expectedOrders);
    });
  });
});
