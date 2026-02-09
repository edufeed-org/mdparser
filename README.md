# 📚 MDParser - Markdown to JSON Parser

Ein modularer Parser für Markdown-Dateien mit YAML Front Matter, optimiert für AMB-Metadatenstandard (schema.org) und Transformation zu WordPress & Nostr.

## 🎯 Features

- ✅ **YAML Front Matter Parsing** - Volle Unterstützung für komplexe YAML-Strukturen
- ✅ **AMB-Metadaten** - Schema.org-konforme Metadaten-Extraktion
- ✅ **Forgejo/Gitea API** - Direkter Zugriff auf Git-Repository-Inhalte
- ✅ **AST-basiert** - Strukturierte Markdown-Verarbeitung mit unified/remark
- ✅ **Isomorph** - Funktioniert in Node.js und im Browser
- ✅ **Erweiterbar** - Modulare Architektur für Custom-Transformationen
- ✅ **WordPress REST API v2** - Transformer für WordPress-Publishing
- ✅ **Nostr NIP-23** - Long-form Content Transformer für Nostr-Relays
- ✅ **Dashboard** - Terminal & Web-Dashboard für Monitoring

## 📦 Installation

```bash
# Repository klonen
git clone https://git.rpi-virtuell.de/Comenius-Institut/mdparser.git
cd mdparser

# Dependencies installieren
npm install

# Environment-Variablen konfigurieren
cp .env.example .env
# .env bearbeiten und API-Zugangsdaten eintragen
```

## 🚀 Quick Start

```javascript
import { parseMarkdownFile } from './src/parser.js';

// Markdown mit YAML Front Matter parsen
const result = await parseMarkdownFile('./content/posts/example/index.md');

console.log(result.metadata);  // Schema.org Metadaten
console.log(result.content);   // Markdown AST
console.log(result.html);      // HTML-Output (optional)
```

## 🏗️ Projekt-Struktur

```
mdparser/
├── src/
│   ├── index.js              # Haupteinstiegspunkt
│   ├── parser.js             # Core Parser (unified/remark)
│   ├── forgejo-client.js     # Forgejo API Client
│   ├── extractors/
│   │   ├── yaml-extractor.js # YAML Front Matter Parsing
│   │   └── amb-extractor.js  # AMB/Schema.org Metadaten
│   ├── transformers/
│   │   ├── wordpress-transformer.js  # WordPress REST API v2
│   │   └── nostr-transformer.js      # Nostr NIP-23
│   └── dashboard/
│       ├── terminal-dashboard.js     # ANSI Terminal Dashboard
│       └── web-dashboard.js          # HTTP Dashboard (Port 3000)
├── examples/
│   ├── parse-forgejo.js      # Beispiel: Forgejo API
│   ├── parse-local.js        # Beispiel: Lokale Datei
│   ├── parse-url.js          # Beispiel: HTTP URL
│   ├── publish-wordpress.js  # Beispiel: WordPress Publishing
│   └── publish-nostr.js      # Beispiel: Nostr Publishing
├── test/
│   ├── parser.test.js
│   ├── wordpress-transformer.test.js
│   └── nostr-transformer.test.js
├── docs/
│   ├── ARCHITECTURE.md       # Architektur-Dokumentation
│   ├── API.md               # API-Referenz
│   ├── DECISIONS.md         # Design-Entscheidungen
│   └── TRANSFORMERS.md      # Transformer-Dokumentation
├── .env.example
├── .gitignore
├── .editorconfig
├── package.json
└── README.md
```

## 🔧 Konfiguration

### Environment-Variablen (`.env`)

```bash
# Forgejo/Gitea API
FORGEJO_API_BASE_URL=https://git.rpi-virtuell.de/api/v1
FORGEJO_OWNER=Comenius-Institut
FORGEJO_REPO=FOERBICO_und_rpi-virtuell
FORGEJO_BRANCH=main
FORGEJO_TOKEN=                    # Optional für private Repos

# WordPress REST API v2
WP_BASE_URL=https://example.com/wp-json/wp/v2
WP_USERNAME=your_wordpress_username
WP_PASSWORD=your_wordpress_application_password

# Nostr
NOSTR_PUBKEY=your_32_byte_hex_public_key
NOSTR_PRIVKEY=your_32_byte_hex_private_key
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band

# API Rate Limiting
API_RATE_LIMIT_DELAY_MS=100

# Logging
LOG_LEVEL=info
```

