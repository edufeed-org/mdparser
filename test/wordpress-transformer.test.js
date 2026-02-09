/**
 * Tests für WordPress Transformer
 */

import { test } from 'node:test'
import assert from 'node:assert'
import {
  transformToWordPress,
  transformFromWordPress
} from '../src/transformers/wordpress-transformer.js'

test('WordPress Transformer - Basic Transformation', () => {
  const ambMetadata = {
    '@context': 'https://schema.org/',
    type: 'LearningResource',
    name: 'Test Article',
    description: 'This is a test description',
    license: 'https://creativecommons.org/licenses/by/4.0/',
    datePublished: '2025-10-01',
    inLanguage: ['de'],
    creator: [
      {
        type: 'Person',
        name: 'John Doe',
        id: 'https://orcid.org/0000-0001-2345-6789'
      }
    ],
    learningResourceType: ['https://w3id.org/kim/hcrt/text'],
    educationalLevel: ['https://w3id.org/kim/educationalLevel/level_A']
  }

  const content = '# Test\n\nThis is test content.'

  const wpPost = transformToWordPress(ambMetadata, content, {
    status: 'publish',
    authorId: 1
  })

  assert.strictEqual(wpPost.title, 'Test Article')
  assert.strictEqual(wpPost.status, 'publish')
  assert.strictEqual(wpPost.excerpt, 'This is a test description')
  assert.ok(wpPost.content.includes('<h1>Test</h1>'))
  assert.ok(Array.isArray(wpPost.tags))
  assert.strictEqual(wpPost.meta.amb_license, 'https://creativecommons.org/licenses/by/4.0/')
})

test('WordPress Transformer - Tags Extraction', () => {
  const ambMetadata = {
    name: 'Test',
    learningResourceType: [
      'https://w3id.org/kim/hcrt/text',
      'https://w3id.org/kim/hcrt/web_page'
    ],
    educationalLevel: ['https://w3id.org/kim/educationalLevel/level_A']
  }

  const wpPost = transformToWordPress(ambMetadata, '')

  assert.ok(wpPost.tags.length > 0)
  assert.ok(wpPost.tags.includes('text') || wpPost.tags.includes('web page'))
})

test('WordPress Transformer - Custom Fields', () => {
  const ambMetadata = {
    name: 'Test',
    type: 'LearningResource',
    license: 'CC-BY-4.0',
    creativeWorkStatus: 'Published',
    creator: [{ name: 'Jane Doe' }]
  }

  const wpPost = transformToWordPress(ambMetadata, '', { includeCustomFields: true })

  assert.strictEqual(wpPost.meta.amb_type, 'LearningResource')
  assert.strictEqual(wpPost.meta.amb_license, 'CC-BY-4.0')
  assert.strictEqual(wpPost.meta.amb_creative_work_status, 'Published')
  assert.ok(wpPost.meta.amb_creators)
})

test('WordPress Transformer - Round-Trip', () => {
  const originalAMB = {
    '@context': 'https://schema.org/',
    type: 'LearningResource',
    name: 'Round Trip Test',
    description: 'Testing round-trip conversion',
    license: 'CC-BY-4.0',
    datePublished: '2025-10-01'
  }

  const wpPost = transformToWordPress(originalAMB, '')
  
  // Simuliere WordPress Response-Format
  wpPost.title = { rendered: wpPost.title }
  wpPost.excerpt = { rendered: wpPost.excerpt }

  const reconstructedAMB = transformFromWordPress(wpPost)

  assert.strictEqual(reconstructedAMB.name, originalAMB.name)
  assert.strictEqual(reconstructedAMB.license, originalAMB.license)
  assert.strictEqual(reconstructedAMB.type, originalAMB.type)
})

test('WordPress Transformer - Excerpt Generation', () => {
  const ambMetadata = { name: 'Test' }
  const longContent = 'Lorem ipsum '.repeat(50)

  const wpPost = transformToWordPress(ambMetadata, longContent)

  assert.ok(wpPost.excerpt.length <= 163) // 160 + '...'
  assert.ok(wpPost.excerpt.endsWith('...'))
})

test('WordPress Transformer - HTML Conversion', () => {
  const ambMetadata = { name: 'Test' }
  const markdown = '## Heading\n\n**Bold** and *italic*\n\n[Link](https://example.com)'

  const wpPost = transformToWordPress(ambMetadata, markdown, { convertToHtml: true })

  assert.ok(wpPost.content.includes('<h2>Heading</h2>'))
  assert.ok(wpPost.content.includes('<strong>Bold</strong>'))
  assert.ok(wpPost.content.includes('<em>italic</em>'))
  assert.ok(wpPost.content.includes('<a href="https://example.com">Link</a>'))
})

test('WordPress Transformer - Featured Media', () => {
  const ambMetadata = {
    name: 'Test',
    image: 'https://example.com/image.jpg'
  }

  const wpPost = transformToWordPress(ambMetadata, '')

  assert.strictEqual(wpPost.featured_media, 'https://example.com/image.jpg')
})

test('WordPress Transformer - Image Object', () => {
  const ambMetadata = {
    name: 'Test',
    image: {
      url: 'https://example.com/image.jpg',
      name: 'Test Image'
    }
  }

  const wpPost = transformToWordPress(ambMetadata, '')

  assert.strictEqual(wpPost.featured_media, 'https://example.com/image.jpg')
})
