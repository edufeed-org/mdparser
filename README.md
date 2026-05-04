# mdparser

Markdown-Parser und Nostr-Sync für die [oer.community](https://oer.community)
Content-Pipeline. Deno-basiert, parsing inklusive.

Liest Markdown-Dateien mit `commonMetadata`-YAML-Frontmatter (AMB/Schema.org)
aus einem Hugo-artigen Content-Tree und publiziert sie als Nostr-Events
(Kind 30023 Long-form + Kind 30142 AMB) auf konfigurierte Relays.

## Rolle in der Pipeline

```
content-lint  →  mdparser  →  nostrmcp  →  oer.community (statische Site)
```

mdparser ersetzt Schritt-für-Schritt einen klassischen Hugo-Build-und-Deploy
durch direktes Nostr-Publishing. Bilder werden weiter unter `oer.community`-URLs
referenziert; deren Auslieferung übernimmt nostrmcp + nsite/Blossom (separat).

## Stand

| Bereich | Status |
|---|---|
| Phase 0 — Single-Post-Publisher | ✅ produktiv (`sync/publish-single.ts`) |
| Phase 1 — CI-Orchestrator | 📋 geplant — `docs/superpowers/plans/2026-05-04-phase-1-ci-orchestrator.md` |
| Phase 2 — GitHub Action im Mirror-Repo | 📋 Teil von Phase 1 |
| Phase 3 — Blaupause für andere Hugo-Repos | 🔮 später (eigenes Action-Repo) |

## Quick Start (Single-Post-Publish)

```bash
cd sync/

# Dry-Run — zeigt die zwei Events ohne zu publizieren
deno task dry-run-single /pfad/zu/post/index.md

# Live — signiert via Bunker und publiziert
deno task publish-single /pfad/zu/post/index.md
```

Voraussetzung: `mdparser/.env` mit:
- `BUNKER_URL=bunker://…` — NIP-46 Pairing-URL aus deiner Signing-App (Amber, nsec.app)
- `CLIENT_SECRET_HEX=…` — 64-Zeichen-Hex (`openssl rand -hex 32`), einmal generieren und stabil halten

Siehe [`sync/README.md`](sync/README.md) für Details und [`docs/superpowers/specs/`](docs/superpowers/specs/) für die Architektur-Spec.

## Repo-Struktur

```
mdparser/
├── sync/                       # Deno-basierter Markdown→Nostr-Publisher
│   ├── publish-single.ts       # CLI: ein Post → Kind 30023 + 30142
│   ├── parser.ts               # YAML-Frontmatter (commonMetadata)
│   ├── events/
│   │   ├── article.ts          # Kind 30023 Builder
│   │   └── amb.ts              # Kind 30142 Builder
│   ├── signer.ts               # NIP-46 Bunker (applesauce-signers)
│   └── relay.ts                # Relay-Publisher (applesauce-relay)
├── docs/superpowers/
│   ├── specs/                  # Architektur-Spezifikationen
│   └── plans/                  # Implementierungs-Pläne
├── CLAUDE.md                   # Kontext für Claude Code
├── LICENSE                     # MIT
└── README.md
```

## Kontrakte

Dieses Repo implementiert die Contracts aus dem [oer-orchestrator](https://git.rpi-virtuell.de/Comenius-Institut/oer-orchestrator):

- **article-frontmatter** — welche YAML-Felder werden gelesen
- **event-tag-mapping** — wie sie auf Nostr-Tags abgebildet werden

Bei Abweichungen zwischen diesem Repo und den Contracts gilt der Contract.

## Lizenz

MIT — siehe [LICENSE](LICENSE).
