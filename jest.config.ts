import type { Config } from "jest";

const config: Config = {
  collectCoverage: true,
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
