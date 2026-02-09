/**
 * Nostr NIP-23 Long-form Content Transformer
 * 
 * Transformiert AMB-Metadaten zu Nostr Event Format (NIP-23)
 * für dezentrales Publishing von OER-Inhalten.
 * 
 * @see https://github.com/nostr-protocol/nips/blob/master/23.md
 */

import crypto from 'crypto'

/**
 * Transformiert AMB-Metadaten zu Nostr NIP-23 Event
 * 
 * @param {Object} ambMetadata - Schema.org-konforme AMB-Metadaten
 * @param {string} content - Markdown-Content
 * @param {Object} options - Transformations-Optionen
 * @returns {Object} Nostr Event (NIP-23)
 */
export function transformToNostr(ambMetadata, content, options = {}) {
  const {
    pubkey = null,  // Öffentlicher Schlüssel des Authors
    identifier = null,  // Eindeutige ID für diesen Artikel
    publishedAt = null  // Timestamp (optional)
  } = options

  if (!pubkey) {
    throw new Error('pubkey is required for Nostr events')
  }

  // Event-Basis
  const event = {
    kind: 30023,  // Long-form Content (NIP-23)
    pubkey: pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: content
  }

  // d-tag (identifier) - erforderlich für replaceable events
  const eventId = identifier || 
    ambMetadata.id || 
    generateIdentifier(ambMetadata.name)
  
  event.tags.push(['d', eventId])

  // title tag
  if (ambMetadata.name) {
    event.tags.push(['title', ambMetadata.name])
  }

  // summary tag (description)
  if (ambMetadata.description) {
    event.tags.push(['summary', ambMetadata.description])
  }

  // published_at tag
  const publishTime = publishedAt || 
    (ambMetadata.datePublished ? new Date(ambMetadata.datePublished).getTime() / 1000 : null)
  
  if (publishTime) {
    event.tags.push(['published_at', Math.floor(publishTime).toString()])
  }

  // image tag
  if (ambMetadata.image) {
    const imageUrl = typeof ambMetadata.image === 'string' ? 
      ambMetadata.image : 
      ambMetadata.image.url || ambMetadata.image.contentUrl
    
    if (imageUrl) {
      event.tags.push(['image', imageUrl])
    }
  }

  // t tags (topic/hashtags)
  const topics = extractTopics(ambMetadata)
  topics.forEach(topic => {
    event.tags.push(['t', topic])
  })

  // Custom AMB tags
  if (ambMetadata.license) {
    event.tags.push(['license', ambMetadata.license])
  }

  if (ambMetadata.inLanguage) {
    const languages = Array.isArray(ambMetadata.inLanguage) ? 
      ambMetadata.inLanguage : [ambMetadata.inLanguage]
    languages.forEach(lang => {
      event.tags.push(['language', lang])
    })
  }

  // Learning Resource Type tags
  if (ambMetadata.learningResourceType) {
    ambMetadata.learningResourceType.forEach(type => {
      event.tags.push(['learning-resource-type', type])
    })
  }

  // Educational Level tags
  if (ambMetadata.educationalLevel) {
    ambMetadata.educationalLevel.forEach(level => {
      event.tags.push(['educational-level', level])
    })
  }

  // Creator tags (author references)
  if (ambMetadata.creator) {
    ambMetadata.creator.forEach(creator => {
      if (creator.id && creator.id.includes('orcid.org')) {
        event.tags.push(['author', 'orcid', creator.id])
      }
      if (creator.name) {
        event.tags.push(['author', 'name', creator.name])
      }
    })
  }

  // About tags (subject/topic URIs)
  if (ambMetadata.about) {
    ambMetadata.about.forEach(topic => {
      const topicUri = typeof topic === 'string' ? topic : topic['@id'] || topic.id
      if (topicUri) {
        event.tags.push(['subject', topicUri])
      }
    })
  }

  // Creative Work Status
  if (ambMetadata.creativeWorkStatus) {
    event.tags.push(['status', ambMetadata.creativeWorkStatus])
  }

  // AMB Metadata als JSON (custom tag)
  event.tags.push(['amb-metadata', JSON.stringify(ambMetadata)])

  return event
}

