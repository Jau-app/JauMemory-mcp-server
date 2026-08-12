/**
 * Jest configuration (plan Fix 0). ESM project ("type": "module"),
 * ts-jest ESM preset; run via `node --experimental-vm-modules` (see the
 * npm test script — required for jest ESM support, cross-platform).
 */
export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  // TS ESM sources import sibling modules with .js specifiers; map them
  // back to the .ts sources for transformation.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
  testMatch: ['**/tests/**/*.test.ts'],
  clearMocks: true,
};
