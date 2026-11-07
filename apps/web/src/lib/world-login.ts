import { proofOfHuman, passport, selfieCheck } from "@worldcoin/idkit";

export const loginMethods = [
  { id: "human", label: "Human (Orb)", credential: "proof_of_human", description: "Use your Orb-verified World ID. In the simulator, choose Human and World ID 4.0." },
  { id: "passport", label: "Passport", credential: "passport", description: "Use the passport credential saved in your World ID." },
  { id: "selfie", label: "Selfie Check", credential: "selfie", description: "Complete a live selfie check. The standard simulator has no Selfie Check; testing this method needs the sandbox World ID app." },
] as const;

export type LoginMethod = typeof loginMethods[number]["id"];

/** Bind the selected SDK preset to the login challenge. The server requires v4. */
export function loginPreset(method: LoginMethod, signal: string) {
  const selected = loginMethods.find(option => option.id === method);
  if (!selected) throw new Error("Choose a supported verification method.");
  const build = { human: proofOfHuman, passport, selfie: selfieCheck }[method];
  return build({ signal });
}

export function loginErrorMessage(code: string, method: LoginMethod): string {
  switch (code) {
    case "user_rejected":
    case "cancelled": return "Sign-in was cancelled.";
    case "credential_unavailable": return `${loginMethods.find(option => option.id === method)?.label ?? "This method"} is not available for this World ID. Choose another method and start again.`;
    case "world_id_4_not_available": return "This connection needs World ID 4.0. In the simulator, select World ID 4.0 and match the method chosen here.";
    case "timeout":
    case "connection_failed": return "World ID did not respond in time. Start a new connection and try again.";
    case "nullifier_replayed": return "World has already used this proof. Start a new connection and try again.";
    case "max_verifications_reached": return "World will not accept another check right now. Try again later.";
    default: return "World could not finish this check. Check the selected method and try again.";
  }
}

function serverError(error: unknown): string {
  if (typeof error !== "string" || !error.trim() || /^[a-z0-9_]+$/i.test(error.trim())) return "Sign-in failed. Please try again.";
  if (/nullifier did not match|verified nullifier/i.test(error)) return "World confirmed a different person than this proof. Try again.";
  if (/max_verifications_reached/i.test(error)) return "World will not accept another check right now. Try again later.";
  if (/nullifier_replayed/i.test(error)) return "World has already used this proof. Start a new connection and try again.";
  return error;
}

/** Reject failures so the connection widget cannot mark a refused login successful. */
export async function confirmLoginResponse(response: Response): Promise<void> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(serverError(data?.error));
  if (data?.ok !== true) throw new Error("Sign-in could not be confirmed.");
}

export function simulatorLink(connection: string): string {
  const url = new URL(connection);
  if (url.origin !== "https://staging.world.org" || url.pathname !== "/verify") {
    throw new Error("This is not a staging World connection.");
  }
  const simulator = new URL("https://simulator.worldcoin.org/");
  simulator.searchParams.set("connect_url", connection);
  return simulator.toString();
}
