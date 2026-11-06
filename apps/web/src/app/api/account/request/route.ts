import { cookies } from "next/headers";
import { z } from "zod";
import { accountActionFor } from "@/lib/assurance";
import { LOGIN_CHALLENGE_COOKIE, newLoginChallenge } from "@/server/auth/store";
import { createWorldRequest } from "@/server/world";

const body = z.object({ kind: z.enum(["fan", "host"]) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Say whether this is a fan or host login." }, { status: 400 });

  const challenge = newLoginChallenge();
  const jar = await cookies();
  jar.set(LOGIN_CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  try {
    const request = createWorldRequest(accountActionFor(parsed.data.kind));
    return Response.json({ ...request, challenge });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
