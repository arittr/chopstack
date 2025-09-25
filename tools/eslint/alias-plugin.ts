/* eslint-disable @typescript-eslint/naming-convention, import-x/no-default-export */
import type { ESLint, Rule } from 'eslint';

const preferAliasImportsRule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer @ alias for src imports and avoid climbing more than one parent directory',
    },
    hasSuggestions: true,
    fixable: 'code',
    schema: [],
    messages: {
      preferAlias: "Use '@/' alias instead of referencing 'src/' in import paths.",
      tooManyParents:
        'Avoid using import paths that climb more than one parent directory (../../ or deeper).',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node): void {
        const sourceNode = (
          node as unknown as {
            source?: { range?: [number, number]; value?: unknown };
          }
        ).source;
        const rawSource = sourceNode?.value;
        if (typeof rawSource !== 'string') {
          return;
        }

        const sourceAliasPattern = /^(?:\.\.\/)+src\//u;
        const directSourcePattern = /^src\//u;

        if (sourceAliasPattern.test(rawSource) || rawSource.startsWith('src/')) {
          const fixed = rawSource
            .replace(sourceAliasPattern, '@/')
            .replace(directSourcePattern, '@/');
          context.report({
            node: sourceNode as unknown as never,
            messageId: 'preferAlias',
            fix(fixer) {
              const { range } = sourceNode as unknown as { range?: [number, number] };
              return range !== undefined ? fixer.replaceTextRange(range, `'${fixed}'`) : null;
            },
          });
          return;
        }

        if (/^(?:\.\.\/){2,}/u.test(rawSource)) {
          context.report({
            node: sourceNode as unknown as never,
            messageId: 'tooManyParents',
          });
        }
      },
    };
  },
};

const aliasPlugin: ESLint.Plugin = {
  rules: {
    'prefer-alias-imports': preferAliasImportsRule,
  },
};

export default aliasPlugin;
