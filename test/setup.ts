import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (process.env.CI !== "true" && existsSync(".env")) loadEnvFile(".env");
