#!/usr/bin/env node

/**
 * WordPress Publishing Example
 * 
 * Demonstriert wie man einen Post aus Forgejo parsed
 * und zu WordPress published.
 */

import { parse } from '../src/index.js'
import { createForgejoClient } from '../src/forgejo-client.js'
import { transformToWordPress, WordPressClient } from '../src/transformers/wordpress-transformer.js'

async function publishExample() {
  console.log('📝 WordPress Publishing Example\n')
  
  // 1. Forgejo Client erstellen
  console.log('1️⃣ Verbinde mit Forgejo...')
  const forgejoClient = createForgejoClient()
  
  // 2. Post abrufen
  const postName = '2025-04-20-OER-und-Symbole'
  console.log(`2️⃣ Lade Post: ${postName}`)
  
  const markdown = await forgejoClient.getPostContent(postName)
  console.log(`   ✅ ${markdown.length} Zeichen geladen\n`)
  
  // 3. Parse Markdown zu AMB
  console.log('3️⃣ Parse Markdown...')
  const result = await parse(markdown)
  console.log(`   ✅ Titel: ${result.metadata.name}`)
  console.log(`   ✅ Lizenz: ${result.metadata.license}`)
  console.log(`   ✅ Creators: ${result.metadata.creator?.length || 0}\n`)
  
  // 4. Transform zu WordPress-Format
  console.log('4️⃣ Transformiere zu WordPress-Format...')
  const wpPost = transformToWordPress(result.metadata, result.content, {
    status: 'draft',  // draft, publish, pending
    authorId: 1,
    categoryIds: [5, 12],  // Beispiel-Kategorien
    convertToHtml: true,
    includeCustomFields: true
  })
  
  console.log('   ✅ WordPress Post erstellt:')
  console.log(`      Titel: ${wpPost.title}`)
  console.log(`      Status: ${wpPost.status}`)
  console.log(`      Tags: ${wpPost.tags.join(', ')}`)
  console.log(`      Custom Fields: ${Object.keys(wpPost.meta).length}`)
  console.log('')
  
  // 5. Vorschau
  console.log('📋 WordPress Post JSON (Auszug):\n')
  console.log(JSON.stringify({
    title: wpPost.title,
    status: wpPost.status,
    excerpt: wpPost.excerpt.substring(0, 100) + '...',
    tags: wpPost.tags.slice(0, 3),
    meta: {
      amb_type: wpPost.meta.amb_type,
      amb_license: wpPost.meta.amb_license,
      amb_in_language: wpPost.meta.amb_in_language
    }
  }, null, 2))
  
  console.log('\n')
  
  // 6. WordPress API (Simulation)
  console.log('6️⃣ WordPress API Integration (Simulation)\n')
  console.log('   ⚠️  Konfiguriere zuerst deine WordPress-Credentials:\n')
  console.log('   const wpClient = new WordPressClient({')
  console.log('     baseUrl: "https://example.com/wp-json/wp/v2",')
  console.log('     username: "your-username",')
  console.log('     password: "your-application-password"')
  console.log('   })\n')
  console.log('   // Dann published:')
  console.log('   const published = await wpClient.createPost(wpPost)')
  console.log('   console.log(`Published: ${published.link}`)')
  
  console.log('\n✅ Beispiel abgeschlossen!')
  console.log('\n💡 Tipp: Setze echte WordPress-Credentials ein,')
  console.log('   um tatsächlich zu publizieren.\n')
}

// Uncomment zum Test mit echten Credentials:
/*
async function publishToRealWordPress() {
  const forgejoClient = createForgejoClient()
  const markdown = await forgejoClient.getPostContent('2025-04-20-OER-und-Symbole')
  const result = await parse(markdown)
  
  const wpPost = transformToWordPress(result.metadata, result.content, {
    status: 'draft',
    authorId: 1
  })
  
  const wpClient = new WordPressClient({
    baseUrl: process.env.WP_BASE_URL,
    username: process.env.WP_USERNAME,
    password: process.env.WP_PASSWORD
  })
  
  const published = await wpClient.createPost(wpPost)
  console.log(`✅ Published: ${published.link}`)
}
*/

publishExample().catch(console.error)
