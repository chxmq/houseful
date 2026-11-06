import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Scanner } from "@/components/door/scanner";
import { event as getEvent } from "@/server/queries";

export async function generateMetadata({ params }: PageProps<"/door/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const e = await getEvent(slug);
  return { title: e ? `Door: ${e.title}` : "Door", robots: { index: false } };
}

export const viewport: Viewport = {
  themeColor: "#14110f",
};

export default function DoorPage({ params }: PageProps<"/door/[slug]">) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-ink text-paper">
      <Suspense
        fallback={<p className="p-6 font-mono text-xs uppercase tracking-[0.16em] text-paper/50">Opening the door</p>}
      >
        <DoorContent params={params} />
      </Suspense>
    </main>
  );
}

async function DoorContent({ params }: Pick<PageProps<"/door/[slug]">, "params">) {
  const { slug } = await params;
  const e = await getEvent(slug);
  if (!e || e.chainEventId == null) notFound();

  return (
    <Scanner
      show={{
        slug: e.slug,
        chainEventId: e.chainEventId,
        title: e.title,
        venue: e.venue.name,
        startsAt: e.startsAt,
        doorsAt: e.doorsAt,
      }}
    />
  );
}
