import { Relay } from 'applesauce-relay'
import { firstValueFrom, timeout } from 'rxjs'
import { loadConfig } from '../core/config.ts'
import { createBunkerSigner } from '../core/signer.ts'
import { AMB_RELAYS, ARTICLE_RELAYS } from '../core/relays.ts'

interface RelayProbe {
  url: string
  ok: boolean
  message?: string
}

async function pingRelay(url: string, timeoutMs = 5_000): Promise<RelayProbe> {
  const relay = new Relay(url)
  try {
    await firstValueFrom(
      relay.req([{ kinds: [1], limit: 0 }]).pipe(timeout({ first: timeoutMs })),
    )
    return { url, ok: true }
  } catch (err) {
    return {
      url,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

async function checkBunker(): Promise<{ ok: boolean; reason?: string }> {
  let cfg
  try {
    cfg = loadConfig()
  } catch (err) {
    return {
      ok: false,
      reason: `config: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  console.log('--- Bunker ---')
  console.log(`  bunker url: ${cfg.bunkerUrl.slice(0, 40)}…`)
  console.log(`  expected:   ${cfg.authorPubkeyHex}`)

  try {
    const signer = await createBunkerSigner(cfg.bunkerUrl, {
      clientSecretHex: cfg.clientSecretHex,
    })
    const got = await signer.getPublicKey()
    if (got !== cfg.authorPubkeyHex) {
      return {
        ok: false,
        reason: `Bunker liefert pubkey ${got}, erwartet ${cfg.authorPubkeyHex}`,
      }
    }
    console.log('  ✅ Bunker-Pubkey passt')
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      reason: `Bunker connect failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

export async function runCheck(): Promise<number> {
  let exitCode = 0

  const bunker = await checkBunker()
  if (!bunker.ok) {
    console.error(`  ❌ ${bunker.reason}`)
    exitCode = 1
  }

  console.log('\n--- Article-Relays (Kind 30023) ---')
  const articleProbes = await Promise.all(ARTICLE_RELAYS.map((u) => pingRelay(u)))
  let articleOk = 0
  for (const p of articleProbes) {
    console.log(`  ${p.ok ? '✅' : '❌'} ${p.url}${p.ok ? '' : ` — ${p.message}`}`)
    if (p.ok) articleOk++
  }
  if (articleOk === 0) {
    console.error('  ❌ kein Article-Relay erreichbar')
    exitCode = 1
  } else if (articleOk < ARTICLE_RELAYS.length) {
    console.warn(`  ⚠️  nur ${articleOk}/${ARTICLE_RELAYS.length} Article-Relays erreichbar`)
  }

  console.log('\n--- AMB-Relay (Kind 30142) ---')
  const ambProbes = await Promise.all(AMB_RELAYS.map((u) => pingRelay(u)))
  let ambOk = 0
  for (const p of ambProbes) {
    console.log(`  ${p.ok ? '✅' : '❌'} ${p.url}${p.ok ? '' : ` — ${p.message}`}`)
    if (p.ok) ambOk++
  }
  if (ambOk === 0) {
    console.error('  ❌ AMB-Relay nicht erreichbar')
    exitCode = 1
  }

  console.log(`\nExit: ${exitCode}`)
  return exitCode
}

if (import.meta.main) {
  const code = await runCheck()
  Deno.exit(code)
}
