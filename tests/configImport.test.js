describe('configuration module loading', () => {
    test('loads dotenv only when configuration is parsed', () => {
        const originalNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
        jest.resetModules();
        jest.doMock('dotenv', () => ({ config: jest.fn() }));

        const dotenv = require('dotenv');
        const { parseConfiguration } = require('../src/config.js');

        expect(dotenv.config).not.toHaveBeenCalled();
        parseConfiguration();
        expect(dotenv.config).toHaveBeenCalledTimes(1);

        process.env.NODE_ENV = originalNodeEnv;
        jest.dontMock('dotenv');
    });
});
