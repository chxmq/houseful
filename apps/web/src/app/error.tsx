"use client";

import Link from "next/link";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <>
      <header className="border-b border-line px-5 py-5">
        <Link href="/" className="font-display text-2xl font-bold uppercase">Houseful</Link>
      </header>
      <main id="main" className="mx-auto w-full max-w-[720px] flex-1 px-5 py-20" role="alert">
        <h1 className="font-display text-5xl font-bold uppercase">This page could not load</h1>
        <p className="mt-5 text-lg">Please try again. If it still does not open, come back in a moment.</p>
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <button onClick={retry} className="min-h-11 bg-ink px-5 py-3 font-medium text-paper">Try again</button>
          <Link href="/search" className="py-3 underline">Find a show</Link>
        </div>
      </main>
    </>
  );
}
