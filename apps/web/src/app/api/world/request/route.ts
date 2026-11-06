import { z } from "zod";
import { worldActionFor } from "@/lib/assurance";
import { createWorldRequest } from "@/server/world";

const body = z.object({ eventId: z.string().min(1).max(120) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Missing event." }, { status: 400 });

  try {
    return Response.json(createWorldRequest(worldActionFor(parsed.data.eventId)));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
