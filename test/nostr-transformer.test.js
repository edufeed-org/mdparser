/**
 * Tests für Nostr Transformer
 */

import { test } from 'node:test'
import assert from 'node:assert'
import {
  transformToNostr,
  transformFromNostr
} from '../src/transformers/nostr-transformer.js'

test('Nostr Transformer - Basic Transformation', () => {
  const ambMetadata = {
    '@context': 'https://schema.org/',
    type: 'LearningResource',
    name: 'Test Article',
    description: 'This is a test description',
    license: 'https://creativecommons.org/licenses/by/4.0/',
    datePublished: '2025-10-01',
    inLanguage: ['de'],
    image: 'https://example.com/image.jpg',
    creator: [
      {
        type: 'Person',
        name: 'John Doe',
        id: 'https://orcid.org/0000-0001-2345-6789'
      }
    ]
  }

  const content = '# Test\n\nThis is test content.'
  const pubkey = '1234567890abcdef'

  const event = transformToNostr(ambMetadata, content, { pubkey })

  assert.strictEqual(event.kind, 30023)
  assert.strictEqual(event.pubkey, pubkey)
  assert.strictEqual(event.content, content)
  assert.ok(Array.isArray(event.tags))
  assert.ok(event.created_at > 0)
})

test('Nostr Transformer - Required d-tag', () => {
  const ambMetadata = { name: 'Test' }
  const pubkey = '1234567890abcdef'

  const event = transformToNostr(ambMetadata, '', { pubkey })

  const dTag = event.tags.find(tag => tag[0] === 'd')
  assert.ok(dTag)
  assert.ok(dTag[1].length > 0)
})

test('Nostr Transformer - Title Tag', () => {
  const ambMetadata = { name: 'My Test Article' }
  const pubkey = '1234567890abcdef'

  const event = transformToNostr(ambMetadata, '', { pubkey })

  const titleTag = event.tags.find(tag => tag[0] === 'title')
  assert.ok(titleTag)
  assert.strictEqual(titleTag[1], 'My Test Article')
})

test('Nostr Transformer - Summary Tag', () => {
  const ambMetadata = { 
    name: 'Test',
    description: 'This is a description'
  }
  const pubkey = '1234567890abcdef'

  const event = transformToNostr(ambMetadata, '', { pubkey })

  const summaryTag = event.tags.find(tag => tag[0] === 'summary')
  assert.ok(summaryTag)
  assert.strictEqual(summaryTag[1], 'This is a description')
})

test('Nostr Transformer - Published At Tag', () => {
  const ambMetadata = { 
    name: 'Test',
    datePublished: '2025-10-01'
  }
  const pubkey = '1234567890abcdef'

  const event = transformToNostr(ambMetadata, '', { pubkey })

  const publishedAtTag = event.tags.find(tag => tag[0] === 'published_at')
  assert.ok(publishedAtTag)
  assert.ok(parseInt(publishedAtTag[1]) > 0)
})

test('Nostr Transformer - Image Tag', () => {
  const ambMetadata = { 
    name: 'Test',
    image: 'https://example.com/image.jpg'
  }
  const pubkey = '1234567890abcdef'

  const event = transformToNostr(ambMetadata, '', { pubkey })

  const imageTag = event.tags.find(tag => tag[0] === 'image')
  assert.ok(imageTag)
  assert.strictEqual(imageTag[1], 'https://example.com/image.jpg')
})

test('Nostr Transformer - Topic Tags', () => {
  const ambMetadata = { 
    name: 'Test',
    learningResourceType: ['https://w3id.org/kim/hcrt/text']
  }
  const pubkey = '1234567890abcdef'

  const event = transformToNostr(ambMetadata, '', { pubkey })

  const topicTags = event.tags.filter(tag => tag[0] === 't')
  assert.ok(topicTags.length > 0)
  assert.ok(topicTags.some(tag => tag[1] === 'oer'))
  assert.ok(topicTags.some(tag => tag[1] === 'education'))
})

test('Nostr Transformer - License Tag', () => {
  const ambMetadata = { 
    name: 'Test',
    license: 'CC-BY-4.0'
  }
  const pubkey = '1234567890abcdef'

  const event = transformToNostr(ambMetadata, '', { pubkey })

  const licenseTag = event.tags.find(tag => tag[0] === 'license')
  assert.ok(licenseTag)
  assert.strictEqual(licenseTag[1], 'CC-BY-4.0')
})

