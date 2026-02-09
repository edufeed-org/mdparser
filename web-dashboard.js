#!/usr/bin/env node

/**
 * Web-Dashboard für Markdown-Parser
 * 
 * HTTP-Server mit interaktivem Browser-Interface zur Echtzeit-Überwachung
 * der Parser-Performance und Metadaten-Qualität.
 */

import http from 'http'
import { parse } from './src/index.js'
import { createForgejoClient } from './src/forgejo-client.js'
import { validateAMBMetadata } from './src/extractors/amb-extractor.js'

const PORT = 3000

// Cache für Metriken
let cachedMetrics = null
let lastUpdate = null
let isUpdating = false

async function collectMetrics() {
  if (isUpdating) {
    return cachedMetrics
  }
  
  isUpdating = true
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
    posts: [],
    lastUpdate: new Date().toISOString()
  }
  
  const startTime = Date.now()
  
  for (const post of allPosts) {
    try {
      const markdown = await client.getPostContent(post.name)
      const result = await parse(markdown)
      
      if (!result.metadata) {
        throw new Error('Keine Metadaten gefunden')
      }
      
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
      
      metrics.posts.push({
        name: post.name,
        title: meta.name || 'Ohne Titel',
        valid: isValid,
        completeness: calculateCompleteness(meta),
        contentLength,
        license: meta.license || null,
        creators: meta.creator?.length || 0,
        topics: meta.about?.length || 0
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
  metrics.posts.sort((a, b) => b.completeness - a.completeness)
  
  cachedMetrics = metrics
  lastUpdate = new Date()
  isUpdating = false
  
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
  if (score >= 95) return { grade: 'A+', emoji: '🌟', status: 'Exzellent', color: '#10b981' }
  if (score >= 90) return { grade: 'A', emoji: '🎉', status: 'Sehr gut', color: '#22c55e' }
  if (score >= 85) return { grade: 'B+', emoji: '✨', status: 'Gut', color: '#84cc16' }
  if (score >= 80) return { grade: 'B', emoji: '👍', status: 'Befriedigend', color: '#eab308' }
  if (score >= 75) return { grade: 'C+', emoji: '⚠️', status: 'Ausreichend', color: '#f59e0b' }
  if (score >= 70) return { grade: 'C', emoji: '📉', status: 'Mangelhaft', color: '#ef4444' }
  return { grade: 'D', emoji: '❌', status: 'Ungenügend', color: '#dc2626' }
}

function getHTMLPage(metrics) {
  const qualityScore = calculateQualityScore(metrics)
  const qualityGrade = getQualityGrade(qualityScore)
  const validityPercent = Math.round((metrics.valid / metrics.total) * 100)
  
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FOERBICO Parser Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 2rem;
      color: #1f2937;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    
    .header {
      background: white;
      border-radius: 1rem;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    }
    
    .header h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .header .subtitle {
      color: #6b7280;
      font-size: 0.875rem;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    
    .stat-card {
      background: white;
      border-radius: 1rem;
      padding: 1.5rem;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      transition: transform 0.2s;
    }
    
    .stat-card:hover {
      transform: translateY(-4px);
    }
    
    .stat-card .label {
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }
    
    .stat-card .value {
      font-size: 2.5rem;
      font-weight: bold;
      margin-bottom: 0.25rem;
    }
    
    .stat-card .subtext {
      font-size: 0.875rem;
      color: #9ca3af;
    }
    
    .quality-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 1.5rem;
    }
    
    .section {
      background: white;
      border-radius: 1rem;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
    
    .section h2 {
      font-size: 1.5rem;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .progress-bar {
      margin-bottom: 1.5rem;
    }
    
    .progress-bar .label {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
    }
    
    .progress-bar .bar-container {
      background: #e5e7eb;
      border-radius: 9999px;
      height: 1.5rem;
      overflow: hidden;
      position: relative;
    }
    
    .progress-bar .bar-fill {
      height: 100%;
      border-radius: 9999px;
      transition: width 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 0.75rem;
      color: white;
      font-weight: 600;
      font-size: 0.875rem;
    }
    
    .bar-fill.green { background: linear-gradient(90deg, #10b981, #059669); }
    .bar-fill.yellow { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .bar-fill.red { background: linear-gradient(90deg, #ef4444, #dc2626); }
    
    .posts-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .posts-table th {
      text-align: left;
      padding: 1rem;
      background: #f9fafb;
      font-weight: 600;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .posts-table td {
      padding: 1rem;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .posts-table tr:hover {
      background: #f9fafb;
    }
    
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    
    .badge.success { background: #d1fae5; color: #065f46; }
    .badge.warning { background: #fef3c7; color: #92400e; }
    .badge.error { background: #fee2e2; color: #991b1b; }
    
    .score-circle {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      margin: 0 auto 1rem;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
    
    .error-list {
      list-style: none;
    }
    
    .error-item {
      padding: 1rem;
      background: #fef2f2;
      border-left: 4px solid #ef4444;
      margin-bottom: 1rem;
      border-radius: 0.5rem;
    }
    
    .error-item strong {
      color: #991b1b;
    }
    
    .refresh-button {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
    }
    
    .refresh-button:hover {
      transform: scale(1.05);
    }
    
    .auto-refresh {
      font-size: 0.875rem;
      color: #6b7280;
      margin-left: 1rem;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .updating {
      animation: pulse 1.5s ease-in-out infinite;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 FOERBICO Markdown-Parser Dashboard</h1>
      <p class="subtitle">
        Repository: Comenius-Institut/FOERBICO_und_rpi-virtuell | 
        Letzte Aktualisierung: ${new Date(metrics.lastUpdate).toLocaleString('de-DE')} |
        Verarbeitungszeit: ${metrics.processingTime}ms
      </p>
      <div style="margin-top: 1rem;">
        <button class="refresh-button" onclick="refreshData()">🔄 Jetzt aktualisieren</button>
        <span class="auto-refresh">⏱️ Auto-Refresh: alle 2 Minuten</span>
      </div>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="label">Gesamt-Validität</div>
        <div class="value" style="color: ${validityPercent >= 90 ? '#10b981' : validityPercent >= 75 ? '#f59e0b' : '#ef4444'}">
          ${validityPercent}%
        </div>
        <div class="subtext">${metrics.valid} von ${metrics.total} Posts</div>
      </div>
      
      <div class="stat-card">
        <div class="label">Qualitäts-Score</div>
        <div class="score-circle" style="background-color: ${qualityGrade.color}; color: white;">
          <div style="font-size: 2rem;">${qualityGrade.emoji}</div>
          <div style="font-size: 1.5rem;">${qualityScore}/100</div>
        </div>
        <div style="text-align: center;">
          <span class="quality-badge" style="background-color: ${qualityGrade.color}20; color: ${qualityGrade.color}">
            ${qualityGrade.grade} - ${qualityGrade.status}
          </span>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="label">Total Posts</div>
        <div class="value" style="color: #667eea">${metrics.total}</div>
        <div class="subtext">
          ✅ ${metrics.valid} gültig &nbsp;
          ${metrics.invalid > 0 ? `❌ ${metrics.invalid} ungültig` : ''}
        </div>
      </div>
      
      <div class="stat-card">
        <div class="label">Ø Content-Länge</div>
        <div class="value" style="color: #764ba2">${metrics.avgContentLength}</div>
        <div class="subtext">Zeichen pro Post</div>
      </div>
    </div>
    
    <div class="section">
      <h2>📋 Metadaten-Vollständigkeit</h2>
      
      <div class="progress-bar">
        <div class="label">
          <span>📜 Lizenz</span>
          <span>${metrics.withLicense} / ${metrics.total} (${Math.round(metrics.withLicense/metrics.total*100)}%)</span>
        </div>
        <div class="bar-container">
          <div class="bar-fill ${metrics.withLicense/metrics.total >= 0.9 ? 'green' : metrics.withLicense/metrics.total >= 0.7 ? 'yellow' : 'red'}" 
               style="width: ${(metrics.withLicense/metrics.total)*100}%">
            ${Math.round(metrics.withLicense/metrics.total*100)}%
          </div>
        </div>
      </div>
      
      <div class="progress-bar">
        <div class="label">
          <span>👤 Creator</span>
          <span>${metrics.withCreator} / ${metrics.total} (${Math.round(metrics.withCreator/metrics.total*100)}%)</span>
        </div>
        <div class="bar-container">
          <div class="bar-fill ${metrics.withCreator/metrics.total >= 0.9 ? 'green' : metrics.withCreator/metrics.total >= 0.7 ? 'yellow' : 'red'}" 
               style="width: ${(metrics.withCreator/metrics.total)*100}%">
            ${Math.round(metrics.withCreator/metrics.total*100)}%
          </div>
        </div>
      </div>
      
      <div class="progress-bar">
        <div class="label">
          <span>🔑 ORCID</span>
          <span>${metrics.withOrcid} / ${metrics.withCreator} (${Math.round(metrics.withOrcid/Math.max(metrics.withCreator,1)*100)}%)</span>
        </div>
        <div class="bar-container">
          <div class="bar-fill ${metrics.withOrcid/Math.max(metrics.withCreator,1) >= 0.5 ? 'green' : metrics.withOrcid/Math.max(metrics.withCreator,1) >= 0.3 ? 'yellow' : 'red'}" 
               style="width: ${(metrics.withOrcid/Math.max(metrics.withCreator,1))*100}%">
            ${Math.round(metrics.withOrcid/Math.max(metrics.withCreator,1)*100)}%
          </div>
        </div>
      </div>
      
      <div class="progress-bar">
        <div class="label">
          <span>🏛️ ROR (Institution)</span>
          <span>${metrics.withRor} / ${metrics.withCreator} (${Math.round(metrics.withRor/Math.max(metrics.withCreator,1)*100)}%)</span>
        </div>
        <div class="bar-container">
          <div class="bar-fill ${metrics.withRor/Math.max(metrics.withCreator,1) >= 0.8 ? 'green' : metrics.withRor/Math.max(metrics.withCreator,1) >= 0.5 ? 'yellow' : 'red'}" 
               style="width: ${(metrics.withRor/Math.max(metrics.withCreator,1))*100}%">
            ${Math.round(metrics.withRor/Math.max(metrics.withCreator,1)*100)}%
          </div>
        </div>
      </div>
      
      <div class="progress-bar">
        <div class="label">
          <span>🏷️ About (Themen)</span>
          <span>${metrics.withAbout} / ${metrics.total} (${Math.round(metrics.withAbout/metrics.total*100)}%)</span>
        </div>
        <div class="bar-container">
          <div class="bar-fill ${metrics.withAbout/metrics.total >= 0.7 ? 'green' : metrics.withAbout/metrics.total >= 0.4 ? 'yellow' : 'red'}" 
               style="width: ${(metrics.withAbout/metrics.total)*100}%">
            ${Math.round(metrics.withAbout/metrics.total*100)}%
          </div>
        </div>
      </div>
      
      <div class="progress-bar">
        <div class="label">
          <span>📚 LearningResourceType</span>
          <span>${metrics.withLearningResourceType} / ${metrics.total} (${Math.round(metrics.withLearningResourceType/metrics.total*100)}%)</span>
        </div>
        <div class="bar-container">
          <div class="bar-fill ${metrics.withLearningResourceType/metrics.total >= 0.9 ? 'green' : metrics.withLearningResourceType/metrics.total >= 0.7 ? 'yellow' : 'red'}" 
               style="width: ${(metrics.withLearningResourceType/metrics.total)*100}%">
            ${Math.round(metrics.withLearningResourceType/metrics.total*100)}%
          </div>
        </div>
      </div>
      
      <div class="progress-bar">
        <div class="label">
          <span>🎓 EducationalLevel</span>
          <span>${metrics.withEducationalLevel} / ${metrics.total} (${Math.round(metrics.withEducationalLevel/metrics.total*100)}%)</span>
        </div>
        <div class="bar-container">
          <div class="bar-fill ${metrics.withEducationalLevel/metrics.total >= 0.7 ? 'green' : metrics.withEducationalLevel/metrics.total >= 0.5 ? 'yellow' : 'red'}" 
               style="width: ${(metrics.withEducationalLevel/metrics.total)*100}%">
            ${Math.round(metrics.withEducationalLevel/metrics.total*100)}%
          </div>
        </div>
      </div>
    </div>
    
    ${metrics.errors.length > 0 ? `
    <div class="section">
      <h2>⚠️ Fehler & Probleme (${metrics.errors.length})</h2>
      <ul class="error-list">
        ${metrics.errors.slice(0, 10).map(error => `
          <li class="error-item">
            <strong>📄 ${error.post}</strong><br>
            ${error.errors.map(err => `→ ${err}`).join('<br>')}
          </li>
        `).join('')}
        ${metrics.errors.length > 10 ? `<li style="text-align: center; color: #6b7280; margin-top: 1rem;">... und ${metrics.errors.length - 10} weitere Fehler</li>` : ''}
      </ul>
    </div>
    ` : ''}
    
    <div class="section">
      <h2>🏆 TOP 15 Posts (Vollständigkeit)</h2>
      <table class="posts-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Post</th>
            <th>Titel</th>
            <th>Score</th>
            <th>Status</th>
            <th>Länge</th>
          </tr>
        </thead>
        <tbody>
          ${metrics.posts.slice(0, 15).map((post, index) => `
            <tr>
              <td>${index + 1}</td>
              <td style="font-family: monospace; font-size: 0.875rem;">${post.name}</td>
              <td>${post.title.substring(0, 60)}${post.title.length > 60 ? '...' : ''}</td>
              <td>
                <strong style="color: ${post.completeness >= 8 ? '#10b981' : post.completeness >= 6 ? '#f59e0b' : '#ef4444'}">
                  ${post.completeness}/10
                </strong>
              </td>
              <td>
                <span class="badge ${post.valid ? 'success' : 'error'}">
                  ${post.valid ? '✅ Gültig' : '❌ Ungültig'}
                </span>
              </td>
              <td>${post.contentLength.toLocaleString('de-DE')} Zeichen</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
  
  <script>
    let isRefreshing = false;
    
    async function refreshData() {
      if (isRefreshing) return;
      
      isRefreshing = true;
      const button = document.querySelector('.refresh-button');
      button.classList.add('updating');
      button.textContent = '⏳ Aktualisiere...';
      
      try {
        const response = await fetch('/api/metrics');
        if (response.ok) {
          location.reload();
        }
      } catch (error) {
        console.error('Fehler beim Aktualisieren:', error);
      } finally {
        isRefreshing = false;
      }
    }
    
    // Auto-Refresh alle 2 Minuten
    setInterval(() => {
      console.log('Auto-Refresh...');
      location.reload();
    }, 2 * 60 * 1000);
    
    console.log('📊 FOERBICO Dashboard geladen');
    console.log('Nächstes Auto-Refresh in 2 Minuten');
  </script>
</body>
</html>`
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }
  
  try {
    if (req.url === '/' || req.url === '/dashboard') {
      // Dashboard HTML
      if (!cachedMetrics || !lastUpdate || (Date.now() - lastUpdate > 5 * 60 * 1000)) {
        console.log('🔄 Sammle Metriken...')
        await collectMetrics()
      }
      
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(getHTMLPage(cachedMetrics))
      
    } else if (req.url === '/api/metrics') {
      // API Endpoint für Metriken
      console.log('📡 API: Metriken werden aktualisiert...')
      const metrics = await collectMetrics()
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(metrics, null, 2))
      
    } else if (req.url === '/api/health') {
      // Health Check
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        lastUpdate: lastUpdate?.toISOString() || null
      }))
      
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('404 Not Found')
    }
    
  } catch (error) {
    console.error('❌ Server-Fehler:', error)
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(`Server Error: ${error.message}`)
  }
})

// Server starten
server.listen(PORT, async () => {
  console.log('\n🚀 Web-Dashboard gestartet!\n')
  console.log(`📊 Dashboard: http://localhost:${PORT}`)
  console.log(`📡 API:       http://localhost:${PORT}/api/metrics`)
  console.log(`💚 Health:    http://localhost:${PORT}/api/health`)
  console.log('\n🔄 Initiales Laden der Metriken...')
  
  try {
    await collectMetrics()
    console.log('✅ Metriken geladen!')
    console.log(`\n💡 Öffne http://localhost:${PORT} im Browser`)
    console.log('⏱️  Auto-Refresh: alle 2 Minuten')
    console.log('\n👋 Zum Beenden: Strg+C\n')
  } catch (error) {
    console.error('❌ Fehler beim Laden der Metriken:', error)
  }
})

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Server wird beendet...')
  server.close(() => {
    console.log('✅ Server gestoppt. Auf Wiedersehen!\n')
    process.exit(0)
  })
})
