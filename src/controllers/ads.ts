import { Request, Response, Router } from 'express';
import {
  errorStatusMap,
  NotFoundError,
  UnauthenticatedError,
  UnauthorizedError,
} from '@/lib/error';
import { fetchAgentById } from '@/services/fetch-agents';
import { AdsService } from '@/services/ads';
import {
  AdStatus,
  AdType,
  Prisma,
  PrismaClient,
  UserKycStatus,
  UserRole,
} from '@prisma/client';
import { getAuthContext } from '@/lib/utils/helpers';
import { ApiResponse } from '@/types';
import { authenticate } from '@/middlewares/authenticate';
import { authorize } from '@/middlewares/authorize';
import { rateService } from '@/services/rates/calculation';
import validator from '@/middlewares/validator';
import { QueryAdTypeSchema } from '@/schema/ads';

abstract class BaseController {
  protected sendSuccess<T>(res: Response, data?: T, message?: string): void {
    const response: ApiResponse<T> = { success: true, data, message };
    res.status(200).json(response);
  }

  protected sendError(res: Response, error: any, context: string): void {
    console.error(`${context} error:`, error);
    const statusCode = errorStatusMap[error.constructor.name] || 500;
    const response: ApiResponse = {
      success: false,
      error: error.message || 'Internal server error',
    };

    res.status(statusCode).json(response);
  }

  protected async handleRequest(
    req: Request,
    res: Response,
    context: string,
    handler: () => Promise<void>
  ): Promise<void> {
    try {
      await handler();
    } catch (error) {
      this.sendError(res, error, context);
    }
  }
}

/**
 * Controller for managing ads.
 * This controller handles incoming HTTP requests related to ads and delegates
 * the business logic to the AdsService.
 */
export class AdsController extends BaseController {
  constructor(
    private prisma: PrismaClient,
    private adsService: AdsService = new AdsService(prisma, rateService)
  ) {
    super();
  }

  /**
   * Retrieves the authenticated user ID from the request object.
   * Throws an error if the user is not authenticated.
   */
  private getUserId(req: Request): string {
    const userId = req.userId;
    if (!userId) {
      throw new UnauthenticatedError('Authentication required.');
    }
    return userId;
  }

  /**
   * This is a consolidated method to handle authentication and
   * agent profile retrieval. It checks user roles and KYC status.
   */
  private async getAuthenticatedAgentProfile(
    req: Request
  ): Promise<Prisma.AgentGetPayload<{}>> {
    const userId = this.getUserId(req);
    const { accessToken } = getAuthContext(req);

    const { data: user } = await fetchAgentById(userId, accessToken);

    if (
      !user ||
      user.enumRole !== UserRole.AGENT ||
      user.kycStatus !== UserKycStatus.APPROVED
    ) {
      throw new UnauthorizedError(
        'Agent role with approved KYC is required to perform this action.'
      );
    }

    const localAgent = await this.prisma.agent.findUnique({
      where: { userId },
    });

    if (!localAgent) {
      throw new NotFoundError(
        'Local agent profile not found. Please complete your P2P profile setup.'
      );
    }

    return localAgent;
  }

  /**
   * Handles the ad creation request.
   */
  async createAd(req: Request, res: Response): Promise<void> {
    const { adType } = req.params;

    await this.handleRequest(req, res, 'createAd', async () => {
      const agent = await this.getAuthenticatedAgentProfile(req);

      const newAd = await this.adsService.createAd(
        agent.userId,
        req.body,
        adType as AdType
      );

      this.sendSuccess(res, newAd, 'Ad created successfully.');
    });
  }

  /**
   * Handles the request to get all ads.
   * This is a public endpoint and does not require a logged-in user.
   * It also supports basic pagination.
   */
  async getAllAds(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, 'getAllAds', async () => {
      // Extract optional query parameters for pagination and filtering
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as AdStatus;

      const ads = await this.adsService.getAllAds({ page, limit, status });

      this.sendSuccess(res, ads, 'Ads fetched successfully.');
    });
  }

  /**
   * Handles the request to get a single ad by ID.
   */
  async getAdById(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, 'getAdById', async () => {
      const adId = req.params.id;
      const ad = await this.adsService.getAdById(adId);

      this.sendSuccess(res, ad, 'Ad fetched successfully.');
    });
  }

  /**
   * Handles the request to update an ad.
   */
  async updateAd(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, 'updateAd', async () => {
      const { id: adId } = req.params;
      const userId = this.getUserId(req);

      const existingAd = await this.adsService.getAdById(adId);
      if (existingAd.agent.userId !== userId) {
        throw new UnauthorizedError('You are not the owner of this ad.');
      }

      const updatedAd = await this.adsService.updateAd(adId, req.body);
      this.sendSuccess(res, updatedAd, 'Ad updated successfully.');
    });
  }

  /**
   * Handles the request to delete an ad.
   */
  async deleteAd(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, 'deleteAd', async () => {
      const { id: adId } = req.params;
      const userId = this.getUserId(req);

      const existingAd = await this.adsService.getAdById(adId);
      if (existingAd.agent.userId !== userId) {
        throw new UnauthorizedError('You are not the owner of this ad.');
      }

      await this.adsService.deleteAd(adId);
      this.sendSuccess(res, null, 'Ad deleted successfully.');
    });
  }

  /**
   * Configures and returns the router with all ad-related routes.
   */
  routes(): Router {
    const router = Router();

    router.get('/', this.getAllAds.bind(this));

    router.get('/:id', this.getAdById.bind(this));

    // POST: Create a new ad.
    router.post(
      '/:adType',
      validator(QueryAdTypeSchema, 'params'),
      authenticate,
      authorize({ requiredPermissions: ['ads:create'] }),
      this.createAd.bind(this)
    );

    // PUT: Update an existing ad.
    router.put(
      '/:id',
      authenticate,
      authorize({ requiredPermissions: ['ads:update'] }),
      this.updateAd.bind(this)
    );

    // DELETE: Delete an ad.
    router.delete(
      '/:id',
      authenticate,

      authorize({ requiredPermissions: ['ads:delete'] }),
      this.deleteAd.bind(this)
    );

    return router;
  }
}
