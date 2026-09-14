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

Bilder liegen auf Blossom (Hash-URL, Git trägt die URL). `events/article.ts`
leitet daraus die `x`-Tags ab — das erste für das Cover, je Fließtextbild mit
Hash-URL ein weiteres (Spec `docs/superpowers/specs/2026-09-07-…`).
`core/bilder.ts` (seit 2026-09-09) sorgt in `publish` dafür, dass Blossom
Git spiegelt: fehlende Blobs werden aus dem Beitragsordner mit dem
FOERBICO-Key hochgeladen (BUD-01, kind:24242), der Lizenznachweis
`kind:1063` wird aus dem `# bilder`-Block geprägt, wenn auf dem Relay keiner
oder ein abweichender liegt. Warnungen (fehlender Block-Eintrag, fehlende
Datei) stehen in der Job-Summary und blockieren das 30023 nicht.
Ein Schreiber je Beitrag: nur `publish` schreibt Events des FOERBICO-Keys —
der Regression-Wächter aus der Spec vom 07.09. entfällt deshalb; Rückschritte
in Git fängt content-lint (C06/C07/V18, Blossom-Form) vor dem Merge.

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
- **Phase-1-Plan (umgesetzt):** `docs/superpowers/plans/2026-05-04-phase-1-ci-orchestrator.md`
- **Setup + aktueller Stand:** `docs/SETUP-GUIDE.md`

## Kommandos

```bash
cd sync/
deno task test                               # alle Tests (braucht -A)
deno task dry-run-single <pfad/zu/index.md>  # Dry-Run einzelner Post
deno task publish-single <pfad/zu/index.md>  # Live-Publish einzelner Post
deno task publish-dry                        # Dry-Run über den Diff
deno task redaktion[-dry]                    # Redaktionsliste kind:30000 d=redaktion (Quelle: community-hub/docs/redaktionskreis.md)
deno task navigation[-dry]                   # Menü + Fußzeile kind:30004 aus Website/navigation.yaml (Hub ADR-0027)
```

**Seiten** (alles außerhalb `posts/`) bekommen im 30023 das NIP-32-Selbst-Label
`["L","foerbico/typ"]`, `["l","seite","foerbico/typ"]`; der community-hub nimmt
sie damit aus Blog, Themen und Feed und zeigt sie ohne Datum (ADR-0027). Die
Startseite des Hubs ist die Seite mit `d = startseite`.

**Voraussetzung in `mdparser/.env` (gitignored):**
- `BUNKER_URL=bunker://…` — frisch in Amber gepairt, FOERBICO-Account aktiv
- `AUTHOR_SECRET_HEX=<64-hex>` — optional, nur für Läufe von Hand (`redaktion`, `navigation`): dann signiert der Prozess selbst und der Bunker bleibt aus. Nie committen, nie in die CI.
- `CLIENT_SECRET_HEX=<64-hex>` — fester Client-Key, sonst rotiert applesauce-signers pro Lauf und Amber sieht jede Session als neue App (Approval-Requests bleiben dann stumm). Einmal mit `openssl rand -hex 32` generieren, drin lassen.

## Nostr-Infrastruktur

| Zweck | URL | Event-Kinds |
|---|---|---|
| Article-Relays | `wss://relay-rpi.edufeed.org/`, `wss://relay.edufeed.org/`, `wss://relay.primal.net/`, `wss://theforest.nostr1.com/` | Kind 30023 (Posts + Pages) |
| AMB-Relay | `wss://amb-relay.edufeed.org/` (exklusiv) | Kind 30142 |
| FOERBICO-Pubkey | `5a12b41ec15b466321e88c371be2dc47d9193f9c8bba4ab09fc50045bd35aedf` | Autor-Identity |

## Entwicklungsstand

- **Phase 0 (29.04.2026):** Single-Post-Publisher fertig. Live-Events bisher: Geschöpflichkeit-als-Maßstab-KI (29.04. + Update 04.05.), hOERz-Herzensaustausch (04.05.).
- **Phase 1 (produktiv seit 04.05.2026):** CI-Orchestrator mit Discovery, Diff-Modus, `cli.ts`-Subcommands, GitHub-Action. Lokal und CI teilen sich denselben `CLIENT_SECRET_HEX` (separater CI-Key hat in der Praxis nicht funktioniert), `MIN_RELAY_ACKS=2`. Stand und offene Punkte: `docs/SETUP-GUIDE.md`.
- **Phase 2 (zukünftig):** Action als Blaupause für andere Hugo-Repos extrahierbar (eigenes Action-Repo `edufeed-org/nostr-publish` o. ä.).

## GitHub-Mirror

`github.com/edufeed-org/mdparser` ist Push-Mirror von Forgejo, automatisch synchron. Wird von der GitHub-Action im FOERBICO-Mirror-Repo per `actions/checkout` gezogen.

## Validierung

Sieben **Pflichtfelder** in `commonMetadata`: `id`, `name`, `description`, `license`,
`creator`, `inLanguage`, `datePublished`. Fehlt eines, wird die Datei übersprungen.

`keywords` ist **empfohlen, nicht Pflicht** (seit 2026-09-02): fehlt es, wird der Post
publiziert und als `missingRecommended` gemeldet. Grund: 74 von 93 Dateien hatten kein
`keywords` — als Pflichtfeld hat es den Großteil des Archivs blockiert.

Ein Run schreibt eine Job-Summary (`core/summary.ts`) nach `GITHUB_STEP_SUMMARY`. Wurden
Dateien geändert, aber nichts publiziert, steht dort eine Warnung — dieser Fall lief
vorher still grün durch. Der Exit-Code bleibt bewusst 0.

## Wichtige Regeln

- `d`-Tag wird aus `commonMetadata.id` abgeleitet (letztes Pfad-Segment) — MUSS stabil bleiben, sonst gehen Habla/Yakihonne-Kommentare verloren
- Kind 30142 nur wenn `commonMetadata.type === 'LearningResource'`
- `published_at` als Unix-Timestamp in Sekunden, aus YAML `datePublished`
- `created_at` als Sync-Zeitpunkt (Replaceable Events)
- `inLanguage` als BCP 47 (nicht NIP-32)
- Bilder werden NICHT von sync hochgeladen — das macht die CI-Pipeline via Blossom (separat)
- `x`-Tags am 30023: erstes `x` = Cover-Hash (aus `image`), danach je Fließtextbild mit
  Hash-URL eines, dedupliziert. Kein `x` ohne Hash im Pfad, kein `imeta`
  (edufeed-Abstimmung 2026-09-07). Der `# bilder`-Block im Frontmatter (Konventionsnamen
  nach `bildattribution.md`) ist Eingabe zum Prägen — das 1063 auf dem Relay ist Wahrheit.
