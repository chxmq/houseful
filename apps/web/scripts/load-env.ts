import { existsSync } from "node:fs";

// Next loads .env.local for the app; scripts run under tsx need it loaded explicitly.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
