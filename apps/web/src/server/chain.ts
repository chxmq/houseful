import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { activeChain } from "@/lib/chain";
import { doorEnv } from "./env";

let client: PublicClient | undefined;

/** Read-only client for the server's RPC, which may differ from the public one the browser uses. */
export function serverChain(): PublicClient {
  return (client ??= createPublicClient({ chain: activeChain, transport: http(doorEnv().RPC_URL) }) as PublicClient);
}
