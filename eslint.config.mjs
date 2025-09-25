import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.node
        },
        rules: {
            // Allow console.log statements for logging
            'no-console': 'off',
            // Enforce semicolons
            'semi': ['error', 'always'],
            // Enforce consistent indentation
            'indent': ['error', 4],
            // Enforce consistent quotes
            'quotes': ['error', 'single', { 'allowTemplateLiterals': true }]
        }
    },
    {
        files: ['tests/**/*.test.js'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest
            }
        }
    }
];
