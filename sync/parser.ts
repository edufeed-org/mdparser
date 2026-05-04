import { parse } from 'yaml'

export interface Creator {
  givenName: string
  familyName: string
  id?: string
  type?: string
  affiliation?: {
    name: string
    id?: string
    type?: string
  }
}

export interface CommonMetadata {
  '@context'?: string
  creativeWorkStatus?: string
  type?: string
  name?: string
  description?: string
  license?: string
  id?: string
  creator?: Creator[]
  inLanguage?: string[]
  about?: string[]
  image?: string
  learningResourceType?: string[]
  educationalLevel?: string[]
  datePublished?: string
  keywords?: string[]
}

export interface ParsedMarkdown {
  metadata: CommonMetadata
  content: string
}

export function parseMarkdown(markdown: string): ParsedMarkdown | null {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!match) return null

  const rawYaml = match[1]
  const content = match[2]

  // commonMetadata-Block endet bei # staticSiteGenerator (Hugo-Reste werden ignoriert)
  const ssgIndex = rawYaml.indexOf('# staticSiteGenerator')
  const commonYaml = ssgIndex >= 0 ? rawYaml.substring(0, ssgIndex) : rawYaml
  const cleanedYaml = commonYaml.replace(/^# commonMetadata\s*\n/m, '')

  const parsed = parse(cleanedYaml)
  if (!parsed || typeof parsed !== 'object') return null

  return { metadata: parsed as CommonMetadata, content }
}

export function extractSlug(id: string): string {
  const url = new URL(id)
  return url.pathname.replace(/^\//, '').replace(/\/$/, '')
}

export function validateRequired(metadata: CommonMetadata): string[] {
  const errors: string[] = []
  const required: (keyof CommonMetadata)[] = [
    'id',
    'name',
    'description',
    'license',
    'creator',
    'inLanguage',
    'datePublished',
    'keywords',
  ]
  for (const field of required) {
    const val = metadata[field]
    if (val === undefined || val === null || val === '') {
      errors.push(`Pflichtfeld fehlt: ${field}`)
    } else if (Array.isArray(val) && val.length === 0) {
      errors.push(`Pflichtfeld leer: ${field}`)
    }
  }
  if (metadata.id && !metadata.id.startsWith('https://oer.community/')) {
    errors.push('id muss mit https://oer.community/ beginnen')
  }
  return errors
}
