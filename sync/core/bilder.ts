/**
 * Bilderschritt in `publish`: Blossom spiegelt Git.
 *
 * Git trägt die Blossom-URLs (Spec 2026-09-07, Teil 3); dieser Schritt sorgt
 * dafür, dass zu jeder Hash-URL eines Beitrags der Blob auf Blossom liegt und
 * der Lizenznachweis (kind:1063) aus dem `# bilder`-Block auf dem Relay steht.
 *
 * - Blob fehlt, Datei mit demselben Hash liegt im Beitragsordner → BUD-01-Upload
 *   mit dem FOERBICO-Key (kind:24242). Fehlt die Datei: Warnung.
 * - Nachweis fehlt oder unterscheidet sich vom Block → neues 1063 (der jüngste
 *   gewinnt, ADR-0010). Unverändert → nichts. Kein Eintrag im Block: Warnung.
 *
 * Nichts hier blockiert das 30023: Git ist die Wahrheit, die URL steht schon im
 * Beitrag. Warnungen landen in der Job-Summary. Die Außenwelt (Blossom, Relays,
 * Signer) ist injizierbar — die Tests laufen ohne Netz.
 */
import { dirname, extname, join } from 'jsr:@std/path@^1.0.0'
import { encodeHex } from 'jsr:@std/encoding@^1.0.5/hex'
import { type BildMetadaten, type Bilder, type CommonMetadata, KI_WERTE, type KiWert } from './parser.ts'
import { hashAusUrl, type UnsignedEvent } from '../events/article.ts'
import type { SignedEvent, Signer } from './signer.ts'
import { publishToRelays, readEvents } from './relays.ts'

export const BLOSSOM = 'https://blossom.edufeed.org'
/** Wo die Nachweise liegen — wie foerbico-editor (nostr.js) und der Hub. */
export const LICENSE_RELAYS = ['wss://relay-rpi.edufeed.org/', 'wss://relay.edufeed.org/'] as const

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
}
/** Bild-Syntax in Markdown — dieselbe Regex wie events/article.ts, md2blossom und der Hub. */
const BILD = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

export interface BildDatei {
  datei: string
  hash: string
  mime: string
  groesse: number
  bytes: Uint8Array
}

export interface BildUrl {
  hash: string
  url: string
}

/** Alle Bilddateien eines Beitragsordners, nach SHA-256. */
export async function bilddateien(postDir: string): Promise<Map<string, BildDatei>> {
  const out = new Map<string, BildDatei>()
  for await (const e of Deno.readDir(postDir)) {
    const ext = extname(e.name).toLowerCase()
    if (!e.isFile || !MIME[ext]) continue
    const bytes = await Deno.readFile(join(postDir, e.name))
    const hash = encodeHex(await crypto.subtle.digest('SHA-256', bytes))
    out.set(hash, { datei: e.name, hash, mime: MIME[ext], groesse: bytes.length, bytes })
  }
  return out
}

/**
 * Hash-URLs des Beitrags: Cover zuerst, dann die Fließtextbilder in Reihenfolge,
 * ohne Dubletten. Bilder ohne Hash im Pfad (relativ, fremder Host) fallen weg —
 * für sie gibt es weder Blob noch Nachweis.
 */
export function bildUrls(metadata: CommonMetadata, content: string): BildUrl[] {
  const out: BildUrl[] = []
  const add = (url: string) => {
    const hash = hashAusUrl(url)
    if (hash && !out.some((b) => b.hash === hash)) out.push({ hash, url })
  }
  if (metadata.image) add(metadata.image)
  for (const m of content.matchAll(BILD)) add(m[2])
  return out
}

/** Eintrag im Block: unter dem Dateinamen, der URL oder einer URL mit demselben Hash. */
export function eintragFuer(
  bilder: Bilder | undefined,
  hash: string,
  url: string,
  datei?: string,
): BildMetadaten | undefined {
  if (!bilder) return undefined
  if (datei && bilder[datei]) return bilder[datei]
  if (bilder[url]) return bilder[url]
  return Object.entries(bilder).find(([k]) => hashAusUrl(k) === hash)?.[1]
}

export interface NachweisEingabe {
  url: string
  hash: string
  pubkey: string
  eintrag: BildMetadaten
  mime?: string
  groesse?: number
}

