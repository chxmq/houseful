import { formatDayNum, formatMonShort } from "@/lib/format";

type Ink = "stamp" | "marigold" | "ink" | "admit";

type EventPosterProps = {
  title: string;
  subtitle?: string | null;
  variant: number;
  ink: Ink;
  startsAt: number;
  timezone?: string;
  venue: string;
  className?: string;
};

const palettes: Record<Ink, { bg: string; fg: string; accent: string }> = {
  stamp: { bg: "#e2401b", fg: "#14110f", accent: "#f1ece2" },
  marigold: { bg: "#f2a51a", fg: "#14110f", accent: "#e2401b" },
  ink: { bg: "#14110f", fg: "#f1ece2", accent: "#f2a51a" },
  admit: { bg: "#0f5a4a", fg: "#f1ece2", accent: "#f2a51a" },
};

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function EventPoster({ title, subtitle, variant, ink, startsAt, timezone, venue, className = "" }: EventPosterProps) {
  const p = palettes[ink];
  const seed = hash(title);
  const day = formatDayNum(startsAt, timezone);
  const month = formatMonShort(startsAt, timezone);
  const words = title.toUpperCase().split(/\s+/);
  const tilt = ((seed % 7) - 3) * 1.5;

  return (
    <div
      className={`relative aspect-[4/5] overflow-hidden [container-type:inline-size] ${className}`}
      style={{ background: p.bg, color: p.fg }}
      role="img"
      aria-label={`Poster for ${title}`}
    >
      <PosterArt variant={variant % 6} seed={seed} accent={p.accent} fg={p.fg} />

      <div className="absolute inset-0 flex flex-col justify-between p-[6cqw]">
        <div className="flex items-start justify-between font-mono text-[3.4cqw] uppercase tracking-[0.14em]">
          <span>{venue}</span>
          <span className="text-right leading-none">
            <span className="block font-display text-[13cqw] font-extrabold tracking-normal">{day}</span>
            {month}
          </span>
        </div>

        <div style={{ rotate: `${variant % 2 === 0 ? 0 : tilt}deg` }}>
          {subtitle ? (
            <p className="mb-[2cqw] font-mono text-[3.2cqw] uppercase tracking-[0.16em] opacity-85">{subtitle}</p>
          ) : null}
          <h3
            className="font-display font-black uppercase leading-[0.82] tracking-[-0.01em]"
            style={{ fontSize: words.some((w) => w.length > 9) ? "13cqw" : "17cqw" }}
          >
            {words.map((word, i) => (
              <span key={`${word}-${i}`} className="block" style={i === 1 && variant % 3 === 0 ? { color: p.accent } : undefined}>
                {word}
              </span>
            ))}
          </h3>
        </div>
      </div>
    </div>
  );
}

function PosterArt({ variant, seed, accent, fg }: { variant: number; seed: number; accent: string; fg: string }) {
  const r = (n: number) => (seed >> n) & 0xff;

  switch (variant) {
    case 0:
      return (
        <svg className="absolute inset-0 size-full" viewBox="0 0 400 500" preserveAspectRatio="none" aria-hidden="true">
          <circle cx={240 + (r(1) % 80)} cy={150 + (r(3) % 60)} r="150" fill={accent} />
          <rect x="0" y="92" width="400" height="8" fill={fg} />
        </svg>
      );
    case 1:
      return (
        <svg className="absolute inset-0 size-full" viewBox="0 0 400 500" preserveAspectRatio="none" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M-40 ${120 + i * 70} L440 ${40 + i * 70} L440 ${70 + i * 70} L-40 ${150 + i * 70}Z`} fill={i % 2 ? fg : accent} opacity={i % 2 ? 0.9 : 1} />
          ))}
        </svg>
      );
    case 2:
      return (
        <svg className="absolute inset-0 size-full" viewBox="0 0 400 500" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <circle key={i} cx="200" cy="230" r={30 + i * 26} fill="none" stroke={i % 3 === 0 ? accent : fg} strokeWidth={i % 3 === 0 ? 9 : 2} />
          ))}
        </svg>
      );
    case 3:
      return (
        <svg className="absolute inset-0 size-full" viewBox="0 0 400 500" preserveAspectRatio="none" aria-hidden="true">
          <rect x={30 + (r(2) % 60)} y="90" width="150" height="260" fill={accent} />
          <rect x={150 + (r(5) % 60)} y="150" width="190" height="190" fill="none" stroke={fg} strokeWidth="10" />
        </svg>
      );
    case 4:
      return (
        <svg className="absolute inset-0 size-full" viewBox="0 0 400 500" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x={i * 34} y={100 + ((r(i % 8) + i * 37) % 160)} width="22" height="400" fill={i % 4 === 0 ? accent : fg} opacity={i % 4 === 0 ? 1 : 0.16} />
          ))}
        </svg>
      );
    default:
      return (
        <svg className="absolute inset-0 size-full" viewBox="0 0 400 500" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 360 Q100 250 200 330 T400 300 V500 H0Z" fill={accent} />
          <path d="M0 410 Q120 330 220 400 T400 380 V500 H0Z" fill={fg} opacity="0.85" />
        </svg>
      );
  }
}
