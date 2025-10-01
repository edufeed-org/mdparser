/**
 * Beispiel: Lokale Markdown-Datei parsen
 */

import { parseMarkdownFile } from '../src/parser.js'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeFile } from 'fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  console.log('🚀 Lokale Datei parsen\n')
  
  try {
    // Beispiel-Markdown-Datei
    const filePath = join(__dirname, '../test/fixtures/example.md')
    
    console.log(`📄 Parse Datei: ${filePath}`)
    
    const result = await parseMarkdownFile(filePath)
    
    console.log('\n✅ Erfolgreich geparst!\n')
    
    // Metadaten ausgeben
    if (result.metadata) {
      console.log('📋 Metadaten:')
      console.log(JSON.stringify(result.metadata, null, 2))
    }
    
    // YAML ausgeben
    if (result.yaml) {
      console.log('\n📝 YAML Front Matter:')
      console.log(JSON.stringify(result.yaml, null, 2))
    }
    
    // AST-Struktur
    console.log('\n🌲 AST Root:')
    console.log(`   Type: ${result.ast.type}`)
    console.log(`   Children: ${result.ast.children?.length || 0}`)
    
    // Überschriften
    const { extractHeadings } = await import('../src/parser.js')
    const headings = extractHeadings(result.ast)
    
    if (headings.length > 0) {
      console.log('\n📑 Überschriften:')
      headings.forEach(h => {
        const indent = '  '.repeat(h.level - 1)
        console.log(`   ${indent}H${h.level}: ${h.text}`)
      })
    }
    
    // Links
    const { extractLinks } = await import('../src/parser.js')
    const links = extractLinks(result.ast)
    
    if (links.length > 0) {
      console.log('\n🔗 Links:')
      links.slice(0, 5).forEach(link => {
        console.log(`   - ${link.text || 'Kein Text'}: ${link.url}`)
      })
      if (links.length > 5) {
        console.log(`   ... und ${links.length - 5} weitere`)
      }
    }
    
    // Bilder
    const { extractImages } = await import('../src/parser.js')
    const images = extractImages(result.ast)
    
    if (images.length > 0) {
      console.log('\n🖼️  Bilder:')
      images.forEach(img => {
        console.log(`   - ${img.alt || 'Kein Alt-Text'}: ${img.url}`)
      })
    }
    
    // Optional: Ergebnis als JSON speichern
    const outputPath = join(__dirname, '../test/output/result.json')
    await writeFile(outputPath, JSON.stringify(result, null, 2))
    console.log(`\n💾 Ergebnis gespeichert: ${outputPath}`)
    
  } catch (error) {
    console.error('❌ Fehler:', error.message)
    process.exit(1)
  }
}

main()
