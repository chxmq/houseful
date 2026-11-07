/**
 * How a title is set on a generated poster. The poster is 4:5, so with the 6cqw padding and the venue
 * and date row there is room for about 70cqw of title. Each line is 0.82 of the font size high, and a
 * condensed capital is about 0.47 em wide, measured on a rendered poster.
 */
const MAX_LINE_CHARS = 12;
const LINE_HEIGHT = 0.82;
const ROOM_HEIGHT = 70;
const ROOM_WIDTH = 88;
const CAPITAL_WIDTH = 0.47;

/** Short titles keep one word per line, which is the look of the posters. Longer ones are grouped to fit. */
export function posterLines(title: string): string[] {
  const words = title.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 4) return words;

  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + 1 + word.length <= MAX_LINE_CHARS) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** The title font size in container width units: the usual size, made smaller only when the title needs it. */
export function posterFontSize(lines: string[]): number {
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const usual = longest > 9 ? 13 : 17;
  const byHeight = ROOM_HEIGHT / (Math.max(1, lines.length) * LINE_HEIGHT);
  const byWidth = ROOM_WIDTH / (longest * CAPITAL_WIDTH);
  return Math.min(usual, byHeight, byWidth);
}

/** The space a title takes, in the same units, for checking that it fits. */
export function posterTitleSize(lines: string[]) {
  const size = posterFontSize(lines);
  const longest = Math.max(1, ...lines.map((line) => line.length));
  return { size, height: lines.length * LINE_HEIGHT * size, width: longest * CAPITAL_WIDTH * size };
}

export const POSTER_ROOM = { height: ROOM_HEIGHT, width: ROOM_WIDTH };
