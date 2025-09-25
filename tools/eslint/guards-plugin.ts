/* eslint-disable @typescript-eslint/naming-convention, import-x/no-default-export */
import type { ESLint, Rule } from 'eslint';

function buildSuggestion(
  node: { range?: [number, number] },
  replacement: string,
): Rule.SuggestionReportDescriptor {
  return {
    desc: `Replace with ${replacement}`,
    fix(fixer) {
      const { range } = node;
      if (range === undefined) {
        return null;
      }
      return fixer.replaceTextRange(range, replacement);
    },
  };
}

const preferGuardsDefinedRule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Prefer guards from '@/validation/guards' instead of direct undefined checks (=== undefined, typeof x === 'undefined').",
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      preferGuard:
        "Prefer guard function '{{guard}}' (or similar) from '@/validation/guards' over direct undefined checks.",
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      BinaryExpression(node) {
        // Detect x === undefined or x !== undefined
        if (node.operator !== '===' && node.operator !== '!==') {
          return;
        }

        const leftText = sourceCode.getText(node.left);
        const rightText = sourceCode.getText(node.right);

        const isLeftUndefined = rightText !== 'undefined' && leftText === 'undefined';
        const isRightUndefined = leftText !== 'undefined' && rightText === 'undefined';

        // typeof x === 'undefined'
        const isTypeofCheck =
          (node.left.type === 'UnaryExpression' &&
            (node.left as { operator: string }).operator === 'typeof' &&
            node.right.type === 'Literal' &&
            (node.right as { value: unknown }).value === 'undefined') ||
          (node.right.type === 'UnaryExpression' &&
            (node.right as { operator: string }).operator === 'typeof' &&
            node.left.type === 'Literal' &&
            (node.left as { value: unknown }).value === 'undefined');

        if (!isLeftUndefined && !isRightUndefined && !isTypeofCheck) {
          return;
        }

        if (isLeftUndefined || isRightUndefined) {
          const comparedText = isLeftUndefined ? rightText : leftText;
          const isNegated = node.operator === '!==';
          const replacement = isNegated
            ? `isDefined(${comparedText})`
            : `!isDefined(${comparedText})`;
          context.report({
            node: node as never,
            messageId: 'preferGuard',
            data: { guard: 'isDefined' },
            suggest: [buildSuggestion(node as never, replacement)],
          });
          return;
        }

        if (isTypeofCheck) {
          const typeofNode = (node.left.type === 'UnaryExpression'
            ? node.left
            : node.right) as unknown as {
            argument: unknown;
          };
          const argumentText = sourceCode.getText(typeofNode.argument as never);
          const isNegated = node.operator === '!==';
          const replacement = isNegated
            ? `isDefined(${argumentText})`
            : `!isDefined(${argumentText})`;
          context.report({
            node: node as never,
            messageId: 'preferGuard',
            data: { guard: 'isDefined' },
            suggest: [buildSuggestion(node as never, replacement)],
          });
        }
      },
    };
  },
};

const guardsPlugin: ESLint.Plugin = {
  rules: {
    'prefer-guards-defined': preferGuardsDefinedRule,
  },
};

export default guardsPlugin;
