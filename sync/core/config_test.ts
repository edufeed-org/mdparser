import { assertEquals, assertThrows } from 'jsr:@std/assert@^1.0.0'
import { type EnvReader, loadConfig } from './config.ts'

const VALID_PUBKEY = '5a12b41ec15b466321e88c371be2dc47d9193f9c8bba4ab09fc50045bd35aedf'
const VALID_CLIENT_SECRET = '1'.repeat(64)

function envReader(env: Record<string, string>): EnvReader {
  return (k) => env[k]
}

Deno.test('loadConfig — vollständige Env', () => {
  const cfg = loadConfig(envReader({
    BUNKER_URL: 'bunker://abc?relay=wss://r1',
    AUTHOR_PUBKEY_HEX: VALID_PUBKEY,
    CLIENT_SECRET_HEX: VALID_CLIENT_SECRET,
    CONTENT_ROOT: '/abs/content',
    MIN_RELAY_ACKS: '2',
  }))

  assertEquals(cfg.bunkerUrl, 'bunker://abc?relay=wss://r1')
  assertEquals(cfg.authorPubkeyHex, VALID_PUBKEY)
  assertEquals(cfg.clientSecretHex, VALID_CLIENT_SECRET)
  assertEquals(cfg.contentRoot, '/abs/content')
  assertEquals(cfg.minRelayAcks, 2)
})

Deno.test('loadConfig — nur Pflichtfelder, Defaults greifen', () => {
  const cfg = loadConfig(envReader({
    BUNKER_URL: 'bunker://abc',
    AUTHOR_PUBKEY_HEX: VALID_PUBKEY,
  }))

  assertEquals(cfg.contentRoot, '../../FOERBICO_und_rpi-virtuell/Website/content')
  assertEquals(cfg.minRelayAcks, 1)
  assertEquals(cfg.clientSecretHex, undefined)
})

Deno.test('loadConfig — fehlendes BUNKER_URL wirft', () => {
  assertThrows(
    () => loadConfig(envReader({ AUTHOR_PUBKEY_HEX: VALID_PUBKEY })),
    Error,
    'BUNKER_URL',
  )
})

Deno.test('loadConfig — fehlendes AUTHOR_PUBKEY_HEX wirft', () => {
  assertThrows(
    () => loadConfig(envReader({ BUNKER_URL: 'bunker://abc' })),
    Error,
    'AUTHOR_PUBKEY_HEX',
  )
})

Deno.test('loadConfig — ungültiger Pubkey-Hex wirft', () => {
  assertThrows(
    () =>
      loadConfig(envReader({
        BUNKER_URL: 'bunker://abc',
        AUTHOR_PUBKEY_HEX: 'NOT_HEX',
      })),
    Error,
    'AUTHOR_PUBKEY_HEX muss 64 lowercase hex sein',
  )
})

Deno.test('loadConfig — uppercase Pubkey wird abgelehnt', () => {
  assertThrows(
    () =>
      loadConfig(envReader({
        BUNKER_URL: 'bunker://abc',
        AUTHOR_PUBKEY_HEX: VALID_PUBKEY.toUpperCase(),
      })),
    Error,
    'AUTHOR_PUBKEY_HEX',
  )
})

Deno.test('loadConfig — ungültiger CLIENT_SECRET_HEX wirft', () => {
  assertThrows(
    () =>
      loadConfig(envReader({
        BUNKER_URL: 'bunker://abc',
        AUTHOR_PUBKEY_HEX: VALID_PUBKEY,
        CLIENT_SECRET_HEX: 'short',
      })),
    Error,
    'CLIENT_SECRET_HEX',
  )
})

Deno.test('loadConfig — leerer CLIENT_SECRET_HEX wird ignoriert', () => {
  const cfg = loadConfig(envReader({
    BUNKER_URL: 'bunker://abc',
    AUTHOR_PUBKEY_HEX: VALID_PUBKEY,
    CLIENT_SECRET_HEX: '',
  }))
  assertEquals(cfg.clientSecretHex, undefined)
})

Deno.test('loadConfig — MIN_RELAY_ACKS=0 wirft', () => {
  assertThrows(
    () =>
      loadConfig(envReader({
        BUNKER_URL: 'bunker://abc',
        AUTHOR_PUBKEY_HEX: VALID_PUBKEY,
        MIN_RELAY_ACKS: '0',
      })),
    Error,
    'MIN_RELAY_ACKS',
  )
})

Deno.test('loadConfig — MIN_RELAY_ACKS nicht numerisch wirft', () => {
  assertThrows(
    () =>
      loadConfig(envReader({
        BUNKER_URL: 'bunker://abc',
        AUTHOR_PUBKEY_HEX: VALID_PUBKEY,
        MIN_RELAY_ACKS: 'two',
      })),
    Error,
    'MIN_RELAY_ACKS',
  )
})
