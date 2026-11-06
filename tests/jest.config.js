export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@nexora/shared/(.*)$': '<rootDir>/../shared/src/$1.ts',
    '^@nexora/backend/(.*)$': '<rootDir>/../backend/src/$1.ts',
  },
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  testMatch: ['<rootDir>/**/*.test.ts'],
  globalSetup: '<rootDir>/setup.ts',
  testTimeout: 30000,
};
