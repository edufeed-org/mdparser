/**
 * Tests für MDParser
 * Nutzt Node.js native test runner
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { parseMarkdownFile, parseMarkdownString } from '../src/parser.js'
import { extractYAML, hasYAML, removeYAML } from '../src/extractors/yaml-extractor.js'
import { extractAMBMetadata, validateAMBMetadata } from '../src/extractors/amb-extractor.js'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('YAML Extractor: extrahiert YAML Front Matter', () => {
  const markdown = `---
title: Test
author: Max
---
# Content`

  const yaml = extractYAML(markdown)
  
  assert.ok(yaml, 'YAML sollte extrahiert werden')
  assert.strictEqual(yaml.title, 'Test')
  assert.strictEqual(yaml.author, 'Max')
})

test('YAML Extractor: erkennt YAML Front Matter', () => {
  const withYAML = `---\ntitle: Test\n---\nContent`
  const withoutYAML = `# Heading\nContent`
  
  assert.strictEqual(hasYAML(withYAML), true)
  assert.strictEqual(hasYAML(withoutYAML), false)
})

test('YAML Extractor: entfernt YAML Front Matter', () => {
  const markdown = `---
title: Test
---
# Content`

  const result = removeYAML(markdown)
  
  assert.ok(!result.includes('---'), 'YAML sollte entfernt sein')
  assert.ok(result.includes('# Content'), 'Content sollte bleiben')
})

test('AMB Extractor: extrahiert Metadaten aus YAML', () => {
  const yaml = {
    commonMetadata: {
      '@context': 'https://schema.org/',
      type: 'LearningResource',
      name: 'Test Resource',
      description: 'Test Description',
      license: 'https://creativecommons.org/licenses/by/4.0/',
      datePublished: '2025-10-01',
      creator: [{
        givenName: 'Max',
        familyName: 'Mustermann',
        type: 'Person'
      }]
    }
  }
  
  const metadata = extractAMBMetadata(yaml)
  
  assert.strictEqual(metadata.name, 'Test Resource')
  assert.strictEqual(metadata.description, 'Test Description')
  assert.strictEqual(metadata.type, 'LearningResource')
  assert.ok(metadata.creator, 'Creator sollte vorhanden sein')
  assert.strictEqual(metadata.creator[0].name, 'Max Mustermann')
})

test('AMB Extractor: verwendet Fallbacks', () => {
  const yaml = {
    title: 'Fallback Title',
    summary: 'Fallback Description',
    author: 'Max Mustermann'
  }
  
  const metadata = extractAMBMetadata(yaml)
  
  assert.strictEqual(metadata.name, 'Fallback Title')
  assert.strictEqual(metadata.description, 'Fallback Description')
  assert.ok(metadata._warnings, 'Warnings sollten vorhanden sein')
  assert.ok(metadata._warnings.length > 0, 'Es sollten Warnings existieren')
})

test('AMB Extractor: validiert Metadaten', () => {
  const completeMetadata = {
    name: 'Test',
    description: 'Description',
    license: 'CC-BY-4.0',
    creator: [{ name: 'Max' }],
    datePublished: '2025-10-01',
    about: ['topic'],
    id: 'https://example.org/test'
  }
  
  const validation = validateAMBMetadata(completeMetadata)
  
  assert.strictEqual(validation.valid, true)
  assert.strictEqual(validation.errors.length, 0)
})

test('Parser: parst Markdown-String', async () => {
  const markdown = `---
title: Test
---
# Heading

Some **bold** text.`

  const result = await parseMarkdownString(markdown)
  
  assert.ok(result.yaml, 'YAML sollte extrahiert sein')
  assert.ok(result.ast, 'AST sollte existieren')
  assert.ok(result.content, 'Content sollte existieren')
  assert.strictEqual(result.yaml.title, 'Test')
})

test('Parser: parst lokale Markdown-Datei', async () => {
  const filePath = join(__dirname, 'fixtures/example.md')
  
  const result = await parseMarkdownFile(filePath)
  
  assert.ok(result.yaml, 'YAML sollte extrahiert sein')
  assert.ok(result.metadata, 'Metadaten sollten extrahiert sein')
  assert.ok(result.ast, 'AST sollte existieren')
  
  // Prüfe AMB-Metadaten
  assert.strictEqual(result.metadata.name, 'Beispiel für OER-Material')
  assert.strictEqual(result.metadata.type, 'LearningResource')
  assert.ok(result.metadata.creator, 'Creator sollte vorhanden sein')
  assert.strictEqual(result.metadata.creator.length, 2, 'Sollte 2 Creators haben')
})

test('Parser: extrahiert Überschriften', async () => {
  const markdown = `# H1
## H2
### H3`

  const result = await parseMarkdownString(markdown)
  const { extractHeadings } = await import('../src/parser.js')
  const headings = extractHeadings(result.ast)
  
  assert.strictEqual(headings.length, 3)
  assert.strictEqual(headings[0].level, 1)
  assert.strictEqual(headings[0].text, 'H1')
  assert.strictEqual(headings[1].level, 2)
  assert.strictEqual(headings[2].level, 3)
})

test('Parser: extrahiert Links', async () => {
  const markdown = `[Link 1](https://example.com)
[Link 2](https://github.com "GitHub")`

  const result = await parseMarkdownString(markdown)
  const { extractLinks } = await import('../src/parser.js')
  const links = extractLinks(result.ast)
  
  assert.strictEqual(links.length, 2)
  assert.strictEqual(links[0].url, 'https://example.com')
  assert.strictEqual(links[0].text, 'Link 1')
  assert.strictEqual(links[1].url, 'https://github.com')
  assert.strictEqual(links[1].title, 'GitHub')
})

test('Parser: extrahiert Bilder', async () => {
  const markdown = `![Alt Text](image.png "Title")`

  const result = await parseMarkdownString(markdown)
  const { extractImages } = await import('../src/parser.js')
  const images = extractImages(result.ast)
  
  assert.strictEqual(images.length, 1)
  assert.strictEqual(images[0].url, 'image.png')
  assert.strictEqual(images[0].alt, 'Alt Text')
  assert.strictEqual(images[0].title, 'Title')
})

console.log('✅ Alle Tests erfolgreich!')
