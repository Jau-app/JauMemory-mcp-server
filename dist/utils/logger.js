/**
 * Logger configuration for production use
 */
import winston from 'winston';
const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';
// Create transports based on environment
const transports = [];
// In MCP mode, only log to stderr to keep stdout clean for JSON
transports.push(new winston.transports.Console({
    stderrLevels: ['error', 'warn', 'info', 'debug', 'verbose', 'silly'],
    format: winston.format.combine(winston.format.timestamp(), winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] ${level}: ${message}${metaStr}`;
    }))
}));
// In production, also log to file
if (isProduction) {
    transports.push(new winston.transports.File({
        filename: 'error.log',
        level: 'error',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json())
    }));
    transports.push(new winston.transports.File({
        filename: 'combined.log',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json())
    }));
}
export const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
    defaultMeta: { service: 'jauauth-mcp' },
    transports
});
//# sourceMappingURL=logger.js.map