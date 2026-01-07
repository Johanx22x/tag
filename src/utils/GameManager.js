/**
 * Gestor centralizado para el estado de las partidas
 * Maneja cooldowns, partidas activas y validaciones comunes
 */

export class GameManager {
  constructor() {
    this.activeGames = new Map(); // guildId => gameData
    this.cooldowns = new Map(); // userId => timestamp
  }

  /**
   * Verifica si hay una partida activa en el servidor
   */
  isGameActive(guildId) {
    return this.activeGames.has(guildId);
  }

  /**
   * Inicia una nueva partida
   */
  startGame(guildId, gameData) {
    this.activeGames.set(guildId, {
      ...gameData,
      startedAt: Date.now()
    });
  }

  /**
   * Finaliza una partida
   */
  endGame(guildId) {
    return this.activeGames.delete(guildId);
  }

  /**
   * Obtiene datos de una partida activa
   */
  getGame(guildId) {
    return this.activeGames.get(guildId);
  }

  /**
   * Verifica el cooldown de un usuario
   */
  isInCooldown(userId, cooldownSeconds = 60) {
    const lastUsed = this.cooldowns.get(userId);
    if (!lastUsed) return false;
    
    const elapsed = (Date.now() - lastUsed) / 1000;
    return elapsed < cooldownSeconds;
  }

  /**
   * Obtiene el tiempo restante de cooldown
   */
  getCooldownRemaining(userId, cooldownSeconds = 60) {
    const lastUsed = this.cooldowns.get(userId);
    if (!lastUsed) return 0;
    
    const elapsed = (Date.now() - lastUsed) / 1000;
    return Math.max(0, Math.ceil(cooldownSeconds - elapsed));
  }

  /**
   * Establece el cooldown para un usuario
   */
  setCooldown(userId) {
    this.cooldowns.set(userId, Date.now());
  }

  /**
   * Limpia cooldowns expirados (llamar periódicamente)
   */
  cleanupCooldowns(maxAgeSeconds = 300) {
    const now = Date.now();
    for (const [userId, timestamp] of this.cooldowns.entries()) {
      if ((now - timestamp) / 1000 > maxAgeSeconds) {
        this.cooldowns.delete(userId);
      }
    }
  }

  /**
   * Obtiene estadísticas del gestor
   */
  getStats() {
    return {
      activeGames: this.activeGames.size,
      cooldownsActive: this.cooldowns.size
    };
  }
}

// Exportar instancia única (singleton)
export default new GameManager();