## 📖 Verwendung

### 1. Lokale Markdown-Datei parsen

```javascript
import { parseMarkdownFile } from './src/parser.js';

const result = await parseMarkdownFile('./content/post/index.md');
console.log(result);
```

### 2. Forgejo API verwenden

```javascript
import { ForgejoClient } from './src/forgejo-client.js';

const client = new ForgejoClient({
  baseUrl: 'https://git.rpi-virtuell.de/api/v1',
  owner: 'Comenius-Institut',
  repo: 'FOERBICO_und_rpi-virtuell'
});

// Einzelne Datei abrufen
const content = await client.getFileContent(
  'Website/content/posts/2025-04-20-OER-und-Symbole/index.md'
);

// Alle Posts auflisten
const posts = await client.listPosts('Website/content/posts');
```

### 3. AMB-Metadaten extrahieren

```javascript
import { extractAMBMetadata } from './src/extractors/amb-extractor.js';

const ambData = extractAMBMetadata(result.yaml);

// Ausgabe: Schema.org-konforme Struktur
console.log(ambData.name);        // Titel
console.log(ambData.creator);     // Autoren
console.log(ambData.license);     // Lizenz
console.log(ambData.about);       // Themen/Tags
```

### 4. Zu WordPress publishen

```javascript
import { parse, createForgejoClient, publishToWordPress } from './src/index.js';

// Von Forgejo laden und parsen
const client = createForgejoClient();
const markdown = await client.getPostContent('2025-04-20-OER-und-Symbole');
const result = await parse(markdown);

// Zu WordPress publishen
const published = await publishToWordPress(
  result.metadata,
  result.content,
  {
    baseUrl: process.env.WP_BASE_URL,
    username: process.env.WP_USERNAME,
    password: process.env.WP_PASSWORD
  },
  {
    status: 'publish',
    authorId: 1
  }
);

console.log(`✅ Published: ${published.link}`);
```

### 5. Zu Nostr publishen

```javascript
import { parse, createForgejoClient, publishToNostr } from './src/index.js';

// Von Forgejo laden und parsen
const client = createForgejoClient();
const markdown = await client.getPostContent('2024-08-09-sdg-logos');
const result = await parse(markdown);

// Zu Nostr publishen
const nostrResult = await publishToNostr(
  result.metadata,
  result.content,
  {
    pubkey: process.env.NOSTR_PUBKEY,
    privateKey: process.env.NOSTR_PRIVKEY,
    relayUrls: process.env.NOSTR_RELAYS.split(',')
  },
  {
    identifier: 'sdg-logos-oer'
  }
);

console.log(`✅ Published to ${nostrResult.results.length} relays`);
console.log(`Event ID: ${nostrResult.event.id}`);
```

### 6. Dashboard starten

```bash
# Terminal Dashboard
node examples/terminal-dashboard.js

# Web Dashboard (http://localhost:3000)
node examples/web-dashboard.js
```

## 🎓 AMB-Metadatenstandard

Dieses Projekt unterstützt den **AMB-Standard** (Metadaten für Bildungsressourcen) basierend auf schema.org:

**Unterstützte Felder:**
- `@context`, `type`, `name`, `description`
- `creator` (Person/Organization mit ORCID/ROR)
- `license`, `inLanguage`, `datePublished`
- `about` (Hochschulfächersystematik)
- `learningResourceType`, `educationalLevel`
- `image`, `id` (URL)

