import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "node_modules/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: { globals: { ...globals.node, ...globals.es2022 } },
    rules: { "no-console": "off" },
  },
  {
    files: ["apps/reader-web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.es2022 } },
  },
);
