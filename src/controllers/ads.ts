import { Request, Response, Router } from "express";
import {
  errorStatusMap,
  NotFoundError,
  UnauthenticatedError,
  UnauthorizedError,
} from "@/lib/error";
import { fetchAgentById } from "@/services/fetch-agents";
import { getAuthContext } from "@/lib/utils/helpers";
import { CreateAdSchema, UpdateAdSchema } from "@/schema/ads";
import { AdsService } from "@/services/ads";
import { Prisma, PrismaClient } from "@prisma/client";
import { ApiResponse } from "@/types";
import { EnrichedAgent } from "@/types/ad";

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
      error: error.message || "Internal server error",
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

export class AdsController extends BaseController {
  constructor(
    private prisma: PrismaClient,
    private adsService: AdsService = new AdsService(prisma)
  ) {
    super();
  }

  private getUserId(req: Request): string {
    const userId = req.userId;
    if (!userId) {
      throw new UnauthenticatedError("Authentication required.");
    }
    return userId;
  }

  private async getAgentProfile(
    req: Request,
    userId: string
  ): Promise<Prisma.AgentGetPayload<{}>> {
    const { accessToken } = getAuthContext(req);
    const externalUser = await fetchAgentById(userId, accessToken);

    if (
      !externalUser ||
      externalUser.role !== "AGENT" ||
      externalUser.kycStatus !== "APPROVED"
    ) {
      throw new UnauthorizedError(
        "Agent role with approved KYC is required to perform this action."
      );
    }

    const localAgentProfile = await this.prisma.agent.findUnique({
      where: { userId },
    });

    if (!localAgentProfile) {
      throw new NotFoundError(
        "Local agent profile not found. Please complete your P2P profile setup."
      );
    }

    return localAgentProfile;
  }

  private async getAuthenticatedAgent(req: Request) {
    const userId = this.getUserId(req);
    return await this.getAgentProfile(req, userId);
  }

  async getAds(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, "getAds", async () => {
      const ads = await this.adsService.getAds();
      this.sendSuccess(res, ads, "Ads retrieved successfully.");
    });
  }

  async createAd(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, "createAd", async () => {
      const agentProfile = await this.getAuthenticatedAgent(req);
      const adData = CreateAdSchema.parse(req.body);

      const { fiatCryptoRateId, ...restOfAdData } = adData;
      const newAd = await this.adsService.createAd(agentProfile.id, {
        fiatCryptoRateId,
        ...restOfAdData,
      });

      this.sendSuccess(
        res,
        { ...newAd, agent: agentProfile },
        "Ad created successfully."
      );
    });
  }

  async getMyAds(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, "getMyAds", async () => {
      const agentProfile = await this.getAuthenticatedAgent(req);
      const { status } = req.query;

      const ads = await this.adsService.getMyAds(agentProfile.id);
      const enrichedAds = ads.map((ad) => ({ ...ad, agent: agentProfile }));

      this.sendSuccess(res, enrichedAds, "Your ads retrieved successfully.");
    });
  }

  async updateAd(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, "updateAd", async () => {
      const agentProfile = await this.getAuthenticatedAgent(req);
      const { adId } = req.params;
      const updateData = UpdateAdSchema.parse(req.body);

      const updatedAd = await this.adsService.updateAd(
        adId,
        agentProfile.id,
        updateData
      );

      this.sendSuccess(
        res,
        { ...updatedAd, agent: agentProfile },
        "Ad updated successfully."
      );
    });
  }

  async deleteAd(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, "deleteAd", async () => {
      const agentProfile = await this.getAuthenticatedAgent(req);
      const { adId } = req.params;

      await this.adsService.deleteAd(adId, agentProfile.id);
      this.sendSuccess(res, undefined, "Ad deleted successfully.");
    });
  }

  async getAgentById(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, "getAgentById", async () => {
      const { accessToken } = getAuthContext(req);
      const { agentId } = req.params;

      const localAgent = await this.prisma.agent.findUnique({
        where: { id: agentId },
      });

      if (!localAgent) {
        throw new NotFoundError("Agent profile not found in this service.");
      }

      const externalAgentData = await fetchAgentById(
        localAgent.userId,
        accessToken
      );

      if (!externalAgentData) {
        throw new NotFoundError("Agent not found in user service.");
      }

      const [stats, activeAds] = await Promise.all([
        this.adsService.getAdStatsForAgent(localAgent.id),
        this.adsService.getActiveAdsForAgent(localAgent.id),
      ]);

      const enrichedAgent: EnrichedAgent = {
        externalData: externalAgentData,
        profile: localAgent,
        stats,
        activeAds,
      };

      this.sendSuccess(res, enrichedAgent, "Agent retrieved successfully.");
    });
  }

  routes(): Router {
    const router = Router();

    // Public routes
    router.get("/agents/:agentId", this.getAgentById.bind(this));
    router.get("/", this.getAds.bind(this));

    // Authenticated agent routes
    router.post("/", this.createAd.bind(this));
    router.get("/my", this.getMyAds.bind(this));
    router.put("/:adId", this.updateAd.bind(this));
    router.delete("/:adId", this.deleteAd.bind(this));

    return router;
  }
}
