import { cookies } from "next/headers";
import { HOST_CHALLENGE_COOKIE, hostLoginMessage, newChallenge } from "@/server/auth/store";

export async function POST() {
  const challenge = newChallenge();
  const jar = await cookies();
  jar.set(HOST_CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return Response.json({ challenge, message: hostLoginMessage(challenge) });
}
