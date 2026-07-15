import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

const fsd_layers = [
  { type: "app", pattern: "src/app/**" },
  { type: "pages", pattern: "src/views/**" },
  { type: "widgets", pattern: "src/widgets/**" },
  { type: "features", pattern: "src/features/**" },
  { type: "entities", pattern: "src/entities/**" },
  { type: "shared", pattern: "src/shared/**" },
  { type: "server", pattern: "src/server/**" },
  { type: "infra", pattern: "src/i18n/**" },
  { type: "infra", pattern: "src/(*)", capture: ["file"] },
];

const layer_allow = {
  app: ["pages", "widgets", "features", "entities", "shared", "server", "infra"],
  pages: ["widgets", "features", "entities", "shared"],
  widgets: ["features", "entities", "shared"],
  features: ["entities", "shared"],
  entities: ["shared"],
  shared: ["shared"],
  server: ["shared", "server"],
  infra: ["shared", "server", "infra"],
};

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { boundaries },
    settings: {
      "boundaries/include": ["src/**/*"],
      "boundaries/elements": fsd_layers,
      "boundaries/legacy-warnings": false,
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: Object.entries(layer_allow).map(([from, allow]) => ({
            from: { element: { type: from } },
            allow: { element: { type: allow } },
          })),
        },
      ],
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "scripts/**",
      "e2e/**",
      "prisma/**",
      "data/**",
    ],
  },
);
