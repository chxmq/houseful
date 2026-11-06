import { SiteHeader } from "@/components/site-header";
import { TicketsSkeleton } from "@/components/page-skeleton";

export default function Loading() {
  return (
    <>
      <SiteHeader />
      <TicketsSkeleton />
    </>
  );
}