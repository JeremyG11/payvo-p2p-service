import { config } from '@/config/env';
import winston, { Logger } from 'winston';

export const loggerInstance = (service: string, level = 'debug'): Logger => {
  return winston.createLogger({
    level: level,
    defaultMeta: { service },

    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ level, message, timestamp }) => {
        return `[${timestamp}] [${service}] ${level.toUpperCase()}: ${message}`;
      })
    ),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: `${service}.log` }),
    ],
  });
};

const service = config.serviceName || 'P2P-Service';

export const logger = loggerInstance(service);
