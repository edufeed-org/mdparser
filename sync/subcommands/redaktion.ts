// sync redaktion [--dry-run]
// Veröffentlicht die Redaktionsliste (NIP-51 kind:30000, d=redaktion) unter dem
// FOERBICO-Key. Quelle ist community-hub/docs/redaktionskreis.md — die Liste
// hier ist eine Kopie und muss mit der Datei übereinstimmen (ADR-0021).
import { loadConfig } from '../core/config.ts'
import { createSigner } from '../core/signer.ts'
import { ARTICLE_RELAYS, publishToRelays } from '../core/relays.ts'
import type { UnsignedEvent } from '../events/article.ts'

export const REDAKTION: Array<{ name: string; hex: string }> = [
  { name: 'Florian', hex: '644ef8a990a90bd3f28d5e176cddfd575c15ba289754d424bdda9174dc143ed9' },
  { name: 'Phillip', hex: '43415482fc9893454693aed3913acfda950a06eb4c072457a9df7390db56faf1' },
  { name: 'Laura', hex: 'f2fd319471c0a466a021e787c9307d4276f10551617ee553394a7fecd0b6e8ca' },
  { name: 'Corinna', hex: 'f0a28f62394c4fb487f1bc58fdd13c8ceaf96a2c878922cdb3ceab914c5d0744' },
  { name: 'Ludger', hex: '3c35fc4a95a306b4ca418d678d03c91376a759d4078043436d11095efa5a25c9' },
  { name: 'Jens', hex: 'f0a250fda57445e71fca119fdd6179ac3d915f043bb4594856e79a733145a00f' },
  { name: 'Steffen', hex: '1c5ff3caacd842c01dca8f378231b16617516d214da75c7aeabbe9e1efe9c0f6' },
  { name: 'Gina', hex: 'd1f647c9ae5892bacdf2bb8288b319fb566de694479b032314b2a6e5edf31781' },
  { name: 'Jörg', hex: '4fa5d1c413e2b45e10d40bf3562ab701a5331206e359c90baae0e99bfd6c6e41' },
]

export function buildRedaktionEvent(pubkey: string): UnsignedEvent {
  const tags: string[][] = [
    ['d', 'redaktion'],
    ['title', 'FOERBICO Redaktionskreis'],
    ['description', 'Darf Beiträge freigeben (foerbico/review) und als redigiert markieren (foerbico/status).'],
  ]
  for (const p of REDAKTION) tags.push(['p', p.hex, ARTICLE_RELAYS[0], p.name])
  return { kind: 30000, pubkey, created_at: Math.floor(Date.now() / 1000), tags, content: '' }
}

export async function runRedaktion(args: string[]): Promise<number> {
  const dryRun = args.includes('--dry-run')
  const cfg = loadConfig()
  const ev = buildRedaktionEvent(cfg.authorPubkeyHex)
  console.log(`=== redaktion === ${REDAKTION.length} Mitglieder, dry-run=${dryRun}`)
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

if (import.meta.main) Deno.exit(await runRedaktion(Deno.args))
