/**
 * Servicio de internacionalización (i18n)
 * Maneja traducciones en múltiples idiomas
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import dbService from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class I18nService {
  constructor() {
    this.translations = {};
    this.defaultLocale = 'es'; // Español por defecto
    this.availableLocales = ['en', 'es'];
    this.loadTranslations();
  }

  /**
   * Carga todos los archivos de traducción
   */
  loadTranslations() {
    for (const locale of this.availableLocales) {
      try {
        const filePath = path.resolve(__dirname, `../locales/${locale}.json`);
        const content = readFileSync(filePath, 'utf-8');
        this.translations[locale] = JSON.parse(content);
        console.log(`✅ Traducciones cargadas: ${locale}`);
      } catch (error) {
        console.error(`❌ Error cargando traducciones ${locale}:`, error.message);
      }
    }
  }

  /**
   * Obtiene el idioma configurado para un servidor
   */
  getGuildLocale(guildId) {
    if (!guildId) return this.defaultLocale;
    
    const locale = dbService.getMetadata(`guild_locale_${guildId}`);
    return locale || this.defaultLocale;
  }

  /**
   * Establece el idioma para un servidor
   */
  setGuildLocale(guildId, locale) {
    if (!this.availableLocales.includes(locale)) {
      throw new Error(`Locale ${locale} no está disponible`);
    }
    
    dbService.setMetadata(`guild_locale_${guildId}`, locale);
  }

  /**
   * Obtiene una traducción por clave
   * Soporta claves anidadas usando puntos: "commands.start.description"
   * Soporta interpolación: "Hello {name}" + {name: "John"} = "Hello John"
   */
  t(key, locale, params = {}) {
    locale = locale || this.defaultLocale;
    
    const keys = key.split('.');
    let value = this.translations[locale];
    
    // Navegar por el objeto anidado
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        break;
      }
    }
    
    // Si no se encuentra, intentar con el idioma por defecto
    if (value === undefined && locale !== this.defaultLocale) {
      return this.t(key, this.defaultLocale, params);
    }
    
    // Si aún no se encuentra, devolver la clave
    if (value === undefined) {
      console.warn(`⚠️ Traducción no encontrada: ${key}`);
      return key;
    }
    
    // Interpolar parámetros
    if (typeof value === 'string') {
      return this.interpolate(value, params);
    }
    
    return value;
  }

  /**
   * Reemplaza {variable} en strings con valores
   */
  interpolate(string, params) {
    return string.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }

  /**
   * Obtiene todas las traducciones para un locale específico
   */
  getTranslations(locale) {
    return this.translations[locale] || this.translations[this.defaultLocale];
  }

  /**
   * Verifica si un locale está disponible
   */
  isValidLocale(locale) {
    return this.availableLocales.includes(locale);
  }

  /**
   * Obtiene la lista de locales disponibles
   */
  getAvailableLocales() {
    return this.availableLocales;
  }
}

// Exportar instancia única
const i18nService = new I18nService();
export default i18nService;
