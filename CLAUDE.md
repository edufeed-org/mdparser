# mdparser

Markdown-Parser und Nostr-Sync für die oer.community Content-Pipeline.
Deno-basiert, das Node-Setup ist abgelöst.

## Contracts (oer-orchestrator)

Dieses Repo implementiert folgende Contracts:
- **article-frontmatter** — YAML-Felder die geparsed werden
- **event-tag-mapping** — Wie YAML-Felder auf Nostr-Tags abgebildet werden

Contracts liegen in: `/Users/joerglohrer/repositories/oer-orchestrator/contracts/`
Bei Abweichungen zwischen dieser CLAUDE.md und den Contracts gilt der Contract.

## Rolle in der Pipeline

```
content-lint → **mdparser** → nostrmcp
```

mdparser liest Hugo-artige Markdown-Trees mit `commonMetadata`-Frontmatter
und publiziert Posts und Pages als Nostr-Events:

- **Kind 30023** (Long-form Content) → Article-Relays
- **Kind 30142** (AMB-Metadaten) → AMB-Relay, nur wenn `type: LearningResource`

Bilder werden weiter unter `oer.community`-URLs referenziert; deren
Auslieferung läuft separat über nostrmcp + nsite/Blossom.

## Projektstruktur

```
mdparser/
├── sync/                       # Deno-Code
│   ├── deno.json
│   ├── publish-single.ts       # CLI: ein Pfad → Kind 30023 + 30142
│   ├── parser.ts               # YAML-Frontmatter (commonMetadata)
│   ├── events/
│   │   ├── article.ts          # Kind 30023 Builder
│   │   └── amb.ts              # Kind 30142 Builder
│   ├── signer.ts               # NIP-46 Bunker (applesauce-signers)
│   └── relay.ts                # Relay-Publisher (applesauce-relay)
├── docs/superpowers/
│   ├── specs/                  # Design-Spezifikationen
│   └── plans/                  # Implementierungspläne
├── CLAUDE.md
├── LICENSE
└── README.md
```

## Design-Dokumente

- **Sync-Design:** `docs/superpowers/specs/2026-03-30-md-to-nostr-sync-design.md`
- **Phase-0-Bericht:** `docs/superpowers/plans/2026-04-29-phase-0-single-post-publisher.md`
- **Phase-1-Plan (aktuell):** `docs/superpowers/plans/2026-05-04-phase-1-ci-orchestrator.md`

## Kommandos

```bash
cd sync/
deno task dry-run-single <pfad/zu/index.md>  # Dry-Run einzelner Post
deno task publish-single <pfad/zu/index.md>  # Live-Publish einzelner Post
```

**Voraussetzung in `mdparser/.env` (gitignored):**
- `BUNKER_URL=bunker://…` — frisch in Amber gepairt, FOERBICO-Account aktiv
- `CLIENT_SECRET_HEX=<64-hex>` — fester Client-Key, sonst rotiert applesauce-signers pro Lauf und Amber sieht jede Session als neue App (Approval-Requests bleiben dann stumm). Einmal mit `openssl rand -hex 32` generieren, drin lassen.

## Nostr-Infrastruktur

| Zweck | URL | Event-Kinds |
|---|---|---|
| Article-Relays | `wss://relay-rpi.edufeed.org/`, `wss://relay.edufeed.org/`, `wss://relay.primal.net/`, `wss://theforest.nostr1.com/` | Kind 30023 (Posts + Pages) |
| AMB-Relay | `wss://amb-relay.edufeed.org/` (exklusiv) | Kind 30142 |
| FOERBICO-Pubkey | `5a12b41ec15b466321e88c371be2dc47d9193f9c8bba4ab09fc50045bd35aedf` | Autor-Identity |

## Entwicklungsstand

- **Phase 0 (29.04.2026):** Single-Post-Publisher fertig. Live-Events bisher: Geschöpflichkeit-als-Maßstab-KI (29.04. + Update 04.05.), hOERz-Herzensaustausch (04.05.).
- **Phase 1 (geplant):** CI-Orchestrator mit Discovery, Diff-Modus, `cli.ts`-Subcommands, GitHub-Action. Plan: `docs/superpowers/plans/2026-05-04-phase-1-ci-orchestrator.md`. Geklärte Entscheidungen: GitHub-Mirror auf `edufeed-org/mdparser`, eigener `CLIENT_SECRET_HEX` für CI, `MIN_RELAY_ACKS=2`.
- **Phase 2 (zukünftig):** Action als Blaupause für andere Hugo-Repos extrahierbar (eigenes Action-Repo `edufeed-org/nostr-publish` o. ä.).

## GitHub-Mirror

`github.com/edufeed-org/mdparser` ist Push-Mirror von Forgejo, automatisch synchron. Wird von der zukünftigen GitHub-Action im FOERBICO-Mirror-Repo per `actions/checkout` gezogen.

## Wichtige Regeln

- `d`-Tag wird aus `commonMetadata.id` abgeleitet (letztes Pfad-Segment) — MUSS stabil bleiben, sonst gehen Habla/Yakihonne-Kommentare verloren
- Kind 30142 nur wenn `commonMetadata.type === 'LearningResource'`
- `published_at` als Unix-Timestamp in Sekunden, aus YAML `datePublished`
- `created_at` als Sync-Zeitpunkt (Replaceable Events)
- `inLanguage` als BCP 47 (nicht NIP-32)
- Bilder werden NICHT von sync hochgeladen — das macht die CI-Pipeline via Blossom (separat)