test('Nostr Transformer - Language Tags', () => {
  const ambMetadata = { 
    name: 'Test',
    inLanguage: ['de', 'en']
  }
  const pubkey = '1234567890abcdef'

  const event = transformToNostr(ambMetadata, '', { pubkey })

  const languageTags = event.tags.filter(tag => tag[0] === 'language')
  assert.strictEqual(languageTags.length, 2)
  assert.ok(languageTags.some(tag => tag[1] === 'de'))
  assert.ok(languageTags.some(tag => tag[1] === 'en'))
})

test('Nostr Transformer - Learning Resource Type Tags', () => {
  const ambMetadata = { 
    name: 'Test',
    learningResourceType: [
      'https://w3id.org/kim/hcrt/text',
      'https://w3id.org/kim/hcrt/video'
    ]
  }
  const pubkey = '1234567890abcdef'

  const event = transformToNostr(ambMetadata, '', { pubkey })

  const lrtTags = event.tags.filter(tag => tag[0] === 'learning-resource-type')
  assert.strictEqual(lrtTags.length, 2)
})

test('Nostr Transformer - Educational Level Tags', () => {
  const ambMetadata = { 
    name: 'Test',
    educationalLevel: ['https://w3id.org/kim/educationalLevel/level_A']
  }
  const pubkey = '1234567890abcdef'

  const event = transformToNostr(ambMetadata, '', { pubkey })

  const eduTags = event.tags.filter(tag => tag[0] === 'educational-level')
  assert.strictEqual(eduTags.length, 1)
})

test('Nostr Transformer - Author Tags', () => {
  const ambMetadata = { 
    name: 'Test',
    creator: [
      {
        name: 'John Doe',
        id: 'https://orcid.org/0000-0001-2345-6789'
      }
    ]
  }
  const pubkey = '1234567890abcdef'

  const event = transformToNostr(ambMetadata, '', { pubkey })

  const authorTags = event.tags.filter(tag => tag[0] === 'author')
  assert.ok(authorTags.length >= 2) // name + orcid
  
  const orcidTag = authorTags.find(tag => tag[1] === 'orcid')
  assert.ok(orcidTag)
  assert.ok(orcidTag[2].includes('orcid.org'))
})

test('Nostr Transformer - Subject Tags', () => {
  const ambMetadata = { 
    name: 'Test',
    about: [
      'https://w3id.org/kim/hochschulfaechersystematik/n079',
      { id: 'https://example.com/topic/123' }
    ]
  }
  const pubkey = '1234567890abcdef'

  const event = transformToNostr(ambMetadata, '', { pubkey })

  const subjectTags = event.tags.filter(tag => tag[0] === 'subject')
  assert.strictEqual(subjectTags.length, 2)
})

test('Nostr Transformer - AMB Metadata Tag', () => {
  const ambMetadata = { 
    name: 'Test',
    type: 'LearningResource',
    license: 'CC-BY-4.0'
  }
  const pubkey = '1234567890abcdef'

  const event = transformToNostr(ambMetadata, '', { pubkey })

  const ambTag = event.tags.find(tag => tag[0] === 'amb-metadata')
  assert.ok(ambTag)
  
  const parsed = JSON.parse(ambTag[1])
  assert.strictEqual(parsed.name, 'Test')
  assert.strictEqual(parsed.type, 'LearningResource')
})

test('Nostr Transformer - Round-Trip', () => {
  const originalAMB = {
    '@context': 'https://schema.org/',
    type: 'LearningResource',
    name: 'Round Trip Test',
    description: 'Testing round-trip conversion',
    license: 'CC-BY-4.0',
    datePublished: '2025-10-01',
    inLanguage: ['de']
  }

  const pubkey = '1234567890abcdef'
  const event = transformToNostr(originalAMB, '', { pubkey })
  const reconstructedAMB = transformFromNostr(event)

  assert.strictEqual(reconstructedAMB.name, originalAMB.name)
  assert.strictEqual(reconstructedAMB.description, originalAMB.description)
  assert.strictEqual(reconstructedAMB.license, originalAMB.license)
  assert.strictEqual(reconstructedAMB.type, originalAMB.type)
})

test('Nostr Transformer - Custom Identifier', () => {
  const ambMetadata = { name: 'Test' }
  const pubkey = '1234567890abcdef'
  const customId = 'my-custom-id-123'

  const event = transformToNostr(ambMetadata, '', { 
    pubkey, 
    identifier: customId 
  })

  const dTag = event.tags.find(tag => tag[0] === 'd')
  assert.strictEqual(dTag[1], customId)
})

test('Nostr Transformer - Requires Pubkey', () => {
  const ambMetadata = { name: 'Test' }

  assert.throws(() => {
    transformToNostr(ambMetadata, '')
  }, /pubkey is required/)
})
