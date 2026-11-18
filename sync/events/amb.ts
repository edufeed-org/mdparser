import { nip19 } from 'nostr-tools'
import type { CommonMetadata, Creator } from '../core/parser.ts'
import { extractSlug } from '../core/parser.ts'
import type { UnsignedEvent } from './article.ts'

/** Hex-Pubkey einer `nostr:npub…`/`nostr:nprofile…`-id, sonst null. */
function nostrPubkey(id: string | undefined): string | null {
  if (!id || !/^nostr:/i.test(id)) return null
  try {
    const d = nip19.decode(id.slice(6))
    if (d.type === 'npub') return d.data
    if (d.type === 'nprofile') return d.data.pubkey
  } catch { /* keine gültige Nostr-id: bleibt eine gewöhnliche URI */ }
  return null
}

/**
 * Urheber als creator:*-Lauf. Steht im Front Matter eine Nostr-id, bleibt der
 * Lauf (der genannte Name ist die Nennung) und ein p-Tag kommt als Begleiter
 * dazu, damit Relays die Nennung finden (NIP-AMB, Provenance).
 */
export function creatorTags(creators: Creator[] | undefined): string[][] {
  const tags: string[][] = []
  for (const creator of creators ?? []) {
    const hex = nostrPubkey(creator.id)
    tags.push(['creator:name', `${creator.givenName} ${creator.familyName}`])
    if (creator.type) tags.push(['creator:type', creator.type])
    if (creator.id) tags.push(['creator:id', hex ? `nostr:${nip19.npubEncode(hex)}` : creator.id])
    if (creator.affiliation) {
      tags.push(['creator:affiliation:name', creator.affiliation.name])
      if (creator.affiliation.id) {
        tags.push(['creator:affiliation:id', creator.affiliation.id])
      }
    }
    if (hex) tags.push(['p', hex, '', 'creator'])
  }
  return tags
}

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

  tags.push(...creatorTags(metadata.creator))

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
