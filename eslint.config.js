export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        Event: 'readonly',
        URL: 'readonly',
        MutationObserver: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        chrome: 'readonly',
        getComputedStyle: 'readonly',
      },
    },
    rules: {
      semi: ['warn', 'always'],
      'no-unused-vars': 'warn',
      'no-undef': 'error',
    },
  },
];
