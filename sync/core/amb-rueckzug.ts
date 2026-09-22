/**
 * Rückzug des AMB-Events in `publish`: kein 30142 ohne `type: LearningResource`.
 *
 * Verliert ein Beitrag den Typ, hört der Sync nur auf, ein 30142 zu bauen — das
 * alte bliebe auf dem AMB-Relay liegen (Stand 22.09.2026: 37 Beiträge). Dieser
 * Schritt fragt das Relay nach einem 30142 des eigenen Keys zum `d` des Beitrags
 * und zieht es mit einem kind:5 (NIP-09) zurück, wenn eines liegt.
 *
 * Nicht hier: die Entscheidung, ob der Beitrag eine Lernressource ist (das
 * Frontmatter), und der Bau des 30142 (events/amb.ts). Die Außenwelt (Relay,
 * Signer) ist injizierbar — die Tests laufen ohne Netz.
 */
import { buildDeletionEvent } from '../events/deletion.ts'
import { AMB_RELAYS, publishToRelays, readEvents } from './relays.ts'
import type { SignedEvent, Signer } from './signer.ts'

export const RUECKZUG_GRUND =
  'Beitrag ist keine Lernressource mehr (type: LearningResource entfernt)'

export interface RueckzugDeps {
  pubkey: string
  dryRun: boolean
  signer: Signer | null
  /** Jüngstes 30142 des eigenen Keys zu diesem d, oder null. */
  vorhandenes: (slug: string) => Promise<SignedEvent | null>
  /** Publiziert das signierte kind:5 an die AMB-Relays, gibt die Zahl der Acks zurück. */
  publizieren: (ev: SignedEvent) => Promise<number>
}

export type RueckzugStatus = 'nichts' | 'wuerde' | 'zurueckgezogen' | 'fehlgeschlagen'

export interface RueckzugErgebnis {
  status: RueckzugStatus
  eventId?: string
  grund?: string
}

export async function vorhandenesAmb(slug: string, pubkey: string): Promise<SignedEvent | null> {
  const treffer = (await Promise.all(
    AMB_RELAYS.map((r) =>
      readEvents(r, { kinds: [30142], authors: [pubkey], '#d': [slug], limit: 1 })
    ),
  )).flat()
  treffer.sort((a, b) => b.created_at - a.created_at)
  return treffer[0] ?? null
}

export function standardRueckzugDeps(
  signer: Signer | null,
  pubkey: string,
  dryRun: boolean,
): RueckzugDeps {
  return {
    pubkey,
    dryRun,
    signer,
    vorhandenes: (slug) => vorhandenesAmb(slug, pubkey),
    publizieren: async (ev) => (await publishToRelays(AMB_RELAYS, ev)).filter((a) => a.ok).length,
  }
}

export async function ambZurueckziehen(
  slug: string,
  deps: RueckzugDeps,
): Promise<RueckzugErgebnis> {
  const altes = await deps.vorhandenes(slug)
  if (!altes) return { status: 'nichts' }
  if (deps.dryRun) return { status: 'wuerde' }
  if (!deps.signer) {
    return { status: 'fehlgeschlagen', grund: 'kein Signer (live-Modus erfordert Bunker)' }
  }

  let signiert: SignedEvent
  try {
    signiert = await deps.signer.signEvent(
      buildDeletionEvent(deps.pubkey, { kind: 30142, dTag: slug }, RUECKZUG_GRUND),
    )
  } catch (err) {
    return {
      status: 'fehlgeschlagen',
      grund: `signEvent (kind 5): ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const acks = await deps.publizieren(signiert)
  if (acks === 0) {
    return {
      status: 'fehlgeschlagen',
      eventId: signiert.id,
      grund: `kind 5: 0/${AMB_RELAYS.length} acks`,
    }
  }
  return { status: 'zurueckgezogen', eventId: signiert.id }
}
