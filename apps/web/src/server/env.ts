import "server-only";
import { z } from "zod";

const hex = z.string().regex(/^(0x)?[0-9a-fA-F]+$/, "expected a hex string");

const schema = z.object({
  WORLD_APP_ID: z.string().startsWith("app_"),
  WORLD_RP_ID: z.string().startsWith("rp_"),
  WORLD_RP_SIGNING_KEY: hex,
  WORLD_ENVIRONMENT: z.enum(["production", "staging"]).default("staging"),
  WORLD_VERIFY_URL: z.url().default("https://developer.world.org/api/v4/verify"),
  ATTESTER_PRIVATE_KEY: hex.length(66),
  DOOR_ISSUER_SECRET_KEY: hex.length(64),
  CHAIN_ID: z.coerce.number().int().default(31337),
  RPC_URL: z.url().default("http://127.0.0.1:8545"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Server environment is incomplete: ${missing}. See apps/web/.env.example.`);
  }
  cached = parsed.data;
  return cached;
}
