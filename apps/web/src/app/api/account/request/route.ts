import { cookies } from "next/headers";
import { z } from "zod";
import { HOUSEFUL_LOGIN_ACTION } from "@/lib/assurance";
import { LOGIN_CHALLENGE_COOKIE, newChallenge } from "@/server/auth/store";
import { createWorldRequest } from "@/server/world";

const body = z.object({ kind: z.literal("fan").default("fan") });

export async function POST(req: Request) {
  const parsed = body.safeParse((await req.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return Response.json({ error: "Fan login only uses World ID." }, { status: 400 });

  const challenge = newChallenge();
  const jar = await cookies();
  jar.set(LOGIN_CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  try {
    const request = createWorldRequest(HOUSEFUL_LOGIN_ACTION);
    return Response.json({ ...request, challenge });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
