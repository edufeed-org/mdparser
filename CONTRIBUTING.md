# Contributing to MDParser

Vielen Dank für dein Interesse an MDParser! 🎉

## 🚀 Quick Start

1. **Fork & Clone**
   ```bash
   git clone https://git.rpi-virtuell.de/dein-username/mdparser.git
   cd mdparser
   ```

2. **Dependencies installieren**
   ```bash
   npm install
   ```

3. **Branch erstellen**
   ```bash
   git checkout -b feature/mein-feature
   ```

4. **Entwickeln & Testen**
   ```bash
   npm test
   npm run lint
   ```

5. **Commit & Push**
   ```bash
   git commit -m "feat: beschreibung"
   git push origin feature/mein-feature
   ```

6. **Pull Request erstellen**

## 📝 Code-Style

- **ESLint** für Linting
- **Prettier** für Formatierung
- **ESM** (ES Modules) verwenden
- **JSDoc** für Funktions-Dokumentation

```javascript
/**
 * Parst eine Markdown-Datei mit YAML Front Matter
 * @param {string} filePath - Pfad zur Markdown-Datei
 * @param {Object} options - Optionale Konfiguration
 * @returns {Promise<Object>} Parsed result
 */
export async function parseMarkdownFile(filePath, options = {}) {
  // ...
}
```

## 🧪 Testing

- Alle neuen Features benötigen Tests
- Tests mit `npm test` ausführen
- Test-Fixtures in `test/fixtures/` ablegen

## 📦 Commit-Conventions

Wir verwenden [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - Neues Feature
- `fix:` - Bugfix
- `docs:` - Dokumentation
- `test:` - Tests
- `refactor:` - Code-Refactoring
- `chore:` - Maintenance

Beispiele:
```
feat: add WordPress transformer
fix: handle missing YAML gracefully
docs: update API documentation
```

## 📄 Lizenz

MIT - siehe [LICENSE](LICENSE)
