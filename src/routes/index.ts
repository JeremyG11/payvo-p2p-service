import { prisma } from '@/lib/prisma';
import express, { Router } from 'express';
import { PaymentController } from '@/controllers/payments';
import { RateController } from '@/controllers/rates';
import { authenticate } from '@/middlewares/authenticate';
import { AdsController } from '@/controllers/ads';

const router: Router = express.Router();
const adsController = new AdsController(prisma);
const paymentController = new PaymentController(prisma);
const rateController = new RateController(prisma);

// rates routes

router.use('/rates', rateController.router);

// payment methods
router.use(
  '/payments/payment-methods',
  authenticate,
  paymentController.routes()
);

// ads routes
router.use('/ads', adsController.routes());

export default router;
