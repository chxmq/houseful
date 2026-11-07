/** Events that use a custom full-bleed poster instead of generated ink art. */
export function posterImageFor(eventId: string): string | null {
  if (eventId === "devcon-mumbai") return "/posters/devcon.svg";
  return null;
}
