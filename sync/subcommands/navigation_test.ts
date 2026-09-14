import { assertEquals, assertThrows } from 'jsr:@std/assert@^1.0.0'
import { buildListenEvents, listenLesen } from './navigation.ts'

const PK = 'b'.repeat(64)

Deno.test('listenLesen: Listen von d-Kennungen, getrimmt', () => {
  const l = listenLesen('navigation:\n  - tagungen\n  - " unser-team "\nfusszeile:\n  - impressum\n')
  assertEquals(l, { navigation: ['tagungen', 'unser-team'], fusszeile: ['impressum'] })
})

Deno.test('listenLesen: lehnt Nicht-Listen, leere Einträge und leere Dateien ab', () => {
  assertThrows(() => listenLesen('navigation: tagungen\n'))
  assertThrows(() => listenLesen('navigation:\n  - ""\n'))
  assertThrows(() => listenLesen('- a\n'))
  assertThrows(() => listenLesen(''))
})

Deno.test('buildListenEvents: ein 30004 je Liste, a-Tags in Reihenfolge mit Relay-Hinweis', () => {
  const [nav, fuss] = buildListenEvents(
    { navigation: ['tagungen', 'unser-team'], fusszeile: ['impressum'] },
    PK,
    'wss://relay.example/',
  )
  assertEquals(nav.kind, 30004)
  assertEquals(nav.tags[0], ['d', 'navigation'])
  assertEquals(nav.tags[1], ['title', 'Hauptmenü'])
  assertEquals(nav.tags.slice(2), [
    ['a', `30023:${PK}:tagungen`, 'wss://relay.example/'],
    ['a', `30023:${PK}:unser-team`, 'wss://relay.example/'],
  ])
  assertEquals(fuss.tags[0], ['d', 'fusszeile'])
  assertEquals(fuss.tags[1], ['title', 'Fußzeile'])
  assertEquals(nav.content, '')
})
