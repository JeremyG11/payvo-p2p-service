import { Logger } from "winston";
import { config } from "@/config/env";
import { loggerInstance } from "@payvo/logger";

export const logger: Logger = loggerInstance(config.serviceName);
