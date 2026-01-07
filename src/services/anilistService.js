/**
 * Servicio para obtener animes del Top 500 de AniList
 * Incluye persistencia en SQLite con refrescado cada 24 horas
 */

import dbService from './database.js';

const ANILIST_API = 'https://graphql.anilist.co';
const TOP_LIMIT = 500;

class AniListService {
  constructor() {
    this.isFetching = false;
    this.isReady = false;
    this.initializationPromise = null;
  }

  /**
   * Query GraphQL para obtener el Top 500 de AniList
   */
  getQuery(page = 1, perPage = 50) {
    return {
      query: `
        query ($page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            pageInfo {
              hasNextPage
              currentPage
            }
            media(
              type: ANIME,
              sort: SCORE_DESC,
              format_in: [TV, MOVIE, OVA, ONA, SPECIAL]
            ) {
              id
              title {
                romaji
                english
              }
              format
              averageScore
              popularity
            }
          }
        }
      `,
      variables: {
        page,
        perPage
      }
    };
  }

  /**
   * Realiza request a la API de AniList
   */
  async fetchFromAPI(page, perPage) {
    const response = await fetch(ANILIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(this.getQuery(page, perPage))
    });

    if (!response.ok) {
      throw new Error(`AniList API error: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Obtiene todos los animes del Top 500
   */
  async fetchTop500() {
    console.log('📥 Obteniendo Top 500 animes de AniList...');
    const allAnimes = [];
    const perPage = 50;
    const totalPages = Math.ceil(TOP_LIMIT / perPage);

    try {
      for (let page = 1; page <= totalPages; page++) {
        const data = await this.fetchFromAPI(page, perPage);
        
        if (data.data?.Page?.media) {
          allAnimes.push(...data.data.Page.media);
        }

        // Rate limiting: esperar 1 segundo entre requests
        if (page < totalPages) {
          await this.sleep(1000);
        }
      }

      console.log(`✅ ${allAnimes.length} animes obtenidos exitosamente`);
      return allAnimes.slice(0, TOP_LIMIT); // Asegurar máximo 500
    } catch (error) {
      console.error('❌ Error obteniendo animes de AniList:', error.message);
      throw error;
    }
  }

  /**
   * Inicializa o actualiza el cache en BD
   */
  async refreshCache() {
    if (this.isFetching) {
      console.log('⏳ Ya hay una actualización en curso...');
      return;
    }

    this.isFetching = true;

    try {
      const animes = await this.fetchTop500();
      dbService.saveAnimes(animes);
      console.log(`🔄 Cache actualizado en BD: ${animes.length} animes`);
    } catch (error) {
      console.error('⚠️ No se pudo actualizar el cache:', error.message);
      // Si falla, mantener datos existentes en BD
      const count = dbService.getAnimeCount();
      if (count === 0) {
        throw new Error('No hay datos en BD y falló la obtención de datos');
      }
      console.log(`📦 Usando ${count} animes existentes en BD`);
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Obtiene animes desde BD, actualizando si es necesario
   */
  async getAnimes() {
    // Verificar si hay datos en BD
    const count = dbService.getAnimeCount();
    
    // Si no hay datos o necesita actualización, refrescar
    if (count === 0 || dbService.needsUpdate()) {
      console.log('🔄 Actualizando datos de AniList...');
      await this.refreshCache();
    } else {
      const lastUpdate = dbService.getLastAnimeUpdate();
      const hoursAgo = Math.floor((Date.now() - lastUpdate) / (1000 * 60 * 60));
      console.log(`📦 Usando ${count} animes de BD (actualizado hace ${hoursAgo}h)`);
    }
    
    return dbService.getAnimes();
  }

  /**
   * Obtiene un anime aleatorio
   */
  async getRandomAnime() {
    // Asegurar que hay datos
    const count = dbService.getAnimeCount();
    if (count === 0 || dbService.needsUpdate()) {
      await this.refreshCache();
    }
    
    return dbService.getRandomAnime();
  }

  /**
   * Inicializa el servicio (cargar cache inicial)
   */
  async initialize() {
    // Si ya se está inicializando, esperar a que termine
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Si ya está listo, no hacer nada
    if (this.isReady) {
      return Promise.resolve();
    }

    this.initializationPromise = (async () => {
      try {
        console.log('🚀 Inicializando servicio de AniList...');
        await this.refreshCache();
        this.isReady = true;
        
        // Configurar actualización automática cada 24 horas
        const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas
        const refreshInterval = Math.max(CACHE_DURATION, 60000); // Mínimo 1 minuto
        setInterval(async () => {
          console.log('⏰ Actualización programada del cache...');
          await this.refreshCache();
        }, refreshInterval);
      } catch (error) {
        this.isReady = false;
        throw error;
      } finally {
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Espera a que el servicio esté listo
   */
  async waitForReady() {
    if (this.isReady) {
      return;
    }
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * Helper: sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtiene información del estado del cache
   */
  getCacheInfo() {
    const lastUpdate = dbService.getLastAnimeUpdate();
    const count = dbService.getAnimeCount();
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas
    
    return {
      totalAnimes: count,
      lastFetch: lastUpdate ? new Date(lastUpdate).toISOString() : 'Nunca',
      nextRefresh: lastUpdate 
        ? new Date(lastUpdate + CACHE_DURATION).toISOString() 
        : 'Pendiente',
      cacheAge: lastUpdate 
        ? Math.floor((Date.now() - lastUpdate) / 1000 / 60) + ' minutos'
        : 'N/A'
    };
  }
}

// Exportar instancia única (singleton)
export default new AniListService();
