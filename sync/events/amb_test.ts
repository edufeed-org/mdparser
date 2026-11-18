import { assertEquals } from 'jsr:@std/assert@^1.0.0'
import { nip19 } from 'nostr-tools'
import { buildAmbEvent } from './amb.ts'
import { buildArticleEvent } from './article.ts'
import type { CommonMetadata } from '../core/parser.ts'

const PK = 'b'.repeat(64)
const PAULA = 'c'.repeat(64)
const PAULA_NPUB = nip19.npubEncode(PAULA)
const RELAY = 'wss://amb-relay.edufeed.org/'

function meta(over: Partial<CommonMetadata> = {}): CommonMetadata {
  return {
    id: 'https://oer.community/test',
    type: 'LearningResource',
    name: 'T',
    description: 'D',
    inLanguage: ['de'],
    datePublished: '2026-09-07',
    ...over,
  }
}

const personen = (ev: { tags: string[][] }) =>
  ev.tags.filter((t) => t[0].startsWith('creator:') || t[0] === 'p')

// --- Urheber mit Nostr-Konto (NIP-AMB: Lauf + Begleit-p-Tag) ---

Deno.test('Urheber ohne Konto: nur der creator:*-Lauf, kein p-Tag', () => {
  const ev = buildAmbEvent(
    meta({
      creator: [{
        givenName: 'Laura',
        familyName: 'Mößle',
        type: 'Person',
        id: 'https://orcid.org/0000-0001',
      }],
    }),
    PK,
    RELAY,
  )
  assertEquals(personen(ev), [
    ['creator:name', 'Laura Mößle'],
    ['creator:type', 'Person'],
    ['creator:id', 'https://orcid.org/0000-0001'],
  ])
})

Deno.test('nostr:npub als id: Lauf behält den Namen, p-Tag kommt dazu', () => {
  const ev = buildAmbEvent(
    meta({
      creator: [
        { givenName: 'Laura', familyName: 'Mößle', type: 'Person' },
        {
          givenName: 'Paula',
          familyName: 'Gregorio Rodrigo',
          type: 'Person',
          id: `nostr:${PAULA_NPUB}`,
        },
      ],
    }),
    PK,
    RELAY,
  )
  assertEquals(personen(ev), [
    ['creator:name', 'Laura Mößle'],
    ['creator:type', 'Person'],
    ['creator:name', 'Paula Gregorio Rodrigo'],
    ['creator:type', 'Person'],
    ['creator:id', `nostr:${PAULA_NPUB}`],
    ['p', PAULA, '', 'creator'],
  ])
})

Deno.test('nprofile wird zur npub-Form; eine kaputte nostr:-id bleibt wie geschrieben, ohne p-Tag', () => {
  const nprofile = nip19.nprofileEncode({ pubkey: PAULA, relays: ['wss://relay.example'] })
  const ev = buildAmbEvent(
    meta({
      creator: [
        { givenName: 'Paula', familyName: 'G', id: `nostr:${nprofile}` },
        { givenName: 'X', familyName: 'Y', id: 'nostr:npub1kaputt' },
      ],
    }),
    PK,
    RELAY,
  )
  assertEquals(personen(ev), [
    ['creator:name', 'Paula G'],
    ['creator:id', `nostr:${PAULA_NPUB}`],
    ['p', PAULA, '', 'creator'],
    ['creator:name', 'X Y'],
    ['creator:id', 'nostr:npub1kaputt'],
  ])
})

Deno.test('Artikel (30023) trägt dieselben Urheber-Tags wie das 30142', () => {
  const m = meta({
    creator: [{
      givenName: 'Paula',
      familyName: 'Gregorio Rodrigo',
      type: 'Person',
      id: `nostr:${PAULA_NPUB}`,
    }],
  })
  assertEquals(personen(buildArticleEvent(m, '', PK, RELAY)), personen(buildAmbEvent(m, PK, RELAY)))
})

Deno.test('Artikel ohne creator: keine Urheber-Tags', () => {
  assertEquals(personen(buildArticleEvent(meta(), '', PK, RELAY)), [])
})