/**
 * Signiert ein Nostr Event
 * 
 * @param {Object} event - Unsigniertes Event
 * @param {string} privateKey - Privater Schlüssel (hex)
 * @returns {Object} Signiertes Event
 */
export function signEvent(event, privateKey) {
  // Serialize event für Signatur
  const serialized = JSON.stringify([
    0,  // Reserved for future use
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ])

  // SHA256 Hash
  const hash = crypto.createHash('sha256')
    .update(Buffer.from(serialized, 'utf8'))
    .digest()

  event.id = hash.toString('hex')

  // Signatur mit secp256k1
  // Hinweis: Für Produktion sollte eine richtige secp256k1-Library verwendet werden
  // wie z.B. 'noble-secp256k1' oder 'nostr-tools'
  
  // Placeholder - in Produktion mit echter Krypto-Library ersetzen
  event.sig = 'PLACEHOLDER_SIGNATURE_' + event.id.substring(0, 16)
  
  console.warn('⚠️ Event-Signatur ist ein Placeholder! Verwende eine echte secp256k1-Library für Produktion.')

  return event
}

/**
 * Extrahiert Topics/Hashtags aus AMB-Metadaten
 */
function extractTopics(ambMetadata) {
  const topics = new Set()

  // Learning Resource Types
  if (ambMetadata.learningResourceType) {
    ambMetadata.learningResourceType.forEach(type => {
      const label = extractLabelFromUri(type)
      if (label) topics.add(label.toLowerCase().replace(/\s+/g, '-'))
    })
  }

  // Educational Level
  if (ambMetadata.educationalLevel) {
    ambMetadata.educationalLevel.forEach(level => {
      const label = extractLabelFromUri(level)
      if (label) topics.add(label.toLowerCase().replace(/\s+/g, '-'))
    })
  }

  // About
  if (ambMetadata.about) {
    ambMetadata.about.forEach(topic => {
      if (typeof topic === 'string') {
        const label = extractLabelFromUri(topic)
        if (label) topics.add(label.toLowerCase().replace(/\s+/g, '-'))
      } else if (topic.name) {
        topics.add(topic.name.toLowerCase().replace(/\s+/g, '-'))
      }
    })
  }

  // Zusätzliche fixe Tags
  topics.add('oer')  // Open Educational Resources
  topics.add('education')

  return Array.from(topics)
}

/**
 * Extrahiert Label aus URI
 */
function extractLabelFromUri(uri) {
  if (!uri || typeof uri !== 'string') return null

  const parts = uri.split('/')
  const lastPart = parts[parts.length - 1]

  if (/^[a-z]\d+$/i.test(lastPart)) return null

  return lastPart
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .trim()
}

/**
 * Generiert eindeutigen Identifier
 */
function generateIdentifier(title) {
  if (!title) {
    return crypto.randomBytes(16).toString('hex')
  }

  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 64)
}

/**
 * Transformiert Nostr Event zurück zu AMB (für Round-Trip)
 * 
 * @param {Object} nostrEvent - Nostr Event
 * @returns {Object} AMB-Metadaten
 */
