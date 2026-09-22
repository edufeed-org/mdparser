import { assertEquals } from 'jsr:@std/assert@^1.0.0'
import { ambZurueckziehen, type RueckzugDeps } from './amb-rueckzug.ts'
import type { SignedEvent, Signer } from './signer.ts'
import type { UnsignedEvent } from '../events/article.ts'

const PK = 'b'.repeat(64)

function altesAmb(slug: string): SignedEvent {
  return {
    kind: 30142,
    pubkey: PK,
    created_at: 1_700_000_000,
    content: '',
    tags: [['d', slug], ['type', 'LearningResource']],
    id: 'e'.repeat(64),
    sig: 'f'.repeat(128),
  }
}

function welt(
  over: { vorhanden?: SignedEvent | null; acks?: number; signer?: Signer | null } = {},
) {
  const w = { signiert: [] as UnsignedEvent[], publiziert: [] as SignedEvent[] }
  const signer: Signer = {
    getPublicKey: () => Promise.resolve(PK),
    signEvent: (ev) => {
      w.signiert.push(ev)
      return Promise.resolve({ ...ev, id: '1'.repeat(64), sig: '2'.repeat(128) })
    },
  }
  const acks = over.acks ?? 1
  const deps: RueckzugDeps = {
    pubkey: PK,
    dryRun: false,
    signer: over.signer === undefined ? signer : over.signer,
    vorhandenes: () => Promise.resolve(over.vorhanden ?? null),
    publizieren: (ev) => {
      w.publiziert.push(ev)
      return Promise.resolve(acks)
    },
  }
  return { w, deps }
}

Deno.test('ambZurueckziehen: kein 30142 auf dem Relay → nichts zu tun, nichts signiert', async () => {
  const { w, deps } = welt()
  const r = await ambZurueckziehen('canva', deps)
  assertEquals(r.status, 'nichts')
  assertEquals(w.signiert, [])
  assertEquals(w.publiziert, [])
})

Deno.test('ambZurueckziehen: 30142 liegt vor → kind 5 auf 30142:pubkey:slug, publiziert', async () => {
  const { w, deps } = welt({ vorhanden: altesAmb('canva') })
  const r = await ambZurueckziehen('canva', deps)
  assertEquals(r.status, 'zurueckgezogen')
  assertEquals(w.signiert.length, 1)
  assertEquals(w.signiert[0].kind, 5)
  assertEquals(w.signiert[0].tags[0], ['a', `30142:${PK}:canva`])
  assertEquals(w.publiziert.length, 1)
  assertEquals(r.eventId, '1'.repeat(64))
})

Deno.test('ambZurueckziehen: dry-run → würde zurückziehen, ohne zu signieren', async () => {
  const { w, deps } = welt({ vorhanden: altesAmb('canva') })
  const r = await ambZurueckziehen('canva', { ...deps, dryRun: true })
  assertEquals(r.status, 'wuerde')
  assertEquals(w.signiert, [])
  assertEquals(w.publiziert, [])
})

Deno.test('ambZurueckziehen: kein Ack vom Relay → fehlgeschlagen mit Grund', async () => {
  const { deps } = welt({ vorhanden: altesAmb('canva'), acks: 0 })
  const r = await ambZurueckziehen('canva', deps)
  assertEquals(r.status, 'fehlgeschlagen')
  assertEquals(r.grund?.includes('0/'), true)
})

Deno.test('ambZurueckziehen: kein Signer im Live-Modus → fehlgeschlagen', async () => {
  const { deps } = welt({ vorhanden: altesAmb('canva'), signer: null })
  const r = await ambZurueckziehen('canva', deps)
  assertEquals(r.status, 'fehlgeschlagen')
  assertEquals(r.grund?.toLowerCase().includes('signer'), true)
})
