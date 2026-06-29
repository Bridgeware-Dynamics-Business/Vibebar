/**
 * Keyword phrases that, when typed at the end of the text immediately before the caret, offer to
 * insert the active project's AI context folder path. Ordered longest-first so the most specific
 * phrase wins (e.g. "ai context folder" before "ai context").
 */
export const CONTEXT_FOLDER_TRIGGERS = [
  'ai context folder',
  'context folder',
  ':: ai context',
  'ai context'
] as const

/**
 * Returns the character length of the matched suffix (trigger phrase plus any trailing colons),
 * or null when no trigger applies. Matching is case-insensitive and only fires on a word
 * boundary so a phrase that is merely a suffix of a larger word (e.g. "subcontext folder") does
 * not trigger. Trailing `:` characters after the phrase (e.g. `ai context folder::`) are included
 * in the match. On accept, the typed phrase is kept (including casing), normalized to end with
 * `::`, and the folder path is appended.
 *
 * @param textBefore Plain text of the current block from its start up to the caret.
 */
export function matchContextFolderTrigger(textBefore: string): number | null {
  // Trailing colons (e.g. "ai context folder::") are part of the trigger and replaced on accept.
  const withoutTrailingColons = textBefore.replace(/:+$/, '')
  const lower = withoutTrailingColons.toLowerCase()
  for (const phrase of CONTEXT_FOLDER_TRIGGERS) {
    if (!lower.endsWith(phrase)) continue
    const startIdx = lower.length - phrase.length
    const prevChar = startIdx > 0 ? lower[startIdx - 1] : ''
    if (startIdx === 0 || /\s/.test(prevChar)) {
      return textBefore.length - startIdx
    }
  }
  return null
}

/**
 * Builds the text inserted on accept: keeps the user's typed trigger phrase (any casing),
 * strips any trailing colons they typed, then appends `::` and the AI context folder path.
 */
export function formatContextFolderInsert(typedSuffix: string, path: string): string {
  const phrase = typedSuffix.replace(/:+$/, '')
  if (!phrase) return path
  return `${phrase}:: ${path}`
}
