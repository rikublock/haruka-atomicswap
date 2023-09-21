import type { Config } from "jest";

const config: Config = {
  collectCoverage: true,
  // globalSetup: "./src/tests/setup.ts",
  // globalTeardown: "./src/tests/teardown.ts",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  roots: ["<rootDir>/src"],
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  verbose: true,
  maxWorkers: 1,
  workerThreads: true,
};

export default config;
