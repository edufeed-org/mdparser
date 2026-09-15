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
  /** schema.org: dieser Text hat eine Übersetzung (URL der anderen Sprachfassung). */
  workTranslation?: string | string[]
  /** schema.org: dieser Text ist die Übersetzung von (URL des Originals). */
  translationOfWork?: string | string[]
}

/**
 * Bildmetadaten aus dem `# bilder`-Block — Feldnamen nach bildattribution.md
 * (Konvention), nicht nach den 1063-Tags; Menschen schreiben den Block.
 * Schlüssel ist der Dateiname oder eine Hash-URL. Ableitbares (Hash, MIME,
 * Größe) steht hier nicht — das rechnet der Konverter aus der Datei.
 * Der Block ist Eingabe zum Prägen; das 1063 auf dem Relay ist Wahrheit.
 */
export interface BildMetadaten {
  alt?: string
  title?: string
  author?: string
  authorUrl?: string
  licence?: string
  licenceUrl?: string
  sourceUrl?: string
  modification?: string
  pubkey?: string
  /** KI-Beteiligung nach edufeed-Wiki (EU-AI-Office-Icons): generated = vollständig KI-generiert, modified = mit KI bearbeitet. */
  ai?: KiWert
}

export const KI_WERTE = ['generated', 'modified'] as const
export type KiWert = (typeof KI_WERTE)[number]

export type Bilder = Record<string, BildMetadaten>

export interface ParsedMarkdown {
  metadata: CommonMetadata
  content: string
  /** Nur vorhanden, wenn das Frontmatter einen `# bilder`-Block hat. */
  bilder?: Bilder
}

export function parseMarkdown(markdown: string): ParsedMarkdown | null {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!match) return null

  const rawYaml = match[1]
  const content = match[2]

  // Drei markierte Blöcke: # commonMetadata, # staticSiteGenerator (Hugo-Reste,
  // werden ignoriert) und # bilder (Bildmetadaten nach bildattribution.md).
  // Jeder Block endet am nächsten Marker dahinter oder am Ende des Frontmatters.
  const ssgIndex = rawYaml.indexOf('# staticSiteGenerator')
  const bilderIndex = rawYaml.indexOf('# bilder')
  const marker = [ssgIndex, bilderIndex].filter((i) => i >= 0)
  const commonEnde = marker.length > 0 ? Math.min(...marker) : rawYaml.length
  const cleanedYaml = rawYaml.substring(0, commonEnde).replace(/^# commonMetadata\s*\n/m, '')

  const parsed = parse(cleanedYaml)
  if (!parsed || typeof parsed !== 'object') return null

  // `inLanguage: de` (String statt Liste) kam in 19 Beiträgen vor; `[0]` davon
  // ergab „d". Ein Mensch meint mit dem String dasselbe wie mit der Liste.
  if (typeof (parsed as { inLanguage?: unknown }).inLanguage === 'string') {
    ;(parsed as { inLanguage: unknown }).inLanguage = [(parsed as { inLanguage: string }).inLanguage]
  }

  const bilder = bilderIndex >= 0 ? bilderBlockLesen(rawYaml, bilderIndex, ssgIndex) : undefined

  return { metadata: parsed as CommonMetadata, content, ...(bilder ? { bilder } : {}) }
}

/**
 * Liest den `# bilder`-Block: vom Marker bis zum nächsten Marker dahinter
 * oder zum Ende. Die Markerzeile selbst ist Kommentar und fällt weg.
 */
function bilderBlockLesen(
  rawYaml: string,
  start: number,
  ssgIndex: number,
): Bilder | undefined {
  const ende = ssgIndex > start ? ssgIndex : rawYaml.length
  const yaml = rawYaml.substring(start, ende).replace(/^# bilder[^\n]*\n/m, '')
  const parsed = parse(yaml)
  if (!parsed || typeof parsed !== 'object') return undefined
  const block = (parsed as { bilder?: unknown }).bilder
  if (!block || typeof block !== 'object') return undefined
  return block as Bilder
}

export function extractSlug(id: string): string {
  const url = new URL(id)
  return url.pathname.replace(/^\//, '').replace(/\/$/, '')
}

// validateRequired ist entfallen: Es führte keywords noch als Pflicht und lief
// damit an validation.ts vorbei (dort seit 2026-09-02 nur empfohlen). Ein
// Prüfer, eine Regel — `validatePost` in core/validation.ts.
