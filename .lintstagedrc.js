const path = require("path");

const buildNextEslintCommand = (filenames) =>
  `yarn next:lint --fix --file ${filenames
    .map((f) => path.relative(path.join("packages", "nextjs"), f))
    .join(" --file ")}`;

const checkTypesNextCommand = () => "yarn next:check-types";

const buildCoreEslintCommand = (filenames) =>
  `yarn core:lint-staged --fix ${filenames
    .map((f) => path.relative(path.join("packages", "core"), f))
    .join(" ")}`;

const checkTypesCoreCommand = () => "yarn core:check-types";

const buildAgentEslintCommand = (filenames) =>
  `yarn agent:lint-staged --fix ${filenames
    .map((f) => path.relative(path.join("packages", "agent"), f))
    .join(" ")}`;

const checkTypesAgentCommand = () => "yarn agent:check-types";

const buildHardhatEslintCommand = (filenames) =>
  `yarn hardhat:lint-staged --fix ${filenames
    .map((f) => path.relative(path.join("packages", "hardhat"), f))
    .join(" ")}`;

module.exports = {
  "packages/core/**/*.ts": [buildCoreEslintCommand, checkTypesCoreCommand],
  "packages/agent/**/*.ts": [buildAgentEslintCommand, checkTypesAgentCommand],
  "packages/nextjs/**/*.{ts,tsx}": [
    buildNextEslintCommand,
    checkTypesNextCommand,
  ],
  "packages/hardhat/**/*.{ts,tsx}": [buildHardhatEslintCommand],
};
