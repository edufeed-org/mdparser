import type { CommonMetadata } from '../parser.ts'
import { extractSlug } from '../parser.ts'
import type { UnsignedEvent } from './article.ts'

export function buildAmbEvent(
  metadata: CommonMetadata,
  pubkey: string,
  contentRelay: string,
): UnsignedEvent {
  const slug = extractSlug(metadata.id!)

  const tags: string[][] = [
    ['d', slug],
    ['type', metadata.type ?? 'LearningResource'],
    ['name', metadata.name!],
    ['description', metadata.description!],
  ]

  if (metadata.license) tags.push(['license:id', metadata.license])

  if (metadata.creator) {
    for (const creator of metadata.creator) {
      tags.push(['creator:name', `${creator.givenName} ${creator.familyName}`])
      if (creator.type) tags.push(['creator:type', creator.type])
      if (creator.id) tags.push(['creator:id', creator.id])
      if (creator.affiliation) {
        tags.push(['creator:affiliation:name', creator.affiliation.name])
        if (creator.affiliation.id) {
          tags.push(['creator:affiliation:id', creator.affiliation.id])
        }
      }
    }
  }

  if (metadata.inLanguage) {
    for (const lang of metadata.inLanguage) tags.push(['inLanguage', lang])
  }
  if (metadata.about) {
    for (const uri of metadata.about) tags.push(['about:id', uri])
  }
  if (metadata.learningResourceType) {
    for (const uri of metadata.learningResourceType) {
      tags.push(['learningResourceType:id', uri])
    }
  }
  if (metadata.educationalLevel) {
    for (const uri of metadata.educationalLevel) {
      tags.push(['educationalLevel:id', uri])
    }
  }
  if (metadata.datePublished) tags.push(['datePublished', metadata.datePublished])
  if (metadata.image) tags.push(['image', metadata.image])
  if (metadata.keywords) {
    for (const kw of metadata.keywords) tags.push(['t', kw])
  }

  tags.push(['a', `30023:${pubkey}:${slug}`, contentRelay, 'content'])

  return {
    kind: 30142,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: metadata.description ?? '',
  }
}
