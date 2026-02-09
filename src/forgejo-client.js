/**
 * Forgejo/Gitea API Client
 * Ermöglicht Zugriff auf Repository-Inhalte über die Forgejo/Gitea API
 */

import { config } from 'dotenv'

// Environment-Variablen laden
config()

/**
 * Forgejo API Client
 */
export class ForgejoClient {
  /**
   * @param {Object} options - Konfiguration
   * @param {string} options.baseUrl - API Base URL
   * @param {string} options.owner - Repository Owner
   * @param {string} options.repo - Repository Name
   * @param {string} options.branch - Branch (default: main)
   * @param {string} options.token - API Token (optional für öffentliche Repos)
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.FORGEJO_API_BASE_URL
    this.owner = options.owner || process.env.FORGEJO_OWNER
    this.repo = options.repo || process.env.FORGEJO_REPO
    this.branch = options.branch || process.env.FORGEJO_BRANCH || 'main'
    this.token = options.token || process.env.FORGEJO_TOKEN

    if (!this.baseUrl || !this.owner || !this.repo) {
      throw new Error('Forgejo client requires baseUrl, owner, and repo')
    }
  }

  /**
   * Erstellt Request-Headers mit optionalem Token
   * @returns {Object} Headers
   */
  getHeaders() {
    const headers = {
      'Accept': 'application/json'
    }

    if (this.token) {
      headers['Authorization'] = `token ${this.token}`
    }

    return headers
  }

  /**
   * Führt einen API-Request aus
   * @param {string} endpoint - API-Endpoint
   * @returns {Promise<Object>} Response-Daten
   */
  async request(endpoint) {
    const url = `${this.baseUrl}${endpoint}`
    
    try {
      const response = await fetch(url, {
        headers: this.getHeaders()
      })

      if (!response.ok) {
        throw new Error(
          `Forgejo API Error: ${response.status} ${response.statusText}`
        )
      }

      return await response.json()
    } catch (error) {
      throw new Error(`Failed to fetch from Forgejo: ${error.message}`)
    }
  }

  /**
   * Ruft Dateiinhalt aus dem Repository ab
   * @param {string} path - Dateipfad im Repository
   * @param {string} ref - Branch/Tag/Commit (optional)
   * @returns {Promise<string>} Dateiinhalt als String
   */
  async getFileContent(path, ref = null) {
    const branch = ref || this.branch
    const endpoint = `/repos/${this.owner}/${this.repo}/contents/${path}?ref=${branch}`
    
    try {
      const data = await this.request(endpoint)
      
      // Forgejo gibt Base64-kodierten Content zurück
      if (data.content && data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf-8')
      }
      
      // Fallback: Download-URL verwenden
      if (data.download_url) {
        const response = await fetch(data.download_url)
        return await response.text()
      }
      
      throw new Error('No content or download_url in response')
    } catch (error) {
      throw new Error(`Failed to get file content: ${error.message}`)
    }
  }

  /**
   * Listet Inhalte eines Verzeichnisses auf
   * @param {string} path - Verzeichnispfad
   * @param {string} ref - Branch/Tag/Commit (optional)
   * @returns {Promise<Array>} Array von Dateien/Verzeichnissen
   */
  async listDirectory(path, ref = null) {
    const branch = ref || this.branch
    const endpoint = `/repos/${this.owner}/${this.repo}/contents/${path}?ref=${branch}`
    
    try {
      const data = await this.request(endpoint)
      
      if (!Array.isArray(data)) {
        throw new Error('Expected directory listing, got single file')
      }
      
      return data.map(item => ({
        name: item.name,
        path: item.path,
        type: item.type, // 'file' oder 'dir'
        size: item.size,
        sha: item.sha,
        url: item.url,
        download_url: item.download_url
      }))
    } catch (error) {
      throw new Error(`Failed to list directory: ${error.message}`)
    }
  }

  /**
   * Listet alle Posts auf
   * @param {string} language - Sprache (default: 'de')
   * @returns {Promise<Array>} Array von Post-Verzeichnissen
   */
  async listPosts(language = 'de') {
    const postsDir = `Website/content/${language}/posts`
    try {
      const contents = await this.listDirectory(postsDir)
      
      // Nur Verzeichnisse zurückgeben
      const postDirs = contents.filter(item => item.type === 'dir')
      
      return postDirs
    } catch (error) {
      throw new Error(`Failed to list posts: ${error.message}`)
    }
  }

  /**
   * Ruft index.md aus einem Post-Verzeichnis ab
   * @param {string} postName - Post-Verzeichnis (z.B. "2025-04-20-OER-und-Symbole")
   * @param {string} language - Sprache (default: 'de')
   * @returns {Promise<string>} Markdown-Content
   */
  async getPostContent(postName, language = 'de') {
    const postsBaseDir = `Website/content/${language}/posts`
    const indexPath = `${postsBaseDir}/${postName}/index.md`
    return await this.getFileContent(indexPath)
  }

  /**
   * Ruft alle Posts mit Content ab
   * @param {string} language - Sprache (default: 'de')
   * @returns {Promise<Array>} Array von Posts mit Content
   */
  async getAllPosts(language = 'de') {
    try {
      const postDirs = await this.listPosts(language)
      
      const posts = await Promise.all(
        postDirs.map(async (dir) => {
          try {
            const content = await this.getPostContent(dir.name, language)
            return {
              directory: dir.name,
              path: `Website/content/${language}/posts/${dir.name}/index.md`,
              content,
              metadata: dir
            }
          } catch (error) {
            console.warn(`Failed to fetch post ${dir.name}:`, error.message)
            return null
          }
        })
      )
      
      // Null-Werte filtern (fehlgeschlagene Requests)
      return posts.filter(post => post !== null)
    } catch (error) {
      throw new Error(`Failed to get all posts: ${error.message}`)
    }
  }

  /**
   * Ruft Repository-Informationen ab
   * @returns {Promise<Object>} Repository-Daten
   */
  async getRepository() {
    const endpoint = `/repos/${this.owner}/${this.repo}`
    return await this.request(endpoint)
  }

  /**
   * Sucht nach Dateien im Repository
   * @param {string} query - Suchbegriff
   * @returns {Promise<Array>} Suchergebnisse
   */
  async searchFiles(query) {
    const endpoint = `/repos/${this.owner}/${this.repo}/search?q=${encodeURIComponent(query)}`
    
    try {
      const data = await this.request(endpoint)
      return data.data || []
    } catch (error) {
      throw new Error(`Failed to search files: ${error.message}`)
    }
  }
}

/**
 * Factory-Funktion: Erstellt ForgejoClient mit Defaults aus .env
 * @param {Object} overrides - Optionale Overrides
 * @returns {ForgejoClient} Konfigurierter Client
 */
export function createForgejoClient(overrides = {}) {
  return new ForgejoClient(overrides)
}
