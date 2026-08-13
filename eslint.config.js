import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * What the linter is for here.
 *
 * `npm run lint` has been in package.json and in the CI job for as long as
 * both have existed, and it has never once run: ESLint was not a dependency,
 * so the step died with `eslint: command not found` and took every pull
 * request's checks down with it. This file is what that script always meant.
 *
 * The ruleset is deliberately narrow. Formatting is not linted — nothing here
 * argues about quotes or semicolons, because that is a job for a formatter and
 * a linter doing it only produces noise a reader learns to scroll past. What is
 * kept is the set that catches things review does not: rules of hooks, which is
 * a correctness bug that renders fine until it does not, and the typed rules
 * that find a promise nobody awaited.
 *
 * Type-aware linting is on, which is why this uses `projectService` — the rules
 * worth having (`no-floating-promises`, `no-misused-promises`) cannot be
 * decided from syntax alone.
 */
export default tseslint.config(
  {
    // Build output, dependencies and the coverage of a test run are not source.
    ignores: ["dist/**", "node_modules/**", "coverage/**", "*.tsbuildinfo"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.es2024 },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // The codebase names deliberately-unused parameters with a leading
      // underscore, which is the convention the compiler already honours.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // A widget's `View` takes `result` as `never` and casts at the call site
      // — the price of erasing a generic widget into a uniform list. The cast
      // is deliberate and load-bearing, so the rule that objects to it is off
      // rather than suppressed at forty call sites.
      "@typescript-eslint/no-unnecessary-type-assertion": "off",

      // Every instance in this codebase is a function satisfying an interface
      // that returns a promise — `read: () => Promise<Blob>` implemented as
      // `async () => file`, and the test doubles that stand in for it. Writing
      // those without `async` means hand-rolling `Promise.resolve`, which is
      // longer and says less. The rule cannot tell that case from a stray
      // `async`, and the stray one is caught by the promise rules anyway.
      "@typescript-eslint/require-await": "off",
    },
  },

  {
    // Node's globals, not the browser's: these run under vitest or bare node.
    files: ["**/*.config.{ts,js}", "scripts/**/*.mjs", "functions/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
);
