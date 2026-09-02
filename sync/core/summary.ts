import type { PostResult } from '../subcommands/publish.ts'

export interface SummaryInput {
  mode: string
  dryRun: boolean
  results: PostResult[]
}

/**
 * Ein Lauf ist "still gescheitert", wenn Dateien im Diff lagen, aber kein
 * einziger Post publiziert wurde. Genau dieser Fall lief bisher gruen durch:
 * Redaktion pusht einen Post, die Action meldet Erfolg, auf Nostr kommt nichts an.
 */
export function isSilentNoop(results: PostResult[]): boolean {
  if (results.length === 0) return false
  return !results.some((r) => r.status === 'ok')
}

function line(r: PostResult): string {
  const where = `${r.file.lang}/${r.file.slug}`
  return r.reason ? `${where} — ${r.reason}` : where
}

/** Markdown fuer die GitHub-Job-Summary (Step Summary). */
export function renderSummary(input: SummaryInput): string {
  const { mode, dryRun, results } = input
  const ok = results.filter((r) => r.status === 'ok')
  const skipped = results.filter((r) => r.status.startsWith('skipped'))
  const failed = results.filter((r) => r.status.startsWith('failed'))
  const recommended = ok.filter((r) => (r.missingRecommended?.length ?? 0) > 0)

  const out: string[] = []
  out.push('## Nostr-Sync')
  out.push('')
  out.push(`Modus: \`${mode}\`${dryRun ? ' (dry-run)' : ''} · Dateien: ${results.length}`)
  out.push('')

  if (isSilentNoop(results)) {
    out.push(
      `> [!WARNING]`,
      `> **${results.length} Datei(en) geaendert, aber nichts publiziert.**`,
      `> Die Aenderung ist nicht auf den Relays angekommen. Gruende unten.`,
      '',
    )
  }

  out.push('| | Anzahl |')
  out.push('|---|---|')
  out.push(`| ✅ publiziert | ${ok.length} |`)
  out.push(`| ⏭️ uebersprungen | ${skipped.length} |`)
  out.push(`| ❌ fehlgeschlagen | ${failed.length} |`)
  out.push('')

  if (failed.length > 0) {
    out.push('### ❌ Fehlgeschlagen')
    for (const r of failed) out.push(`- ${line(r)}`)
    out.push('')
  }

  if (skipped.length > 0) {
    out.push('### ⏭️ Nicht publiziert')
    for (const r of skipped) out.push(`- ${line(r)}`)
    out.push('')
  }

  if (ok.length > 0) {
    out.push('### ✅ Publiziert')
    for (const r of ok) {
      const acks = r.articleAcks
        ? ` (${r.articleAcks.filter((a) => a.ok).length}/${r.articleAcks.length} acks)`
        : ''
      out.push(`- ${r.file.lang}/${r.file.slug}${acks}`)
    }
    out.push('')
  }

  if (recommended.length > 0) {
    out.push('### 💡 Publiziert, aber Metadaten unvollstaendig')
    out.push('')
    out.push('Diese Posts sind auf Nostr, es fehlen aber empfohlene AMB-Felder:')
    out.push('')
    for (const r of recommended) {
      out.push(`- ${r.file.lang}/${r.file.slug} — fehlt: ${r.missingRecommended!.join(', ')}`)
    }
    out.push('')
  }

  // Ein Relay, das dauerhaft nicht ackt, faellt sonst niemandem auf, solange
  // MIN_RELAY_ACKS erfuellt ist.
  const relayFails = new Map<string, number>()
  for (const r of ok) {
    for (const a of r.articleAcks ?? []) {
      if (!a.ok) relayFails.set(a.relay, (relayFails.get(a.relay) ?? 0) + 1)
    }
  }
  if (relayFails.size > 0) {
    out.push('### 📡 Relays ohne Bestaetigung')
    for (const [relay, n] of [...relayFails].sort((a, b) => b[1] - a[1])) {
      out.push(`- \`${relay}\` — ${n}/${ok.length} Events nicht bestaetigt`)
    }
    out.push('')
  }

  return out.join('\n')
}

/**
 * Schreibt die Summary nach GITHUB_STEP_SUMMARY, wenn die Env-Var gesetzt ist.
 * Lokal (ohne die Var) passiert nichts.
 */
export async function writeStepSummary(
  markdown: string,
  read: (k: string) => string | undefined = (k) => Deno.env.get(k),
): Promise<boolean> {
  const target = read('GITHUB_STEP_SUMMARY')
  if (!target) return false
  await Deno.writeTextFile(target, markdown + '\n', { append: true })
  return true
}
