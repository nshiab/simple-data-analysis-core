const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Keep combining characters attached to their base without normalizing text.
// Grapheme counts are not terminal display widths for wide characters or emoji.
export default function splitGraphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
}
