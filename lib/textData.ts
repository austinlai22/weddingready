/** Keeps user text inside its delimiters: no angle brackets, no control characters, capped length. */
export function asData(text: string, max: number): string {
  return text
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, (c) => (c === '<' ? '‹' : '›'))
    .slice(0, max)
    .trim();
}
