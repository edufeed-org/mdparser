#!/usr/bin/env node

/**
 * Monitoring Dashboard für Markdown-Parser
 * 
 * Echtzeit-Überwachung der Parser-Performance und Metadaten-Qualität
 * über alle Posts im Forgejo-Repository.
 */

import { parse } from './src/index.js'
import { createForgejoClient } from './src/forgejo-client.js'
import { validateAMBMetadata } from './src/extractors/amb-extractor.js'

// ANSI-Farben für Terminal-Output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
}

function print(text, color = 'reset') {
  console.log(`${colors[color]}${text}${colors.reset}`)
}

function printBar(label, value, max, width = 40, showPercentage = true) {
  const percentage = Math.round((value / max) * 100)
  const filled = Math.round((value / max) * width)
  const empty = width - filled
  
  let barColor = 'green'
  if (percentage < 50) barColor = 'red'
  else if (percentage < 75) barColor = 'yellow'
  
  const bar = '█'.repeat(filled) + '░'.repeat(empty)
  const percentText = showPercentage ? ` ${percentage}%` : ` ${value}/${max}`
  
  console.log(`${colors.dim}${label.padEnd(25)}${colors[barColor]}${bar}${colors.reset}${colors.bright}${percentText}${colors.reset}`)
}

function printBox(title, content, color = 'cyan') {
  const width = 70
  const topBorder = '╔' + '═'.repeat(width - 2) + '╗'
  const bottomBorder = '╚' + '═'.repeat(width - 2) + '╝'
  const titleLine = `║ ${title.padEnd(width - 4)} ║`
  
  print(topBorder, color)
  print(titleLine, 'bright')
  print('║' + ' '.repeat(width - 2) + '║', color)
  
  content.split('\n').forEach(line => {
    const paddedLine = line.padEnd(width - 4)
    print(`║ ${paddedLine} ║`, color)
  })
  
  print(bottomBorder, color)
  console.log()
}

function clearScreen() {
  console.clear()
}

function moveCursor(row, col) {
  process.stdout.write(`\x1b[${row};${col}H`)
}

async function collectMetrics() {
  const client = createForgejoClient()
  const allPosts = await client.listPosts()
  
  const metrics = {
    total: allPosts.length,
    valid: 0,
    invalid: 0,
    withLicense: 0,
    withCreator: 0,
    withOrcid: 0,
    withRor: 0,
    withAbout: 0,
    withLearningResourceType: 0,
    withEducationalLevel: 0,
    withInLanguage: 0,
    totalContentLength: 0,
    errors: [],
    warnings: [],
    processingTime: 0,
    posts: []
  }
  
  const startTime = Date.now()
  
  for (const post of allPosts) {
    try {
      const markdown = await client.getPostContent(post.name)
      const result = await parse(markdown)
      
      // Prüfe ob Metadaten existieren
      if (!result.metadata) {
        throw new Error('Keine Metadaten gefunden')
      }
      
      // Validierung durchführen
      const validation = validateAMBMetadata(result.metadata)
      const isValid = validation.valid
      
      if (isValid) {
        metrics.valid++
      } else {
        metrics.invalid++
        metrics.errors.push({
          post: post.name,
          errors: validation.errors
        })
      }
      
      const meta = result.metadata
      
      if (meta.license) metrics.withLicense++
      if (meta.creator && meta.creator.length > 0) {
        metrics.withCreator++
        if (meta.creator.some(c => c.id)) metrics.withOrcid++
        if (meta.creator.some(c => c.affiliation?.id)) metrics.withRor++
      }
      if (meta.about && meta.about.length > 0) metrics.withAbout++
      if (meta.learningResourceType && meta.learningResourceType.length > 0) {
        metrics.withLearningResourceType++
      }
      if (meta.educationalLevel && meta.educationalLevel.length > 0) {
        metrics.withEducationalLevel++
      }
      if (meta.inLanguage) metrics.withInLanguage++
      
      const contentLength = result.content.length
      metrics.totalContentLength += contentLength
      
      // Post-Details für Ranking
      metrics.posts.push({
        name: post.name,
        title: meta.name || 'Ohne Titel',
        valid: isValid,
        completeness: calculateCompleteness(meta),
        contentLength
      })
      
    } catch (error) {
      metrics.errors.push({
        post: post.name,
        errors: [error.message]
      })
    }
  }
  
  metrics.processingTime = Date.now() - startTime
  metrics.avgContentLength = Math.round(metrics.totalContentLength / metrics.total)
  
  // Posts nach Vollständigkeit sortieren
  metrics.posts.sort((a, b) => b.completeness - a.completeness)
  
  return metrics
}

