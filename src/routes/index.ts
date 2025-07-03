import express, { Router } from "express";
import { PaymentController } from "@/controllers/payments";
import { RateController } from "@/controllers/rateController";

const router: Router = express.Router();
const rateControllerInstance = new RateController();
const paymentController = new PaymentController(prisma);

router.use("/rates", rateControllerInstance.router);

// Mpesa Routes
router.post("/p2p/user-payment-method/", paymentController.routes());
router.use("/methods", paymentController.routes());

export default router;
