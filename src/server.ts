import http from 'http';
import app from '@/app';
import { config } from '@/config/env';
import { logger } from '@/lib/logger';
import { initRedis, shutdownRedis } from '@/config/radis';
import {
  initializeKafkaClient,
  disconnectKafkaClient,
} from '@/infra/messaging/kafka';
import { schedulerService } from '@/services/rates/cleanup';
import { blacklistService } from '@/services/cache/blacklist-cache';
import { seedAllSupportedPaymentMethods } from '@/seeders/payment-methods.seeder';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(config.port) || 5006;

/**
 * Executes all necessary service connections and setup before the server starts.
 */
async function bootstrap() {
  if (!config.redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }

  logger.info('Initializing core services (Kafka, Redis)...');

  // Initialize services concurrently with graceful degradation
  void initializeKafkaClient();

  const initRedisTask = async () => {
    if (!config.redisUrl) {
      logger.info('Redis URL not configured - skipping initialization');
      return { service: 'Redis', status: 'disabled' };
    }

    await initRedis();
    return { service: 'Redis', status: 'initialized' };
  };

  const seedTask = async () => {
    await seedAllSupportedPaymentMethods();
    return { service: 'Seeder', status: 'completed' };
  };

  // Use allSettled to allow services to fail independently
  const results = await Promise.allSettled([
    initRedisTask(),
    seedTask(),
  ]);

  // Log results for each service
  results.forEach((result, index) => {
    const serviceName = index === 0 ? 'Redis' : 'Seeder';

    if (result.status === 'fulfilled') {
      logger.info(`${serviceName}: ${result.value.status}`);
    } else {
      logger.error(`${serviceName} initialization failed:`, result.reason);
    }
  });

  logger.info(
    'Core services initialization complete (some services may be degraded).'
  );
}

async function startServer() {
  try {
    await bootstrap();

    logger.info('Starting scheduled tasks...');
    schedulerService.scheduleAllTasks();

    const server = http.createServer(app);

    /**
     * Handles the complete graceful shutdown process for the application.
     */
    const graceful = async (signal: string) => {
      logger.warn(`Received ${signal}, commencing graceful shutdown...`);

      // Close HTTP server
      server.close((err) => {
        if (err) logger.error('Error closing HTTP server:', err);
        else logger.info('HTTP server closed');
      });

      // Stop scheduled tasks
      schedulerService.stopAllTasks();
      logger.info('Scheduled tasks stopped');

      //  Close cache/message bus connections
      const disconnectKafkaTask = async () => {
        await disconnectKafkaClient();
        logger.info('Kafka disconnected');
      };
      const shutdownRedisTask = async () => {
        await shutdownRedis();
        logger.info('Redis shut down');
      };

      await Promise.allSettled([disconnectKafkaTask(), shutdownRedisTask()]);

      logger.info('All services cleaned up. Goodbye.');
      process.exit(0);
    };

    // Start listening for connections
    server.listen(PORT, HOST, () => {
      logger.info(`🚀 Server listening at http://${HOST}:${PORT}`);
    });

    // Setup process signal handlers for graceful shutdown
    process.on('SIGINT', () => graceful('SIGINT'));
    process.on('SIGTERM', () => graceful('SIGTERM'));

    // Handle unexpected errors to prevent silent crashes
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception detected, exiting:', err);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection detected, exiting:', reason);
      process.exit(1);
    });
  } catch (err) {
    logger.error('FATAL: Application bootstrap failed.', err);
    process.exit(1);
  }
}

startServer();
