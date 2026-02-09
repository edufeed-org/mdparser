/**
 * WordPress REST API v2 Transformer
 * 
 * Transformiert AMB-Metadaten zu WordPress REST API v2 Format
 * für das Publishing von OER-Inhalten in WordPress-Systemen.
 * 
 * @see https://developer.wordpress.org/rest-api/reference/posts/
 */

/**
 * Transformiert AMB-Metadaten zu WordPress Post-Format
 * 
 * @param {Object} ambMetadata - Schema.org-konforme AMB-Metadaten
 * @param {string} content - Markdown-Content (wird zu HTML konvertiert)
 * @param {Object} options - Transformations-Optionen
 * @returns {Object} WordPress REST API v2 Post-Objekt
 */
export function transformToWordPress(ambMetadata, content, options = {}) {
  const {
    status = 'draft',  // draft, publish, pending, private
    authorId = 1,
    categoryIds = [],
    convertToHtml = true,
    includeCustomFields = true
  } = options

  // Basis-Post-Struktur
  const wpPost = {
    // Pflichtfelder
    title: ambMetadata.name || 'Untitled',
    content: convertToHtml ? markdownToHtml(content) : content,
    status: status,
    
    // Metadaten
    excerpt: ambMetadata.description || generateExcerpt(content),
    author: authorId,
    
    // Taxonomien
    categories: categoryIds,
    tags: extractTags(ambMetadata),
    
    // Featured Image
    featured_media: extractFeaturedMedia(ambMetadata),
    
    // Datum
    date: ambMetadata.datePublished || new Date().toISOString(),
    
    // Format
    format: 'standard',
    
    // Meta-Felder für AMB-Daten
    meta: includeCustomFields ? buildCustomFields(ambMetadata) : {}
  }

  return wpPost
}

/**
 * Konvertiert Markdown zu HTML
 * Einfache Implementierung - kann erweitert werden
 */
function markdownToHtml(markdown) {
  // TODO: Verwende einen Markdown-to-HTML Converter
  // Für jetzt: Einfache Ersetzungen
  let html = markdown
  
  // Überschriften
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>')
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>')
  
  // Bold & Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2">$1</a>')
  
  // Paragraphen
  html = html.split('\n\n').map(p => `<p>${p}</p>`).join('\n')
  
  return html
}

/**
 * Generiert Excerpt aus Content
 */
