# Spec: Bilder in `sync publish`, `sync pull` (Relay → Git), `sync label`/`adopt`

**Datum:** 2026-09-04
**Status:** Entwurf
**Bezug:** `community-hub/docs/redaktion-longform.md` (Abschnitte 2, 6, 8),
`community-hub/docs/entscheidungen/0013`, `0015`, `0021`

## Warum

`sync publish` erzeugt 30023 + 30142 sauber, aber ohne Bilderschritt. Folge im
FOERBICO-Bestand (Stand 03.09.): 85 von 86 Artikeln ohne `x`-Tag, 166 von 269
Bildverweisen relativ, 1 Lizenznachweis. Der community-hub liefert Bilder nur
mit auflösbarem `kind:1063` — also zeigt er derzeit fast keine.

Zweitens fehlt die Gegenrichtung. Sobald jemand einen Beitrag im edufeed-Editor
anfasst, überschreibt der nächste Push aus Git die Änderung. Ohne `pull` ist
der Editor für FOERBICO tabu.

## Teil A — Bilderschritt in `publish`

> **Stand 09.09.2026:** umgesetzt als `core/bilder.ts`, aber anders als hier
> beschrieben: Git trägt die Blossom-URLs selbst (Spec 07.09., Teil 3), der
> Schritt schreibt nichts zurück und schreibt nichts um — er stellt nur sicher,
> dass Blob und Nachweis zu jeder Hash-URL existieren. Teil B (`pull`) und
> Teil C (`label`/`adopt`) entfallen mit der Entscheidung für Git-first ohne
> Nostr-first-Beiträge (siehe Spec 07.09., Kopf).

### Konvention im Content-Repo

Je Post-Verzeichnis eine `bilder.yaml` (Schlüssel = Dateiname):

```yaml
Gina-OERcamp.jpeg:
  title: Gina am FOERBICO-Stand        # Pflicht
  credit: Comenius-Institut            # Pflicht
  license: https://creativecommons.org/licenses/by/4.0/   # Pflicht
  source: https://…                    # optional
  alt: Person neben Roll-up            # optional → title
  pubkey: <hex>                        # optional → ["p", …] im 1063
```

Bilder bleiben relativ im Git. Die Umschreibung passiert **nur im Event**,
nie in `index.md`. Git ist Quelle, das Event ist Ausgabe.

### Ablauf je Post (`core/images.ts`, neu)

1. **Sammeln**: alle Bilddateien im Post-Verzeichnis; welche davon im Markdown
   (`![…](datei)`) oder als Cover (`cover.image` bei `relative: true`, sonst
   `image` per Dateiname) referenziert sind.
2. **Hashen**: SHA-256 je Datei (`crypto.subtle.digest`). URL ist damit
   deterministisch: `${BLOSSOM}/${sha256}${ext}` (`.jpeg` → `.jpg`).
3. **Nachweis prüfen**: `{ kinds:[1063], "#x":[hash] }` gegen alle
   `ARTICLE_RELAYS` + `AMB_RELAYS` (ADR-0013: alle Relays, nicht nur eines).
   - Treffer → **nichts publizieren**, vorhandenen Nachweis nehmen. Weicht
     `bilder.yaml` ab → Warnung im Log, `bilder.yaml` gewinnt **nicht**.
   - Kein Treffer und `bilder.yaml` vollständig → 1063 bauen (Tags wie
     edufeed `buildLicenseTemplate`: `url x m size title license credit alt
     [source] [p]`), signieren, an `ARTICLE_RELAYS` publizieren.
   - Kein Treffer und `bilder.yaml` unvollständig → Bild aus dem Event
     **entfernen**, `TODO:LICENSE <datei>` in PostResult.
4. **Hochladen** (nur für Bilder mit Nachweis): `HEAD ${BLOSSOM}/${hash}`;
   bei 404 `PUT ${BLOSSOM}/upload` mit Blossom-Auth (BUD-01): signiertes
   `kind:24242`, Tags `["t","upload"]`, `["x",hash]`, `["expiration",…]`,
   Header `Authorization: Nostr <base64(event)>`. Der Bunker signiert das
   genauso wie 30023. Idempotent: zweiter Lauf ist ein HEAD-200.
