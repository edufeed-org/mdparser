import { join } from 'jsr:@std/path@^1.0.0'
import type { PostResult, PostStatus } from '../subcommands/publish.ts'

export interface PostLog {
  slug: string
  lang: string
  type: 'post' | 'page'
  path: string
  status: PostStatus
  reason?: string
  articleEventId?: string
  ambEventId?: string
  articleAcks?: { relay: string; ok: boolean; message?: string }[]
  ambAcks?: { relay: string; ok: boolean; message?: string }[]
}

export interface RunSummary {
  runId: string
  mode: string
  startedAt: string
  finishedAt: string
  contentRoot: string
  posts: PostLog[]
  counts: { ok: number; skipped: number; failed: number; total: number }
  exitCode: number
}

export interface LoggerOpts {
  mode: string
  contentRoot: string
  logDir?: string
}

export interface Logger {
  record(result: PostResult): void
  finish(exitCode: number): Promise<string>
}

function isoCompact(d: Date): string {
  return d.toISOString().replace(/[:.]/g, '-')
}

function toPostLog(r: PostResult): PostLog {
  return {
    slug: r.file.slug,
    lang: r.file.lang,
    type: r.file.type,
    path: r.file.path,
    status: r.status,
    reason: r.reason,
    articleEventId: r.articleEventId,
    ambEventId: r.ambEventId,
    articleAcks: r.articleAcks?.map((a) => ({
      relay: a.relay,
      ok: a.ok,
      message: a.message,
    })),
    ambAcks: r.ambAcks?.map((a) => ({ relay: a.relay, ok: a.ok, message: a.message })),
  }
}

export function createLogger(opts: LoggerOpts): Logger {
  const startedAt = new Date()
  const runId = isoCompact(startedAt)
  const logDir = opts.logDir ?? './logs'
  const posts: PostLog[] = []

  return {
    record(result: PostResult) {
      posts.push(toPostLog(result))
    },
    async finish(exitCode: number): Promise<string> {
      const finishedAt = new Date()
      const summary: RunSummary = {
        runId,
        mode: opts.mode,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        contentRoot: opts.contentRoot,
        posts,
        counts: {
          ok: posts.filter((p) => p.status === 'ok').length,
          skipped: posts.filter((p) => p.status.startsWith('skipped')).length,
          failed: posts.filter((p) => p.status.startsWith('failed')).length,
          total: posts.length,
        },
        exitCode,
      }
      await Deno.mkdir(logDir, { recursive: true })
      const file = join(logDir, `publish-${runId}.json`)
      await Deno.writeTextFile(file, JSON.stringify(summary, null, 2))
      return file
    },
  }
}
