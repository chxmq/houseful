/** Shared loading frames that match real layouts so navigation feels finished. */

export function EventPageSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-[1320px] flex-1 gap-10 px-5 pb-24 pt-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-16 md:px-8 md:pt-12">
      <div className="aspect-[3/4] animate-pulse rounded-[4px] bg-paper-deep" />
      <div className="space-y-4 pt-2">
        <div className="h-3 w-40 animate-pulse rounded-sm bg-ink/10" />
        <div className="h-16 w-[90%] animate-pulse rounded-sm bg-ink/10" />
        <div className="h-16 w-[70%] animate-pulse rounded-sm bg-ink/10" />
        <div className="mt-8 h-24 animate-pulse rounded-[4px] bg-paper-deep" />
        <div className="h-40 animate-pulse rounded-[4px] bg-paper-deep" />
      </div>
    </div>
  );
}

export function CityPageSkeleton() {
  return (
    <div className="mx-auto max-w-[1320px] flex-1 px-5 pb-24 pt-12 md:px-8">
      <div className="h-3 w-24 animate-pulse rounded-sm bg-ink/10" />
      <div className="mt-4 h-20 w-[min(100%,28rem)] animate-pulse rounded-sm bg-ink/10" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-[4px] bg-paper-deep" />
        ))}
      </div>
    </div>
  );
}

export function TicketsSkeleton() {
  return (
    <div className="mx-auto max-w-[720px] flex-1 px-5 pb-24 pt-12 md:px-8">
      <div className="h-12 w-64 animate-pulse rounded-sm bg-ink/10" />
      <div className="mt-10 space-y-10">
        <div className="h-48 animate-pulse rounded-[14px] bg-paper-deep" />
        <div className="h-48 animate-pulse rounded-[14px] bg-paper-deep" />
      </div>
    </div>
  );
}
