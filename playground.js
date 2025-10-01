/**
 * Interaktives Playground zum Ausprobieren des Parsers
 * 
 * Verwendung:
 * node playground.js
 */

import { createForgejoClient } from './src/forgejo-client.js'
import { parseMarkdownString, extractHeadings, extractLinks, extractImages } from './src/parser.js'
import { validateAMBMetadata } from './src/extractors/amb-extractor.js'

// Farben für Console-Output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
}

function print(text, color = 'reset') {
  console.log(`${colors[color]}${text}${colors.reset}`)
}

function section(title) {
  console.log('\n' + '='.repeat(70))
  print(title, 'bright')
  console.log('='.repeat(70) + '\n')
}

async function playground() {
  section('🎮 MDParser Playground')
  
  print('Dieses Script zeigt die verschiedenen Funktionen des Parsers.', 'cyan')
  print('Du kannst den Code in playground.js anpassen, um zu experimentieren.\n', 'cyan')
  
  // 1. Forgejo Client Setup
  section('1️⃣  Forgejo API Client')
  
  const client = createForgejoClient()
  print(`✓ Client erstellt`, 'green')
  print(`  Repository: ${client.owner}/${client.repo}`, 'blue')
  print(`  Branch: ${client.branch}`, 'blue')
  
  // Repository-Info
  const repo = await client.getRepository()
  print(`  Beschreibung: ${repo.description}`, 'blue')
  
  // 2. Posts auflisten
  section('2️⃣  Posts auflisten')
  
  const posts = await client.listPosts()
  print(`✓ ${posts.length} Posts gefunden`, 'green')
  
  // Die ersten 10 Posts anzeigen
  print('\nErste 10 Posts:', 'yellow')
  posts.slice(0, 10).forEach((post, i) => {
    console.log(`  ${i + 1}. ${post.name}`)
  })
  
  // 3. Einen Post parsen
  section('3️⃣  Post parsen')
  
  // Du kannst hier einen anderen Post wählen!
  const selectedPost = '2025-04-20-OER-und-Symbole'
  print(`📄 Parse: ${selectedPost}`, 'yellow')
  
  const markdown = await client.getPostContent(selectedPost)
  print(`✓ Markdown geladen: ${markdown.length} Zeichen`, 'green')
  
  const result = await parseMarkdownString(markdown)
  print(`✓ Erfolgreich geparst`, 'green')
  
  // 4. Metadaten analysieren
  section('4️⃣  AMB-Metadaten')
  
  if (result.metadata) {
    const meta = result.metadata
    
    console.log('\n📋 Basis-Informationen:')
    console.log(`  Titel: ${meta.name || 'N/A'}`)
    console.log(`  Typ: ${meta.type}`)
    console.log(`  Lizenz: ${meta.license || 'N/A'}`)
    console.log(`  Datum: ${meta.datePublished || 'N/A'}`)
    console.log(`  ID: ${meta.id || 'N/A'}`)
    console.log(`  Sprache: ${meta.inLanguage ? meta.inLanguage.join(', ') : 'N/A'}`)
    
    if (meta.creator && meta.creator.length > 0) {
      console.log('\n👥 Autoren:')
      meta.creator.forEach((creator, i) => {
        const name = creator.name || `${creator.givenName} ${creator.familyName}`
        console.log(`  ${i + 1}. ${name}`)
        if (creator.id) console.log(`     └─ ID: ${creator.id}`)
        if (creator.affiliation) {
          console.log(`     └─ Affiliation: ${creator.affiliation.name}`)
        }
      })
    }
    
    if (meta.about && meta.about.length > 0) {
      console.log('\n🏷️  Themen:')
      meta.about.forEach(topic => console.log(`  - ${topic}`))
    }
    
    if (meta.learningResourceType && meta.learningResourceType.length > 0) {
      console.log('\n📚 Lernressourcen-Typen:')
      meta.learningResourceType.forEach(type => console.log(`  - ${type}`))
    }
    
    // Validierung
    const validation = validateAMBMetadata(meta)
    console.log('\n✓ Validierung:')
    console.log(`  Status: ${validation.valid ? '✅ Gültig' : '⚠️  Unvollständig'}`)
    if (validation.errors.length > 0) {
      console.log(`  Fehler: ${validation.errors.length}`)
      validation.errors.forEach(err => console.log(`    - ${err}`))
    }
    if (validation.warnings.length > 0) {
      console.log(`  Warnings: ${validation.warnings.length}`)
      validation.warnings.slice(0, 3).forEach(warn => console.log(`    - ${warn}`))
      if (validation.warnings.length > 3) {
        console.log(`    ... und ${validation.warnings.length - 3} weitere`)
      }
    }
    
    if (meta._warnings && meta._warnings.length > 0) {
      console.log('\n⚠️  Parser-Warnings:')
      meta._warnings.forEach(w => console.log(`  - ${w}`))
    }
  } else {
    print('⚠️  Keine Metadaten gefunden', 'yellow')
  }
  
  // 5. Content-Analyse
  section('5️⃣  Content-Analyse')
  
  console.log('📝 Content-Statistik:')
  console.log(`  Länge: ${result.content.length} Zeichen`)
  console.log(`  Zeilen: ${result.content.split('\n').length}`)
  console.log(`  Wörter (ca.): ${result.content.split(/\s+/).length}`)
  
  // Überschriften
  const headings = extractHeadings(result.ast)
  console.log(`\n📑 Überschriften: ${headings.length}`)
  headings.forEach(h => {
    const indent = '  ' + '  '.repeat(h.level - 2)
    console.log(`${indent}H${h.level}: ${h.text}`)
  })
  
  // Links
  const links = extractLinks(result.ast)
  if (links.length > 0) {
    console.log(`\n🔗 Links: ${links.length}`)
    links.slice(0, 5).forEach(link => {
      console.log(`  - ${link.text || 'Kein Text'}`)
      console.log(`    → ${link.url}`)
    })
    if (links.length > 5) {
      console.log(`  ... und ${links.length - 5} weitere`)
    }
  }
  
  // Bilder
  const images = extractImages(result.ast)
  if (images.length > 0) {
    console.log(`\n🖼️  Bilder: ${images.length}`)
    images.forEach(img => {
      console.log(`  - ${img.alt || 'Kein Alt-Text'}`)
      console.log(`    → ${img.url}`)
    })
  }
  
  // 6. AST-Struktur
  section('6️⃣  AST-Struktur (Auszug)')
  
  console.log('🌲 Root-Node:')
  console.log(`  Type: ${result.ast.type}`)
  console.log(`  Children: ${result.ast.children?.length || 0}`)
  
  if (result.ast.children && result.ast.children.length > 0) {
    console.log('\n  Erste 5 Child-Nodes:')
    result.ast.children.slice(0, 5).forEach((child, i) => {
      console.log(`    ${i + 1}. ${child.type}`)
      if (child.depth) console.log(`       └─ depth: ${child.depth}`)
      if (child.value) {
        const preview = child.value.substring(0, 50)
        console.log(`       └─ value: "${preview}${child.value.length > 50 ? '...' : ''}"`)
      }
    })
    if (result.ast.children.length > 5) {
      console.log(`    ... und ${result.ast.children.length - 5} weitere`)
    }
  }
  
  // 7. Rohdaten-Export
  section('7️⃣  JSON-Export')
  
  const exportData = {
    metadata: result.metadata,
    content: result.content.substring(0, 500) + '...',
    stats: {
      chars: result.content.length,
      lines: result.content.split('\n').length,
      headings: headings.length,
      links: links.length,
      images: images.length
    }
  }
  
  console.log('📦 Export-Vorschau (erste 500 Zeichen Content):')
  console.log(JSON.stringify(exportData, null, 2))
  
  // 8. Tipps
  section('💡 Tipps zum Experimentieren')
  
  print('Du kannst dieses Script anpassen:', 'cyan')
  console.log('\n1. Anderen Post wählen:')
  console.log('   const selectedPost = "2024-08-05-hello-world"')
  
  console.log('\n2. Mehrere Posts analysieren:')
  console.log('   for (const post of posts.slice(0, 5)) { ... }')
  
  console.log('\n3. Parser-Optionen anpassen:')
  console.log('   const result = await parseMarkdownString(markdown, {')
  console.log('     extractYaml: true,')
  console.log('     parseGfm: true,')
  console.log('     extractAMB: true')
  console.log('   })')
  
  console.log('\n4. Weitere Funktionen ausprobieren:')
  console.log('   import { extractYAML, hasYAML } from "./src/index.js"')
  
  section('✅ Fertig!')
  
  print('Viel Spaß beim Experimentieren! 🎉', 'green')
  print('Für mehr Infos: README.md oder docs/ARCHITECTURE.md\n', 'cyan')
}

// Fehlerbehandlung
playground().catch(error => {
  console.error('\n❌ Fehler:', error.message)
  console.error(error.stack)
  process.exit(1)
})
