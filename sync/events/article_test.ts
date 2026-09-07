import { assert, assertEquals } from 'jsr:@std/assert@^1.0.0'
import { buildArticleEvent } from './article.ts'
import type { CommonMetadata } from '../core/parser.ts'

const HASH = 'a'.repeat(64)
const HASH2 = 'c'.repeat(64)
const URL_ = `https://blossom.edufeed.org/${HASH}.jpeg`
const URL2 = `https://blossom.edufeed.org/${HASH2}.png`
const PK = 'b'.repeat(64)
const RELAY = 'wss://amb-relay.edufeed.org/'

function meta(over: Partial<CommonMetadata> = {}): CommonMetadata {
  return {
    id: 'https://oer.community/test',
    name: 'T',
    description: 'D',
    inLanguage: ['de'],
    datePublished: '2026-09-07',
    ...over,
  }
}

const tags = (ev: { tags: string[][] }, name: string) => ev.tags.filter((t) => t[0] === name)

// --- x für das Cover (Spec Teil 2) ---

Deno.test('x aus der Blossom-URL, unmittelbar nach image', () => {
  const ev = buildArticleEvent(meta({ image: URL_ }), '', PK, RELAY)
  const i = ev.tags.findIndex((t) => t[0] === 'image')
  assert(i >= 0)
  assertEquals(ev.tags[i + 1], ['x', HASH])
})

Deno.test('kein x bei einer URL ohne Hash im Pfad', () => {
  const ev = buildArticleEvent(
    meta({ image: 'https://oer.community/test/nosTr-schrein.jpg' }),
    '',
    PK,
    RELAY,
  )
  assertEquals(tags(ev, 'x'), [])
})

Deno.test('kein image, kein x', () => {
  const ev = buildArticleEvent(meta(), '', PK, RELAY)
  assertEquals(tags(ev, 'image'), [])
  assertEquals(tags(ev, 'x'), [])
})

Deno.test('Endungen .jpg, .jpeg und ohne Endung werden erkannt', () => {
  for (
    const u of [
      `https://b.example/${HASH}.jpg`,
      `https://b.example/${HASH}.jpeg`,
      `https://b.example/${HASH}`,
    ]
  ) {
    assertEquals(tags(buildArticleEvent(meta({ image: u }), '', PK, RELAY), 'x'), [['x', HASH]])
  }
})

// --- x je Fließtextbild (edufeed, 07.09.: „die Hashes der Bilder mit einem x-Tag kennzeichnen") ---

Deno.test('x je Fließtextbild mit Hash-URL — zusätzlich zum Cover', () => {
  const ev = buildArticleEvent(meta({ image: URL_ }), `Text\n\n![Zweites](${URL2})\n`, PK, RELAY)
  assertEquals(tags(ev, 'x'), [['x', HASH], ['x', HASH2]])
})

Deno.test('das Cover-x steht zuerst — die Konvention, die edufeed und Hub heute lesen', () => {
  const ev = buildArticleEvent(meta({ image: URL_ }), `![a](${URL2})`, PK, RELAY)
  const i = ev.tags.findIndex((t) => t[0] === 'image')
  assertEquals(ev.tags[i + 1], ['x', HASH])
  assertEquals(ev.tags[i + 2], ['x', HASH2])
})

Deno.test('kein doppeltes x, wenn das Textbild das Cover ist — der Referenzfall', () => {
  const ev = buildArticleEvent(meta({ image: URL_ }), `![Schrein](${URL_})`, PK, RELAY)
  assertEquals(tags(ev, 'x'), [['x', HASH]])
})

Deno.test('ein x je Hash, auch wenn das Bild zweimal vorkommt', () => {
  const ev = buildArticleEvent(meta(), `![a](${URL2})\n\n![b](${URL2})`, PK, RELAY)
  assertEquals(tags(ev, 'x'), [['x', HASH2]])
})

Deno.test('kein x für Bild-URLs ohne Hash — relativ oder fremd', () => {
  const ev = buildArticleEvent(
    meta(),
    '![a](https://cdn.example/foo.png) ![b](nosTr-schrein.jpg)',
    PK,
    RELAY,
  )
  assertEquals(tags(ev, 'x'), [])
})

Deno.test('Text-x stehen vor about, t und a', () => {
  const ev = buildArticleEvent(
    meta({
      image: URL_,
      about: ['https://w3id.org/kim/x'],
      keywords: ['k'],
      type: 'LearningResource',
    }),
    `![a](${URL2})`,
    PK,
    RELAY,
  )
  const names = ev.tags.map((t) => t[0])
  const letztesX = names.lastIndexOf('x')
  assert(letztesX < names.indexOf('about'))
  assert(letztesX < names.indexOf('t'))
  assert(letztesX < names.indexOf('a'))
})

Deno.test('Großbuchstaben im Text-Hash werden normalisiert', () => {
  const ev = buildArticleEvent(meta(), `![a](https://b.example/${HASH2.toUpperCase()})`, PK, RELAY)
  assertEquals(tags(ev, 'x'), [['x', HASH2]])
})

Deno.test('kein imeta mehr — die x-Tags sind der Zeiger', () => {
  const ev = buildArticleEvent(meta({ image: URL_ }), `![a](${URL2})`, PK, RELAY)
  assertEquals(tags(ev, 'imeta'), [])
})

Deno.test('Cover ohne Fließtextbild: genau ein x', () => {
  const ev = buildArticleEvent(meta({ image: URL_ }), 'Nur Text.', PK, RELAY)
  assertEquals(tags(ev, 'x'), [['x', HASH]])
})
