import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: env.isTest ? "silent" : env.logLevel,
  base: undefined, // sem pid/hostname no log
});
