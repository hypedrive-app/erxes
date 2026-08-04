export default {
  displayName: 'core-ui',
  preset: '../../jest.preset.js',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nx/react/babel'] }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  /**
   * Path aliases, mirrored from tsconfig.json.
   *
   * jest does not read tsconfig `paths`, so without these every test importing
   * `~/...` or `@/...` fails at resolution. That is why the two test files in
   * this project had never run: PluginConfigsProvidersEffect.test.ts dies on
   * its first line (`import { i18nInstance } from '~/i18n'`).
   */
  moduleNameMapper: {
    '^~/(.*)$': '<rootDir>/src/$1',
    '^@/(.*)$': '<rootDir>/src/modules/$1',
    '^erxes-ui$': '<rootDir>/../libs/erxes-ui/src',
    '^erxes-ui/(.*)$': '<rootDir>/../libs/erxes-ui/src/$1',
    '^ui-modules$': '<rootDir>/../libs/ui-modules/src',
    '^ui-modules/(.*)$': '<rootDir>/../libs/ui-modules/src/$1',
  },
  coverageDirectory: '../../coverage/packages/core',
};