/**
 * kind:1063 aus den Konventionsnamen (bildattribution.md), Tag-Form wie
 * md2blossom und foerbico-editor (bilder.js, nachweisEvent): title→title,
 * author→credit, licenceUrl→license, sourceUrl→source, pubkey→p; authorUrl und
 * modification als Zusatz-Tags ohne NIP-Standard. m und size nur, wenn die Datei
 * bekannt ist. ai→ai (generated | modified, edufeed-Wiki license-events-nope
 * vom 2026-09-10) als letzter Tag; ein anderer Wert ergibt keinen Tag — Leser
 * ignorieren ihn ohnehin und behandeln das Bild als nicht deklariert.
 */
export function nachweisEvent(e: NachweisEingabe): UnsignedEvent {
  const l = e.eintrag
  const tags: string[][] = [['url', e.url], ['x', e.hash]]
  if (e.mime) tags.push(['m', e.mime])
  if (e.groesse !== undefined) tags.push(['size', String(e.groesse)])
  tags.push(
    ['title', l.title ?? ''],
    ['license', l.licenceUrl ?? ''],
    ['credit', l.author ?? ''],
    ['alt', l.alt ?? l.title ?? ''],
  )
  if (l.sourceUrl) tags.push(['source', l.sourceUrl])
  if (l.authorUrl) tags.push(['authorUrl', l.authorUrl])
  if (l.modification) tags.push(['modification', l.modification])
  if (l.pubkey) tags.push(['p', l.pubkey])
  if (kiWertGueltig(l.ai)) tags.push(['ai', l.ai])
  return { kind: 1063, pubkey: e.pubkey, created_at: Math.floor(Date.now() / 1000), tags, content: '' }
}

/** Nur die zwei Werte des Wikis sind bedeutungsvoll; alles andere ist „nicht deklariert". */
export function kiWertGueltig(w: unknown): w is KiWert {
  return typeof w === 'string' && (KI_WERTE as readonly string[]).includes(w)
}

/** Zwei Nachweise sagen dasselbe, wenn ihre Tags gleich sind — Zeitstempel und Signatur zählen nicht. */
export function nachweisGleich(a: { tags: string[][] }, b: { tags: string[][] }): boolean {
  return JSON.stringify(a.tags) === JSON.stringify(b.tags)
}

// ---------- Außenwelt ----------

export async function blobVorhanden(hash: string, blossom = BLOSSOM): Promise<boolean> {
  const r = await fetch(`${blossom}/${hash}`, { method: 'HEAD' })
  return r.ok
}

