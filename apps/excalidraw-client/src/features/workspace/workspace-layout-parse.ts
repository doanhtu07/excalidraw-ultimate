import type { PersistedTab, WorkspaceLayout } from './workspace-layout'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isFileStat(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      typeof value.lastModified === 'number' &&
      typeof value.size === 'number')
  )
}

function isPersistedTab(value: unknown): value is PersistedTab {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isNullableString(value.fileName) &&
    isNullableString(value.filePath) &&
    typeof value.revision === 'number' &&
    typeof value.savedVersion === 'number' &&
    isFileStat(value.stat) &&
    isNullableString(value.recovery)
  )
}

export function parseWorkspaceLayout(text: string): WorkspaceLayout | null {
  try {
    const parsed = JSON.parse(text) as unknown

    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      typeof parsed.root !== 'string' ||
      typeof parsed.name !== 'string' ||
      !isNullableString(parsed.activeTabId) ||
      !Array.isArray(parsed.tabs)
    ) {
      return null
    }

    return {
      version: 1,
      root: parsed.root,
      name: parsed.name,
      activeTabId: parsed.activeTabId,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      tabs: parsed.tabs.filter(isPersistedTab),
    }
  } catch {
    return null
  }
}
