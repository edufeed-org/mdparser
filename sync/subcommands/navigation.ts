// sync navigation [--dry-run]
// Publiziert die Kuratierungslisten des Hubs (NIP-51 kind:30004): Hauptmenü
// (d=navigation) und Fußzeilenlinks (d=fusszeile) — community-hub ADR-0027.
// Quelle ist Website/navigation.yaml neben dem content-Verzeichnis:
//
//   navigation: [tagungen, oer-und-oep, qualitaet, unser-team]
//   fusszeile: [impressum, datenschutz]
//
// Jeder Eintrag ist das d einer Seite (kind:30023 desselben Autors). Der Hub
// beschriftet mit dem Seitentitel und überspringt, was er nicht kennt.
import { join } from 'jsr:@std/path@^1.0.0'
import { parse } from 'yaml'
import { loadConfig } from '../core/config.ts'
import { createSigner } from '../core/signer.ts'
import { ARTICLE_RELAYS, publishToRelays } from '../core/relays.ts'
import type { UnsignedEvent } from '../events/article.ts'

/** Anzeigename je Liste — nur Kosmetik für Clients, der Hub liest die d-Kennung. */
const TITEL: Record<string, string> = { navigation: 'Hauptmenü', fusszeile: 'Fußzeile' }

export type Listen = Record<string, string[]>

/** Liest und prüft navigation.yaml: Objekt aus Listen von nicht-leeren Strings. */
export function listenLesen(text: string): Listen {
  const roh = parse(text)
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    throw new Error('navigation.yaml: erwartet ein Objekt mit Listen (navigation, fusszeile)')
  }
  const listen: Listen = {}
  for (const [name, wert] of Object.entries(roh as Record<string, unknown>)) {
    if (!Array.isArray(wert) || wert.some((e) => typeof e !== 'string' || e.trim() === '')) {
      throw new Error(`navigation.yaml: „${name}" muss eine Liste von d-Kennungen sein`)
    }
    listen[name] = (wert as string[]).map((e) => e.trim())
  }
  if (Object.keys(listen).length === 0) throw new Error('navigation.yaml: keine Liste enthalten')
  return listen
}

/** Ein kind:30004 je Liste; a-Tags in der Reihenfolge der Datei, Relay-Hinweis auf das erste Artikel-Relay. */
export function buildListenEvents(listen: Listen, pubkey: string, relayHint: string): UnsignedEvent[] {
  const jetzt = Math.floor(Date.now() / 1000)
  return Object.entries(listen).map(([name, ds]) => ({
    kind: 30004,
    pubkey,
    created_at: jetzt,
    tags: [
      ['d', name],
      ['title', TITEL[name] ?? name],
      ...ds.map((d) => ['a', `30023:${pubkey}:${d}`, relayHint]),
    ],
    content: '',
  }))
}

export async function runNavigation(args: string[]): Promise<number> {
  const dryRun = args.includes('--dry-run')
  const cfg = loadConfig()
  const pfad = join(cfg.contentRoot, '..', 'navigation.yaml')
  const listen = listenLesen(await Deno.readTextFile(pfad))
  const events = buildListenEvents(listen, cfg.authorPubkeyHex, ARTICLE_RELAYS[0])
  console.log(`=== navigation === ${Object.keys(listen).join(', ')} aus ${pfad}, dry-run=${dryRun}`)
  if (dryRun) {
    console.log(JSON.stringify(events, null, 2))
    return 0
  }

  const signer = await createSigner(cfg)
  if ((await signer.getPublicKey()) !== cfg.authorPubkeyHex) {
    console.error('Signer-Pubkey stimmt nicht mit AUTHOR_PUBKEY_HEX überein')
    return 1
  }
  let alleOk = true
  for (const ev of events) {
    const signed = await signer.signEvent(ev)
    const acks = await publishToRelays(ARTICLE_RELAYS, signed)
    for (const a of acks) console.log(`${a.ok ? '✅' : '❌'} ${a.relay} ${a.message ?? ''}`)
    const ok = acks.filter((a) => a.ok).length
    console.log(`${ev.tags[0][1]}: id=${signed.id}  acks=${ok}/${acks.length}`)
    if (ok < cfg.minRelayAcks) alleOk = false
  }
  return alleOk ? 0 : 1
}

if (import.meta.main) Deno.exit(await runNavigation(Deno.args))
