"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { listShow } from "@/app/host/actions";
import { CATEGORIES, chainParams, draftSchema, INKS, slugify, type EventDraft } from "@/lib/event-draft";
import { categoryLabel, formatUsdt, formatLongDate, formatTime } from "@/lib/format";
import { createShow } from "@/lib/host-actions";
import { explainError } from "@/lib/ticket-actions";
import { EventPoster } from "../event-poster";
import { CheckIcon } from "../icons";

export type VenueOption = { id: string; name: string; area: string; capacity: number };

type Phase = { kind: "editing" } | { kind: "working"; step: 0 | 1 } | { kind: "failed"; error: string };

const IST = "+05:30";

function istParts(seconds: number) {
  const d = new Date((seconds + 5.5 * 3600) * 1000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}

function nextSaturdayEvening(now: number) {
  const d = new Date((now + 5.5 * 3600) * 1000);
  const days = (6 - d.getUTCDay() + 7) % 7;
  const add = (days < 3 ? days + 7 : days) * 86_400;
  const day = new Date((now + add + 5.5 * 3600) * 1000).toISOString().slice(0, 10);
  return Math.floor(Date.parse(`${day}T20:00:00${IST}`) / 1000);
}

type Form = Omit<EventDraft, "slug" | "lineup" | "startsAt"> & { date: string; time: string; lineup: string };

export function ShowForm({ venues, now }: { venues: VenueOption[]; now: number }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(() => ({
    title: "",
    subtitle: "",
    category: "music",
    venueId: venues[0]?.id ?? "",
    hostName: "",
    ...istParts(nextSaturdayEvening(now)),
    doorsBeforeMins: 60,
    durationMins: 150,
    priceUsd: 12,
    capacity: 300,
    seated: false,
    surrenderCutoffHours: 24,
    ageLimit: 18,
    language: "Hindi, English",
    description: "",
    lineup: "",
    posterVariant: 2,
    posterInk: "stamp",
  }));
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [openedAt] = useState(() => Math.max(now, Math.floor(Date.now() / 1000)));

  const set = <K extends keyof Form>(key: K) => (value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const draftBase = useMemo(() => {
    const { date, time, lineup, ...rest } = form;
    return {
      ...rest,
      startsAt: Math.floor(Date.parse(`${date}T${time}:00${IST}`) / 1000),
      lineup: lineup
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }, [form]);

  const titleSlug = slugify(form.title);
  const slugPreview = `${titleSlug || "your-show"}-····`;
  const check = draftSchema.safeParse({ ...draftBase, slug: "preview" });
  const issues = check.success ? [] : [...new Set(check.error.issues.map((i) => String(i.path[0])))];
  const venue = venues.find((v) => v.id === form.venueId);
  const terms = check.success ? chainParams(check.data, now) : null;
  const scheduleProblem = !terms
    ? null
    : Number(terms.surrenderCutoff) <= openedAt + 600
      ? "Hand-backs would already be closed. Pick a later date or a shorter cutoff."
      : null;
  const slugProblem = form.title.trim().length >= 2 && !titleSlug
    ? "Add a few English letters to the title so we can make a URL."
    : null;
  const ready = check.success && !scheduleProblem && !slugProblem;

  async function submit() {
    if (!titleSlug) {
      setPhase({ kind: "failed", error: slugProblem ?? "Add a few English letters to the title so we can make a URL." });
      return;
    }
    const suffix = Array.from(crypto.getRandomValues(new Uint8Array(2)), (b) => b.toString(16).padStart(2, "0")).join("");
    const parsed = draftSchema.safeParse({ ...draftBase, slug: `${titleSlug}-${suffix}` });
    if (!parsed.success) {
      setPhase({ kind: "failed", error: "The form still has a problem. Check the highlighted fields." });
      return;
    }
    try {
      setPhase({ kind: "working", step: 0 });
      const { hash } = await createShow(parsed.data);
      setPhase({ kind: "working", step: 1 });
      const listed = await listShow(parsed.data, hash);
      if (!listed.ok) throw new Error(listed.error);
      router.push(`/e/${listed.slug}`);
    } catch (err) {
      setPhase({ kind: "failed", error: explainError(err) });
    }
  }

  const working = phase.kind === "working";

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-12"
      >
        <Section index="01" title="The show">
          <Field label="Title">
            <input required maxLength={60} value={form.title} onChange={(e) => set("title")(e.target.value)} className={input} />
          </Field>
          <Field label="One line under the title">
            <input maxLength={90} value={form.subtitle} onChange={(e) => set("subtitle")(e.target.value)} className={input} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Category">
              <select value={form.category} onChange={(e) => set("category")(e.target.value as Form["category"])} className={input}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel[c] ?? c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hosted by">
              <input required maxLength={60} value={form.hostName} onChange={(e) => set("hostName")(e.target.value)} className={input} />
            </Field>
          </div>
          <Field label="What people should know" hint="At least a couple of sentences.">
            <textarea
              required
              rows={5}
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
              className={`${input} resize-y`}
            />
          </Field>
          <Field label="Lineup" hint="One name per line. Optional.">
            <textarea rows={3} value={form.lineup} onChange={(e) => set("lineup")(e.target.value)} className={`${input} resize-y`} />
          </Field>
        </Section>

        <Section index="02" title="Where and when">
          <Field label="Venue">
            <select value={form.venueId} onChange={(e) => set("venueId")(e.target.value)} className={input}>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}, {v.area}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Date">
              <input type="date" required value={form.date} onChange={(e) => set("date")(e.target.value)} className={input} />
            </Field>
            <Field label="Show starts (IST)">
              <input type="time" required value={form.time} onChange={(e) => set("time")(e.target.value)} className={input} />
            </Field>
            <Field label="Doors open, minutes before">
              <NumberInput value={form.doorsBeforeMins} onChange={set("doorsBeforeMins")} min={0} max={240} />
            </Field>
            <Field label="Runs for, minutes">
              <NumberInput value={form.durationMins} onChange={set("durationMins")} min={15} max={1440} />
            </Field>
            <Field label="Language">
              <input value={form.language} onChange={(e) => set("language")(e.target.value)} className={input} />
            </Field>
            <Field label="Minimum age">
              <NumberInput value={form.ageLimit} onChange={set("ageLimit")} min={0} max={21} />
            </Field>
          </div>
        </Section>

        <Section index="03" title="The terms">
          <p className="-mt-2 max-w-[56ch] text-sm text-ink-soft">
            These go on chain when you list. Nobody can change them afterwards, including you.
          </p>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Face value, ₹">
              <NumberInput value={form.priceUsd} onChange={set("priceUsd")} min={0} max={100000} />
            </Field>
            <Field label="Seats" hint={venue ? `${venue.name} holds ${venue.capacity.toLocaleString("en-IN")}` : undefined}>
              <NumberInput value={form.capacity} onChange={set("capacity")} min={1} max={100000} />
            </Field>
            <Field label="Hand-backs close, hours before doors">
              <NumberInput value={form.surrenderCutoffHours} onChange={set("surrenderCutoffHours")} min={0} max={336} />
            </Field>
          </div>
        </Section>

        <Section index="04" title="The poster">
          <div className="flex flex-wrap gap-6">
            <Field label="Layout" group>
              <div className="flex gap-2">
                {[0, 1, 2, 3, 4, 5].map((v) => (
                  <Choice key={v} selected={form.posterVariant === v} onClick={() => set("posterVariant")(v)}>
                    {v + 1}
                  </Choice>
                ))}
              </div>
            </Field>
            <Field label="Ink" group>
              <div className="flex gap-2">
                {INKS.map((ink) => (
                  <Choice key={ink} selected={form.posterInk === ink} onClick={() => set("posterInk")(ink)}>
                    <span className={`block size-4 rounded-full ${inkSwatch[ink]}`} />
                    <span className="sr-only">{ink}</span>
                  </Choice>
                ))}
              </div>
            </Field>
          </div>
        </Section>

        <div className="border-t-2 border-ink pt-6">
          <AnimatePresence mode="wait">
            {working ? (
              <motion.ol key="steps" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                {["Writing the terms to the contract", "Adding the show to the guide"].map((label, i) => (
                  <li key={label} className={`flex items-center gap-3 ${i > phase.step ? "text-muted" : ""}`}>
                    <span className="inline-flex size-5 items-center justify-center">
                      {i < phase.step ? (
                        <CheckIcon size={18} className="text-admit" />
                      ) : i === phase.step ? (
                        <span className="size-2.5 animate-pulse rounded-full bg-stamp" />
                      ) : (
                        <span className="size-2 rounded-full bg-ink/20" />
                      )}
                    </span>
                    {label}
                  </li>
                ))}
              </motion.ol>
            ) : (
              <motion.div key="submit" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {phase.kind === "failed" ? <p className="mb-4 font-medium text-reject">{phase.error}</p> : null}
                {issues.length > 0 && form.title ? (
                  <p className="mb-4 text-sm text-ink-soft">Still needed: {issues.map((k) => fieldNames[k] ?? k).join(", ")}.</p>
                ) : null}
                {scheduleProblem ? <p className="mb-4 text-sm font-medium text-reject">{scheduleProblem}</p> : null}
                {slugProblem ? <p className="mb-4 text-sm font-medium text-reject">{slugProblem}</p> : null}
                <button
                  type="submit"
                  disabled={!ready}
                  className="rounded-full bg-ink px-7 py-3.5 font-semibold text-paper disabled:opacity-40"
                >
                  List it on chain
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </form>

      <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
        <EventPoster
          title={form.title || "Your show"}
          subtitle={form.subtitle}
          variant={form.posterVariant}
          ink={form.posterInk}
          startsAt={draftBase.startsAt || nextSaturdayEvening(now)}
          venue={venue?.name ?? ""}
          className="mx-auto max-w-[360px] rounded-[4px] shadow-[0_30px_60px_-30px_rgba(20,17,15,0.45)]"
        />

        <div className="rounded-[4px] bg-ink p-5 font-mono text-[12px] leading-relaxed text-paper">
          <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-paper/50">What your wallet signs</p>
          <p>houseful.createEvent({"{"}</p>
          <div className="pl-4">
            <Term name="faceValue" value={terms ? `${terms.faceValue} units` : "…"} note={formatUsdt(form.priceUsd)} />
            <Term name="capacity" value={terms ? String(terms.capacity) : "…"} note="one per verified person" />
            <Term
              name="surrenderCutoff"
              value={terms ? String(terms.surrenderCutoff) : "…"}
              note={terms ? `${formatLongDate(Number(terms.surrenderCutoff))}, ${formatTime(Number(terms.surrenderCutoff))}` : ""}
            />
            <Term
              name="endsAt"
              value={terms ? String(terms.endsAt) : "…"}
              note={terms ? `${formatLongDate(Number(terms.endsAt))}, ${formatTime(Number(terms.endsAt))}` : ""}
            />
            <Term name="metadataURI" value={`"houseful:event/${slugPreview}"`} />
            <Term name="metadataHash" value={terms ? `${terms.metadataHash.slice(0, 18)}…` : "…"} note="this page, hashed" />
          </div>
          <p>{"})"}</p>
        </div>
      </aside>
    </div>
  );
}

const input =
  "w-full rounded-[4px] border border-ink/25 bg-paper px-3.5 py-2.5 text-[15px] text-ink outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-marigold/60";

const inkSwatch: Record<(typeof INKS)[number], string> = {
  stamp: "bg-stamp",
  marigold: "bg-marigold",
  ink: "bg-ink",
  admit: "bg-admit",
};

const fieldNames: Record<string, string> = {
  title: "a title",
  hostName: "who is hosting",
  description: "a description of at least 20 characters",
  startsAt: "a date and time",
  venueId: "a venue",
};

function Section({ index, title, children }: { index: string; title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-5">
      <legend className="mb-5 flex items-baseline gap-3">
        <span className="font-mono text-xs text-stamp">{index}</span>
        <span className="font-display text-3xl font-extrabold uppercase leading-none">{title}</span>
      </legend>
      {children}
    </fieldset>
  );
}

function Field({ label, hint, group, children }: { label: string; hint?: string; group?: boolean; children: ReactNode }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="block" role={group ? "group" : undefined} aria-label={group ? label : undefined}>
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </Tag>
  );
}

function NumberInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? NaN : Math.floor(Number(e.target.value)))}
      className={`${input} tabular-nums`}
    />
  );
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex size-10 items-center justify-center rounded-[4px] border font-mono text-sm ${
        selected ? "border-ink bg-ink text-paper" : "border-ink/25"
      }`}
    >
      {children}
    </button>
  );
}

/** A line of the contract call that flashes when its value changes. */
function Term({ name, value, note }: { name: string; value: string; note?: string }) {
  return (
    <div className="relative">
      <AnimatePresence initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0.55 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9 }}
          className="pointer-events-none absolute -inset-x-1.5 inset-y-0 rounded-[2px] bg-marigold/40"
        />
      </AnimatePresence>
      <span className="relative">
        <span className="text-paper/60">{name}:</span> <span className="text-marigold">{value}</span>,
        {note ? <span className="text-paper/40"> {"// "}{note}</span> : null}
      </span>
    </div>
  );
}
