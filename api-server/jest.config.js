module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 60000,
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.(ts|js)$': 'ts-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!.*jose)',
  ],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^#bg-tasks/(.*)$': '<rootDir>/src/bg-tasks/$1',
    '^#handlers/(.*)$': '<rootDir>/src/handlers/$1',
    '^#lib/(.*)$': '<rootDir>/src/lib/$1',
    '^#llm_authorization/(.*)$': '<rootDir>/src/llm_authorization/$1',
    '^#middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^#modules/(.*)$': '<rootDir>/src/modules/$1',
    '^#types/(.*)$': '<rootDir>/src/types/$1',
  },
};
