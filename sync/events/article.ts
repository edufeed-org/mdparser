import type { CommonMetadata } from '../parser.ts'
import { extractSlug } from '../parser.ts'

export interface UnsignedEvent {
  kind: number
  pubkey: string
  created_at: number
  tags: string[][]
  content: string
}

export function buildArticleEvent(
  metadata: CommonMetadata,
  content: string,
  pubkey: string,
  ambRelay: string,
): UnsignedEvent {
  const slug = extractSlug(metadata.id!)
  const lang = metadata.inLanguage?.[0] ?? 'de'

  const tags: string[][] = [
    ['d', slug],
    ['title', metadata.name!],
    ['summary', metadata.description!, lang],
    ['published_at', String(Math.floor(new Date(metadata.datePublished!).getTime() / 1000))],
    ['inLanguage', lang],
  ]

  if (metadata.image) tags.push(['image', metadata.image])

  if (metadata.about) {
    for (const uri of metadata.about) tags.push(['about', uri])
  }

  if (metadata.keywords) {
    for (const kw of metadata.keywords) tags.push(['t', kw])
  }

  if (metadata.type === 'LearningResource') {
    tags.push(['a', `30142:${pubkey}:${slug}`, ambRelay, 'amb-metadata'])
  }

  return {
    kind: 30023,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  }
}
