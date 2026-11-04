/**
 * Sounds in a note's Markdown. A sound is a link `[audio](media/<file>)` on a line of its own; the
 * screen plays it, and everywhere a note becomes plain text (a list row, an agent's answer, an
 * export) it is left out or said as "(sound)", never shown as the word "audio".
 */

const LINK = String.raw`\[audio\]\(media\/([A-Za-z0-9._-]+)\)`

/** The sound files a text names, each once, in order. */
export function soundFiles(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(new RegExp(LINK, 'g'))].map((match) => match[1]!))]
}

/** The text with its sound links taken out and the gaps they leave closed. */
export function withoutSounds(markdown: string): string {
  return markdown
    .replace(new RegExp(`[ \\t]*${LINK}[ \\t]*`, 'g'), '\u0000')
    .replace(/\n?[ \t]*\u0000[ \t]*\n?/g, (gap, offset: number, whole: string) =>
      // A link between words keeps one space; at a line's edge it leaves no blank line.
      offset > 0 && !gap.includes('\n') && whole[offset + gap.length] !== undefined ? ' ' : '\n',
    )
    .replace(/\u0000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Sounds said as "(sound)", once per run, for the agent's text. */
export function soundsAsWords(markdown: string): string {
  return markdown.replace(new RegExp(`(?:\\s*${LINK})+`, 'g'), ' (sound)').replace(/^\s+|\s+$/g, '')
}

/** Only the words: no sounds and no pictures, for a look inside a file whose media is not stored. */
export function textOnly(markdown: string): string {
  return withoutSounds(markdown)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
}
