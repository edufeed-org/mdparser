# 🔄 Transformer Dokumentation

## Übersicht

Die Transformer konvertieren AMB-Metadaten (Schema.org) in verschiedene Publishing-Formate:

- **WordPress REST API v2** - für WordPress-Blogs und CMS
- **Nostr NIP-23** - für dezentrales Nostr-Netzwerk

## WordPress Transformer

### Grundlegende Nutzung

```javascript
import { transformToWordPress } from './src/transformers/wordpress-transformer.js'

const wpPost = transformToWordPress(ambMetadata, markdownContent, {
  status: 'draft',        // draft, publish, pending, private
  authorId: 1,
  categoryIds: [5, 12],
  convertToHtml: true,
  includeCustomFields: true
})
```

### WordPress Post-Struktur

```javascript
{
  title: "Artikel-Titel",
  content: "<p>HTML-Content...</p>",
  excerpt: "Kurzbeschreibung (max 160 Zeichen)",
  status: "draft",
  author: 1,
  categories: [5, 12],
  tags: ["oer", "education", "text"],
  featured_media: "https://example.com/image.jpg",
  date: "2025-10-01T12:00:00",
  format: "standard",
  meta: {
    amb_type: "LearningResource",
    amb_license: "CC-BY-4.0",
    amb_creators: "[...]",
    amb_about: "[...]",
    // ... weitere AMB-Felder
  }
}
```

### WordPress API Client

```javascript
import { WordPressClient } from './src/transformers/wordpress-transformer.js'

const client = new WordPressClient({
  baseUrl: 'https://example.com/wp-json/wp/v2',
  username: 'your-username',
  password: 'your-application-password'
})

// Post erstellen
const published = await client.createPost(wpPost)
console.log(`Published: ${published.link}`)

// Post aktualisieren
await client.updatePost(postId, wpPost)

// Post abrufen
const post = await client.getPost(postId)

// Post löschen
await client.deletePost(postId)
```

### Convenience-Funktion

```javascript
import { publishToWordPress } from './src/index.js'

const result = await publishToWordPress(
  ambMetadata,
  content,
  {
    baseUrl: 'https://example.com/wp-json/wp/v2',
    username: 'user',
    password: 'pass'
  },
  {
    status: 'publish',
    authorId: 1
  }
)
```

### Tags-Extraktion

Der Transformer extrahiert automatisch Tags aus:
- `learningResourceType` → z.B. "text", "video"
- `educationalLevel` → z.B. "level A"
- `about` → Themen-URIs werden zu lesbaren Tags

### Custom Fields

Alle AMB-Metadaten werden in WordPress Custom Fields gespeichert:

```javascript
{
  amb_type: "LearningResource",
  amb_license: "https://creativecommons.org/licenses/by/4.0/",
  amb_id: "https://example.com/resource/123",
  amb_in_language: "de,en",
  amb_creative_work_status: "Published",
  amb_creators: "[{\"name\":\"John Doe\",\"id\":\"...\"}]",
  amb_about: "[\"https://...\"]",
  amb_learning_resource_types: "[\"https://...\"]",
  amb_educational_level: "[\"https://...\"]",
  amb_time_required: "PT2H",
  amb_is_accessible_for_free: true
}
```

### Round-Trip

```javascript
import { transformFromWordPress } from './src/transformers/wordpress-transformer.js'

// WordPress Post zurück zu AMB konvertieren
const ambMetadata = transformFromWordPress(wpPost)
```

## Nostr Transformer

### Grundlegende Nutzung

```javascript
import { transformToNostr } from './src/transformers/nostr-transformer.js'

const event = transformToNostr(ambMetadata, markdownContent, {
  pubkey: 'a1b2c3d4...',  // Erforderlich: 32-byte hex public key
  identifier: 'unique-id',  // Optional: Custom identifier
  publishedAt: 1234567890  // Optional: Unix timestamp
})
```

### Nostr Event-Struktur (NIP-23)

```javascript
{
  kind: 30023,  // Long-form Content
  pubkey: "a1b2c3d4e5f6...",
  created_at: 1234567890,
  tags: [
    ["d", "unique-identifier"],
    ["title", "Artikel-Titel"],
    ["summary", "Beschreibung"],
    ["published_at", "1234567890"],
    ["image", "https://example.com/image.jpg"],
    ["t", "oer"],
    ["t", "education"],
    ["license", "CC-BY-4.0"],
    ["language", "de"],
    ["learning-resource-type", "https://..."],
    ["educational-level", "https://..."],
    ["author", "name", "John Doe"],
    ["author", "orcid", "https://orcid.org/..."],
    ["subject", "https://..."],
    ["amb-metadata", "{...}"]  // Komplette AMB-Metadaten als JSON
  ],
  content: "# Markdown Content\n\n..."
}
```

### Event Signieren

```javascript
import { signEvent } from './src/transformers/nostr-transformer.js'

const signedEvent = signEvent(event, privateKey)
// Hinweis: Für Produktion echte secp256k1-Library verwenden!
```

### Nostr Client

```javascript
import { NostrClient } from './src/transformers/nostr-transformer.js'

const client = new NostrClient([
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band'
])

// Verbinden
await client.connect()

// Event publishen
const results = await client.publishEvent(signedEvent)
console.log(results)
// [
//   { relay: 'wss://relay.damus.io', success: true },
//   { relay: 'wss://nos.lol', success: true },
//   ...
// ]

// Verbindungen schließen
client.close()
```

