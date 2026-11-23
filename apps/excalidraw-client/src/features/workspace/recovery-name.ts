function slugify(name: string): string {
  const slug = name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  return slug || 'drawing'
}

/** Human-readable recovery file name with a stable id suffix. */
export function recoveryFileName(tabId: string, name: string): string {
  const shortId = tabId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'tab'

  const withoutExtension = name.endsWith('.excalidraw')
    ? name.slice(0, -'.excalidraw'.length)
    : name

  return `${slugify(withoutExtension)}--${shortId}.excalidraw`
}

export function recoveryRelativePath(fileName: string): string {
  return `recovery/${fileName}`
}