function generateExcerpt(content, maxLength = 160) {
  const plainText = content
    .replace(/#+\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/\n/g, ' ')
    .trim()
  
  if (plainText.length <= maxLength) {
    return plainText
  }
  
  return plainText.substring(0, maxLength) + '...'
}

/**
 * Extrahiert Tags aus AMB-Metadaten
 */
function extractTags(ambMetadata) {
  const tags = []
  
  // Learning Resource Types als Tags
  if (ambMetadata.learningResourceType) {
    ambMetadata.learningResourceType.forEach(type => {
      const tagName = extractLabelFromUri(type)
      if (tagName) tags.push(tagName)
    })
  }
  
  // Educational Level als Tags
  if (ambMetadata.educationalLevel) {
    ambMetadata.educationalLevel.forEach(level => {
      const tagName = extractLabelFromUri(level)
      if (tagName) tags.push(tagName)
    })
  }
  
  // About-Themen als Tags
  if (ambMetadata.about) {
    ambMetadata.about.forEach(topic => {
      if (typeof topic === 'string') {
        const tagName = extractLabelFromUri(topic)
        if (tagName) tags.push(tagName)
      } else if (topic.name) {
        tags.push(topic.name)
      }
    })
  }
  
  return [...new Set(tags)] // Duplikate entfernen
}

/**
 * Extrahiert Featured Media URL
 */
function extractFeaturedMedia(ambMetadata) {
  if (ambMetadata.image) {
    // Wenn image ein String (URL) ist
    if (typeof ambMetadata.image === 'string') {
      return ambMetadata.image
    }
    // Wenn image ein Objekt ist
    if (ambMetadata.image.url) {
      return ambMetadata.image.url
    }
    if (ambMetadata.image.contentUrl) {
      return ambMetadata.image.contentUrl
    }
  }
  return null
}

/**
 * Baut Custom Fields für WordPress
 */
function buildCustomFields(ambMetadata) {
  const customFields = {
    // AMB-spezifische Felder
    amb_type: ambMetadata.type || 'LearningResource',
    amb_license: ambMetadata.license || null,
    amb_id: ambMetadata.id || null,
    amb_in_language: ambMetadata.inLanguage ? ambMetadata.inLanguage.join(',') : null,
    amb_creative_work_status: ambMetadata.creativeWorkStatus || null,
    
    // Creators als JSON
    amb_creators: ambMetadata.creator ? JSON.stringify(ambMetadata.creator) : null,
    
    // About als JSON
    amb_about: ambMetadata.about ? JSON.stringify(ambMetadata.about) : null,
    
    // Learning Resource Types
    amb_learning_resource_types: ambMetadata.learningResourceType ? 
      JSON.stringify(ambMetadata.learningResourceType) : null,
    
    // Educational Level
    amb_educational_level: ambMetadata.educationalLevel ? 
      JSON.stringify(ambMetadata.educationalLevel) : null,
    
    // Audience
    amb_audience: ambMetadata.audience ? JSON.stringify(ambMetadata.audience) : null,
    
    // Time Required
    amb_time_required: ambMetadata.timeRequired || null,
    
    //Conditionsof Access
    amb_conditions_of_access: ambMetadata.conditionsOfAccess || null,
    
    // Is Accessible For Free
    amb_is_accessible_for_free: ambMetadata.isAccessibleForFree || null
  }
  
  // Null-Werte entfernen
  return Object.fromEntries(
    Object.entries(customFields).filter(([_, v]) => v != null)
  )
}

/**
 * Extrahiert Label aus URI
 */
function extractLabelFromUri(uri) {
  if (!uri || typeof uri !== 'string') return null
  
  // Versuche letzten Teil der URI zu extrahieren
  const parts = uri.split('/')
  const lastPart = parts[parts.length - 1]
  
  // Wenn es eine ID ist (z.B. n079), überspringe
  if (/^[a-z]\d+$/i.test(lastPart)) return null
  
  // Konvertiere zu lesbarem Format
  return lastPart
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
}

/**
 * Transformiert WordPress Post zurück zu AMB (für Round-Trip)
 * 
 * @param {Object} wpPost - WordPress Post-Objekt
 * @returns {Object} AMB-Metadaten
 */
export function transformFromWordPress(wpPost) {
  const ambMetadata = {
    '@context': 'https://schema.org/',
    type: wpPost.meta?.amb_type || 'LearningResource',
    name: wpPost.title?.rendered || wpPost.title,
    description: wpPost.excerpt?.rendered || wpPost.excerpt,
    license: wpPost.meta?.amb_license || null,
    id: wpPost.meta?.amb_id || null,
    inLanguage: wpPost.meta?.amb_in_language ? 
      wpPost.meta.amb_in_language.split(',') : null,
    datePublished: wpPost.date,
    creativeWorkStatus: wpPost.meta?.amb_creative_work_status || null
  }
  
  // Parse JSON-Felder
  if (wpPost.meta?.amb_creators) {
    try {
      ambMetadata.creator = JSON.parse(wpPost.meta.amb_creators)
    } catch (e) {
      console.warn('Failed to parse creators:', e)
    }
  }
  
  if (wpPost.meta?.amb_about) {
    try {
      ambMetadata.about = JSON.parse(wpPost.meta.amb_about)
    } catch (e) {
      console.warn('Failed to parse about:', e)
    }
  }
  
  if (wpPost.meta?.amb_learning_resource_types) {
    try {
      ambMetadata.learningResourceType = JSON.parse(wpPost.meta.amb_learning_resource_types)
    } catch (e) {
      console.warn('Failed to parse learning resource types:', e)
    }
  }
  
  if (wpPost.meta?.amb_educational_level) {
    try {
      ambMetadata.educationalLevel = JSON.parse(wpPost.meta.amb_educational_level)
    } catch (e) {
      console.warn('Failed to parse educational level:', e)
    }
  }
  
  // Null-Werte entfernen
  return Object.fromEntries(
    Object.entries(ambMetadata).filter(([_, v]) => v != null)
  )
}

/**
 * WordPress API Client Helper
 * Vereinfacht das Posting zu WordPress
 */
export class WordPressClient {
  constructor(config) {
    this.baseUrl = config.baseUrl // z.B. https://example.com/wp-json/wp/v2
    this.username = config.username
    this.password = config.password
    this.token = config.token // Alternative: Application Password
  }
  
  /**
   * Postet einen Artikel zu WordPress
   */
  async createPost(wpPost) {
    const auth = this.token || 
      Buffer.from(`${this.username}:${this.password}`).toString('base64')
    
    const response = await fetch(`${this.baseUrl}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(wpPost)
    })
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`WordPress API Error: ${response.status} - ${error}`)
    }
    
    return response.json()
  }
  
  /**
   * Aktualisiert einen Artikel
   */
  async updatePost(postId, wpPost) {
    const auth = this.token || 
      Buffer.from(`${this.username}:${this.password}`).toString('base64')
    
    const response = await fetch(`${this.baseUrl}/posts/${postId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(wpPost)
    })
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`WordPress API Error: ${response.status} - ${error}`)
    }
    
    return response.json()
  }
  
  /**
   * Ruft einen Artikel ab
   */
  async getPost(postId) {
    const response = await fetch(`${this.baseUrl}/posts/${postId}`)
    
    if (!response.ok) {
      throw new Error(`WordPress API Error: ${response.status}`)
    }
    
    return response.json()
  }
  
  /**
   * Löscht einen Artikel
   */
  async deletePost(postId) {
    const auth = this.token || 
      Buffer.from(`${this.username}:${this.password}`).toString('base64')
    
    const response = await fetch(`${this.baseUrl}/posts/${postId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${auth}`
      }
    })
    
    if (!response.ok) {
      throw new Error(`WordPress API Error: ${response.status}`)
    }
    
    return response.json()
  }
}

/**
 * Convenience-Funktion für kompletten Workflow
 */
export async function publishToWordPress(ambMetadata, content, wpConfig, options = {}) {
  // Transformiere zu WordPress-Format
  const wpPost = transformToWordPress(ambMetadata, content, options)
  
  // Erstelle Client
  const client = new WordPressClient(wpConfig)
  
  // Poste zu WordPress
  const result = await client.createPost(wpPost)
  
  return result
}