function calculateCompleteness(meta) {
  let score = 0
  const checks = [
    meta.license,
    meta.creator && meta.creator.length > 0,
    meta.creator && meta.creator.some(c => c.id),
    meta.creator && meta.creator.some(c => c.affiliation?.id),
    meta.about && meta.about.length > 0,
    meta.learningResourceType && meta.learningResourceType.length > 0,
    meta.educationalLevel && meta.educationalLevel.length > 0,
    meta.inLanguage,
    meta.datePublished,
    meta.creativeWorkStatus
  ]
  
  checks.forEach(check => { if (check) score++ })
  return score
}

function renderDashboard(metrics) {
  clearScreen()
  
  // Header
  print('═'.repeat(75), 'cyan')
  print('   📊  FOERBICO MARKDOWN-PARSER MONITORING DASHBOARD', 'bright')
  print('═'.repeat(75), 'cyan')
  print(`   Letzte Aktualisierung: ${new Date().toLocaleString('de-DE')}`, 'dim')
  print(`   Repository: Comenius-Institut/FOERBICO_und_rpi-virtuell`, 'dim')
  print(`   Verarbeitungszeit: ${metrics.processingTime}ms`, 'dim')
  console.log()
  
  // Hauptmetriken Box
  const validRate = Math.round((metrics.valid / metrics.total) * 100)
  let statusColor = 'green'
  let statusEmoji = '✅'
  if (validRate < 90) {
    statusColor = 'yellow'
    statusEmoji = '⚠️'
  }
  if (validRate < 75) {
    statusColor = 'red'
    statusEmoji = '❌'
  }
  
  const mainMetrics = [
    `${statusEmoji}  Gesamt-Validität: ${colors.bright}${validRate}%${colors.reset} (${metrics.valid}/${metrics.total})`,
    '',
    `📄  Total Posts:        ${colors.bright}${metrics.total}${colors.reset}`,
    `✅  Gültig:             ${colors.green}${metrics.valid}${colors.reset}`,
    `❌  Ungültig:           ${colors.red}${metrics.invalid}${colors.reset}`,
    `📝  Ø Content-Länge:    ${colors.bright}${metrics.avgContentLength}${colors.reset} Zeichen`
  ].join('\n')
  
  printBox('SYSTEM STATUS', mainMetrics, statusColor)
  
  // Metadaten-Vollständigkeit
  print('┌─────────────────────────────────────────────────────────────────────┐', 'cyan')
  print('│  METADATEN-VOLLSTÄNDIGKEIT                                          │', 'bright')
  print('├─────────────────────────────────────────────────────────────────────┤', 'cyan')
  console.log()
  
  printBar('📜 Lizenz', metrics.withLicense, metrics.total)
  printBar('👤 Creator', metrics.withCreator, metrics.total)
  printBar('🔑 ORCID', metrics.withOrcid, metrics.withCreator, 40, false)
  printBar('🏛️  ROR', metrics.withRor, metrics.withCreator, 40, false)
  printBar('🏷️  About (Themen)', metrics.withAbout, metrics.total)
  printBar('📚 LearningResourceType', metrics.withLearningResourceType, metrics.total)
  printBar('🎓 EducationalLevel', metrics.withEducationalLevel, metrics.total)
  printBar('🌐 InLanguage', metrics.withInLanguage, metrics.total)
  
  console.log()
  print('└─────────────────────────────────────────────────────────────────────┘', 'cyan')
  console.log()
  
  // Top 10 Posts
  print('┌─────────────────────────────────────────────────────────────────────┐', 'magenta')
  print('│  🏆 TOP 10 POSTS (Vollständigkeit)                                  │', 'bright')
  print('├─────────────────────────────────────────────────────────────────────┤', 'magenta')
  console.log()
  
  metrics.posts.slice(0, 10).forEach((post, index) => {
    const rank = `${index + 1}.`.padEnd(4)
    const score = `${post.completeness}/10`
    const scoreColor = post.completeness >= 8 ? 'green' : post.completeness >= 6 ? 'yellow' : 'red'
    const validIcon = post.valid ? '✅' : '❌'
    const titleShort = post.title.substring(0, 40)
    
    console.log(`  ${colors.dim}${rank}${colors[scoreColor]}${score.padEnd(6)}${colors.reset} ${validIcon}  ${titleShort}`)
  })
  
  console.log()
  print('└─────────────────────────────────────────────────────────────────────┘', 'magenta')
  console.log()
  
  // Fehler & Warnungen
  if (metrics.errors.length > 0) {
    print('┌─────────────────────────────────────────────────────────────────────┐', 'red')
    print('│  ⚠️  FEHLER & PROBLEME                                               │', 'bright')
    print('├─────────────────────────────────────────────────────────────────────┤', 'red')
    console.log()
    
    metrics.errors.slice(0, 5).forEach(error => {
      print(`  📄 ${error.post}`, 'yellow')
      error.errors.forEach(err => {
        print(`     → ${err}`, 'red')
      })
    })
    
    if (metrics.errors.length > 5) {
      print(`\n  ... und ${metrics.errors.length - 5} weitere Fehler`, 'dim')
    }
    
    console.log()
    print('└─────────────────────────────────────────────────────────────────────┘', 'red')
    console.log()
  }
  
  // Quality Score
  const qualityScore = calculateQualityScore(metrics)
  const qualityGrade = getQualityGrade(qualityScore)
  
  const qualityBox = [
    `Score:  ${colors.bright}${qualityScore}/100${colors.reset}`,
    `Note:   ${qualityGrade.emoji} ${colors.bright}${qualityGrade.grade}${colors.reset}`,
    `Status: ${qualityGrade.status}`
  ].join('\n')
  
  printBox('QUALITÄTS-BEWERTUNG', qualityBox, qualityGrade.color)
  
  // Footer
  print('─'.repeat(75), 'dim')
  print('  💡 Drücke Strg+C zum Beenden', 'dim')
  print('  🔄 Das Dashboard aktualisiert sich alle 5 Minuten automatisch', 'dim')
  print('─'.repeat(75), 'dim')
}

