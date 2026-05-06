/**
 * Custom ESLint rules for Cascade Projects
 * Rule: no-arrow-dash - Disallow `->` in TypeScript (use `=>` instead)
 */
module.exports = {
  rules: {
    "no-arrow-dash": {
      meta: {
        type: "problem",
        docs: {
          description: "Disallow `->` token in TypeScript files (use `=>` for arrow functions)",
          category: "Possible Errors",
        },
        schema: [],
      },
      create(context) {
        return {
          Program() {
            const sourceCode = context.getSourceCode();
            const text = sourceCode.getText();
            const lines = text.split("\n");

            lines.forEach((line, index) => {
              // Check for -> that's not inside strings/comments
              const arrowDashRegex = /(?<!=)->(?!=)/g;
              let match;
              while ((match = arrowDashRegex.exec(line)) !== null) {
                // Skip if inside string or comment (simple check)
                const beforeMatch = line.substring(0, match.index);
                const inString =
                  (beforeMatch.match(/"/g) || []).length % 2 !== 0 ||
                  (beforeMatch.match(/'/g) || []).length % 2 !== 0 ||
                  (beforeMatch.match(/`/g) || []).length % 2 !== 0;

                if (!inString) {
                  context.report({
                    node: context.getSourceCode().ast,
                    loc: {
                      start: { line: index + 1, column: match.index },
                      end: { line: index + 1, column: match.index + 2 },
                    },
                    message: "Unexpected `->` token. Use `=>` for arrow functions in TypeScript.",
                  });
                }
              }
            });
          },
        };
      },
    },
  },
};
