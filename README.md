# 📚 MDParser - Markdown to JSON Parser

Ein modularer Parser für Markdown-Dateien mit YAML Front Matter, optimiert für AMB-Metadatenstandard (schema.org) und Transformation zu WordPress & Nostr.

## 🎯 Features

- ✅ **YAML Front Matter Parsing** - Volle Unterstützung für komplexe YAML-Strukturen
- ✅ **AMB-Metadaten** - Schema.org-konforme Metadaten-Extraktion
- ✅ **Forgejo/Gitea API** - Direkter Zugriff auf Git-Repository-Inhalte
- ✅ **AST-basiert** - Strukturierte Markdown-Verarbeitung mit unified/remark
- ✅ **Isomorph** - Funktioniert in Node.js und im Browser
- ✅ **Erweiterbar** - Modulare Architektur für Custom-Transformationen
- 🚧 **WordPress REST API v2** - Transformer (geplant)
- 🚧 **Nostr NIP-23** - Long-form Content Transformer (geplant)

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
│   └── transformers/         # (geplant)
│       ├── wordpress.js
│       └── nostr.js
├── examples/
│   ├── parse-forgejo.js      # Beispiel: Forgejo API
│   ├── parse-local.js        # Beispiel: Lokale Datei
│   └── parse-url.js          # Beispiel: HTTP URL
├── test/
│   └── parser.test.js
├── docs/
│   ├── ARCHITECTURE.md       # Architektur-Dokumentation
│   ├── API.md               # API-Referenz
│   └── DECISIONS.md         # Design-Entscheidungen
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

### Phase 1: Core Parser (aktuell)
- [x] Projekt-Setup mit Git, npm, Dokumentation
- [ ] Markdown + YAML Parser implementieren
- [ ] Forgejo API Client
- [ ] AMB-Metadaten-Extraktor
- [ ] Beispiele und Tests

### Phase 2: Transformers (nächster Schritt)
- [ ] WordPress REST API v2 Transformer
  - title, content, excerpt, featured_media
  - tags, categories, custom fields
  - author mapping
- [ ] Nostr NIP-23 Transformer
  - d (identifier), title, summary
  - published_at, image
  - t (tags), e/a/p (references)

### Phase 3: Erweiterte Features
- [ ] Browser-Build (ESM)
- [ ] CLI-Tool
- [ ] Batch-Processing
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

---

**Status:** 🚧 In aktiver Entwicklung - Phase 1
