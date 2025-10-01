# 🚀 Quick Start Guide

## Installation & Setup

```bash
# 1. Dependencies installieren (schon erledigt ✅)
npm install

# 2. .env ist schon konfiguriert mit deinem Token ✅
```

## 🎮 Interaktives Ausprobieren

### Playground starten
```bash
node playground.js
```

Das Playground-Script zeigt dir:
- ✅ Verbindung zur Forgejo API
- ✅ Alle 53 Posts im Repository
- ✅ Vollständiges Parsing eines Posts
- ✅ AMB-Metadaten-Analyse
- ✅ Content-Statistiken (Überschriften, Links, Bilder)
- ✅ AST-Struktur
- ✅ JSON-Export

### Anderen Post wählen

Öffne `playground.js` und ändere Zeile 64:

```javascript
// Standard:
const selectedPost = '2025-04-20-OER-und-Symbole'

// Andere Posts (siehe Liste im Output):
const selectedPost = '2024-08-05-hello-world'
const selectedPost = '2024-09-06-OERcamp-Hamburg'
const selectedPost = '2025-07-02-nostr-schrein'
```

## 📚 Weitere Beispiele

### 1. Einzelnen Post von Forgejo parsen
```bash
node examples/parse-forgejo.js
```

### 2. Alle Posts auflisten
```bash
node examples/list-all-posts.js
```

### 3. Lokale Datei parsen
```bash
node examples/parse-local.js
```

## 💻 Im eigenen Code verwenden

### Einfaches Beispiel

```javascript
import { parseMarkdownFile } from './src/index.js'

const result = await parseMarkdownFile('./test/fixtures/example.md')

console.log(result.metadata.name)        // Titel
console.log(result.metadata.creator)     // Autoren
console.log(result.content.length)       // Content-Länge
```

### Forgejo API nutzen

```javascript
import { createForgejoClient, parseMarkdownString } from './src/index.js'

// Client erstellen
const client = createForgejoClient()

// Alle Posts auflisten
const posts = await client.listPosts()
console.log(`${posts.length} Posts gefunden`)

// Einen Post abrufen und parsen
const markdown = await client.getPostContent('2024-08-05-hello-world')
const result = await parseMarkdownString(markdown)

console.log(result.metadata)
```

### Metadaten extrahieren

```javascript
import { extractAMBMetadata, validateAMBMetadata } from './src/index.js'

// AMB-Metadaten aus YAML extrahieren
const metadata = extractAMBMetadata(result.yaml)

// Validieren
const validation = validateAMBMetadata(metadata)
console.log(`Gültig: ${validation.valid}`)
console.log(`Fehler: ${validation.errors.length}`)
console.log(`Warnings: ${validation.warnings.length}`)
```

### Content analysieren

```javascript
import { 
  extractHeadings, 
  extractLinks, 
  extractImages 
} from './src/index.js'

// Überschriften
const headings = extractHeadings(result.ast)
headings.forEach(h => {
  console.log(`H${h.level}: ${h.text}`)
})

// Links
const links = extractLinks(result.ast)
links.forEach(link => {
  console.log(`${link.text} → ${link.url}`)
})

// Bilder
const images = extractImages(result.ast)
images.forEach(img => {
  console.log(`${img.alt} → ${img.url}`)
})
```

## 🧪 Tests ausführen

```bash
npm test
```

Output:
```
✅ Alle Tests erfolgreich!
✔ 11 Tests passing
```

## 📁 Verfügbare Posts im Repository

Die ersten 10 von 53 Posts:
1. `2025-07-02-nostr-schrein`
2. `2024-08-05-hello-world`
3. `2024-08-09-sdg-logos`
4. `2024-08-15-OER-im-Blick`
5. `2024-09-02-blog_its_jointly_2024`
6. `2024-09-03-OER-Fachtag-Orca.NRW`
7. `2024-09-04-OER-erklaert`
8. `2024-09-06-OERcamp-Hamburg`
9. `2024-09-11-OER-Brownbag`
10. `2024-09-15-pirner-oer-youtube`

## 🎯 Typische Use Cases

### 1. Alle Posts mit bestimmtem Tag finden

```javascript
const client = createForgejoClient()
const allPosts = await client.getAllPosts()

const oerPosts = []
for (const post of allPosts) {
  const result = await parseMarkdownString(post.content)
  if (result.metadata._tags?.includes('OER')) {
    oerPosts.push(result)
  }
}

console.log(`${oerPosts.length} Posts mit Tag "OER"`)
```

### 2. Statistiken über alle Posts

```javascript
const client = createForgejoClient()
const posts = await client.listPosts()

const stats = {
  total: posts.length,
  withAuthors: 0,
  withLicense: 0,
  avgContentLength: 0
}

let totalLength = 0

for (const post of posts.slice(0, 10)) {
  const markdown = await client.getPostContent(post.name)
  const result = await parseMarkdownString(markdown)
  
  if (result.metadata?.creator) stats.withAuthors++
  if (result.metadata?.license) stats.withLicense++
  totalLength += result.content.length
}

stats.avgContentLength = Math.round(totalLength / 10)

console.log(stats)
```

### 3. Export als JSON

```javascript
import { writeFile } from 'fs/promises'

const client = createForgejoClient()
const markdown = await client.getPostContent('2024-08-05-hello-world')
const result = await parseMarkdownString(markdown)

// Nur Metadaten exportieren
const exportData = {
  metadata: result.metadata,
  stats: {
    contentLength: result.content.length,
    headings: extractHeadings(result.ast).length,
    links: extractLinks(result.ast).length
  }
}

await writeFile(
  'export.json', 
  JSON.stringify(exportData, null, 2)
)
```

## 🔧 Erweiterte Optionen

### Parser-Optionen anpassen

```javascript
const result = await parseMarkdownString(markdown, {
  extractYaml: true,      // YAML Front Matter extrahieren
  parseGfm: true,         // GitHub Flavored Markdown
  extractAMB: true        // AMB-Metadaten extrahieren
})
```

### Eigene Forgejo-Instanz

```javascript
const client = new ForgejoClient({
  baseUrl: 'https://deine-instanz.de/api/v1',
  owner: 'dein-username',
  repo: 'dein-repo',
  branch: 'main',
  token: 'dein-token'
})
```

## 📖 Weitere Dokumentation

- **README.md** - Vollständige Projekt-Dokumentation
- **docs/ARCHITECTURE.md** - Technische Architektur
- **docs/DECISIONS.md** - Design-Entscheidungen
- **test/parser.test.js** - Test-Beispiele

## 💡 Nächste Schritte

1. ✅ Parser ausprobieren (du bist hier!)
2. 🔜 WordPress Transformer (Phase 2)
3. 🔜 Nostr Transformer (Phase 2)
4. 🔜 Batch-Processing
5. 🔜 Browser-Build

## 🆘 Hilfe

Bei Fragen oder Problemen:
- Schaue in die Tests: `test/parser.test.js`
- Lese die Beispiele: `examples/*.js`
- Prüfe die API-Docs: `README.md`

Viel Erfolg! 🚀
