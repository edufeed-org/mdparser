/**
 * Batch-Test: Analysiert mehrere Posts aus dem Repository
 * und zeigt Statistiken über die Metadaten-Qualität
 */

import { createForgejoClient, parseMarkdownString, validateAMBMetadata } from './src/index.js'

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function print(text, color = 'reset') {
  console.log(`${colors[color]}${text}${colors.reset}`)
}

async function testMultiplePosts() {
  print('\n🔍 BATCH-TEST: Mehrere Posts analysieren\n', 'bright')
  
  const client = createForgejoClient()
  
  // Alle Posts abrufen
  print('📡 Rufe alle Posts ab...', 'cyan')
  const allPosts = await client.listPosts()
  print(`✅ ${allPosts.length} Posts gefunden\n`, 'green')
  
  // Alle Posts testen
  const postsToTest = allPosts
  
  const results = []
  const stats = {
    total: 0,
    withLicense: 0,
    withCreator: 0,
    withOrcid: 0,
    withRor: 0,
    withAbout: 0,
    withLearningResourceType: 0,
    withEducationalLevel: 0,
    valid: 0,
    avgContentLength: 0,
    errors: []
  }
  
  print('🔬 Analysiere Posts...\n', 'cyan')
  
  for (let i = 0; i < postsToTest.length; i++) {
    const post = postsToTest[i]
    const num = `[${i + 1}/${postsToTest.length}]`
    
    try {
      const markdown = await client.getPostContent(post.name)
      const result = await parseMarkdownString(markdown)
      
      stats.total++
      stats.avgContentLength += result.content.length
      
      const meta = result.metadata
      const validation = validateAMBMetadata(meta)
      
      // Statistiken sammeln
      if (meta.license) stats.withLicense++
      if (meta.creator && meta.creator.length > 0) {
        stats.withCreator++
        if (meta.creator.some(c => c.id && c.id.includes('orcid'))) stats.withOrcid++
        if (meta.creator.some(c => c.affiliation?.id && c.affiliation.id.includes('ror'))) stats.withRor++
      }
      if (meta.about && meta.about.length > 0) stats.withAbout++
      if (meta.learningResourceType && meta.learningResourceType.length > 0) stats.withLearningResourceType++
      if (meta.educationalLevel && meta.educationalLevel.length > 0) stats.withEducationalLevel++
      if (validation.valid) stats.valid++
      
      // Detaillierte Ausgabe
      const status = validation.valid ? '✅' : '⚠️'
      console.log(`${status} ${num} ${post.name}`)
      console.log(`   Titel: ${meta.name || 'N/A'}`)
      console.log(`   Lizenz: ${meta.license ? '✅' : '❌'}`)
      console.log(`   Creator: ${meta.creator?.length || 0} (ORCID: ${meta.creator?.some(c => c.id?.includes('orcid')) ? '✅' : '❌'})`)
      console.log(`   About: ${meta.about?.length || 0} Themen`)
      console.log(`   LearningResourceType: ${meta.learningResourceType?.length || 0}`)
      console.log(`   Content: ${result.content.length} Zeichen`)
      console.log(`   Validierung: ${validation.valid ? 'GÜLTIG' : `${validation.errors.length} Fehler`}`)
      
      if (validation.errors.length > 0) {
        console.log(`   Fehler: ${validation.errors.join(', ')}`)
      }
      
      console.log()
      
      results.push({
        name: post.name,
        metadata: meta,
        validation,
        contentLength: result.content.length
      })
      
    } catch (error) {
      print(`❌ ${num} ${post.name}`, 'red')
      print(`   Fehler: ${error.message}`, 'red')
      console.log()
      stats.errors.push({ post: post.name, error: error.message })
    }
  }
  
  // Zusammenfassung
  print('\n' + '='.repeat(70), 'bright')
  print('📊 ZUSAMMENFASSUNG', 'bright')
  print('='.repeat(70) + '\n', 'bright')
  
  console.log('📈 Statistiken:')
  console.log(`   Analysiert: ${stats.total} Posts`)
  console.log(`   Gültig (AMB): ${stats.valid} / ${stats.total} (${Math.round(stats.valid/stats.total*100)}%)`)
  console.log()
  
  console.log('📋 Metadaten-Vollständigkeit:')
  console.log(`   Lizenz: ${stats.withLicense} / ${stats.total} (${Math.round(stats.withLicense/stats.total*100)}%)`)
  console.log(`   Creator: ${stats.withCreator} / ${stats.total} (${Math.round(stats.withCreator/stats.total*100)}%)`)
  console.log(`   └─ mit ORCID: ${stats.withOrcid} / ${stats.withCreator} (${stats.withCreator ? Math.round(stats.withOrcid/stats.withCreator*100) : 0}%)`)
  console.log(`   └─ mit ROR: ${stats.withRor} / ${stats.withCreator} (${stats.withCreator ? Math.round(stats.withRor/stats.withCreator*100) : 0}%)`)
  console.log(`   About (Themen): ${stats.withAbout} / ${stats.total} (${Math.round(stats.withAbout/stats.total*100)}%)`)
  console.log(`   LearningResourceType: ${stats.withLearningResourceType} / ${stats.total} (${Math.round(stats.withLearningResourceType/stats.total*100)}%)`)
  console.log(`   EducationalLevel: ${stats.withEducationalLevel} / ${stats.total} (${Math.round(stats.withEducationalLevel/stats.total*100)}%)`)
  console.log()
  
  console.log('📝 Content:')
  console.log(`   Durchschnittliche Länge: ${Math.round(stats.avgContentLength / stats.total)} Zeichen`)
  console.log(`   Kürzester: ${Math.min(...results.map(r => r.contentLength))} Zeichen`)
  console.log(`   Längster: ${Math.max(...results.map(r => r.contentLength))} Zeichen`)
  console.log()
  
  if (stats.errors.length > 0) {
    print(`❌ Fehler: ${stats.errors.length}`, 'red')
    stats.errors.forEach(err => {
      console.log(`   - ${err.post}: ${err.error}`)
    })
    console.log()
  }
  
  // Top 5 Posts mit vollständigsten Metadaten
  print('🏆 TOP 5 Posts mit vollständigsten Metadaten:', 'cyan')
  const scored = results.map(r => {
    let score = 0
    if (r.metadata.license) score++
    if (r.metadata.creator?.length > 0) score++
    if (r.metadata.creator?.some(c => c.id)) score++
    if (r.metadata.about?.length > 0) score++
    if (r.metadata.learningResourceType?.length > 0) score++
    if (r.metadata.educationalLevel?.length > 0) score++
    if (r.validation.valid) score++
    return { ...r, score }
  })
  
  scored.sort((a, b) => b.score - a.score)
  scored.slice(0, 5).forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.name}`)
    console.log(`      Score: ${r.score}/7`)
    console.log(`      Titel: ${r.metadata.name}`)
  })
  console.log()
  
  // Posts mit fehlenden Pflichtfeldern
  const incomplete = results.filter(r => !r.validation.valid)
  if (incomplete.length > 0) {
    print(`⚠️  ${incomplete.length} Posts mit fehlenden Pflichtfeldern:`, 'yellow')
    incomplete.forEach(r => {
      console.log(`   - ${r.name}`)
      if (r.validation.errors.length > 0) {
        console.log(`     Fehlt: ${r.validation.errors.join(', ')}`)
      }
    })
  }
  
  print('\n✅ Batch-Test abgeschlossen!\n', 'green')
}

// Ausführen
testMultiplePosts().catch(error => {
  console.error('\n❌ Fehler:', error.message)
  console.error(error.stack)
  process.exit(1)
})
