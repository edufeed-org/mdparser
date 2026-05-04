import { NostrConnectSigner, SimpleSigner } from 'applesauce-signers'
import { RelayPool } from 'applesauce-relay'
import type { UnsignedEvent } from '../events/article.ts'

export interface SignedEvent extends UnsignedEvent {
  id: string
  sig: string
}

export interface Signer {
  getPublicKey(): Promise<string>
  signEvent(ev: UnsignedEvent): Promise<SignedEvent>
}

const signerPool = new RelayPool()

NostrConnectSigner.subscriptionMethod = (relays, filters) => signerPool.req(relays, filters)
NostrConnectSigner.publishMethod = (relays, event) => signerPool.event(relays, event)

// Bei wiederholten connect-requests an einen Bunker antwortet die Signing-App
// (z.B. amber) manchmal mit "already connected" oder "no permission" — applesauce
// wirft dann unhandled rejections. Diese benignen Fehler schlucken wir prozessweit.
const BENIGN_CONNECT_ERRORS = ['already connected', 'no permission']

function isBenignConnectError(msg: string): boolean {
  const lower = msg.toLowerCase()
  return BENIGN_CONNECT_ERRORS.some((e) => lower.includes(e))
}

globalThis.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  const reason = e.reason
  const msg = reason instanceof Error ? reason.message : String(reason)
  if (isBenignConnectError(msg)) {
    e.preventDefault()
  }
})

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timerId: number | undefined
  const timeoutPromise = new Promise<never>((_r, rej) => {
    timerId = setTimeout(() => rej(new Error(`${label} timeout`)), ms)
  })
  return Promise.race([p, timeoutPromise]).finally(() => {
    if (timerId !== undefined) clearTimeout(timerId)
  }) as Promise<T>
}

export interface CreateSignerOptions {
  clientSecretHex?: string
}

export async function createBunkerSigner(
  bunkerUrl: string,
  options: CreateSignerOptions = {},
): Promise<Signer> {
  const { remote, relays, secret } = NostrConnectSigner.parseBunkerURI(bunkerUrl)
  console.log(`  signer: setup (remote=${remote.slice(0, 8)}…, relays=${relays.length})`)

  // Stabile client-identität über CLIENT_SECRET_HEX. Ohne festen Key sieht der
  // Bunker jeden Lauf als neue App und Berechtigungen greifen nicht.
  const clientSigner = options.clientSecretHex
    ? SimpleSigner.fromKey(options.clientSecretHex)
    : undefined
  const signer = new NostrConnectSigner({ relays, remote, signer: clientSigner })
  const clientPubkey = await signer.signer.getPublicKey()
  console.log(`  signer: client-pubkey=${clientPubkey.slice(0, 8)}…`)

  try {
    await withTimeout(signer.connect(secret), 60_000, 'Bunker connect')
    console.log('  signer: connect ok')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!isBenignConnectError(msg)) throw err
    console.log(`  signer: connect benign "${msg}", fallback to open+force`)
    await signer.open()
    ;(signer as unknown as { isConnected: boolean }).isConnected = true
  }

  console.log('  signer: getPublicKey…')
  const pubkey = await withTimeout(signer.getPublicKey(), 30_000, 'Bunker getPublicKey')
  console.log(`  signer: pubkey ok (${pubkey.slice(0, 8)}…)`)

  return {
    getPublicKey: () => Promise.resolve(pubkey),
    signEvent: async (ev: UnsignedEvent) => {
      const signed = await withTimeout(signer.signEvent(ev), 30_000, 'Bunker signEvent')
      return signed as SignedEvent
    },
  }
}
