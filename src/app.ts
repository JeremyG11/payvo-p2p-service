import "module-alias/register";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import express, { Application } from "express";

import cron from "@/cron";
import router from "@/routes";
import { config } from "@/config/env";

const app: Application = express();
dotenv.config();

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000",
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
app.get("/", (req, res) => {
  res.json({
    service: config.serviceName,
    version: "1.0.0",
    environment: config.env,
    message: "Welcome to the Payvo P2P Service",
  });
});

app.use("/", router);

cron;
export default app;