function calculateQualityScore(metrics) {
  const weights = {
    validity: 30,
    license: 20,
    creator: 15,
    orcid: 10,
    learningResourceType: 10,
    about: 8,
    educationalLevel: 7
  }
  
  let score = 0
  score += (metrics.valid / metrics.total) * weights.validity
  score += (metrics.withLicense / metrics.total) * weights.license
  score += (metrics.withCreator / metrics.total) * weights.creator
  score += (metrics.withOrcid / Math.max(metrics.withCreator, 1)) * weights.orcid
  score += (metrics.withLearningResourceType / metrics.total) * weights.learningResourceType
  score += (metrics.withAbout / metrics.total) * weights.about
  score += (metrics.withEducationalLevel / metrics.total) * weights.educationalLevel
  
  return Math.round(score)
}

function getQualityGrade(score) {
  if (score >= 95) return { grade: 'A+', emoji: '🌟', status: 'Exzellent', color: 'green' }
  if (score >= 90) return { grade: 'A', emoji: '🎉', status: 'Sehr gut', color: 'green' }
  if (score >= 85) return { grade: 'B+', emoji: '✨', status: 'Gut', color: 'green' }
  if (score >= 80) return { grade: 'B', emoji: '👍', status: 'Befriedigend', color: 'yellow' }
  if (score >= 75) return { grade: 'C+', emoji: '⚠️', status: 'Ausreichend', color: 'yellow' }
  if (score >= 70) return { grade: 'C', emoji: '📉', status: 'Mangelhaft', color: 'red' }
  return { grade: 'D', emoji: '❌', status: 'Ungenügend', color: 'red' }
}

async function runDashboard() {
  try {
    print('\n🚀 Starte Monitoring Dashboard...', 'cyan')
    print('📡 Sammle Metriken von Forgejo...', 'cyan')
    
    const metrics = await collectMetrics()
    renderDashboard(metrics)
    
    // Auto-Refresh alle 5 Minuten
    setInterval(async () => {
      print('\n🔄 Aktualisiere Dashboard...', 'dim')
      const updatedMetrics = await collectMetrics()
      renderDashboard(updatedMetrics)
    }, 5 * 60 * 1000) // 5 Minuten
    
  } catch (error) {
    print(`\n❌ Fehler beim Starten des Dashboards: ${error.message}`, 'red')
    process.exit(1)
  }
}

// Graceful Shutdown
process.on('SIGINT', () => {
  print('\n\n👋 Dashboard wird beendet...', 'yellow')
  print('✅ Auf Wiedersehen!\n', 'green')
  process.exit(0)
})

// Start Dashboard
runDashboard()