Siehe [AMB-Dokumentation](https://dini-ag-kim.github.io/amb/) für Details.

## 🔌 API-Referenz

### `parseMarkdownFile(filePath, options)`

Parst eine Markdown-Datei mit YAML Front Matter.

**Parameter:**
- `filePath` (string) - Pfad zur Markdown-Datei
- `options` (object) - Optionale Konfiguration
  - `extractYaml` (boolean) - YAML extrahieren (default: true)
  - `parseGfm` (boolean) - GitHub Flavored Markdown (default: true)
  - `toHtml` (boolean) - HTML-Output generieren (default: false)

**Rückgabe:**
```javascript
{
  yaml: { /* YAML Front Matter als Objekt */ },
  metadata: { /* Extrahierte AMB-Metadaten */ },
  ast: { /* Markdown Abstract Syntax Tree */ },
  content: { /* Reiner Content ohne Front Matter */ },
  html: "..." // Optional
}
```

Siehe [docs/API.md](./docs/API.md) für vollständige API-Dokumentation.

## 🧪 Tests

```bash
# Tests ausführen
npm test

# Mit Watch-Mode während Entwicklung
npm run dev
```

## 🤝 Entwicklung

### Technologie-Stack

| Bereich | Bibliothek | Begründung |
|---------|-----------|------------|
| **Markdown Parser** | unified + remark-parse | AST-basiert, erweiterbar, isomorph |
| **YAML Parser** | yaml | Robust, spec-compliant |
| **Front Matter** | remark-frontmatter | Nahtlose Integration mit remark |
| **GFM Support** | remark-gfm | Tabellen, Task Lists, etc. |
| **HTTP Client** | native fetch | Standard, keine Dependencies |

### Warum unified/remark?

✅ **Isomorph** - Node.js + Browser  
✅ **AST-basiert** - Präzise Manipulation  
✅ **Erweiterbar** - Riesiges Plugin-Ökosystem  
✅ **Standard** - MDAST ist De-facto-Standard  
✅ **Aktiv** - Große Community, gute Wartung  

Siehe [docs/DECISIONS.md](./docs/DECISIONS.md) für detaillierte Design-Entscheidungen.

## 📋 Roadmap

### Phase 1: Core Parser ✅
- [x] Projekt-Setup mit Git, npm, Dokumentation
- [x] Markdown + YAML Parser implementieren
- [x] Forgejo API Client
- [x] AMB-Metadaten-Extraktor
- [x] Beispiele und Tests
- [x] Batch-Testing (53/54 Posts valid - 98%)

### Phase 2: Transformers ✅
- [x] WordPress REST API v2 Transformer
  - title, content, excerpt, featured_media
  - tags, categories, custom fields
  - author mapping, bidirectional conversion
- [x] Nostr NIP-23 Transformer
  - d (identifier), title, summary
  - published_at, image, license
  - t (tags), author tags, subject tags
  - AMB metadata preservation
- [x] Test Suite (37 Tests, 100% passing)
- [x] Working Examples mit real data

### Phase 3: Erweiterte Features (geplant)
- [ ] Browser-Build (ESM)
- [ ] CLI-Tool
- [ ] Batch-Publishing-Scripts
- [ ] Media-Upload für WordPress
- [ ] Nostr Relay Pool Management
- [ ] Caching-Strategie
- [ ] Error-Handling & Logging

## 📄 Lizenz

MIT License - siehe [LICENSE](./LICENSE) für Details.

## 👥 Autoren

- **Jörg Lohrer** - [ORCID](https://orcid.org/0000-0002-9282-0406)
- Comenius-Institut - [ROR](https://ror.org/025e8aw85)

## 🔗 Links

- **Projekt-Repository**: https://git.rpi-virtuell.de/Comenius-Institut/mdparser
- **Forgejo API**: https://git.rpi-virtuell.de/api/swagger
- **AMB-Standard**: https://dini-ag-kim.github.io/amb/
- **unified/remark**: https://unifiedjs.com/
- **WordPress REST API**: https://developer.wordpress.org/rest-api/
- **Nostr NIPs**: https://github.com/nostr-protocol/nips
- **Transformer-Dokumentation**: [docs/TRANSFORMERS.md](./docs/TRANSFORMERS.md)

---

**Status:** � Phase 2 abgeschlossen - Production Ready!
