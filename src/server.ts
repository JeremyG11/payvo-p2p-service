import http from 'http';
import app from '@/app';
import { config } from '@/config/env';
import { logger } from '@/lib/logger';
import { initRedis, shutdownRedis } from '@/config/radis';
import kafkaInit, { disconnectKafka } from '@/config/kafka';
import { blacklistService } from '@/services/cache/blacklist-cache';
import { getRateCleanupService, rateCleanupService } from '@/services/cron';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(config.port) || 5006;

async function bootstrap() {
  if (!config.jwtPublicKey) {
    throw new Error('JWT keys must be defined in environment.');
  }

  logger.info('Connecting to Kafka…');
  await kafkaInit();

  logger.info('Connecting to Redis…');
  await initRedis();
}

async function startServer() {
  try {
    await bootstrap();

    logger.info('Starting scheduled tasks…');

    // Start the cron task using the service instance
    const rateCleanupService = getRateCleanupService();
    rateCleanupService.scheduleAllTasks();

    const server = http.createServer(app);
    server.listen(PORT, HOST, () => {
      logger.info(`🚀 Server listening at http://${HOST}:${PORT}`);
    });

    // Graceful shutdown helper
    const graceful = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down…`);

      // Stop accepting new HTTP connections
      server.close((err) => {
        if (err) logger.error('Error closing HTTP server:', err);
        else logger.info('HTTP server closed');
      });

      // Close cache services
      await shutdownCacheServices();

      // Kafka & Redis cleanup
      await disconnectKafka();
      await shutdownRedis();

      // Stop the scheduled task correctly
      rateCleanupService.stopRateCleanup();

      process.exit(0);
    };

    // Add shutdown method to cache services
    async function shutdownCacheServices() {
      try {
        if (
          blacklistService &&
          typeof (blacklistService as any).disconnect === 'function'
        ) {
          await (blacklistService as any).disconnect();
          logger.info('BlacklistService disconnected');
        }
      } catch (error) {
        logger.error('Error shutting down cache services', { error });
      }
    }

    process.on('SIGINT', () => graceful('SIGINT'));
    process.on('SIGTERM', () => graceful('SIGTERM'));

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception:', err);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection:', reason);
      process.exit(1);
    });
  } catch (err) {
    logger.error('Bootstrap failed:', err);
    process.exit(1);
  }
}

startServer();