5. **Umschreiben** (in-memory, für `content` des 30023):
   `![alt](datei)` → `![alt](blossom-url)\n\n<TULLU>`; TULLU aus dem
   **gefundenen oder erzeugten 1063**, nicht aus `bilder.yaml` direkt — dann
   stimmt die Zeile auch, wenn ein fremder Nachweis gewonnen hat.
   Cover → `["image", url]`, `["x", hash]` (edufeed-Konvention, ADR-0013).
   Auch im 30142: `["image", url]`.
6. **Bilder ohne Nachweis**: aus dem Markdown entfernen (nicht als tote URL
   drin lassen — der Hub entfernt sie sowieso, ADR-0015), Cover-Tags weg.

### Reihenfolge und Fehler

1063 und Upload **vor** 30023. Schlägt der Upload fehl, geht der Post ohne
dieses Bild raus (Status `ok`, mit `imageWarnings`). Schlägt das 1063-Publish
fehl → dasselbe. Nur 30023-Fehler sind `failed-*`.

`PostResult` bekommt `images: { file, hash, url, status: 'reused'|'attested'|'uploaded'|'missing-license'|'upload-failed' }[]`
und `missingLicense: string[]`; `summary.ts` zeigt `TODO:LICENSE` gesammelt
im Job-Summary. Exit-Code bleibt 0 — fehlende Lizenz ist Redaktionsrückstand,
kein Pipeline-Fehler.

### Config

`BLOSSOM_URL` (Default `https://blossom.edufeed.org`), `LICENSE_RELAYS`
(Default `['wss://relay-rpi.edufeed.org/']` — dort geht 1063 nachweislich,
der FOERBICO-Key darf dort hochladen; der Lookup fragt trotzdem alle
Relays). `--no-images` als Flag für den heutigen Weg.

### Validation

`validation.ts`: `creativeWorkStatus: Draft` → `skipped-draft`. (Steht heute
nicht drin — prüfen.)

### Tests

- `images_test.ts`: Hash → URL deterministisch; `.jpeg`→`.jpg`; Cover-Erkennung
  über `cover.relative` und über `image`-Dateiname; Umschreibung lässt externe
  URLs unverändert; fehlende Lizenz entfernt Bild und meldet.
- Mock für Relay-Lookup und Blossom-HEAD/PUT (Deno `fetch` injizieren).
- Roundtrip mit `md2blossom.mjs`-Ausgabe: gleicher Hash, gleiche URL.

### Aufwand

Ein Tag inkl. Tests. Blossom-Auth ist der einzige neue Baustein; alles
andere (Signer, Relays, Parser) existiert.

## Teil B — `sync pull` (Relay → Git)

### Zweck

Spiegel der publizierten Beiträge nach `content/` als **Backup** und als
Quelle für Hugo. Kein Review (ADR-0021). Läuft als zweite Action
zeitgesteuert und per `workflow_dispatch`.

### Ablauf

1. `{ kinds:[30023], authors:[AUTHOR_PUBKEY_HEX] }` von `ARTICLE_RELAYS`,
   dedupliziert nach `d`, neuestes `created_at` gewinnt.
2. Zu jedem Event den zugehörigen 30142 (`a`-Tag `amb-metadata` oder gleicher
   `d` auf `AMB_RELAYS`) und alle 1063 zu den Hashes aus `x`-Tag + Blossom-URLs
   im Markdown.
3. Ziel: `content/<lang>/posts/<d>/index.md`. Existiert das Verzeichnis mit
   anderem Namen (Datumspräfix `2026-09-01-OERcamp-2026`), wird es über
   `commonMetadata.id` ↔ `d` gefunden, nicht neu angelegt.
4. **Nur schreiben, wenn sich etwas geändert hat**: Vergleich des erzeugten
   Frontmatters + Body mit dem vorhandenen. Sonst `unchanged`.
