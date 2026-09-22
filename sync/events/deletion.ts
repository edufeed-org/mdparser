/**
 * Lösch-Event (kind:5, NIP-09) für ein adressierbares Event des eigenen Keys.
 *
 * Beantwortet nur: Wie sieht die Rücknahme einer Adresse `kind:pubkey:d` aus?
 * Der `a`-Tag nennt die Adresse, der `k`-Tag den Kind; Relays, die NIP-09
 * verstehen, entfernen alle Fassungen bis zum `created_at` der Löschung.
 * Nicht hier: ob gelöscht werden soll (core/amb-rueckzug.ts) und das Signieren.
 */
import type { UnsignedEvent } from './article.ts'

export interface Adresse {
  kind: number
  dTag: string
}

export function buildDeletionEvent(pubkey: string, ziel: Adresse, grund: string): UnsignedEvent {
  return {
    kind: 5,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['a', `${ziel.kind}:${pubkey}:${ziel.dTag}`],
      ['k', String(ziel.kind)],
    ],
    content: grund,
  }
}
