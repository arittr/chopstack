// Simple plugin to prefer @ alias and prevent deep parent imports
// ESM-compatible for flat config

/** @type {import('eslint').ESLint.Plugin} */
const plugin = {
  rules: {
    'prefer-alias-imports': {
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
          ImportDeclaration(node) {
            const source = node.source && node.source.value;
            if (typeof source !== 'string') {
              return;
            }

            // Auto-fix: replace any leading ../ sequences followed by src/ with @/
            // Examples:
            //   '../../src/engine/vcs-engine' -> '@/engine/vcs-engine'
            //   '../src/utils/x'               -> '@/utils/x'
            //   'src/engine/vcs-engine'        -> '@/engine/vcs-engine'
            const srcAliasPattern = /^(?:\.\.\/)+src\//u;
            const directSrcPattern = /^src\//u;

            if (srcAliasPattern.test(source) || directSrcPattern.test(source)) {
              const fixed = source.replace(srcAliasPattern, '@/').replace(directSrcPattern, '@/');
              context.report({
                node: node.source,
                messageId: 'preferAlias',
                fix(fixer) {
                  return fixer.replaceText(node.source, `'${fixed}'`);
                },
              });
              return;
            }

            // Flag climbing more than one parent directory: starts with ../../ (two or more)
            if (/^(?:\.\.\/){2,}/u.test(source)) {
              context.report({
                node: node.source,
                messageId: 'tooManyParents',
              });
            }
          },
        };
      },
    },
  },
};

export default plugin;
