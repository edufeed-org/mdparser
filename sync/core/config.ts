export interface Config {
  bunkerUrl: string
  authorPubkeyHex: string
  contentRoot: string
  clientSecretHex?: string
  minRelayAcks: number
}

export type EnvReader = (key: string) => string | undefined

const DEFAULT_CONTENT_ROOT = '../../FOERBICO_und_rpi-virtuell/Website/content'
const DEFAULT_MIN_RELAY_ACKS = 1

const HEX64 = /^[0-9a-f]{64}$/

function requireEnv(read: EnvReader, key: string): string {
  const v = read(key)
  if (!v || v.length === 0) {
    throw new Error(`Pflicht-Env fehlt: ${key}`)
  }
  return v
}

function parseInt64Hex(value: string, key: string): string {
  if (!HEX64.test(value)) {
    throw new Error(`${key} muss 64 lowercase hex sein, ist: ${value.slice(0, 8)}…`)
  }
  return value
}

function parseMinRelayAcks(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_MIN_RELAY_ACKS
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`MIN_RELAY_ACKS muss ganze Zahl ≥ 1 sein, ist: ${raw}`)
  }
  return n
}

export function loadConfig(read: EnvReader = (k) => Deno.env.get(k)): Config {
  const bunkerUrl = requireEnv(read, 'BUNKER_URL')
  const authorPubkeyHex = parseInt64Hex(
    requireEnv(read, 'AUTHOR_PUBKEY_HEX'),
    'AUTHOR_PUBKEY_HEX',
  )
  const contentRoot = read('CONTENT_ROOT') ?? DEFAULT_CONTENT_ROOT
  const clientSecretRaw = read('CLIENT_SECRET_HEX')
  const clientSecretHex = clientSecretRaw && clientSecretRaw.length > 0
    ? parseInt64Hex(clientSecretRaw, 'CLIENT_SECRET_HEX')
    : undefined
  const minRelayAcks = parseMinRelayAcks(read('MIN_RELAY_ACKS'))

  return { bunkerUrl, authorPubkeyHex, contentRoot, clientSecretHex, minRelayAcks }
}
