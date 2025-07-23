import { prisma } from "@/lib/prisma";
import express, { Router } from "express";
import { authenticate } from "@/middlewares/auth";
import { PaymentController } from "@/controllers/payments";
import { RateController } from "@/controllers/rates";

const router: Router = express.Router();
const rateControllerInstance = new RateController();
const paymentController = new PaymentController(prisma);

router.use("/rates", rateControllerInstance.router);

// payment methods
router.use(
  "/payments/payment-methods",
  authenticate,
  paymentController.routes()
);

export default router;
