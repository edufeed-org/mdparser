# mdparser/sync — Markdown → Nostr Publisher

Deno-basiertes Sync-Modul, das Markdown-Posts mit `commonMetadata`-Frontmatter aus dem oer.community-Content-Repo als Nostr-Events (Kind 30023 + 30142) auf die edufeed-Relays publiziert.

**Status:** Phase 0 (Single-Post-Publisher) abgeschlossen. Phase 1 (Discovery + Orchestrator) und Phase 2 (GitHub Action im Mirror-Repo) folgen.

## Architektur (Phase 0)

```
sync/
├── deno.json              # Tasks + applesauce/nostr-tools imports
├── parser.ts              # YAML-Frontmatter (commonMetadata-Block)
├── events/
│   ├── article.ts         # Kind 30023 Builder
│   └── amb.ts             # Kind 30142 Builder
├── signer.ts              # NIP-46 Bunker via applesauce-signers
├── relay.ts               # Single-Event-Publisher via applesauce-relay
└── publish-single.ts      # CLI: ein Pfad → 30023 + 30142
```

**Bewusst weggelassen** (kommt in Phase 1): Discovery, Image-AMB-Events, Validierung über content-lint hinaus, Tests.

## Verwendung

### Voraussetzungen

- [Deno](https://deno.com) 2.x
- `mdparser/.env` mit `BUNKER_URL=bunker://…` (gitignored)
- Bunker-Signing-App (Amber, nsec.app, …) bereit zum Approven

### Dry-Run (nichts geht raus)

```bash
cd mdparser/sync
deno task dry-run-single /path/to/post/index.md
```

Gibt beide Events als JSON aus + voraussichtliche `naddr` mit Fallback-Pubkey.

### Live-Publish

```bash
cd mdparser/sync
deno task publish-single /path/to/post/index.md
```

Connectet den Bunker (erste App-Approval nötig), signiert beide Events, published 30023 → `relay-rpi.edufeed.org`, 30142 → `amb-relay.edufeed.org`. Output: `naddr1…` der Article-Adresse mit Habla-/Yakihonne-Links für Live-Kommentare.

## Konventionen (siehe Spec)

- `d`-Tag = letzter Pfadteil von `commonMetadata.id` (z.B. `https://oer.community/foo` → `foo`)
- Identischer `d`-Tag für 30023 und 30142 — Adresse ist `kind:pubkey:d`, kollidiert nicht
- `a`-Cross-Refs zwischen 30023 und 30142 (Marker `content` bzw. `amb-metadata`)
- Kind 30142 wird **nur** erstellt, wenn `type: LearningResource`
- `published_at` aus YAML `datePublished`, `created_at` = Sync-Zeitpunkt (Replaceable Events)

## Verwandte Dokumente

- `docs/superpowers/specs/2026-03-30-md-to-nostr-sync-design.md` — vollständige Architektur-Spec
- `docs/superpowers/plans/2026-03-30-md-to-nostr-dry-run.md` — Implementation-Plan (Discovery-Variante mit Tests)
- `docs/superpowers/plans/2026-04-29-phase-0-single-post-publisher.md` — was *tatsächlich* in Phase 0 gebaut wurde
- [`joerglohrerde/publish/`](https://github.com/joerglohrer/joerglohrerde) — Blaupause für Phase 2 (GitHub Action, NIP-46 Bunker)
