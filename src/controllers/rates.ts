import type { Request, Response } from 'express';
import { Router } from 'express';
import { FiatCurrency, PrismaClient, AdType } from '@prisma/client';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from '@/lib/error';
import { asyncWrapper } from '@/middlewares/error';

/**
 * Controller for handling exchange rate-related API requests.
 */
export class RateController {
  public router: Router;
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
    this.router = Router();
    this.routes();
  }

  /**
   * Defines all the API routes for the controller.
   */
  private routes(): void {}
}
