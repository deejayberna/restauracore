import nextPlugin from "@next/eslint-plugin-next";
import security from "eslint-plugin-security";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "out/**",
      ".system_generated/**",
    ],
  },
  nextPlugin.configs["core-web-vitals"],
  {
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
    },
  },
];

export default eslintConfig;

