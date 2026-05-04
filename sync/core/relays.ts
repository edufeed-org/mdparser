import { Relay } from 'applesauce-relay'
import { firstValueFrom, timeout } from 'rxjs'
import type { SignedEvent } from './signer.ts'

export const ARTICLE_RELAYS = [
  'wss://relay-rpi.edufeed.org/',
  'wss://relay.edufeed.org/',
  'wss://relay.primal.net/',
  'wss://theforest.nostr1.com/',
] as const

export const AMB_RELAYS = ['wss://amb-relay.edufeed.org/'] as const

export interface PublishResult {
  relay: string
  ok: boolean
  message?: string
}

export async function publishEvent(
  relayUrl: string,
  event: SignedEvent,
  timeoutMs = 10_000,
): Promise<PublishResult> {
  const relay = new Relay(relayUrl)
  try {
    const response = await firstValueFrom(
      relay.event(event).pipe(timeout({ first: timeoutMs })),
    )
    return {
      relay: relayUrl,
      ok: response.ok,
      message: response.message,
    }
  } catch (err) {
    return {
      relay: relayUrl,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function publishToRelays(
  relays: readonly string[],
  event: SignedEvent,
  timeoutMs = 10_000,
): Promise<PublishResult[]> {
  return await Promise.all(relays.map((url) => publishEvent(url, event, timeoutMs)))
}
