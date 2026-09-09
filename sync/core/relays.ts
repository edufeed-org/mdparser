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

/**
 * Events lesen (REQ bis EOSE) über ein rohes WebSocket — wie foerbico-editor
 * (nostr.js, abfragen). Fehler und Timeouts ergeben eine leere Liste, kein Wurf:
 * Ein nicht erreichbares Relay darf einen Publish-Lauf nicht kippen.
 */
export function readEvents(
  relayUrl: string,
  filter: Record<string, unknown>,
  timeoutMs = 6_000,
): Promise<SignedEvent[]> {
  return new Promise((resolve) => {
    const events: SignedEvent[] = []
    let ws: WebSocket
    const fertig = () => {
      clearTimeout(t)
      try {
        ws.close()
      } catch { /* schon zu */ }
      resolve(events)
    }
    const t = setTimeout(fertig, timeoutMs)
    try {
      ws = new WebSocket(relayUrl)
    } catch {
      clearTimeout(t)
      resolve(events)
      return
    }
    const sub = 'r' + Math.random().toString(36).slice(2, 10)
    ws.onopen = () => ws.send(JSON.stringify(['REQ', sub, filter]))
    ws.onmessage = (m) => {
      let d: unknown[]
      try {
        d = JSON.parse(String(m.data))
      } catch {
        return
      }
      if (d[0] === 'EVENT' && d[1] === sub) events.push(d[2] as SignedEvent)
      if (d[0] === 'EOSE' && d[1] === sub) fertig()
      if (d[0] === 'CLOSED' && d[1] === sub) fertig()
    }
    ws.onerror = fertig
    ws.onclose = fertig
  })
}
