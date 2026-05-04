# Phase 1 — CI-fähiger Sync-Orchestrator (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Plan, geschrieben am 2026-05-04. Voraussetzung für GitHub Action im Mirror-Repo.

**Ziel:** `mdparser/sync/` zu einem CI-fähigen Orchestrator ausbauen, der vom GitHub-Mirror `rpi-virtuell/FOERBICO_und_rpi-virtuell` per Action getriggert wird, geänderte Posts und Pages findet und als Kind 30023 + 30142 publiziert.

**Vorbild:** `joerglohrerde/publish/` — bewährter Aufbau (cli.ts mit Subcommands, change-detection.ts, runCheck/processPost-Pattern). Wir übernehmen die Architektur, weichen aber an drei Stellen ab:
1. **Pfad-Layout:** mdparser-Quelle ist `Website/content/<lang>/posts/<slug>/index.md` plus `Website/content/<lang>/<page>/index.md` (joerglohrerde: `content/posts/<lang>/<slug>/`)
2. **Relays:** kein NIP-65/Outbox. Hardcoded Mapping pro Kind:
   - 30023 → `relay-rpi.edufeed.org`, `relay.edufeed.org`, `relay.primal.net`, `theforest.nostr1.com`
   - 30142 → `amb-relay.edufeed.org` exklusiv
3. **Kind 30142 zusätzlich:** joerglohrerde sendet nur 30023; wir senden für `type: LearningResource` zusätzlich AMB-Events.

**Bewusst weggelassen** (kommt später): Bilder-Sidecar-YAMLs + Image-AMB-Events + Blossom-Upload. Die Markdown-Bilder verweisen weiter auf `oer.community`-URLs; CI liefert sie über die statische Site aus.

## Vorbedingungen

