/** @type {import('jest').Config} */
const base = { preset: 'ts-jest', testEnvironment: 'node', moduleFileExtensions: ['ts', 'js', 'json'] };
module.exports = {
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/unit/**/*.spec.ts'] },
    {
      ...base,
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
      globalSetup: '<rootDir>/test/e2e/global-setup.ts',
      setupFiles: ['<rootDir>/test/e2e/env.ts'],
    },
  ],
};
