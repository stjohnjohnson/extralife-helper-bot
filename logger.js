const { createLogger, format, transports } = require('winston');

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.splat(),
        // Custom format that's both human readable and Splunk parsable
        format.printf(({ timestamp, level, message, module, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${module || 'app'}] ${level.toUpperCase()}: ${message}${metaStr}`;
        })
    ),
    transports: [
        new transports.Console({
            stderrLevels: ['error', 'warn']
        })
    ]
});

function getLogger(module) {
    return logger.child({ module });
}

module.exports = getLogger;
