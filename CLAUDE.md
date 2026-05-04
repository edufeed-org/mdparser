# mdparser

Markdown-Parser und Nostr-Sync fuer die oer.community Content-Pipeline.

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

mdparser hat zwei Aufgaben:
1. **Parsing** (Node.js, `src/`): Markdown + YAML-Frontmatter parsen, in verschiedene Formate transformieren
2. **Sync** (Deno, `sync/`): Geparsete Inhalte als Nostr-Events auf Relays publizieren

## Projektstruktur

```
mdparser/
  src/                        # Node.js Parser (bestehend)
    parser.js                 # Markdown AST Parsing
    index.js                  # Hauptexport
    extractors/
      yaml-extractor.js       # YAML-Frontmatter Extraktion
      amb-extractor.js        # Schema.org Metadaten
    converters/
      markdown-to-html.js     # Markdown → HTML
      html-template.js        # HTML Templating
    transformers/
      nostr-transformer.js    # → Kind 30023/30142
      wordpress-transformer.js
    forgejo-client.js         # Forgejo API Zugriff
  sync/                       # Deno Sync-Modul (in Entwicklung)
    deno.json
    sync.ts                   # Hauptorchestrierung
    forgejo.ts                # Forgejo API Client
    parser.ts                 # YAML Extraktion
    amb.ts                    # commonMetadata → AMB Tags
    events/
      article.ts              # Kind 30023 Builder
      amb.ts                  # Kind 30142 Builder
    relay.ts                  # WebSocket Relay Client
    signing.ts                # Event Signing
    config.ts                 # Konfiguration
  docs/superpowers/
    specs/                    # Design-Spezifikationen
    plans/                    # Implementierungsplaene
```

## Design-Dokumente

- **Sync-Design:** `docs/superpowers/specs/2026-03-30-md-to-nostr-sync-design.md`
- **Dry-Run-Plan:** `docs/superpowers/plans/2026-03-30-md-to-nostr-dry-run.md`

## Verfuegbare Kommandos

### Node.js Parser

```bash
npm run start           # Parser ausfuehren
npm run dev             # Watch-Mode
npm run test            # Alle Tests (parser, converter, transformers)
npm run test:parser     # Parser-Tests
npm run test:converter  # HTML-Conversion-Tests
npm run test:wordpress  # WordPress-Transformer
npm run test:nostr      # Nostr-Transformer Tests
npm run lint            # ESLint
npm run format          # Prettier
npm run example         # Forgejo-Beispiel
npm run dashboard       # Dashboard UI
npm run web             # Web-Server auf localhost:3000
```

### Deno Sync (in Entwicklung)

```bash
cd sync/
deno task dry-run-single <pfad/zu/index.md>  # Dry-Run einzelner Post
deno task publish-single <pfad/zu/index.md>  # Live-Publish einzelner Post
```

**Voraussetzung in `mdparser/.env`:**
- `BUNKER_URL=bunker://…` — frisch in Amber gepairt, FOERBICO-Account aktiv
- `CLIENT_SECRET_HEX=<64-hex>` — fester Client-Key, sonst rotiert applesauce-signers pro Lauf und Amber sieht jede Session als neue App (Approval-Requests bleiben dann stumm). Einmal mit `openssl rand -hex 32` generieren, drin lassen.

## Nostr-Infrastruktur

| Dienst | URL | Event-Typen |
|---|---|---|
| Content-Relay | `wss://relay-rpi.edufeed.org/` | Kind 30023 (Artikel), Kind 30004 (Menus) |
| AMB-Relay | `wss://amb-relay.edufeed.org/` | Kind 30142 (AMB-Metadaten) |
| Pubkey | `5a12b41ec15b466321e88c371be2dc47d9193f9c8bba4ab09fc50045bd35aedf` | Autor-Identity |

## Entwicklungsstand

- **Node.js Parser:** Stabil, v0.4.0, Tests vorhanden
- **Deno Sync — Phase 0 (29.04.2026):** Single-Post-Publisher fertig. `sync/publish-single.ts` kann eine Markdown-Datei als Kind 30023 + 30142 publizieren (Bunker-Signing, beide Relays). Live-Events bisher: Geschöpflichkeit-als-Maßstab-KI (29.04. + Update 04.05.), hOERz-Herzensaustausch (04.05.).
- **Deno Sync — Phase 1:** Discovery + Orchestrator + Bild-AMB-Events + Tests stehen aus. Bezugsplan: `docs/superpowers/plans/2026-03-30-md-to-nostr-dry-run.md`.
- **Deno Sync — Phase 2:** GitHub Action im Mirror-Repo `rpi-virtuell/FOERBICO_und_rpi-virtuell`. Blaupause: `joerglohrerde/.github/workflows/publish.yml`.

## Wichtige Regeln

- d-Tag wird aus `commonMetadata.id` abgeleitet (letztes Pfad-Segment) — MUSS stabil bleiben
- Kind 30142 nur wenn `commonMetadata.type` = `LearningResource`
- `published_at` als Unix-Timestamp in Sekunden
- `inLanguage` als BCP 47 (nicht NIP-32)
- Bilder werden NICHT von sync hochgeladen — das macht die CI-Pipeline via Blossom
