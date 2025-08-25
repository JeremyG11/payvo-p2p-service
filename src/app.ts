import "module-alias/register";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import express, { Application, Request, Response } from "express";

import routes from "@/routes";
import { globalErrorHandler, notFoundHandler } from "@/middlewares/error";

const app: Application = express();
dotenv.config();

// Middleware
app.set("trust proxy", true);

app.use(
  cors({
    origin: ["http://payvo.com:30447", "http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-signature"],
  })
);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 60 * 60 * 24 * 365,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: "same-origin" },
  })
);

app.use(helmet.frameguard({ action: "deny" }));
app.use(helmet.noSniff());
app.use(helmet.dnsPrefetchControl({ allow: false }));
app.use(helmet.xssFilter());

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

/**
 * entry route
 */
// health check endpoint
app.get("/api/v1/p2p/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "UP",
    timestamp: new Date().toISOString(),
    message: "Payvo-p2p-service is running smoothly",
  });
});

app.use("/api/v1/p2p", routes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
