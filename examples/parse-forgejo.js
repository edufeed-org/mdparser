/**
 * Beispiel: Markdown-Datei von Forgejo API abrufen und parsen
 */

import { createForgejoClient } from '../src/forgejo-client.js'
import { parseMarkdownString } from '../src/parser.js'

async function main() {
  console.log('🚀 Forgejo API Beispiel\n')
  
  try {
    // Forgejo Client erstellen (nutzt .env Konfiguration)
    const client = createForgejoClient()
    
    console.log('📡 Verbinde mit Forgejo API...')
    console.log(`   Repository: ${client.owner}/${client.repo}`)
    console.log(`   Branch: ${client.branch}\n`)
    
    // Repository-Info abrufen
    const repo = await client.getRepository()
    console.log('✅ Repository gefunden:')
    console.log(`   Name: ${repo.name}`)
    console.log(`   Beschreibung: ${repo.description}`)
    console.log(`   Sprache: ${repo.language}\n`)
    
    // Beispiel-Post abrufen
    const postPath = '2025-04-20-OER-und-Symbole'
    console.log(`📄 Rufe Post ab: ${postPath}`)
    
    const markdown = await client.getPostContent(postPath)
    console.log(`✅ Markdown geladen (${markdown.length} Zeichen)\n`)
    
    // Markdown parsen
    console.log('🔍 Parse Markdown...')
    const result = await parseMarkdownString(markdown)
    
    // Ergebnisse anzeigen
    console.log('\n📊 Parse-Ergebnisse:\n')
    
    if (result.metadata) {
      console.log('🏷️  Metadaten:')
      console.log(`   Titel: ${result.metadata.name}`)
      console.log(`   Typ: ${result.metadata.type}`)
      console.log(`   Lizenz: ${result.metadata.license}`)
      console.log(`   Datum: ${result.metadata.datePublished}`)
      
      if (result.metadata.creator) {
        console.log('   Autoren:')
        result.metadata.creator.forEach(creator => {
          const name = creator.name || `${creator.givenName} ${creator.familyName}`
          console.log(`     - ${name}`)
          if (creator.id) console.log(`       ORCID: ${creator.id}`)
        })
      }
      
      if (result.metadata._warnings && result.metadata._warnings.length > 0) {
        console.log('\n⚠️  Warnings:')
        result.metadata._warnings.forEach(w => console.log(`   - ${w}`))
      }
    }
    
    console.log('\n📝 Content:')
    console.log(`   Länge: ${result.content.length} Zeichen`)
    console.log(`   AST Nodes: ${countNodes(result.ast)}`)
    
    // Überschriften extrahieren
    const { extractHeadings } = await import('../src/parser.js')
    const headings = extractHeadings(result.ast)
    
    if (headings.length > 0) {
      console.log('\n📑 Überschriften:')
      headings.slice(0, 5).forEach(h => {
        const indent = '  '.repeat(h.level - 1)
        console.log(`   ${indent}H${h.level}: ${h.text}`)
      })
      if (headings.length > 5) {
        console.log(`   ... und ${headings.length - 5} weitere`)
      }
    }
    
    console.log('\n✅ Erfolgreich!')
    
  } catch (error) {
    console.error('❌ Fehler:', error.message)
    process.exit(1)
  }
}

// Hilfsfunktion: Zähle AST-Nodes
function countNodes(node) {
  let count = 1
  if (node.children) {
    node.children.forEach(child => {
      count += countNodes(child)
    })
  }
  return count
}

// Ausführen
main()
