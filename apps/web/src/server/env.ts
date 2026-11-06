import "server-only";
import { z } from "zod";

const hex = z.string().regex(/^(0x)?[0-9a-fA-F]+$/, "expected a hex string");

const chain = z.object({
  CHAIN_ID: z.coerce.number().int().default(31337),
  RPC_URL: z.url().default("http://127.0.0.1:8545"),
});

const door = chain.extend({
  DOOR_ISSUER_SECRET_KEY: hex.length(64),
});

const schema = door.extend({
  WORLD_APP_ID: z.string().startsWith("app_"),
  WORLD_RP_ID: z.string().startsWith("rp_"),
  WORLD_RP_SIGNING_KEY: hex,
  WORLD_ENVIRONMENT: z.enum(["production", "staging"]).default("staging"),
  WORLD_VERIFY_URL: z.url().default("https://developer.world.org/api/v4/verify"),
  ATTESTER_PRIVATE_KEY: hex.length(66),
});

export type ServerEnv = z.infer<typeof schema>;
export type DoorEnv = z.infer<typeof door>;

function load<T extends z.ZodType>(s: T): z.infer<T> {
  const parsed = s.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Server environment is incomplete: ${missing}. See apps/web/.env.example.`);
  }
  return parsed.data;
}

let cached: ServerEnv | undefined;
let cachedDoor: DoorEnv | undefined;

/** Everything, including World ID and the attester. Used by the verification path. */
export function serverEnv(): ServerEnv {
  return (cached ??= load(schema));
}

/** Only what door passes need, so tickets keep working while World ID is misconfigured. */
export function doorEnv(): DoorEnv {
  return (cachedDoor ??= load(door));
}