/** BUD-01: signiertes kind:24242 als Authorization, PUT der Bytes, Hash der Antwort geprüft. */
export async function blobHochladen(
  datei: BildDatei,
  signer: Signer,
  pubkey: string,
  blossom = BLOSSOM,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const auth = await signer.signEvent({
    kind: 24242,
    pubkey,
    created_at: now,
    content: `Upload ${datei.datei}`,
    tags: [['t', 'upload'], ['x', datei.hash], ['expiration', String(now + 600)]],
  })
  const r = await fetch(`${blossom}/upload`, {
    method: 'PUT',
    headers: { Authorization: 'Nostr ' + btoa(JSON.stringify(auth)), 'Content-Type': datei.mime },
    body: datei.bytes,
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`Blossom HTTP ${r.status}: ${r.headers.get('x-reason') ?? text.slice(0, 200)}`)
  const antwort = JSON.parse(text) as { sha256?: string }
  if (antwort.sha256 !== datei.hash) throw new Error(`Blossom meldet anderen Hash: ${antwort.sha256}`)
}

/** Jüngster Nachweis des eigenen Keys zu einem Hash, oder null. */
export async function letzterNachweis(
  hash: string,
  pubkey: string,
  relays: readonly string[] = LICENSE_RELAYS,
): Promise<SignedEvent | null> {
  const treffer = (await Promise.all(
    relays.map((r) => readEvents(r, { kinds: [1063], authors: [pubkey], '#x': [hash], limit: 5 })),
  )).flat()
  treffer.sort((a, b) => b.created_at - a.created_at)
  return treffer[0] ?? null
}

// ---------- Der Schritt ----------

export interface BilderDeps {
  pubkey: string
  dryRun: boolean
  signer: Signer | null
  blobVorhanden: (hash: string) => Promise<boolean>
  hochladen: (datei: BildDatei) => Promise<void>
  letzterNachweis: (hash: string) => Promise<{ tags: string[][] } | null>
  /** Publiziert ein signiertes 1063, gibt die Zahl der Acks zurück. */
  publizieren: (ev: SignedEvent) => Promise<number>
}

export interface BilderErgebnis {
  hochgeladen: string[]
  nachweise: string[]
  unveraendert: string[]
  warnungen: string[]
}

export function standardDeps(signer: Signer | null, pubkey: string, dryRun: boolean): BilderDeps {
  return {
    pubkey,
    dryRun,
    signer,
    blobVorhanden: (hash) => blobVorhanden(hash),
    hochladen: (datei) => {
      if (!signer) return Promise.reject(new Error('kein Signer'))
      return blobHochladen(datei, signer, pubkey)
    },
    letzterNachweis: (hash) => letzterNachweis(hash, pubkey),
    publizieren: async (ev) => (await publishToRelays([...LICENSE_RELAYS], ev)).filter((a) => a.ok).length,
  }
}

export async function bilderSchritt(
  parsed: { metadata: CommonMetadata; content: string; bilder?: Bilder },
  dateien: Map<string, BildDatei>,
  deps: BilderDeps,
): Promise<BilderErgebnis> {
  const r: BilderErgebnis = { hochgeladen: [], nachweise: [], unveraendert: [], warnungen: [] }
  const kurz = (h: string) => h.slice(0, 8) + '…'

  for (const { hash, url } of bildUrls(parsed.metadata, parsed.content)) {
    const datei = dateien.get(hash)
    const name = datei?.datei ?? url

    // 1. Blob
    try {
      if (!(await deps.blobVorhanden(hash))) {
        if (!datei) {
          r.warnungen.push(`${kurz(hash)}: Blob fehlt auf Blossom und keine Datei mit diesem Hash im Ordner (${url})`)
        } else if (deps.dryRun) {
          r.hochgeladen.push(hash)
        } else {
          await deps.hochladen(datei)
          r.hochgeladen.push(hash)
        }
      }
    } catch (err) {
      r.warnungen.push(`${kurz(hash)}: Upload von ${name} fehlgeschlagen — ${err instanceof Error ? err.message : String(err)}`)
    }

    // 2. Nachweis
    const eintrag = eintragFuer(parsed.bilder, hash, url, datei?.datei)
    if (!eintrag) {
      r.warnungen.push(`${kurz(hash)}: kein Eintrag im # bilder-Block für ${name} — kein Nachweis`)
      continue
    }
    if (!eintrag.licenceUrl) {
      r.warnungen.push(`${kurz(hash)}: Eintrag für ${name} ohne licenceUrl — kein Nachweis`)
      continue
    }
    if (eintrag.ai !== undefined && !kiWertGueltig(eintrag.ai)) {
      r.warnungen.push(
        `${kurz(hash)}: ai-Wert „${String(eintrag.ai)}" für ${name} unbekannt (erlaubt: ${KI_WERTE.join(', ')}) — Nachweis ohne ai-Tag`,
      )
    }
    const soll = nachweisEvent({
      url, hash, pubkey: deps.pubkey, eintrag, mime: datei?.mime, groesse: datei?.groesse,
    })
    try {
      const ist = await deps.letzterNachweis(hash)
      if (ist && nachweisGleich(ist, soll)) {
        r.unveraendert.push(hash)
        continue
      }
      if (deps.dryRun) {
        r.nachweise.push(hash)
        continue
      }
      if (!deps.signer) throw new Error('kein Signer')
      const signed = await deps.signer.signEvent(soll)
      const acks = await deps.publizieren(signed)
      if (acks === 0) throw new Error('kein Relay hat den Nachweis angenommen')
      r.nachweise.push(hash)
    } catch (err) {
      r.warnungen.push(`${kurz(hash)}: Nachweis für ${name} nicht publiziert — ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return r
}

/** Bequem für publish.ts: Ordner aus dem Pfad der index.md. */
export function postDirVon(indexPath: string): string {
  return dirname(indexPath)
}
