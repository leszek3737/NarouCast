module.exports = {
  env: {
    browser: false,
    es2021: true,
    node: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  plugins: ['react'],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    'semi': ['error', 'always'],
    'quotes': ['error', 'single'],
    'react/jsx-uses-react': 'error',
    'react/jsx-uses-vars': 'error'
  },
  overrides: [
    {
      files: ['src/tui/**/*.js'],
      env: {
        node: true
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    }
  ]
};