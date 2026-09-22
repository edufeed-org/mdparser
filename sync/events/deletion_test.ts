import { assertEquals } from 'jsr:@std/assert@^1.0.0'
import { buildDeletionEvent } from './deletion.ts'

const PK = 'b'.repeat(64)

Deno.test('buildDeletionEvent: kind 5 mit a-Tag auf die Adresse und k-Tag auf den Kind', () => {
  const ev = buildDeletionEvent(PK, { kind: 30142, dTag: 'canva' }, 'keine Lernressource mehr')
  assertEquals(ev.kind, 5)
  assertEquals(ev.pubkey, PK)
  assertEquals(ev.tags, [
    ['a', `30142:${PK}:canva`],
    ['k', '30142'],
  ])
  assertEquals(ev.content, 'keine Lernressource mehr')
})

Deno.test('buildDeletionEvent: created_at ist jetzt (Sekunden)', () => {
  const vorher = Math.floor(Date.now() / 1000)
  const ev = buildDeletionEvent(PK, { kind: 30142, dTag: 'x' }, '')
  assertEquals(ev.created_at >= vorher && ev.created_at <= vorher + 2, true)
})
