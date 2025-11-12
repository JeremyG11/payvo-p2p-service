import express, { Router } from 'express';

import { prisma } from '@/lib/prisma';
import { AdsController } from '@/controllers/ads';
import { RateController } from '@/controllers/rates';
import { PaymentController } from '@/controllers/payments';
import { ordersController } from '@/controllers/orders';

const router: Router = express.Router();
const adsController = new AdsController(prisma);
const paymentController = new PaymentController(prisma);
const rateController = new RateController(prisma);

// rates routes
router.use('/rates', rateController.router);

// payment methods
router.use('/payments/payment-methods', paymentController.routes());

// ads routes
router.use('/ads', adsController.routes());

// orders routes
router.use('/orders', ordersController.routes());

export default router;