export function transformFromNostr(nostrEvent) {
  // Versuche AMB-Metadaten aus custom tag zu lesen
  const ambTag = nostrEvent.tags.find(tag => tag[0] === 'amb-metadata')
  if (ambTag && ambTag[1]) {
    try {
      return JSON.parse(ambTag[1])
    } catch (e) {
      console.warn('Failed to parse AMB metadata from tag:', e)
    }
  }

  // Fallback: Rekonstruiere aus Tags
  const ambMetadata = {
    '@context': 'https://schema.org/',
    type: 'LearningResource'
  }

  // Titel
  const titleTag = nostrEvent.tags.find(tag => tag[0] === 'title')
  if (titleTag) ambMetadata.name = titleTag[1]

  // Beschreibung
  const summaryTag = nostrEvent.tags.find(tag => tag[0] === 'summary')
  if (summaryTag) ambMetadata.description = summaryTag[1]

  // Bild
  const imageTag = nostrEvent.tags.find(tag => tag[0] === 'image')
  if (imageTag) ambMetadata.image = imageTag[1]

  // Lizenz
  const licenseTag = nostrEvent.tags.find(tag => tag[0] === 'license')
  if (licenseTag) ambMetadata.license = licenseTag[1]

  // Sprache
  const languageTags = nostrEvent.tags.filter(tag => tag[0] === 'language')
  if (languageTags.length > 0) {
    ambMetadata.inLanguage = languageTags.map(tag => tag[1])
  }

  // Veröffentlichungsdatum
  const publishedAtTag = nostrEvent.tags.find(tag => tag[0] === 'published_at')
  if (publishedAtTag) {
    const timestamp = parseInt(publishedAtTag[1]) * 1000
    ambMetadata.datePublished = new Date(timestamp).toISOString().split('T')[0]
  }

  // Learning Resource Types
  const lrtTags = nostrEvent.tags.filter(tag => tag[0] === 'learning-resource-type')
  if (lrtTags.length > 0) {
    ambMetadata.learningResourceType = lrtTags.map(tag => tag[1])
  }

  // Educational Level
  const eduTags = nostrEvent.tags.filter(tag => tag[0] === 'educational-level')
  if (eduTags.length > 0) {
    ambMetadata.educationalLevel = eduTags.map(tag => tag[1])
  }

  // About (Subjects)
  const subjectTags = nostrEvent.tags.filter(tag => tag[0] === 'subject')
  if (subjectTags.length > 0) {
    ambMetadata.about = subjectTags.map(tag => tag[1])
  }

  // Status
  const statusTag = nostrEvent.tags.find(tag => tag[0] === 'status')
  if (statusTag) ambMetadata.creativeWorkStatus = statusTag[1]

  return ambMetadata
}

/**
 * Nostr Relay Client Helper
 */
export class NostrClient {
  constructor(relayUrls = []) {
    this.relayUrls = relayUrls.length > 0 ? relayUrls : [
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.nostr.band'
    ]
    this.connections = new Map()
  }

  /**
   * Verbindet zu Relays
   */
  async connect() {
    const promises = this.relayUrls.map(async url => {
      try {
        const ws = new WebSocket(url)
        
        await new Promise((resolve, reject) => {
          ws.onopen = () => {
            this.connections.set(url, ws)
            console.log(`✅ Connected to ${url}`)
            resolve()
          }
          ws.onerror = reject
          setTimeout(reject, 5000)  // Timeout nach 5 Sekunden
        })
      } catch (error) {
        console.warn(`⚠️ Failed to connect to ${url}:`, error.message)
      }
    })

    await Promise.allSettled(promises)
    
    if (this.connections.size === 0) {
      throw new Error('Failed to connect to any relay')
    }
  }

  /**
   * Published Event zu Relays
   */
  async publishEvent(event) {
    const message = JSON.stringify(['EVENT', event])
    const results = []

    for (const [url, ws] of this.connections) {
      try {
        ws.send(message)
        results.push({ relay: url, success: true })
      } catch (error) {
        results.push({ relay: url, success: false, error: error.message })
      }
    }

    return results
  }

  /**
   * Schließt alle Verbindungen
   */
  close() {
    for (const [url, ws] of this.connections) {
      ws.close()
      console.log(`🔌 Disconnected from ${url}`)
    }
    this.connections.clear()
  }
}

/**
 * Convenience-Funktion für kompletten Workflow
 */
export async function publishToNostr(ambMetadata, content, nostrConfig, options = {}) {
  const {
    relayUrls = [],
    privateKey = null,
    pubkey = null
  } = nostrConfig

  if (!pubkey) {
    throw new Error('pubkey is required')
  }

  // Transformiere zu Nostr-Format
  const event = transformToNostr(ambMetadata, content, { ...options, pubkey })

  // Signiere Event
  if (privateKey) {
    signEvent(event, privateKey)
  } else {
    console.warn('⚠️ Event nicht signiert - privateKey fehlt')
  }

  // Erstelle Client und verbinde
  const client = new NostrClient(relayUrls)
  await client.connect()

  // Publiziere Event
  const results = await client.publishEvent(event)

  // Schließe Verbindungen
  client.close()

  return {
    event,
    results
  }
}
