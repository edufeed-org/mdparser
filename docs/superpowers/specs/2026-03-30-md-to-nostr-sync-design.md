# md-to-nostr Sync — Design Spec

> Erweiterung des mdparser-Repos um ein Deno-basiertes Sync-Script, das Markdown-Dateien aus einem Forgejo-Repo als Nostr-Events (Kind 30023 + Kind 30142) publiziert.

## Kontext & Motivation

Das oer.community-Projekt nutzt eine Pipeline:

1. **Forgejo** — Markdown-Dateien mit YAML-Frontmatter (Posts + Seiten)
2. **md-to-nostr** (dieses Script) — erzeugt Nostr-Events aus den Markdown-Dateien
3. **nostrmcp/build** (Deno) — liest Events vom Relay, generiert statische Website
4. **nsyte deploy + nsite-rs** — liefert die Website unter oer.community aus

Bisher werden nur Posts als Kind 30023 Events publiziert. Es fehlt:
- Publikation von **Seiten** (statische Inhalte wie About, Impressum)
- Separate **Kind 30142 Events** (AMB-Metadaten nach Schema.org/NIP-AMB)
- Automatisierte, regelmäßige Synchronisation (Woodpecker CI)

**Vorbild:** [wp-to-nostr](https://github.com/edufeed-org/wp-to-nostr) — GitHub Action die WordPress-Posts als Nostr-Events synchronisiert.

## Architekturentscheidungen

| Entscheidung | Wahl | Begründung |
|---|---|---|
| Runtime | Deno | Konsistent mit nostrmcp, modernes TypeScript, npm-Kompatibilität |
| Platzierung | `sync/` im mdparser-Repo | Weiterentwicklung des bestehenden Projekts |
| Verhältnis zu Node.js-Code | Koexistenz, keine Wiederverwendung | AMB-Logik muss ohnehin für 30142 neu separiert werden |
| CI | Woodpecker (primär), GitHub Actions (später) | Forgejo-Repo liegt auf Forgejo, Woodpecker ist dort nativ |
| Event-Signing | Private Key als CI-Secret, später NIP-46 Bunker | Einfacher Start, sicherere Lösung nachrüstbar |
| Bilder | Nicht Aufgabe des Sync-Scripts | `image`-Tag enthält `oer.community`-URL; Auslieferung ist Sache des Website-Builds (nostrmcp + nsyte) |

## Verzeichnisstruktur

```
mdparser/
├── src/                          # Bestehender Node.js-Code (unverändert)
├── sync/                         # Neues Deno-Sync-Script
│   ├── deno.json                 # Deno-Config, Tasks, Imports
│   ├── sync.ts                   # Hauptscript: Orchestrierung
│   ├── forgejo.ts                # Forgejo API Client
│   ├── parser.ts                 # YAML-Frontmatter Extraktion
│   ├── amb.ts                    # commonMetadata → AMB-Tags Mapping
│   ├── events/
│   │   ├── article.ts            # Kind 30023 Event-Builder
│   │   └── amb.ts                # Kind 30142 Event-Builder
│   ├── relay.ts                  # Relay-Client (WebSocket, publish)
│   ├── signing.ts                # Event-Signing (Private Key, später NIP-46)
│   ├── config.ts                 # Konfiguration (Relays, Pubkey, Repo-URL)
│   └── *_test.ts                 # Tests
├── .woodpecker.yml               # Woodpecker CI Pipeline
└── ...
```

## Content-Quellen

**Posts:** `content/{lang}/posts/{datum-slug}/index.md`
- Sprach-spezifische Unterverzeichnisse (`de`, `en`)
- Verzeichnisname enthält Datum-Prefix + Slug

**Seiten:** `content/*.md` (Toplevel)
- Statische Inhaltsseiten (About, Impressum, Kontakt)
- Ohne Datum, ohne Sprachverzeichnis

Beide verwenden dasselbe YAML-Frontmatter-Format mit `commonMetadata`-Block.

## YAML-Frontmatter

### Struktur

Jede Markdown-Datei hat zwei Blöcke zwischen `---`:

```yaml
---
# commonMetadata
'@context': https://schema.org/
type: LearningResource
name: '...'
description: >- ...
license: https://creativecommons.org/licenses/by/4.0/deed.de
id: https://oer.community/slug
creator: [...]
inLanguage: [de]
about: [...]
image: https://oer.community/slug/bild.jpg
learningResourceType: [...]
educationalLevel: [...]
datePublished: 'YYYY-MM-DD'
keywords: [...]

# staticSiteGenerator
...
---
```

**Nur der `# commonMetadata`-Block wird ausgewertet.** Der `# staticSiteGenerator`-Block wird ignoriert (existiert für Rückwärtskompatibilität mit Hugo, fällt künftig weg).

### Pflichtfeld-Validierung

| Feld | Validierung |
|---|---|
| `id` | Muss mit `https://oer.community/` beginnen, Slug extrahierbar |
| `name` | Nicht leer |
| `description` | Nicht leer |
| `license` | Bekannte CC-URL |
| `creator` | Mindestens ein Eintrag mit `givenName` + `familyName` |
| `inLanguage` | Mindestens ein Eintrag |
| `datePublished` | Gültiges ISO-Datum |
| `keywords` | Liste vorhanden |

Fehlendes Pflichtfeld: Event wird **nicht** erstellt, Warnung im Log.
Fehlendes optionales Feld: Event wird erstellt, Info im Log.

## d-Tag Strategie

Der `d`-Tag wird aus `commonMetadata.id` abgeleitet — letzter Pfadteil der URL:

```
id: https://oer.community/oep-von-ressourcen-zu-praktiken
→ d-tag: "oep-von-ressourcen-zu-praktiken"
```

**Identischer d-Tag für Kind 30023 und Kind 30142.** Die Events kollidieren nicht, da die Adresse `kind:pubkey:d` aus allen drei Teilen besteht — verschiedener `kind` ergibt verschiedene Adresse.

Dies ist konsistent mit den bestehenden Events auf dem Relay (verifiziert per Fetch von `wss://relay-rpi.edufeed.org/`).

## Event-Mapping

### Kind 30023 — Content-Event (Posts + Seiten)

| YAML (commonMetadata) | Nostr Tag |
|---|---|
| `id` (Pfad-Teil) | `["d", "slug"]` |
| `name` | `["title", "..."]` |
| `description` | `["summary", "...", "<lang>"]` |
| `image` | `["image", "https://oer.community/slug/bild.jpg"]` |
| `datePublished` | `["published_at", "<unix-timestamp>"]` |
| `inLanguage[0]` | `["inLanguage", "de"]` |
| `about[]` | `["about", "https://w3id.org/..."]` je Eintrag |
| `keywords[]` | `["t", "..."]` je Keyword |
| Markdown-Body | `content`-Feld des Events |
| AMB-Referenz | `["a", "30142:<pubkey>:<d>", "wss://amb-relay.edufeed.org/", "amb-metadata"]` |

### Kind 30142 — AMB-Event (NIP-AMB)

Spezifikation: [NIP-AMB (kind:30142)](https://git.edufeed.org/edufeed/nips/src/branch/edufeed-amb/AMB.md)

| YAML (commonMetadata) | Nostr Tag |
|---|---|
| `id` (Pfad-Teil) | `["d", "slug"]` |
| `type` | `["type", "LearningResource"]` |
| `name` | `["name", "..."]` |
| `description` | `["description", "..."]` + `content`-Feld |
| `license` | `["license:id", "https://creativecommons.org/..."]` |
| `creator[].givenName` + `familyName` | `["creator:name", "Vorname Nachname"]` |
| `creator[].type` | `["creator:type", "Person"]` |
| `creator[].id` (ORCID) | `["creator:id", "https://orcid.org/..."]` |
| `creator[].affiliation.name` | `["creator:affiliation:name", "..."]` |
| `creator[].affiliation.id` (ROR) | `["creator:affiliation:id", "https://ror.org/..."]` |
| `inLanguage[]` | `["inLanguage", "de"]` |
| `about[]` | `["about:id", "https://w3id.org/..."]` |
| `learningResourceType[]` | `["learningResourceType:id", "https://w3id.org/..."]` |
| `educationalLevel[]` | `["educationalLevel:id", "https://w3id.org/..."]` |
| `datePublished` | `["datePublished", "2025-09-11"]` |
| `image` | `["image", "https://oer.community/slug/bild.jpg"]` |
| `keywords[]` | `["t", "..."]` je Keyword |
| Content-Referenz | `["a", "30023:<pubkey>:<d>", "wss://relay-rpi.edufeed.org/", "content"]` |

### Relay-Zuweisung

| Event Kind | Relay |
|---|---|
| 30023 (Content) | `wss://relay-rpi.edufeed.org/` |
| 30142 (AMB) | `wss://amb-relay.edufeed.org/` |

## Change Detection

Replaceable Events (NIP-33): Der Relay akzeptiert nur Events mit höherem `created_at` für dieselbe `kind:pubkey:d`-Adresse.

- **`datePublished`** aus YAML → `published_at` Tag
- **`created_at`** des Events = Unix-Timestamp der letzten Änderung (aus Git-Commit-Datum oder Forgejo API `last_modified`)
- Unveränderte Beiträge: selber `created_at` → Relay ignoriert → kein Overhead
- Geänderte Beiträge: höherer `created_at` → Relay überschreibt

## Sync-Ablauf

```
1. Config laden (Env-Vars: Relay-URLs, Pubkey, Private Key, Forgejo-Credentials)
2. Forgejo API: Dateiliste holen
   ├── content/{lang}/posts/*/index.md  → typ "post"
   └── content/*.md (Toplevel)          → typ "page"
3. Für jede Datei:
   a. Markdown-Inhalt laden (Forgejo API)
   b. YAML-Frontmatter parsen (nur commonMetadata-Block)
   c. Pflichtfelder validieren — bei Fehler: überspringen + Warnung
   d. d-tag aus commonMetadata.id extrahieren (letzter URL-Pfadteil)
   e. Kind 30023 Event bauen (Content + Tags + AMB-Referenz)
   f. Kind 30142 Event bauen (AMB-Metadaten geflattened + Content-Referenz)
   g. created_at setzen (Datei-Änderungszeitpunkt)
   h. Events signieren (Private Key)
   i. Publizieren: 30023 → content-relay, 30142 → amb-relay
4. Zusammenfassung loggen
```

### Dry-Run Modus

`deno task sync --dry-run` zeigt Events ohne zu publizieren:

```
✅ oep-von-ressourcen-zu-praktiken (30023 + 30142)
✅ recap-foerbico-tagung-2026 (30023 + 30142)
⚠️  about.md — fehlendes Pflichtfeld: datePublished
❌ impressum.md — fehlendes Pflichtfeld: id, license
```

## Woodpecker CI Pipeline

```yaml
when:
  - cron: "0 */6 * * *"    # alle 6 Stunden
  - event: push             # oder bei Push

steps:
  sync:
    image: denoland/deno
    commands:
      - cd sync && deno task sync
    secrets:
      - nostr_private_key
      - forgejo_token
```

### Environment Variables

| Variable | Beschreibung |
|---|---|
| `NOSTR_PRIVATE_KEY` | nsec1 oder 64-Zeichen Hex |
| `NOSTR_PUBKEY` | 64-Zeichen Hex Public Key |
| `CONTENT_RELAY` | `wss://relay-rpi.edufeed.org/` |
| `AMB_RELAY` | `wss://amb-relay.edufeed.org/` |
| `FORGEJO_API_BASE_URL` | `https://git.rpi-virtuell.de/api/v1` |
| `FORGEJO_OWNER` | Repository Owner |
| `FORGEJO_REPO` | Repository Name |
| `FORGEJO_BRANCH` | Branch (default: `main`) |
| `FORGEJO_TOKEN` | API Token (optional für öffentliche Repos) |

### Spätere GitHub Actions-Variante

Selber `deno task sync`-Aufruf, nur als `.github/workflows/sync.yml` statt `.woodpecker.yml`.

## Signing-Strategie

**Phase 1 (jetzt):** `NOSTR_PRIVATE_KEY` als CI-Secret. Das Script signiert Events lokal mit nostr-tools.

**Phase 2 (später):** NIP-46 Bunker. Das `signing.ts`-Modul ist so aufgebaut, dass der Signing-Mechanismus austauschbar ist — ein Interface `signEvent(event) → signedEvent` wird von beiden Implementierungen erfüllt.

## Abgrenzung

| Verantwortung | Zuständig |
|---|---|
| Markdown → Nostr Events (30023, 30142) | **md-to-nostr (dieses Script)** |
| Events lesen, HTML bauen, Website deployen | **nostrmcp** |
| Bilder auf oer.community verfügbar machen | **nostrmcp + nsyte deploy** |
| YAML-Frontmatter validieren/korrigieren | **Manuell (YAML-Assistent-Prompt)** |
| Kanonische Keywords pflegen | **Manuell** |

## Vorbereitungsschritte

Bevor der Sync produktiv laufen kann:
1. Alle bestehenden Beiträge mit dem YAML-Frontmatter-Assistenten validieren
2. `keywords`-Feld in allen Posts ergänzen (falls nur `tags` im staticSiteGenerator vorhanden)
3. `id`-Feld auf konsistente `https://oer.community/slug`-Form prüfen
4. Seiten (`content/*.md`) mit vollständigem commonMetadata-Block versehen
