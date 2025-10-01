# 🎯 Design-Entscheidungen

Dieses Dokument dokumentiert wichtige technische Entscheidungen und deren Begründungen.

## 1. Parser-Technologie: unified/remark

**Entscheidung:** unified + remark als Core-Parser

**Datum:** 2025-10-01

### Kontext
Es wurden mehrere Markdown-Parser für die Verarbeitung von Bildungsressourcen mit YAML Front Matter evaluiert.

### Alternativen

| Parser | Vorteile | Nachteile | Score |
|--------|----------|-----------|-------|
| **marked** | Sehr populär (30k+ GitHub Stars)<br/>Einfache API<br/>Gute Performance | Fokus auf HTML-Output<br/>Kein AST-Zugriff<br/>Begrenzte Erweiterbarkeit | 6/10 |
| **markdown-it** | Erweiterbar durch Plugins<br/>Sehr schnell<br/>CommonMark-konform | Komplexe API<br/>HTML-fokussiert<br/>Keine Browser-Isomorphie | 7/10 |
| **unified/remark** | AST-basiert (MDAST)<br/>Isomorph (Node + Browser)<br/>Riesiges Plugin-Ökosystem<br/>De-facto Standard | Steilere Lernkurve<br/>Mehr Setup-Code | **9/10** |
| **gray-matter + marked** | Sehr einfach<br/>Schneller Einstieg | Weniger strukturiert<br/>Begrenzte Flexibilität | 5/10 |

### Entscheidungskriterien

1. **AST-Zugriff** (Gewichtung: 30%)
   - ✅ unified: Voller MDAST-Zugriff für präzise Manipulation
   - ❌ marked: Kein AST, nur Token-Stream
   
2. **Isomorphie** (Gewichtung: 25%)
   - ✅ unified: Funktioniert identisch in Node.js und Browser
   - ⚠️ markdown-it: Primär Node.js-fokussiert

3. **Erweiterbarkeit** (Gewichtung: 20%)
   - ✅ unified: 200+ Plugins im Ökosystem
   - ⚠️ marked: Begrenzte Extension-API

4. **Standards** (Gewichtung: 15%)
   - ✅ unified: MDAST ist De-facto-Standard
   - ✅ markdown-it: CommonMark-konform

5. **Community & Wartung** (Gewichtung: 10%)
   - ✅ unified: Sehr aktiv, Teil von unifiedjs
   - ✅ marked: Aktiv maintained

### Konsequenzen

**Positiv:**
- Maximale Flexibilität für zukünftige Features
- AST-Transformationen für WordPress/Nostr
- Browser-Support ohne Code-Änderungen
- Plugin-System für Custom-Syntax

**Negativ:**
- Mehr initialer Setup-Code erforderlich
- Höhere Komplexität für einfache Use-Cases
- Größere Learning-Curve für Contributors

### Code-Beispiel

```javascript
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkGfm)

const ast = processor.parse(markdown)
```

---

## 2. YAML-Parser: `yaml` library

**Entscheidung:** `yaml` (v2.x) statt `js-yaml`

**Datum:** 2025-10-01

### Kontext
YAML Front Matter muss zuverlässig geparst werden, inkl. komplexer Strukturen (Arrays, nested Objects).

### Alternativen

| Library | Bundle Size | Spec-Konformität | Performance | Score |
|---------|-------------|------------------|-------------|-------|
| **yaml** | 42 KB | YAML 1.2 | Sehr gut | **9/10** |
| **js-yaml** | 68 KB | YAML 1.2 | Gut | 7/10 |
| JSON.parse | 0 KB (native) | N/A (nur JSON) | Exzellent | 3/10 |

### Entscheidung: `yaml`

**Gründe:**
1. ✅ **Kleinere Bundle-Size** (42 KB vs. 68 KB)
2. ✅ **Moderne API** (ESM-first, TypeScript-Typen)
3. ✅ **Spec-compliant** (YAML 1.2)
4. ✅ **Aktive Entwicklung**
5. ✅ **Bessere Error-Messages**

### Konsequenzen

- Zuverlässiges Parsing komplexer YAML-Strukturen
- Gute Performance auch bei großen Dateien
- Kleinere Bundle-Size für Browser-Builds

---

## 3. HTTP-Client: Native `fetch`

**Entscheidung:** Native `fetch` API statt axios/node-fetch

**Datum:** 2025-10-01

### Kontext
HTTP-Requests für Forgejo API und URL-basierte Markdown-Dateien.

### Alternativen

| Option | Vorteile | Nachteile | Score |
|--------|----------|-----------|-------|
| **native fetch** | In Node 18+ integriert<br/>Identisch im Browser<br/>Keine Dependencies | Erfordert Node.js 18+ | **10/10** |
| **axios** | Feature-reich<br/>Interceptors<br/>Auto-Transform | Zusätzliche Dependency<br/>25 KB Bundle | 6/10 |
| **node-fetch** | Populär | Zusätzliche Dependency<br/>Nicht identisch mit Browser | 5/10 |

### Entscheidung: Native `fetch`

**Gründe:**
1. ✅ **Zero Dependencies**
2. ✅ **Isomorphie** - Identische API in Node.js 18+ und Browser
3. ✅ **Standard** - Web API Standard
4. ✅ **Async/await** - Moderne Syntax

**Requirement:** Node.js >= 18.0.0

### Konsequenzen

- Keine zusätzlichen Dependencies
- Code funktioniert ohne Änderungen im Browser
- Einfachere Maintenance

---

