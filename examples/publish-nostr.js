#!/usr/bin/env node

/**
 * Nostr Publishing Example
 * 
 * Demonstriert wie man einen Post aus Forgejo parsed
 * und zu Nostr published.
 */

import { parse } from '../src/index.js'
import { createForgejoClient } from '../src/forgejo-client.js'
import { transformToNostr } from '../src/transformers/nostr-transformer.js'

async function nostrExample() {
  console.log('📡 Nostr Publishing Example\n')
  
  // 1. Forgejo Client erstellen
  console.log('1️⃣ Verbinde mit Forgejo...')
  const forgejoClient = createForgejoClient()
  
  // 2. Post abrufen
  const postName = '2024-08-09-sdg-logos'
  console.log(`2️⃣ Lade Post: ${postName}`)
  
  const markdown = await forgejoClient.getPostContent(postName)
  console.log(`   ✅ ${markdown.length} Zeichen geladen\n`)
  
  // 3. Parse Markdown zu AMB
  console.log('3️⃣ Parse Markdown...')
  const result = await parse(markdown)
  console.log(`   ✅ Titel: ${result.metadata.name}`)
  console.log(`   ✅ Lizenz: ${result.metadata.license}`)
  console.log(`   ✅ About: ${result.metadata.about?.length || 0} Topics\n`)
  
  // 4. Transform zu Nostr NIP-23 Format
  console.log('4️⃣ Transformiere zu Nostr Event...')
  
  // Beispiel-Public-Key (in Produktion durch echten ersetzen)
  const pubkey = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6' // 32 bytes hex
  
  const event = transformToNostr(result.metadata, result.content, {
    pubkey: pubkey,
    identifier: 'oer-community-nostr-schrein'
  })
  
  console.log('   ✅ Nostr Event erstellt:')
  console.log(`      Kind: ${event.kind} (NIP-23 Long-form)`)
  console.log(`      Tags: ${event.tags.length}`)
  console.log(`      Content: ${event.content.length} Zeichen`)
  console.log('')
  
  // 5. Event-Tags analysieren
  console.log('📋 Event Tags (Auswahl):\n')
  
  const titleTag = event.tags.find(t => t[0] === 'title')
  const summaryTag = event.tags.find(t => t[0] === 'summary')
  const licenseTag = event.tags.find(t => t[0] === 'license')
  const topicTags = event.tags.filter(t => t[0] === 't')
  const authorTags = event.tags.filter(t => t[0] === 'author')
  
  console.log(`   title: "${titleTag ? titleTag[1] : 'N/A'}"`)
  console.log(`   summary: "${summaryTag ? summaryTag[1].substring(0, 80) + '...' : 'N/A'}"`)
  console.log(`   license: "${licenseTag ? licenseTag[1] : 'N/A'}"`)
  console.log(`   topics (t): ${topicTags.map(t => t[1]).join(', ')}`)
  console.log(`   authors: ${authorTags.length} entries`)
  console.log('')
  
  // 6. Event JSON Preview
  console.log('📡 Nostr Event JSON (gekürzt):\n')
  const previewEvent = {
    kind: event.kind,
    pubkey: event.pubkey.substring(0, 16) + '...',
    created_at: event.created_at,
    tags: [
      event.tags[0],  // d tag
      event.tags[1],  // title tag
      event.tags[2],  // summary tag (if exists)
      '... ' + (event.tags.length - 3) + ' weitere tags'
    ],
    content: event.content.substring(0, 100) + '...'
  }
  
  console.log(JSON.stringify(previewEvent, null, 2))
  console.log('')
  
  // 7. Publishing Info
  console.log('7️⃣ Nostr Publishing (Simulation)\n')
  console.log('   ⚠️  Zum echten Publishing benötigst du:\n')
  console.log('   1. Einen Nostr Private Key (nsec...)')
  console.log('   2. Signatur-Library (z.B. nostr-tools)')
  console.log('   3. Relay-Verbindungen\n')
  console.log('   Beispiel:\n')
  console.log('   import { signEvent, NostrClient } from "./src/transformers/nostr-transformer.js"')
  console.log('   ')
  console.log('   // Event signieren')
  console.log('   const signedEvent = signEvent(event, privateKey)')
  console.log('   ')
  console.log('   // Zu Relays publishen')
  console.log('   const client = new NostrClient([')
  console.log('     "wss://relay.damus.io",')
  console.log('     "wss://nos.lol"')
  console.log('   ])')
  console.log('   await client.connect()')
  console.log('   const results = await client.publishEvent(signedEvent)')
  
  console.log('\n✅ Beispiel abgeschlossen!')
  console.log('\n💡 Tipp: Installiere nostr-tools für echtes Publishing:')
  console.log('   npm install nostr-tools\n')
}

// Uncomment zum Test mit echten Credentials:
/*
async function publishToRealNostr() {
  import { signEvent, NostrClient } from '../src/transformers/nostr-transformer.js'
  
  const forgejoClient = createForgejoClient()
  const markdown = await forgejoClient.getPostContent('2025-07-02-nostr-schrein')
  const result = await parse(markdown)
  
  const event = transformToNostr(result.metadata, result.content, {
    pubkey: process.env.NOSTR_PUBKEY,
    identifier: 'oer-community-post-' + Date.now()
  })
  
  // Signieren mit private key
  const signedEvent = signEvent(event, process.env.NOSTR_PRIVKEY)
  
  // Publishen zu Relays
  const client = new NostrClient([
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band'
  ])
  
  await client.connect()
  const results = await client.publishEvent(signedEvent)
  
  console.log('✅ Published to Nostr!')
  console.log('Results:', results)
  
  client.close()
}
*/

nostrExample().catch(console.error)
