import { assertEquals, assertRejects } from 'jsr:@std/assert@^1.0.0'
import { join } from 'jsr:@std/path@^1.0.0'
import { changedContentFiles, type GitRunner } from './change-detection.ts'

async function buildFixture(): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: 'mdparser-changes-' })
  const files = [
    'de/posts/post-a/index.md',
    'de/posts/post-a/cover.jpg',
    'de/posts/post-b/index.md',
    'de/impressum/index.md',
    'de/oer-und-oep/lernmodul/index.md',
    'en/posts/post-a/index.md',
  ]
  for (const rel of files) {
    const abs = join(root, rel)
    await Deno.mkdir(join(abs, '..'), { recursive: true })
    await Deno.writeTextFile(abs, '')
  }
  return root
}

function fakeRunner(diff: string[]): GitRunner {
  return { diffNames: () => Promise.resolve(diff) }
}

Deno.test('changedContentFiles — geänderte index.md liefert nur diesen Post', async () => {
  const root = await buildFixture()
  try {
    const out = await changedContentFiles({
      from: 'HEAD~1',
      to: 'HEAD',
      contentRoot: root,
      runner: fakeRunner(['de/posts/post-a/index.md']),
    })
    assertEquals(out.map((c) => `${c.lang}/${c.slug}`), ['de/post-a'])
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('changedContentFiles — Asset-Änderung im Post-Verzeichnis triggert Post', async () => {
  const root = await buildFixture()
  try {
    const out = await changedContentFiles({
      from: 'HEAD~1',
      to: 'HEAD',
      contentRoot: root,
      runner: fakeRunner(['de/posts/post-a/cover.jpg']),
    })
    assertEquals(out.map((c) => `${c.type}:${c.lang}/${c.slug}`), ['post:de/post-a'])
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('changedContentFiles — geschachtelte Page wird erkannt', async () => {
  const root = await buildFixture()
  try {
    const out = await changedContentFiles({
      from: 'HEAD~1',
      to: 'HEAD',
      contentRoot: root,
      runner: fakeRunner(['de/oer-und-oep/lernmodul/index.md']),
    })
    assertEquals(
      out.map((c) => `${c.type}:${c.lang}/${c.slug}`),
      ['page:de/oer-und-oep/lernmodul'],
    )
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('changedContentFiles — mehrere Änderungen in einem Lauf', async () => {
  const root = await buildFixture()
  try {
    const out = await changedContentFiles({
      from: 'HEAD~5',
      to: 'HEAD',
      contentRoot: root,
      runner: fakeRunner([
        'de/posts/post-a/index.md',
        'de/posts/post-b/cover.jpg',
        'en/posts/post-a/index.md',
        'README.md',
      ]),
    })
    const labels = out.map((c) => `${c.lang}/${c.slug}`).sort()
    assertEquals(labels, ['de/post-a', 'de/post-b', 'en/post-a'])
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('changedContentFiles — keine Änderungen → leere Liste', async () => {
  const root = await buildFixture()
  try {
    const out = await changedContentFiles({
      from: 'HEAD~1',
      to: 'HEAD',
      contentRoot: root,
      runner: fakeRunner([]),
    })
    assertEquals(out, [])
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('changedContentFiles — Änderung außerhalb des content-Layouts wird ignoriert', async () => {
  const root = await buildFixture()
  try {
    const out = await changedContentFiles({
      from: 'HEAD~1',
      to: 'HEAD',
      contentRoot: root,
      runner: fakeRunner(['some/random/file.txt', 'README.md']),
    })
    assertEquals(out, [])
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('changedContentFiles — null-SHA als from wirft', async () => {
  await assertRejects(
    () =>
      changedContentFiles({
        from: '0'.repeat(40),
        to: 'HEAD',
        contentRoot: '/tmp/irrelevant',
        runner: fakeRunner([]),
      }),
    Error,
    'null-SHA',
  )
})

Deno.test('changedContentFiles — leeres from wirft', async () => {
  await assertRejects(
    () =>
      changedContentFiles({
        from: '',
        to: 'HEAD',
        contentRoot: '/tmp/irrelevant',
        runner: fakeRunner([]),
      }),
    Error,
    'leer oder null-SHA',
  )
})
