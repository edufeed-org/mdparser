// sync team [--dry-run]
// Publiziert das Team als NIP-51-Personenliste (kind:30000, d=team) unter dem
// FOERBICO-Key — community-hub ADR-0036. Quelle ist Website/team.yaml neben
// dem content-Verzeichnis:
//
//   title: Unser Team
//   description: Das FOERBICO-Team an drei Standorten …
//   mitglieder:
//     - name: Jörg
//       npub: npub1…
//
// Der Hub holt zu jedem p-Tag das kind:0 und zeigt Name, Bild, about; der
// Petname hier ist nur der Rückfall, wenn kein Profil zu finden ist.
import { join } from 'jsr:@std/path@^1.0.0'
import { parse } from 'yaml'
import { nip19 } from 'nostr-tools'
import { loadConfig } from '../core/config.ts'
import { createSigner } from '../core/signer.ts'
import { ARTICLE_RELAYS, publishToRelays } from '../core/relays.ts'
import type { UnsignedEvent } from '../events/article.ts'

export interface Team {
  title: string
  description: string | null
  mitglieder: Array<{ name: string; hex: string }>
}

/** npub oder 64-Hex → Hex; alles andere ist ein Fehler in der Datei. */
export function hexAus(wert: string): string {
  const t = wert.trim()
  if (/^[0-9a-f]{64}$/i.test(t)) return t.toLowerCase()
  if (t.startsWith('npub1')) {
    const d = nip19.decode(t)
    if (d.type === 'npub') return d.data
  }
  throw new Error(`team.yaml: „${wert}" ist weder npub noch 64-Hex`)
}

/** Liest und prüft team.yaml. */
export function teamLesen(text: string): Team {
  const roh = parse(text)
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) throw new Error('team.yaml: erwartet ein Objekt mit title und mitglieder')
  const r = roh as Record<string, unknown>
  if (typeof r.title !== 'string' || r.title.trim() === '') throw new Error('team.yaml: title fehlt')
  if (!Array.isArray(r.mitglieder) || r.mitglieder.length === 0) throw new Error('team.yaml: mitglieder ist keine nicht-leere Liste')
  const mitglieder = r.mitglieder.map((m, i) => {
    if (!m || typeof m !== 'object') throw new Error(`team.yaml: Mitglied ${i + 1} ist kein Objekt`)
    const e = m as Record<string, unknown>
    if (typeof e.name !== 'string' || e.name.trim() === '') throw new Error(`team.yaml: Mitglied ${i + 1} ohne name`)
    if (typeof e.npub !== 'string') throw new Error(`team.yaml: Mitglied „${e.name}" ohne npub`)
    return { name: e.name.trim(), hex: hexAus(e.npub) }
  })
  const doppelt = mitglieder.map((m) => m.hex).filter((h, i, a) => a.indexOf(h) !== i)
  if (doppelt.length > 0) throw new Error(`team.yaml: Schlüssel doppelt: ${doppelt.join(', ')}`)
  return {
    title: r.title.trim(),
    description: typeof r.description === 'string' && r.description.trim() !== '' ? r.description.trim() : null,
    mitglieder,
  }
}

export function buildTeamEvent(team: Team, pubkey: string, relayHint: string): UnsignedEvent {
  const tags: string[][] = [['d', 'team'], ['title', team.title]]
  if (team.description) tags.push(['description', team.description])
  for (const m of team.mitglieder) tags.push(['p', m.hex, relayHint, m.name])
  return { kind: 30000, pubkey, created_at: Math.floor(Date.now() / 1000), tags, content: '' }
}

export async function runTeam(args: string[]): Promise<number> {
  const dryRun = args.includes('--dry-run')
  const cfg = loadConfig()
  const pfad = join(cfg.contentRoot, '..', 'team.yaml')
  const team = teamLesen(await Deno.readTextFile(pfad))
  const ev = buildTeamEvent(team, cfg.authorPubkeyHex, ARTICLE_RELAYS[0])
  console.log(`=== team === ${team.mitglieder.length} Mitglieder aus ${pfad}, dry-run=${dryRun}`)
  if (dryRun) { console.log(JSON.stringify(ev, null, 2)); return 0 }

  const signer = await createSigner(cfg)
  if ((await signer.getPublicKey()) !== cfg.authorPubkeyHex) {
    console.error('Bunker-Pubkey stimmt nicht mit AUTHOR_PUBKEY_HEX überein')
    return 1
  }
  const signed = await signer.signEvent(ev)
  const acks = await publishToRelays(ARTICLE_RELAYS, signed)
  for (const a of acks) console.log(`${a.ok ? '✅' : '❌'} ${a.relay} ${a.message ?? ''}`)
  const ok = acks.filter((a) => a.ok).length
  console.log(`id=${signed.id}  acks=${ok}/${acks.length}`)
  return ok >= cfg.minRelayAcks ? 0 : 1
}

if (import.meta.main) Deno.exit(await runTeam(Deno.args))
