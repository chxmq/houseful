import { cookies } from "next/headers";
import {
  encodeHostChallenge,
  HOST_CHALLENGE_COOKIE,
  newChallenge,
  requestOrigin,
} from "@/server/auth/store";

export async function POST(req: Request) {
  const challenge = newChallenge();
  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + 600_000).toISOString();
  const origin = requestOrigin(req);

  const jar = await cookies();
  jar.set(HOST_CHALLENGE_COOKIE, encodeHostChallenge({ challenge, issuedAt, expirationTime }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return Response.json({ challenge, issuedAt, expirationTime, origin });
}
