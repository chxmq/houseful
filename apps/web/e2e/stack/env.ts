import { BUILD_DIR_RELATIVE, CHAIN_ID, HARDHAT_KEYS, URLS, WORLD } from "./config";

/**
 * Everything the stack's processes are told, in one place. Nothing here is written to a file: the values
 * are handed to each child process, and they win over any .env.local on this machine because Next, drizzle
 * and the seed scripts only fill in variables that are not set already.
 *
 * When the app learns a new setting (a USDT address, a session secret), add it to appEnv.
 */

/** The current environment minus anything that would leak a developer's own setup into the stack. */
function cleanBaseEnv(): NodeJS.ProcessEnv {
  const drop = /^(NEXT_PUBLIC_|DATABASE_|WORLD_|ATTESTER_|FAUCET_|DOOR_|VERIFIER_|DEPLOYER_|LOCAL_RPC_URL$|RPC_URL$|CHAIN_ID$|NODE_ENV$|NEXT_DIST_DIR$|PORT$|HOSTNAME$)/;
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || drop.test(key)) continue;
    env[key] = value;
  }
  if (env.NODE_OPTIONS) {
    env.NODE_OPTIONS = env.NODE_OPTIONS.split(/\s+/)
      .filter((flag) => flag && !/playwright/i.test(flag))
      .join(" ");
  }
  return env;
}

/** For the Hardhat node and the contract deploy. */
export function chainEnv(): NodeJS.ProcessEnv {
  return {
    ...cleanBaseEnv(),
    LOCAL_RPC_URL: URLS.rpc,
    // Pin the verifier so a packages/contracts/.env meant for a live chain cannot change who the app must sign as.
    VERIFIER_PRIVATE_KEY: HARDHAT_KEYS.account1,
    HARDHAT_DISABLE_TELEMETRY_PROMPT: "true",
  };
}

export type AppEnvInput = {
  databaseUrl: string;
  contractAddress: string;
  /** Throwaway, made fresh for each run. */
  worldRpSigningKey: string;
  /** Throwaway, made fresh for each run. */
  doorIssuerSecretKey: string;
};

/** For the web app's build and server, and for the database and chain seed scripts that read the same settings. */
export function appEnv(input: AppEnvInput): NodeJS.ProcessEnv {
  return {
    ...cleanBaseEnv(),
    DATABASE_URL: input.databaseUrl,
    DATABASE_AUTH_TOKEN: "",

    CHAIN_ID: String(CHAIN_ID),
    RPC_URL: URLS.rpc,
    NEXT_PUBLIC_CHAIN_ID: String(CHAIN_ID),
    NEXT_PUBLIC_RPC_URL: URLS.rpc,
    NEXT_PUBLIC_HOUSEFUL_ADDRESS: input.contractAddress,

    WORLD_APP_ID: WORLD.appId,
    WORLD_RP_ID: WORLD.rpId,
    WORLD_ENVIRONMENT: WORLD.environment,
    WORLD_RP_SIGNING_KEY: input.worldRpSigningKey,
    WORLD_VERIFY_URL: URLS.world,

    ATTESTER_PRIVATE_KEY: HARDHAT_KEYS.account1,
    FAUCET_PRIVATE_KEY: HARDHAT_KEYS.account0,
    FAUCET_DRIP_ETH: "0.02",

    DOOR_ISSUER_SECRET_KEY: input.doorIssuerSecretKey,

    // Build into the harness's own folder, so a dev server or a normal build never touches it.
    NEXT_DIST_DIR: BUILD_DIR_RELATIVE,
    NEXT_TELEMETRY_DISABLED: "1",
  };
}
