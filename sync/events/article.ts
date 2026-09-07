import type { CommonMetadata } from '../core/parser.ts'
import { extractSlug } from '../core/parser.ts'

export interface UnsignedEvent {
  kind: number
  pubkey: string
  created_at: number
  tags: string[][]
  content: string
}

/** Bild-Syntax in Markdown: ![alt](quelle) — dieselbe Regex wie md2blossom und der Hub. */
const BILD = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

/** Hash-URL (Blossom, BUD-01): letztes Pfadsegment ist der SHA-256, Endung optional. */
const HASH_IM_PFAD = /\/([0-9a-f]{64})(?:\.[a-z0-9]+)?$/i

/**
 * SHA-256 aus einer Hash-URL — oder null, wenn der Pfad keinen trägt.
 *
 * Dieselbe Regel wie redaktion-longform.md (Z. 26), edufeeds
 * `getSha256FromURL`, `hub/models/lizenz.js` und der Wächter (Spec
 * 2026-09-07, Teil 1): Eine Bild-URL ohne Hash im Pfad ist kein Zeiger auf
 * einen Nachweis. Relative oder kaputte URLs ergeben null, keinen Fehler.
 */
export function hashAusUrl(url: string): string | null {
  let pfad: string
  try {
    pfad = new URL(url).pathname
  } catch {
    return null
  }
  return pfad.match(HASH_IM_PFAD)?.[1]?.toLowerCase() ?? null
}

/**
 * Hashes aller Fließtextbilder mit Hash-URL, in Reihenfolge des Auftretens,
 * ohne Dubletten. Bilder ohne Hash — relativ, fremder Host — fallen weg:
 * Ein erratener Hash wäre schlimmer als keiner. Die Autorin schreibt nur die
 * URL; alles hier ist daraus abgeleitet.
 */
function textbildHashes(content: string): string[] {
  const hashes: string[] = []
  for (const treffer of content.matchAll(BILD)) {
    const hash = hashAusUrl(treffer[2])
    if (hash && !hashes.includes(hash)) hashes.push(hash)
  }
  return hashes
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

  // Zeiger auf die Nachweise (kind:1063): je Bild ein x-Tag — so hat edufeed
  // es am 07.09.2026 vorgeschlagen. Das Cover zuerst, unmittelbar nach image
  // (ADR-0013, md2blossom Z. 149): edufeeds ArticleView und der Hub lesen das
  // erste x als Cover-Hash. Danach die Fließtextbilder, dedupliziert — zeigt
  // der Text das Cover noch einmal, gibt es ein x, nicht zwei.
  const coverHash = metadata.image ? hashAusUrl(metadata.image) : null
  if (metadata.image) {
    tags.push(['image', metadata.image])
    if (coverHash) tags.push(['x', coverHash])
  }
  for (const hash of textbildHashes(content)) {
    if (hash !== coverHash) tags.push(['x', hash])
  }

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
