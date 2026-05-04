import { join, resolve } from 'jsr:@std/path@^1.0.0'
import { allContentFiles, type ContentFile } from './discover.ts'

export interface GitRunner {
  diffNames(args: { from: string; to: string; cwd: string }): Promise<string[]>
}

export interface DiffArgs {
  from: string
  to: string
  contentRoot: string
  runner?: GitRunner
}

const NULL_SHA = '0000000000000000000000000000000000000000'

export const defaultGitRunner: GitRunner = {
  async diffNames({ from, to, cwd }) {
    const cmd = new Deno.Command('git', {
      args: ['-C', cwd, 'diff', '--name-only', '--relative', from, to],
      stdout: 'piped',
      stderr: 'piped',
    })
    const { code, stdout, stderr } = await cmd.output()
    if (code !== 0) {
      const msg = new TextDecoder().decode(stderr).trim()
      throw new Error(`git diff failed (exit ${code}): ${msg}`)
    }
    return new TextDecoder().decode(stdout)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  },
}

export async function changedContentFiles(args: DiffArgs): Promise<ContentFile[]> {
  if (!args.from || args.from === NULL_SHA) {
    throw new Error(
      `change-detection: from-ref ist leer oder null-SHA (${args.from || '<empty>'}). ` +
        `Beim ersten Push auf einen Branch ist event.before all-zeros — in dem Fall ` +
        `--force-all verwenden statt diff.`,
    )
  }
  if (!args.to) {
    throw new Error('change-detection: to-ref fehlt')
  }

  const runner = args.runner ?? defaultGitRunner
  const contentRoot = resolve(args.contentRoot)

  const changedRel = await runner.diffNames({
    from: args.from,
    to: args.to,
    cwd: contentRoot,
  })
  if (changedRel.length === 0) return []

  const changedAbs = new Set(changedRel.map((r) => resolve(join(contentRoot, r))))

  const all = await allContentFiles(contentRoot)
  const out: ContentFile[] = []
  for (const cf of all) {
    const dir = cf.path.replace(/\/index\.md$/, '/')
    let touched = false
    for (const changed of changedAbs) {
      if (changed === cf.path || changed.startsWith(dir)) {
        touched = true
        break
      }
    }
    if (touched) out.push(cf)
  }
  return out
}