- `mdparser/.env` enthält `BUNKER_URL`, `CLIENT_SECRET_HEX`, `AUTHOR_PUBKEY_HEX`. Stand 2026-05-04 alle gesetzt, Pairing in Amber funktioniert mit „always allow" (siehe `2026-04-29-phase-0-single-post-publisher.md` und Memory `bunker_signing_setup.md`).
- Der FOERBICO-Pubkey `5a12b41ec15b466321e88c371be2dc47d9193f9c8bba4ab09fc50045bd35aedf` hat ein kind:10002 auf `relay-rpi.edufeed.org`. Wird in dieser Phase **nicht** angefasst, da wir Relays hardcoden.
- Pages haben aktuell **leeren commonMetadata-Block** (#commonMetadata: auskommentiert). Phase 1 publiziert sie nicht — sie werden mit Warnung übersprungen, bis redaktionell nachgezogen.

## Datei-Struktur (Ziel)

```
sync/
├── deno.json                    # neue Tasks: check, publish, dry-run, validate-post
├── cli.ts                       # Subcommand-Dispatcher (NEU)
├── publish-single.ts            # bleibt bestehen (legacy, aber funktional)
├── core/
│   ├── config.ts                # NEU — env reader
│   ├── relays.ts                # NEU — hardcoded relay-map + publish-helper
│   ├── change-detection.ts      # NEU — git diff für Diff-Modus
│   ├── discover.ts              # NEU — alle Posts + Pages durchwandern
│   ├── parser.ts                # MOVE aus sync/parser.ts
│   ├── signer.ts                # MOVE aus sync/signer.ts
│   ├── validation.ts            # NEU — Pflichtfeld-Check als eigene Funktion
│   └── log.ts                   # NEU — Run-Logger mit JSON-Artifact
├── events/
│   ├── article.ts               # bleibt
│   └── amb.ts                   # bleibt
├── subcommands/
│   ├── check.ts                 # NEU — Pre-Flight: Bunker-Ping, Pubkey-Match, Relay-Reachability
│   ├── publish.ts               # NEU — processPost: lesen → validieren → bauen → signieren → publizieren
│   └── validate-post.ts         # NEU — einzelne Datei lokal prüfen ohne Bunker
└── tests/
    ├── change-detection_test.ts
    ├── discover_test.ts
    ├── parser_test.ts
    ├── validation_test.ts
    ├── article_test.ts
    └── amb_test.ts
```

**Migration:** `parser.ts` und `signer.ts` ziehen nach `core/`, `relay.ts` ersetzt durch `core/relays.ts`. `publish-single.ts` bleibt für Adhoc-Single-Publish — die Imports werden auf neue Pfade angepasst.

## Aufgaben

### Task 1: Refactor — Verzeichnisse einziehen, Imports anpassen

**Files:**
- Move: `sync/parser.ts` → `sync/core/parser.ts`
- Move: `sync/signer.ts` → `sync/core/signer.ts`
- Move: `sync/relay.ts` → `sync/core/relays.ts` (umbenannt zu Plural)
- Update: `sync/publish-single.ts` (Imports anpassen)
- Update: `sync/events/article.ts` (Import von `parser.ts`)
- Update: `sync/events/amb.ts` (Import von `parser.ts`)

- [ ] **Step 1:** Dateien verschieben, Imports in den verschobenen Dateien selbst lassen wie sie sind.
- [ ] **Step 2:** `publish-single.ts` Imports auf `./core/...` anpassen.
- [ ] **Step 3:** `events/article.ts` und `events/amb.ts` Imports auf `../core/parser.ts` anpassen.
- [ ] **Step 4:** Verify — `deno task dry-run-single <pfad>` läuft ohne Fehler.
- [ ] **Step 5:** Commit: `refactor(sync): move parser/signer/relay to core/`

---

### Task 2: Config-Modul

**Files:**
- Create: `sync/core/config.ts`

Konfiguration kommt aus Env-Variablen mit sinnvollen Defaults. Pflicht: `BUNKER_URL`, `AUTHOR_PUBKEY_HEX`. Optional mit Defaults: `CONTENT_ROOT`, `CLIENT_SECRET_HEX`, `MIN_RELAY_ACKS`.

```typescript
export interface Config {
  bunkerUrl: string
  authorPubkeyHex: string
  contentRoot: string             // default '../../FOERBICO_und_rpi-virtuell/Website/content', in CI: 'Website/content'
  clientSecretHex?: string
  minRelayAcks: number             // default 1 (für 30023 mit 4 Relays sinnvoll: 2)
}

export function loadConfig(read = (k: string) => Deno.env.get(k)): Config { … }
```

Validierung: `AUTHOR_PUBKEY_HEX` und `CLIENT_SECRET_HEX` müssen 64 lowercase hex sein.

- [ ] **Step 1:** `core/config.ts` schreiben analog zu `joerglohrerde/publish/src/core/config.ts`, an mdparser-Felder angepasst.
- [ ] **Step 2:** `core/config_test.ts` mit fake EnvReader, prüft Defaults und Validierung.
- [ ] **Step 3:** Tests laufen lassen, grün.
- [ ] **Step 4:** Commit: `feat(sync): add core/config module`

---

### Task 3: Relays — hardcoded Mapping pro Kind

**Files:**
- Create: `sync/core/relays.ts` (überschreibt vorherige `sync/relay.ts`)

Statt einer Liste Universal-Relays haben wir zwei feste Listen:

```typescript
export const ARTICLE_RELAYS = [
  'wss://relay-rpi.edufeed.org/',
  'wss://relay.edufeed.org/',
  'wss://relay.primal.net/',
  'wss://theforest.nostr1.com/',
]

export const AMB_RELAYS = ['wss://amb-relay.edufeed.org/']

export interface PublishResult { relay: string; ok: boolean; message?: string }

export async function publishToRelays(
  relays: string[],
  event: SignedEvent,
  timeoutMs = 10_000,
): Promise<PublishResult[]>
```

`publishToRelays` ruft pro Relay `publishEvent` (existiert schon, wird kopiert) und sammelt Ergebnisse. Erfolg = mindestens `minRelayAcks` Relays haben mit `ok=true` geantwortet.

- [ ] **Step 1:** `core/relays.ts` schreiben.
- [ ] **Step 2:** `publish-single.ts` umstellen: 30023 → `publishToRelays(ARTICLE_RELAYS, …)`, 30142 → `publishToRelays(AMB_RELAYS, …)`.
- [ ] **Step 3:** Manueller Live-Test mit kleinem Post (oder hOERz-Republish): erwartet 4 OK-Antworten für 30023, 1 für 30142.
- [ ] **Step 4:** Commit: `feat(sync): hardcoded relay-map per event kind`

---

### Task 4: Discovery

**Files:**
- Create: `sync/core/discover.ts`
- Create: `sync/core/discover_test.ts`

Pfad-Layout: `<contentRoot>/<lang>/posts/<slug>/index.md` (Posts) und `<contentRoot>/<lang>/<page>/index.md` (Pages, aber **nicht** unter `posts/`).

```typescript
export interface ContentFile {
  path: string                  // absoluter Pfad zur index.md
  type: 'post' | 'page'
  lang: string                  // ISO 639-1 ('de', 'en')
  slug: string                  // letzter Pfadteil vor /index.md
}

export async function allContentFiles(contentRoot: string): Promise<ContentFile[]>
```

Logik:
- Iteriere `<contentRoot>/<lang>/` (nur 2-Buchstaben-Ordner).
- Wenn `<lang>/posts/` existiert: Posts daraus.
- Direkte Unterordner von `<lang>/` ≠ `posts/` und nicht `_*`: Pages. Auch tiefer geschachtelte Pages (z. B. `oer-und-oep/lernmodul/`).
- Skip Dateien ohne `index.md`.

- [ ] **Step 1:** `discover.ts` schreiben.
- [ ] **Step 2:** Tests gegen `testdata/`-Fixture mit synthetischer Struktur (Tasks 4 + 5 nutzen dasselbe Fixture).
- [ ] **Step 3:** Live-Smoke: `deno run --allow-read core/discover.ts` (CLI-Wrapper) listet Posts + Pages aus dem echten `FOERBICO_und_rpi-virtuell/Website/content`.
- [ ] **Step 4:** Commit: `feat(sync): content discovery for posts and pages`

---

### Task 5: Change-Detection (Git-Diff)

**Files:**
- Create: `sync/core/change-detection.ts`
- Create: `sync/core/change-detection_test.ts`

Adaption von `joerglohrerde/publish/src/core/change-detection.ts`. Anders als joerglohrerde haben wir das umgekehrte Layout: `<lang>/posts/<slug>` statt `posts/<lang>/<slug>`. Plus Pages.

```typescript
export interface DiffArgs { from: string; to: string; contentRoot: string; runner?: GitRunner }

export async function changedContentFiles(args: DiffArgs): Promise<ContentFile[]>
```

`from`/`to` sind Git-Refs. In CI `from = $GITHUB_EVENT_BEFORE`, `to = HEAD`. Lokal: `from = HEAD~1`, `to = HEAD`.

Verhalten: Liefert dieselbe `ContentFile`-Form wie `discover.ts`, aber gefiltert auf das, was im Diff verändert wurde. Wenn ein Asset (Bild) im Post-Verzeichnis sich geändert hat, gilt der Post als geändert.

- [ ] **Step 1:** `change-detection.ts` schreiben — Regex an mdparser-Layout angepasst.
- [ ] **Step 2:** Tests mit fake `GitRunner` (gibt vordefinierte Diff-Lines zurück).
- [ ] **Step 3:** Test gegen echtes Repo: `git diff --name-only HEAD~5..HEAD` → erwartet, dass die letzten Post-Änderungen aufgelistet werden.
- [ ] **Step 4:** Commit: `feat(sync): git-diff based change detection`

---

### Task 6: Validation

**Files:**
- Create: `sync/core/validation.ts`
- Create: `sync/core/validation_test.ts`

`validateRequired` aus `parser.ts` rausziehen, leicht erweitern:
- Klassifiziere Output: `'ok' | 'skip-empty-frontmatter' | 'skip-missing-fields' | 'error'`.
- Gib eine Liste der fehlenden Felder zurück.
- Pages mit komplett auskommentiertem `commonMetadata`-Block → `skip-empty-frontmatter` (kein Fehler, nur Warnung).

```typescript
export type ValidationStatus = 'ok' | 'skip-empty-frontmatter' | 'skip-missing-fields' | 'error'
export interface ValidationResult { status: ValidationStatus; missing: string[]; reason?: string }
export function validatePost(parsed: ParsedMarkdown | null): ValidationResult
```

- [ ] **Step 1:** `validation.ts` schreiben.
- [ ] **Step 2:** Tests: 4 Cases (vollständiger Post, leerer Frontmatter, fehlende Pflichtfelder, parser hat null geliefert).
- [ ] **Step 3:** Commit: `feat(sync): structured validation with skip categories`

---

### Task 7: Subcommand `validate-post`

**Files:**
- Create: `sync/subcommands/validate-post.ts`

CLI: `deno task validate-post <pfad/zu/index.md>` — liest die Datei, parst, validiert, gibt Status aus. Exit-Code 0 wenn `ok`, 1 sonst. Kein Bunker, keine Netzwerkzugriffe.

- [ ] **Step 1:** `subcommands/validate-post.ts` schreiben.
- [ ] **Step 2:** Manueller Test: gegen Geschöpflichkeit → `ok`. Gegen impressum → `skip-empty-frontmatter`. Gegen non-existierendes File → Exit 2.
- [ ] **Step 3:** Commit: `feat(sync): add validate-post subcommand`

---

### Task 8: Subcommand `check` (Pre-Flight)

**Files:**
- Create: `sync/subcommands/check.ts`

Macht 3 Dinge:
1. **Bunker-Ping:** `createBunkerSigner` aufrufen, `getPublicKey` durchziehen, prüfen dass Result == `AUTHOR_PUBKEY_HEX`. Bei Mismatch: Fehler mit klarer Meldung.
2. **Article-Relays prüfen:** WS-Connection zu jedem `ARTICLE_RELAYS`-Eintrag, Erwartung: connection success in <5s. Bei Fehler: warnen, nicht abbrechen.
3. **AMB-Relay prüfen:** dasselbe für `AMB_RELAYS`.

Exit 0 wenn Bunker ok und mindestens 1 Article-Relay + AMB-Relay erreichbar. Exit 1 sonst.

- [ ] **Step 1:** `subcommands/check.ts` schreiben.
- [ ] **Step 2:** Manueller Test: `deno task check` lokal — sollte alle vier Article-Relays + AMB-Relay grün melden, Bunker-Pubkey-Match grün.
- [ ] **Step 3:** Commit: `feat(sync): add check subcommand for CI pre-flight`

---

### Task 9: Subcommand `publish` mit Modi (diff / force-all / single)

**Files:**
- Create: `sync/subcommands/publish.ts`
- Create: `sync/cli.ts`
- Update: `sync/deno.json`

`processPost(file: ContentFile, deps): Promise<PostResult>`
1. Datei lesen, `parseMarkdown`.
2. `validatePost` → bei `skip-*` zurück mit Status, kein Publish.
3. `buildArticleEvent`, `signer.signEvent`, `publishToRelays(ARTICLE_RELAYS)`.
4. Wenn `type === 'LearningResource'`: `buildAmbEvent`, `signer.signEvent`, `publishToRelays(AMB_RELAYS)`.
5. Logger updaten.

`cmdPublish(flags)`:
- `--force-all` → `allContentFiles(contentRoot)`
- `--post <slug-oder-pfad>` → einer
- sonst (default) → `changedContentFiles({from: GITHUB_EVENT_BEFORE ?? 'HEAD~1', to: 'HEAD', contentRoot})`
- `--dry-run` → wie publish, aber kein signEvent/publish, nur Log.

`cli.ts` entry point analog joerglohrerde, dispatched zu `check`/`publish`/`validate-post`.

`deno.json` neue Tasks:
```json
{
  "tasks": {
    "check": "deno run --allow-env --allow-read --allow-net --env-file=../.env cli.ts check",
    "publish": "deno run --allow-env --allow-read --allow-net --allow-run=git --env-file=../.env cli.ts publish",
    "publish-dry": "deno run --allow-env --allow-read --allow-net --allow-run=git --env-file=../.env cli.ts publish --dry-run",
    "validate-post": "deno run --allow-read cli.ts validate-post",
    "dry-run-single": "deno run --env-file=../.env --allow-env --allow-read publish-single.ts --dry-run",
    "publish-single": "deno run --env-file=../.env --allow-env --allow-read --allow-net publish-single.ts"
  }
}
```

- [ ] **Step 1:** `subcommands/publish.ts` schreiben.
- [ ] **Step 2:** `cli.ts` schreiben.
- [ ] **Step 3:** `deno.json` Tasks erweitern.
- [ ] **Step 4:** Lokaler `--dry-run`-Test: `CONTENT_ROOT=/Users/joerglohrer/repositories/FOERBICO_und_rpi-virtuell/Website/content deno task publish-dry --force-all` → erwartet ~30 Posts, ~12 Pages (davon viele skip wegen leerem Frontmatter), keine Bunker-Calls.
- [ ] **Step 5:** Commit: `feat(sync): add publish subcommand with diff/force-all/single modes`

---

### Task 10: Run-Logger

**Files:**
- Create: `sync/core/log.ts`

Sammelt pro Lauf: ok-Posts, skipped-Posts, failed-Posts, Event-IDs, Relay-Antworten. Schreibt JSON nach `./logs/publish-<iso-timestamp>.json`. In CI als Artifact uploadbar.

```typescript
export interface PostLog { slug: string; status: 'ok' | 'skipped' | 'failed'; ... }
export interface RunSummary { runId: string; mode: string; startedAt: string; finishedAt: string; posts: PostLog[]; exitCode: number }
export function createLogger(opts): Logger
```

- [ ] **Step 1:** `core/log.ts` schreiben.
- [ ] **Step 2:** In `subcommands/publish.ts` einbauen.
- [ ] **Step 3:** Probelauf prüfen: nach `--dry-run --force-all` liegt `logs/publish-*.json` mit allen Posts.
- [ ] **Step 4:** Commit: `feat(sync): add run logger with JSON artifact`

---

### Task 11: End-to-End Live-Test

Mit gerade fertigem Orchestrator wird **eine Auswahl an Posts** live publiziert — nicht alle, denn die meisten sind möglicherweise schon einmal publiziert oder noch nicht redaktionell freigegeben.

- [ ] **Step 1:** `deno task check` — alle Komponenten grün?
- [ ] **Step 2:** `deno task publish-dry --force-all` — wieviele OK-Posts? wieviele skip?
- [ ] **Step 3:** Liste OK-Posts mit Jörg durchgehen, Auswahl bestimmen für ersten Live-Lauf (z. B. die 5 jüngsten).
- [ ] **Step 4:** Pro ausgewähltem Post `deno task publish --post <slug>` — beobachten, dass alle Events durchgehen.
- [ ] **Step 5:** Stichproben in Habla/Yakihonne — sind die naddrs aufrufbar?
- [ ] **Step 6:** Commit Logs (oder gitignored, je nach Wunsch).

---

### Task 12: GitHub Action im Mirror-Repo

**Files:**
- Create: `rpi-virtuell/FOERBICO_und_rpi-virtuell/.github/workflows/nostr-sync.yml`

Wird nicht in mdparser committed, sondern im Mirror-Repo. Das mdparser-Repo wird als Submodule oder per Checkout-Action im Workflow gezogen.

```yaml
name: Nostr Sync

on:
  push:
    branches: [main]
    paths: ['Website/content/**']
  workflow_dispatch:
    inputs:
      force_all:
        description: 'Publish all posts (--force-all)'
        type: boolean
        default: false

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout content repo
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          path: content-repo

      - name: Checkout mdparser
        uses: actions/checkout@v4
        with:
          repository: rpi-virtuell/mdparser   # oder wo auch immer der Mirror liegt
          path: mdparser
          ref: main

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - name: Pre-Flight Check
        working-directory: mdparser/sync
        env:
          BUNKER_URL: ${{ secrets.BUNKER_URL }}
          AUTHOR_PUBKEY_HEX: ${{ secrets.AUTHOR_PUBKEY_HEX }}
          CLIENT_SECRET_HEX: ${{ secrets.CLIENT_SECRET_HEX }}
        run: deno run --allow-env --allow-net --allow-read cli.ts check

      - name: Publish
        working-directory: mdparser/sync
        env:
          BUNKER_URL: ${{ secrets.BUNKER_URL }}
          AUTHOR_PUBKEY_HEX: ${{ secrets.AUTHOR_PUBKEY_HEX }}
          CLIENT_SECRET_HEX: ${{ secrets.CLIENT_SECRET_HEX }}
          CONTENT_ROOT: ${{ github.workspace }}/content-repo/Website/content
          GITHUB_EVENT_BEFORE: ${{ github.event.before }}
        run: |
          if [ "${{ github.event.inputs.force_all }}" = "true" ]; then
            deno run --allow-env --allow-read --allow-write=./logs --allow-net --allow-run=git cli.ts publish --force-all
          else
            cd "${{ github.workspace }}/content-repo" && \
            cd "${{ github.workspace }}/mdparser/sync" && \
            deno run --allow-env --allow-read --allow-write=./logs --allow-net --allow-run=git cli.ts publish
          fi

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: nostr-sync-log
          path: mdparser/sync/logs/publish-*.json
          retention-days: 30
```

**Offen — vor diesem Task klären:**
- Wo liegt der mdparser-Mirror, von dem die Action ihn checkout'et? Oder soll mdparser-Code als Git-Submodule im content-Repo liegen?
- Welcher Branch ist Push-Trigger im Mirror — `main`?

Secrets setzen:
- `BUNKER_URL` — derselbe wie lokal in `mdparser/.env`
- `AUTHOR_PUBKEY_HEX` — `5a12b41ec15b466321e88c371be2dc47d9193f9c8bba4ab09fc50045bd35aedf`
- `CLIENT_SECRET_HEX` — derselbe wie lokal (oder eigener für CI? — Diskussion: gleicher Key bedeutet, dass CI und Lokal als „dieselbe App" in Amber erscheinen, was dedupliziert. Eigener Key heißt extra Approval beim ersten CI-Run.)

- [ ] **Step 1:** Mit Jörg klären: mdparser-Quelle für die Action.
- [ ] **Step 2:** Workflow-File schreiben.
- [ ] **Step 3:** Secrets im Mirror-Repo eintragen.
- [ ] **Step 4:** `workflow_dispatch` mit `force_all=false` als Smoke-Test (geht durch wenn der letzte Push keine Posts geändert hat → leerer Publish-Lauf, aber check ok).
- [ ] **Step 5:** Live-Smoke: einen Post im Mirror ändern, push, beobachten.

---

### Task 13: Phase 2 Optional — Woodpecker im Forgejo-Repo

Spec sagt Woodpecker primär. Wenn die GitHub-Action auf dem Mirror funktioniert und stabil ist, kann derselbe Code unter Woodpecker laufen — `cd sync && deno task check && deno task publish` reicht aus, gleiche Secrets.

- [ ] Aufschieben bis nach Task 12 produktiv.

---

## Zusammenfassung

| Task | Was | Aufwand |
|---|---|---|
| 1 | Refactor core/ | klein |
| 2 | Config | klein |
| 3 | Relays | klein |
| 4 | Discovery | mittel |
| 5 | Change-Detection | mittel |
| 6 | Validation | klein |
| 7 | validate-post | klein |
| 8 | check | mittel |
| 9 | publish + cli | groß |
| 10 | Logger | klein |
| 11 | E2E Live-Test | mittel |
| 12 | GitHub Action | mittel |
| 13 | Woodpecker | optional |

**Konventionen während Implementation:**
- Test-driven wo der Code Logik enthält (parser, validation, change-detection, discover). Subcommands selbst werden manuell verifiziert.
- Pro Task ein Commit. Tests laufen vor jedem Commit grün.
- Keine Mock-Bunker — Live-Tests immer gegen echten Amber.

## Klärungspunkte vor Start

1. **mdparser-Mirror auf GitHub:** Wo lebt der Code, den die Action checkout'et? Optionen: a) GitHub-Mirror von `git.rpi-virtuell.de/Comenius-Institut/mdparser`, b) Submodule im Content-Repo, c) eigener Push der `sync/`-Sources ins Content-Repo.
2. **CLIENT_SECRET_HEX in CI:** derselbe wie lokal (Amber dedupliziert) oder eigener (extra App-Eintrag in Amber)?
3. **`MIN_RELAY_ACKS`:** für 30023 mit 4 Relays — sinnvoll 2? Bei 1 funktioniert es auch wenn 3 Relays down sind, was robust ist.
