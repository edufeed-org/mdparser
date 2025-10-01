/**
 * Beispiel: Alle Posts von Forgejo abrufen und analysieren
 */

import { createForgejoClient } from '../src/forgejo-client.js'
import { parseMarkdownString } from '../src/parser.js'

async function main() {
  console.log('🚀 Alle Posts von Forgejo abrufen\n')
  
  try {
    const client = createForgejoClient()
    
    console.log('📡 Liste alle Posts...')
    const postDirs = await client.listPosts()
    
    console.log(`✅ ${postDirs.length} Posts gefunden\n`)
    
    // Ersten 5 Posts parsen
    const limit = 5
    console.log(`🔍 Parse die ersten ${limit} Posts...\n`)
    
    for (let i = 0; i < Math.min(limit, postDirs.length); i++) {
      const dir = postDirs[i]
      
      console.log(`\n📄 [${i + 1}/${limit}] ${dir.name}`)
      console.log('─'.repeat(60))
      
      try {
        const markdown = await client.getPostContent(dir.name)
        const result = await parseMarkdownString(markdown)
        
        if (result.metadata) {
          console.log(`   Titel: ${result.metadata.name || 'Unbekannt'}`)
          console.log(`   Typ: ${result.metadata.type}`)
          console.log(`   Datum: ${result.metadata.datePublished || 'N/A'}`)
          console.log(`   Lizenz: ${result.metadata.license || 'N/A'}`)
          
          if (result.metadata.creator) {
            const authors = result.metadata.creator
              .map(c => c.name || `${c.givenName} ${c.familyName}`)
              .join(', ')
            console.log(`   Autoren: ${authors}`)
          }
          
          console.log(`   Content: ${result.content.length} Zeichen`)
        } else {
          console.log('   ⚠️  Keine Metadaten gefunden')
        }
        
      } catch (error) {
        console.log(`   ❌ Fehler: ${error.message}`)
      }
    }
    
    console.log('\n\n📊 Zusammenfassung:')
    console.log(`   Gesamt: ${postDirs.length} Posts im Repository`)
    console.log(`   Analysiert: ${Math.min(limit, postDirs.length)} Posts`)
    console.log('\n✅ Fertig!')
    
  } catch (error) {
    console.error('❌ Fehler:', error.message)
    process.exit(1)
  }
}

main()
