# Phase 0 — Single-Post-Publisher (Bericht)

> **Status:** Abgeschlossen am 29.04.2026.
> Dies ist ein **Bericht über getane Arbeit**, kein zukünftiger Plan. Der formelle Plan in `2026-03-30-md-to-nostr-dry-run.md` (Tasks 1–9, TDD, Discovery + Tests) bleibt der Bezugsplan für Phase 1.

## Anlass

Jörg brauchte sofort eine adressierbare `naddr`-Adresse für den aktuellsten Post `2026-04-28-Geschoepflichkeit-als-Massstab-KI`, an die in Habla/Yakihonne Live-Kommentare angedockt werden können. Pipeline-vollständige Lösung (Phase 1+2) hätte das verzögert; ein minimaler Vorgriff auf `sync/` löst das jetzt und legt gleichzeitig Boden für die spätere Pipeline.

## Entscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Quelle | Lokale Markdown-Datei, Pfad als CLI-Argument | Geht ohne Discovery; Mirror-Frage wird erst in Phase 2 relevant |
| Signing | NIP-46 Bunker (BUNKER_URL in `.env`) | Bereits vorhandene Bunker-Identität für FOERBICO-Pubkey, vermeidet Private Key in Repo |
| Bunker-Library | `applesauce-signers` + `applesauce-relay` | Vorbild aus `joerglohrerde/publish/src/core/signer.ts`, bewährter benign-error-Workaround |
| Events | Kind 30023 + Kind 30142 (Article + AMB) | Spec-konform für `type: LearningResource`; Habla/Yakihonne kommentieren am 30023 |
| Bilder | Nicht in Phase 0 | Bild-AMB-Events und Blossom-Upload kommen in Phase 1; `image`-Tag mit oer.community-URL bleibt drin |
| `created_at` | Sync-Zeitpunkt (`Date.now()`) | Nostr-native: Replaceable Events ersetzen sich über `created_at` automatisch. Hash-Cache fürs Skippen unveränderter Posts ist Phase-2-Optimierung. |
| `published_at` | Aus YAML `datePublished` | Spec-konform, repräsentiert Erscheinungsdatum statt Sync-Zeit |
| Tests | In Phase 0 weggelassen | Vorgriff-Charakter; vollständige TDD-Tests laut Plan-Tasks 3–8 entstehen in Phase 1 |

## Was gebaut wurde

```
mdparser/
├── .env                         # BUNKER_URL ergänzt (Forgejo-Token unverändert)
└── sync/
    ├── README.md                # Modul-Doku
    ├── deno.json                # Tasks dry-run-single + publish-single
    ├── parser.ts                # parseMarkdown, extractSlug, validateRequired
    ├── events/
    │   ├── article.ts           # Kind 30023 Builder + UnsignedEvent type
    │   └── amb.ts               # Kind 30142 Builder
    ├── signer.ts                # createBunkerSigner via NostrConnectSigner
    ├── relay.ts                 # publishEvent (single-shot, Timeout)
    └── publish-single.ts        # CLI: --dry-run / live, naddr-Output
```

## Live-Lauf

**Datei:** `/Users/joerglohrer/repositories/FOERBICO_und_rpi-virtuell/Website/content/de/posts/2026-04-28-Geschoepflichkeit-als-Massstab-KI/index.md`

**Bunker-Pubkey verifiziert:** `5a12b41ec15b466321e88c371be2dc47d9193f9c8bba4ab09fc50045bd35aedf` (FOERBICO).

| Event | Kind | Event-ID | Relay | Antwort |
|---|---|---|---|---|
| Article | 30023 | `9e4670c5bd060fd0…` | `wss://relay-rpi.edufeed.org/` | OK |
| AMB | 30142 | `8bfdd36bcd3e9462…` | `wss://amb-relay.edufeed.org/` | OK |

**naddr für Kommentare:**
```
naddr1qvzqqqr4gupzqksjks0vzk6xvvs73rphr03dc37eryleeza6f2cfl3gqgk7nttklqyw8wumn8ghj7un9d3shjttjwp5juetyw4nx2ety9ehhyee0qqskwetnvd5x7etsvekxjcmgddjkjapdv9k8xttdv9ehxum5v93z66mfjmnwea
```

## Abweichungen von der Original-Spec

Die Spec (`2026-03-30-md-to-nostr-sync-design.md`) ging von Forgejo-API-Zugriff aus; Phase 0 liest **lokale Files** (im Phase-2-Setup ist das ohnehin korrekt, weil GitHub-Action das Mirror-Repo auscheckt). Keine inhaltliche Abweichung beim Event-Mapping.

## Was Phase 1 daran ergänzen muss

- `discover.ts` (Posts + Pages durchwandern)
- `images.ts` + `events/image_amb.ts` (Bild-Sidecar-YAMLs → Kind 30142 für Bilder)
- `sync.ts` Orchestrator + Diff-Logik (`GITHUB_EVENT_BEFORE` für inkrementellen Lauf)
- `cli.ts` mit Subcommands `check`/`publish` analog `joerglohrerde/publish/src/cli.ts`
- Tests laut Plan-Tasks 3–8 (35 Tests)

## Was Phase 2 daran ergänzen muss

- `.github/workflows/sync.yml` im Mirror-Repo `rpi-virtuell/FOERBICO_und_rpi-virtuell`
- Repo-Secrets: `BUNKER_URL`, `AUTHOR_PUBKEY_HEX`, optional `CLIENT_SECRET_HEX`
- Pre-Flight `cli.ts check` (Bunker-Ping, Pubkey-Match)
- Logs als GitHub Artifacts