## 4. Module-System: ESM (ES Modules)

**Entscheidung:** Pure ESM, kein CommonJS

**Datum:** 2025-10-01

### Kontext
Wahl des Module-Systems für das Projekt.

### Entscheidung: ESM

```json
{
  "type": "module"
}
```

**Gründe:**
1. ✅ **Standard** - ESM ist der JavaScript-Standard
2. ✅ **Browser-kompatibel** - Direkt in Browsern lauffähig
3. ✅ **Tree-Shaking** - Bessere Bundle-Optimierung
4. ✅ **Zukunftssicher** - CommonJS ist Legacy

**Import-Syntax:**
```javascript
import { parseMarkdownFile } from './parser.js'
// statt:
// const { parseMarkdownFile } = require('./parser.js')
```

### Konsequenzen

**Positiv:**
- Moderne, zukunftssichere Codebasis
- Bessere Bundle-Optimierung
- Browser-Kompatibilität

**Negativ:**
- Keine Kompatibilität mit alten CommonJS-only Tools
- Erfordert `.js` Extension bei relativen Imports

---

## 5. Datenquelle-Priorität: API-First

**Entscheidung:** Primärer Fokus auf Forgejo API

**Datum:** 2025-10-01

### Kontext
Verschiedene Datenquellen müssen unterstützt werden.

### Priorisierung

1. **Forgejo/Gitea API** (Priorität 1)
   - Primäre Datenquelle
   - Direkter API-Zugriff
   - No Git-Clone nötig

2. **HTTP/HTTPS URLs** (Priorität 2)
   - Einfacher Fallback
   - Für öffentliche Dateien

3. **Lokale Dateien** (Priorität 3)
   - Für Entwicklung und Tests
   - Node.js-only

### Implementation

```javascript
// src/index.js
export async function parseMarkdown(source, options = {}) {
  if (isForgejoURL(source)) {
    return parseFromForgejo(source, options)
  } else if (isHTTPURL(source)) {
    return parseFromURL(source, options)
  } else {
    return parseFromFile(source, options)
  }
}
```

---

## 6. Error-Handling: Graceful Degradation

**Entscheidung:** Fehlertolerante Metadaten-Extraktion

**Datum:** 2025-10-01

### Prinzip

Fehlende oder ungültige Metadaten führen nicht zu Fehler, sondern zu Warnings.

```javascript
{
  metadata: {
    name: "Unbekannt",  // Fallback
    _warnings: [
      "Fehlendes Feld: commonMetadata.name"
    ]
  }
}
```

**Gründe:**
1. ✅ Robustheit gegenüber unvollständigen Daten
2. ✅ Bessere User Experience
3. ✅ Ermöglicht partielle Verarbeitung

---

## 7. Browser-Build: Phase 2

**Entscheidung:** Browser-Build wird in Phase 2 implementiert

**Datum:** 2025-10-01

### Kontext
Browser-Unterstützung ist wichtig, aber nicht im ersten Release.

### Phasen-Plan

**Phase 1 (jetzt):**
- Node.js-kompatibel
- Isomorpher Code (aber kein Build)
- Tests in Node.js

**Phase 2:**
- ESM Browser-Build
- Bundling mit Rollup/esbuild
- Browser-Tests

**Grund:**
- Fokus auf Core-Funktionalität
- Vermeidung von Over-Engineering
- Schnelleres Initial-Release

---

## 8. Testing: Node.js Native Test Runner

**Entscheidung:** Node.js `--test` statt Jest/Mocha

**Datum:** 2025-10-01

### Alternativen

| Test-Framework | Vorteile | Nachteile | Score |
|----------------|----------|-----------|-------|
| **Node.js native** | Keine Dependencies<br/>Schnell<br/>ESM-Support | Weniger Features | **8/10** |
| **Jest** | Feature-reich<br/>Snapshots | Langsam<br/>ESM-Probleme | 6/10 |
| **Vitest** | Schnell<br/>ESM-first | Weitere Dependency | 7/10 |

### Entscheidung: Node.js Native

```javascript
// test/parser.test.js
import { test } from 'node:test'
import assert from 'node:assert'

test('parses markdown with YAML', async () => {
  const result = await parseMarkdownFile('./fixtures/test.md')
  assert.ok(result.yaml)
})
```

**Gründe:**
- ✅ Zero Dependencies für Tests
- ✅ Schnelle Ausführung
- ✅ Native ESM-Support
- ✅ Ausreichend für unsere Zwecke

---

## Zusammenfassung: Technologie-Stack

| Kategorie | Technologie | Begründung |
|-----------|-------------|------------|
| **Parser** | unified + remark | AST-basiert, isomorph, erweiterbar |
| **YAML** | yaml (v2.x) | Klein, modern, spec-compliant |
| **HTTP** | native fetch | Zero deps, isomorph |
| **Modules** | ESM | Standard, zukunftssicher |
| **Testing** | Node.js native | Zero deps, schnell |
| **Code Style** | Prettier + ESLint | Standard, automatisierbar |

---

## Änderungshistorie

| Datum | Entscheidung | Autor |
|-------|--------------|-------|
| 2025-10-01 | Initial: unified/remark | Jörg Lohrer |
| 2025-10-01 | YAML library | Jörg Lohrer |
| 2025-10-01 | Native fetch | Jörg Lohrer |
| 2025-10-01 | ESM-only | Jörg Lohrer |

---

**Fragen oder Vorschläge?** → [Issue erstellen](https://git.rpi-virtuell.de/Comenius-Institut/mdparser/issues)