5. Frontmatter aus Tags zurückbauen (Umkehrung von `events/article.ts` +
   `events/amb.ts`): `id` ← `https://oer.community/<d>`, `name` ← `title`,
   `description` ← `summary`, `datePublished` ← `published_at`, `keywords` ←
   `t`, `image` ← `image`, `creator/about/learningResourceType/educationalLevel/
   license` ← 30142. Der `# staticSiteGenerator`-Block wird **beibehalten**,
   wenn vorhanden, sonst aus `commonMetadata` abgeleitet (`title`, `summary`,
   `url`, `cover` mit `relative: false` und Blossom-URL).
6. `bilder.yaml` aus den 1063 erzeugen (Schlüssel = Blossom-URL, da keine
   lokale Datei existiert). Blobs **nicht** herunterladen — Blossom ist die
   Ablage, Git die Metadaten.
7. Frontmatter bekommt `source: relay` und `syncedAt: <created_at>`.
   `publish` überspringt Posts mit `source: relay` (`skipped-source-relay`),
   außer mit `--force-all --include-relay-sourced`.
8. Ausgabe: geänderte Dateien, Commit mit Nachricht
   `pull: <n> Beiträge vom Relay (<kurz-ids>)`, Push auf einen Branch
   `sync/pull` → PR. **Nicht** direkt auf `main`: Review bleibt.

### Was `pull` nicht tut

- Kein Publish, kein Signieren. Nur lesen und schreiben.
- Keine Konfliktlösung. Wenn `index.md` in Git neuer ist als das Event
  (Git-Commit-Zeit > `created_at`) **und** abweicht → Datei nicht anfassen,
  `conflict` melden. Das ist der Fall „beide Wege gleichzeitig", der laut
  Regel nicht vorkommen darf; wenn er vorkommt, entscheidet ein Mensch.

### Roundtrip-Kriterium

Für den Referenzfall `die-kraft-der-gemeinschaft`:
`pull` → `index.md` → `publish --dry-run` → erzeugtes 30023 hat identische
Tags (ohne `created_at`) und identischen `content` wie das Event auf dem
Relay. Das ist der Test, der den Cut-over freigibt.

### Tests

- Tag→Frontmatter für alle Felder aus `article.ts`/`amb.ts` (Property-Test:
  `buildArticleEvent(frontmatterFromTags(ev)) ≈ ev`).
- Verzeichnis-Zuordnung über `id`, nicht über Namen.
- `unchanged` bei Gleichstand; `conflict` bei Git-neuer-als-Relay.

### Aufwand

Zwei Tage. Der Rückbau der Tags ist mechanisch; die Verzeichnis-Zuordnung und
der Konfliktfall brauchen die Sorgfalt.

## Teil C — `sync label` und `sync adopt` (ADR-0021)

### Zweck

Betriebsmodell: Redaktion schreibt Entwürfe als 30023 unter
**Redaktions-Keys**, Team gibt frei, der **FOERBICO-Key übernimmt**. Der
FOERBICO-Key wird nur noch durch `adopt` beschrieben.

### `sync label <naddr> [--as freigegeben|zurueck]`

Signiert mit dem Key der aufrufenden Person (eigener Bunker oder `--nsec`
lokal). Publiziert `kind:1985`:

```
["L","foerbico/review"]
["l","freigegeben","foerbico/review"]
["e",<id des aktuellen Entwurfs>]
["a","30023:<pk>:<d>",<relay>]
["p",<pk des Entwurfsautors>]
```

Die **Event-ID** ist der Anker: neue Version, neue ID, Label wertlos.
`zurueck` publiziert dasselbe mit `l=zurueck` und ist damit ein
Widerruf (neuestes Label je Prüferin zählt).

### `sync adopt <naddr> [--min-approvals 1] [--dry-run]`

Mit dem FOERBICO-Bunker (wie `publish`):

1. **Entwurf holen** über `ARTICLE_RELAYS`, neuestes `created_at` je `d`.
2. **Redaktionsliste** laden: `kind:30000`, `d=redaktion`, Autor
   FOERBICO. Prüferinnen = `p`-Tags.
