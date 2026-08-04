export default {
  displayName: 'content_ui',
  preset: '../../../jest.preset.js',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nx/react/babel'] }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  // jest does not read tsconfig `paths`; without these any test importing
  // `~/...` or `@/...` fails at resolution. See core-ui/jest.config.ts.
  moduleNameMapper: {
    '^~/(.*)$': '<rootDir>/src/$1',
    '^@/(.*)$': '<rootDir>/src/modules/$1',
    '^erxes-ui$': '<rootDir>/../../libs/erxes-ui/src',
    '^erxes-ui/(.*)$': '<rootDir>/../../libs/erxes-ui/src/$1',
    '^ui-modules$': '<rootDir>/../../libs/ui-modules/src',
    '^ui-modules/(.*)$': '<rootDir>/../../libs/ui-modules/src/$1',
  },
  coverageDirectory: '../../../coverage/frontend/plugins/content_ui',
};