### Convenience-Funktion

```javascript
import { publishToNostr } from './src/index.js'

const result = await publishToNostr(
  ambMetadata,
  content,
  {
    pubkey: 'a1b2c3d4...',
    privateKey: 'secret...',
    relayUrls: [
      'wss://relay.damus.io',
      'wss://nos.lol'
    ]
  },
  {
    identifier: 'my-article-123'
  }
)

console.log(result.event)
console.log(result.results)
```

### Topic Tags (t-tags)

Automatisch generiert aus:
- `learningResourceType`
- `educationalLevel`
- `about`
- Fixe Tags: "oer", "education"

### Custom Tags

Alle AMB-Metadaten werden in speziellen Tags gespeichert:

```javascript
["license", "CC-BY-4.0"]
["language", "de"]
["learning-resource-type", "https://w3id.org/kim/hcrt/text"]
["educational-level", "https://w3id.org/kim/educationalLevel/level_A"]
["author", "name", "John Doe"]
["author", "orcid", "https://orcid.org/0000-0001-2345-6789"]
["subject", "https://w3id.org/kim/hochschulfaechersystematik/n079"]
["status", "Published"]
["amb-metadata", "{\"@context\":\"https://schema.org/\",\"type\":...}"]
```

### Round-Trip

```javascript
import { transformFromNostr } from './src/transformers/nostr-transformer.js'

// Nostr Event zurück zu AMB konvertieren
const ambMetadata = transformFromNostr(event)
```

## Komplettes Workflow-Beispiel

### Von Forgejo zu WordPress

```javascript
import { parse, createForgejoClient, publishToWordPress } from './src/index.js'

// 1. Post von Forgejo laden
const client = createForgejoClient()
const markdown = await client.getPostContent('2025-04-20-OER-und-Symbole')

// 2. Zu AMB parsen
const result = await parse(markdown)

// 3. Zu WordPress publishen
const published = await publishToWordPress(
  result.metadata,
  result.content,
  {
    baseUrl: process.env.WP_BASE_URL,
    username: process.env.WP_USERNAME,
    password: process.env.WP_PASSWORD
  },
  {
    status: 'publish',
    authorId: 1
  }
)

console.log(`✅ Published to WordPress: ${published.link}`)
```

### Von Forgejo zu Nostr

```javascript
import { parse, createForgejoClient, publishToNostr } from './src/index.js'

// 1. Post von Forgejo laden
const client = createForgejoClient()
const markdown = await client.getPostContent('2024-08-09-sdg-logos')

// 2. Zu AMB parsen
const result = await parse(markdown)

// 3. Zu Nostr publishen
const nostrResult = await publishToNostr(
  result.metadata,
  result.content,
  {
    pubkey: process.env.NOSTR_PUBKEY,
    privateKey: process.env.NOSTR_PRIVKEY,
    relayUrls: [
      'wss://relay.damus.io',
      'wss://nos.lol'
    ]
  },
  {
    identifier: 'sdg-logos-oer'
  }
)

console.log('✅ Published to Nostr!')
console.log(`Event ID: ${nostrResult.event.id}`)
console.log(`Relays: ${nostrResult.results.length}`)
```

## Environment-Variablen

Empfohlene `.env`-Konfiguration:

```bash
# Forgejo
FORGEJO_BASE_URL=https://git.rpi-virtuell.de/api/v1
FORGEJO_OWNER=Comenius-Institut
FORGEJO_REPO=FOERBICO_und_rpi-virtuell
FORGEJO_TOKEN=your_token_here

# WordPress
WP_BASE_URL=https://example.com/wp-json/wp/v2
WP_USERNAME=your_username
WP_PASSWORD=your_application_password

# Nostr
NOSTR_PUBKEY=your_public_key_hex
NOSTR_PRIVKEY=your_private_key_hex
```

## Best Practices

### WordPress

1. **Draft zuerst**: Publiziere zunächst als Draft und reviewe
2. **Kategorien anlegen**: Erstelle WordPress-Kategorien für OER-Typen
3. **Featured Image**: Upload Bilder separat und verwende die Media-ID
4. **Custom Fields registrieren**: Registriere AMB-Fields in WordPress
5. **Rate Limits beachten**: Nutze Delays bei Batch-Publishing

### Nostr

1. **Key Management**: Verwende sichere Key-Verwaltung (nie im Code!)
2. **Multiple Relays**: Verwende mindestens 3-5 Relays für Redundanz
3. **Identifier-Strategie**: Nutze konsistente, eindeutige Identifiers
4. **Signatur-Library**: Verwende `nostr-tools` für Produktion
5. **Event-Größe**: Halte Events unter 64KB (Relay-Limits)

## Fehlerbehandlung

```javascript
try {
  const result = await publishToWordPress(ambMetadata, content, wpConfig)
  console.log('✅ Success:', result.link)
} catch (error) {
  if (error.message.includes('401')) {
    console.error('❌ Authentication failed')
  } else if (error.message.includes('404')) {
    console.error('❌ Endpoint not found')
  } else {
    console.error('❌ Error:', error.message)
  }
}
```

## Weitere Ressourcen

- [WordPress REST API Reference](https://developer.wordpress.org/rest-api/reference/)
- [Nostr NIP-23 Specification](https://github.com/nostr-protocol/nips/blob/master/23.md)
- [Schema.org Documentation](https://schema.org/)
- [AMB Metadata Standard](https://dini-ag-kim.github.io/amb/)
