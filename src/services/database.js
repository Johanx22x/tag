/**
 * Servicio de base de datos SQLite
 * Persiste datos de AniList para reducir requests a la API
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseService {
  constructor() {
    const dbPath = path.resolve(__dirname, '../../data/tag.db');
    this.db = new Database(dbPath);
    this.initTables();
  }

  /**
   * Inicializa las tablas necesarias
   */
  initTables() {
    // Tabla para animes
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS animes (
        id INTEGER PRIMARY KEY,
        title_romaji TEXT NOT NULL,
        title_english TEXT,
        format TEXT,
        average_score INTEGER,
        popularity INTEGER,
        updated_at INTEGER NOT NULL
      )
    `);

    // Tabla para configuración/metadata
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Índices para búsquedas rápidas
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_animes_score ON animes(average_score DESC)
    `);

    console.log('✅ Base de datos inicializada');
  }

  /**
   * Guarda lista de animes en la BD
   */
  saveAnimes(animes) {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO animes (id, title_romaji, title_english, format, average_score, popularity, updated_at)
      VALUES (@id, @title_romaji, @title_english, @format, @average_score, @popularity, @updated_at)
    `);

    const insertMany = this.db.transaction((animeList) => {
      const now = Date.now();
      for (const anime of animeList) {
        insert.run({
          id: anime.id,
          title_romaji: anime.title.romaji,
          title_english: anime.title.english || null,
          format: anime.format || null,
          average_score: anime.averageScore || null,
          popularity: anime.popularity || null,
          updated_at: now
        });
      }
    });

    insertMany(animes);
    
    // Actualizar timestamp de última actualización
    this.setMetadata('last_anime_update', Date.now().toString());
    
    console.log(`💾 ${animes.length} animes guardados en BD`);
  }

  /**
   * Obtiene todos los animes de la BD
   */
  getAnimes() {
    const query = this.db.prepare(`
      SELECT 
        id,
        title_romaji,
        title_english,
        format,
        average_score as averageScore,
        popularity
      FROM animes
      ORDER BY average_score DESC
    `);

    const rows = query.all();
    
    // Convertir a formato AniList
    return rows.map(row => ({
      id: row.id,
      title: {
        romaji: row.title_romaji,
        english: row.title_english
      },
      format: row.format,
      averageScore: row.averageScore,
      popularity: row.popularity
    }));
  }

  /**
   * Obtiene un anime aleatorio
   */
  getRandomAnime() {
    const query = this.db.prepare(`
      SELECT 
        id,
        title_romaji,
        title_english,
        format,
        average_score as averageScore,
        popularity
      FROM animes
      ORDER BY RANDOM()
      LIMIT 1
    `);

    const row = query.get();
    
    if (!row) return null;
    
    return {
      id: row.id,
      title: {
        romaji: row.title_romaji,
        english: row.title_english
      },
      format: row.format,
      averageScore: row.averageScore,
      popularity: row.popularity
    };
  }

  /**
   * Cuenta animes en la BD
   */
  getAnimeCount() {
    const query = this.db.prepare('SELECT COUNT(*) as count FROM animes');
    const result = query.get();
    return result.count;
  }

  /**
   * Guarda metadata
   */
  setMetadata(key, value) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO metadata (key, value, updated_at)
      VALUES (?, ?, ?)
    `);
    
    stmt.run(key, value, Date.now());
  }

  /**
   * Obtiene metadata
   */
  getMetadata(key) {
    const query = this.db.prepare('SELECT value FROM metadata WHERE key = ?');
    const result = query.get(key);
    return result ? result.value : null;
  }

  /**
   * Obtiene timestamp de última actualización de animes
   */
  getLastAnimeUpdate() {
    const timestamp = this.getMetadata('last_anime_update');
    return timestamp ? parseInt(timestamp) : null;
  }

  /**
   * Verifica si necesita actualización (más de 24 horas)
   */
  needsUpdate() {
    const lastUpdate = this.getLastAnimeUpdate();
    if (!lastUpdate) return true;
    
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas
    return (Date.now() - lastUpdate) > CACHE_DURATION;
  }

  /**
   * Limpia todos los datos
   */
  clearAll() {
    this.db.exec('DELETE FROM animes');
    this.db.exec('DELETE FROM metadata');
    console.log('🗑️ Base de datos limpiada');
  }

  /**
   * Cierra la conexión a la BD
   */
  close() {
    this.db.close();
  }
}

// Exportar instancia única
const dbService = new DatabaseService();
export default dbService;
