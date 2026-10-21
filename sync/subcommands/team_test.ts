import { assertEquals, assertThrows } from 'jsr:@std/assert@^1.0.0'
import { buildTeamEvent, hexAus, teamLesen } from './team.ts'

const JOERG_NPUB = 'npub1f7jar3qnu269uyx5p0e4v24hqxjnxysxudvujza2ur5ehltvdeqsly2fx9'
const JOERG_HEX = '4fa5d1c413e2b45e10d40bf3562ab701a5331206e359c90baae0e99bfd6c6e41'

Deno.test('hexAus: npub und Hex, sonst Fehler', () => {
  assertEquals(hexAus(JOERG_NPUB), JOERG_HEX)
  assertEquals(hexAus(JOERG_HEX.toUpperCase()), JOERG_HEX)
  assertThrows(() => hexAus('nix'))
})

Deno.test('teamLesen: title, description, Mitglieder in Reihenfolge; Dubletten und Lücken sind Fehler', () => {
  const team = teamLesen(`title: Unser Team\ndescription: Drei Standorte.\nmitglieder:\n  - name: Jörg\n    npub: ${JOERG_NPUB}\n  - name: X\n    npub: ${'a'.repeat(64)}\n`)
  assertEquals(team.title, 'Unser Team')
  assertEquals(team.description, 'Drei Standorte.')
  assertEquals(team.mitglieder, [{ name: 'Jörg', hex: JOERG_HEX }, { name: 'X', hex: 'a'.repeat(64) }])
  assertThrows(() => teamLesen('mitglieder: []'))
  assertThrows(() => teamLesen(`title: T\nmitglieder:\n  - name: A\n    npub: ${JOERG_NPUB}\n  - name: B\n    npub: ${JOERG_HEX}\n`), Error, 'doppelt')
  assertThrows(() => teamLesen(`title: T\nmitglieder:\n  - npub: ${JOERG_NPUB}\n`), Error, 'ohne name')
})

Deno.test('buildTeamEvent: kind:30000 d=team mit p-Tags samt Relay-Hinweis und Petname', () => {
  const ev = buildTeamEvent({ title: 'T', description: null, mitglieder: [{ name: 'Jörg', hex: JOERG_HEX }] }, 'b'.repeat(64), 'wss://r/')
  assertEquals(ev.kind, 30000)
  assertEquals(ev.tags, [['d', 'team'], ['title', 'T'], ['p', JOERG_HEX, 'wss://r/', 'Jörg']])
  const mit = buildTeamEvent({ title: 'T', description: 'D', mitglieder: [] }, 'b'.repeat(64), 'wss://r/')
  assertEquals(mit.tags[2], ['description', 'D'])
})
