import { assertEquals } from 'jsr:@std/assert@^1.0.0'
import type { CommonMetadata, ParsedMarkdown } from './parser.ts'
import { validatePost } from './validation.ts'

function fullMetadata(): CommonMetadata {
  return {
    id: 'https://oer.community/foo',
    name: 'Foo',
    description: 'desc',
    license: 'https://creativecommons.org/licenses/by/4.0/',
    creator: [{ givenName: 'A', familyName: 'B' }],
    inLanguage: ['de'],
    datePublished: '2026-01-01',
    keywords: ['k1'],
  }
}

function withMetadata(md: CommonMetadata): ParsedMarkdown {
  return { metadata: md, content: 'hi' }
}

Deno.test('validatePost — vollständiger Post → ok', () => {
  const r = validatePost(withMetadata(fullMetadata()))
  assertEquals(r.status, 'ok')
  assertEquals(r.missing, [])
})

Deno.test('validatePost — null (parser hat nichts geliefert) → skip-empty-frontmatter', () => {
  const r = validatePost(null)
  assertEquals(r.status, 'skip-empty-frontmatter')
  assertEquals(r.missing, [])
})

Deno.test('validatePost — leeres metadata-Objekt → skip-empty-frontmatter', () => {
  const r = validatePost(withMetadata({}))
  assertEquals(r.status, 'skip-empty-frontmatter')
  assertEquals(r.missing.length, 8)
})

Deno.test('validatePost — manche Pflichtfelder fehlen → skip-missing-fields', () => {
  const md = fullMetadata()
  delete md.keywords
  delete md.creator
  const r = validatePost(withMetadata(md))
  assertEquals(r.status, 'skip-missing-fields')
  assertEquals(r.missing.sort(), ['creator', 'keywords'])
})

Deno.test('validatePost — leeres Array bei keywords zählt als fehlend', () => {
  const md = fullMetadata()
  md.keywords = []
  const r = validatePost(withMetadata(md))
  assertEquals(r.status, 'skip-missing-fields')
  assertEquals(r.missing, ['keywords'])
})

Deno.test('validatePost — id ohne oer.community-Prefix → error', () => {
  const md = fullMetadata()
  md.id = 'https://example.com/foo'
  const r = validatePost(withMetadata(md))
  assertEquals(r.status, 'error')
  assertEquals(r.reason?.includes('oer.community'), true)
})
