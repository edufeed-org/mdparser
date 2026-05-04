import type { CommonMetadata, ParsedMarkdown } from './parser.ts'

export type ValidationStatus =
  | 'ok'
  | 'skip-empty-frontmatter'
  | 'skip-missing-fields'
  | 'error'

export interface ValidationResult {
  status: ValidationStatus
  missing: string[]
  reason?: string
}

const REQUIRED_FIELDS: (keyof CommonMetadata)[] = [
  'id',
  'name',
  'description',
  'license',
  'creator',
  'inLanguage',
  'datePublished',
  'keywords',
]

const ID_PREFIX = 'https://oer.community/'

function isEmpty(val: unknown): boolean {
  if (val === undefined || val === null || val === '') return true
  if (Array.isArray(val) && val.length === 0) return true
  return false
}

export function validatePost(parsed: ParsedMarkdown | null): ValidationResult {
  if (parsed === null) {
    return {
      status: 'skip-empty-frontmatter',
      missing: [],
      reason: 'kein Frontmatter oder vollständig auskommentiert',
    }
  }

  const md = parsed.metadata
  const missing: string[] = []
  for (const field of REQUIRED_FIELDS) {
    if (isEmpty(md[field])) missing.push(field)
  }

  if (missing.length === REQUIRED_FIELDS.length) {
    return {
      status: 'skip-empty-frontmatter',
      missing,
      reason: 'alle Pflichtfelder leer',
    }
  }

  if (missing.length > 0) {
    return {
      status: 'skip-missing-fields',
      missing,
      reason: `Pflichtfelder fehlen: ${missing.join(', ')}`,
    }
  }

  if (typeof md.id === 'string' && !md.id.startsWith(ID_PREFIX)) {
    return {
      status: 'error',
      missing: [],
      reason: `id muss mit ${ID_PREFIX} beginnen, ist: ${md.id}`,
    }
  }

  return { status: 'ok', missing: [] }
}