3. **Freigaben zählen**: `{ kinds:[1985], "#e":[id], "#L":["foerbico/review"] }`,
   nur von Prüferinnen, nur `l=freigegeben`, nicht vom Entwurfsautor selbst,
   neuestes Label je Prüferin. `< min` → Abbruch mit Liste, wer noch fehlt.
4. **Blobs spiegeln**: alle Blossom-URLs aus `image`-Tag und Markdown;
   `HEAD` → wenn 200 und `PUT /mirror` (BUD-04) unter FOERBICO-Auth
   möglich → mirror; sonst Download + `PUT /upload`. Hash bleibt, URL
   bleibt. Fehlt ein Blob (404) → Abbruch, das darf nicht still passieren.
5. **1063 prüfen**, nicht neu erzeugen: für jeden Hash muss ein Nachweis
   auffindbar sein (`#x`), sonst Abbruch mit `TODO:LICENSE`. Der Nachweis
   des Redaktions-Keys gilt.
6. **30023 neu signieren** unter FOERBICO: gleicher `d`, `content`
   byte-identisch, Tags identisch **bis auf** `a`-Cross-Ref auf den
   eigenen 30142 und zusätzlich `["p",<redaktionskey>,"","author"]`.
   `published_at` vom Entwurf übernehmen (erste Veröffentlichung), bei
   Re-Adopt das vorhandene FOERBICO-`published_at` behalten.
7. **30142** aus den 30023-Tags + ggf. vorhandenem 30142 des
   Redaktions-Keys bauen; Creator als `["p",<redaktionskey>,relay,"creator"]`
   (NIP-AMB), kein `creator:name`-Run daneben.
8. Publish 30023 → `ARTICLE_RELAYS` (min acks wie `publish`), 30142 →
   `AMB_RELAYS`. `naddr` des FOERBICO-Events ausgeben.

### Was `adopt` nicht tut

- Nichts am Entwurf ändern oder löschen — der gehört dem Redaktions-Key.
- Keine inhaltliche Normalisierung. Was im Entwurf steht, wird übernommen.
  Migrationsregeln (Themen, Blockquotes) gelten nur in `publish`.
- Keine Prüfung des Entwurfs auf `TODO:LICENSE`-Kommentare im Markdown —
  die sollten im Editor gar nicht entstehen.

### Idempotenz

Zweiter `adopt` auf denselben Entwurf ohne Änderung: gleiche Tags, gleicher
`content` → `unchanged`, kein Publish (`created_at` wäre die einzige
Differenz und soll nicht hochgezählt werden).

### Tests

- Freigabezählung: Autor zählt nicht; Widerruf überschreibt; fremde Keys
  zählen nicht; alte ID zählt nicht.
- Tag-Umbau: `a`-Ref zeigt auf FOERBICO-30142, `p author` gesetzt, Rest
  byte-identisch.
- `published_at`-Regel bei Erst- und Re-Adopt.
- Blob 404 → Abbruch; 1063 fehlt → Abbruch.
- `unchanged` bei Wiederholung.

### Aufwand

Ein Tag. Alles Signieren und Publizieren existiert; neu sind Label-Abfrage
und Mirror.

## Reihenfolge

1. Teil A → `--force-all` → 86 Artikel mit Bildern (soweit `bilder.yaml`)
2. Teil C → Referenzfall einmal durch: Entwurf unter Redaktions-Key →
   `label` → `adopt` → Hub zeigt ihn
3. Teil B als Backup, Roundtrip am übernommenen Event
4. Cut-over-Datum; `publish`-Action deaktivieren

## Offen

- Blossom: erlaubt `blossom.edufeed.org` `PUT /mirror` (BUD-04)? Sonst
  Download + Re-Upload unter FOERBICO-Auth, Ergebnis identisch. → Steffen
- Bunker für Redaktions-Keys: Amber je Person oder Server-Bunker. → Steffen
- `pull` für Termine (31922/31923), sobald es welche gibt: gleiche Mechanik,
  eigener Ordner.
