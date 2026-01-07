/**
 * Constantes de configuración del bot
 */

// Configuración del juego
export const GAME_CONFIG = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 20,
  COOLDOWN_SECONDS: 60,
  JOIN_TIME_SECONDS: 15
};

// Emojis
export const EMOJIS = {
  ANIME: '🎌',
  GAME: '🎮',
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  LOADING: '⏳',
  IMPOSTOR: '🎭'
};

// Colores para embeds
export const COLORS = {
  PRIMARY: 0x5865F2,
  SUCCESS: 0x57F287,
  ERROR: 0xED4245,
  WARNING: 0xFEE75C,
  INFO: 0x5865F2
};

// Mensajes
export const MESSAGES = {
  ERRORS: {
    NOT_IN_VOICE: 'Debes estar en un canal de voz para iniciar una partida',
    MIN_PLAYERS: `Se necesitan al menos ${GAME_CONFIG.MIN_PLAYERS} jugadores para jugar`,
    NOT_ENOUGH_PLAYERS: `No se unieron suficientes jugadores. Se necesitan al menos ${GAME_CONFIG.MIN_PLAYERS}`,
    DM_BLOCKED: 'Algunos jugadores tienen los DMs bloqueados. Todos deben permitir mensajes privados del bot',
    API_ERROR: 'Error al obtener datos de AniList. Por favor, intenta de nuevo',
    GAME_ERROR: 'Ocurrió un error al iniciar la partida. Por favor, intenta de nuevo'
  },
  SUCCESS: {
    ROLES_SENT: '¡Roles enviados por DM. El juego ha comenzado!',
    GAME_STARTED: 'Partida iniciada con éxito'
  }
};

// Reglas generales para juegos de anime
export const GAME_RULES = `
**📜 REGLAS DE LOS JUEGOS DE ANIME**

**Objetivo:**
- Participa en diferentes juegos temáticos de anime con tus amigos.

**Cómo jugar:**
1. Únete a una partida desde el canal de voz.
2. Sigue las instrucciones específicas de cada juego.
3. Interactúa usando los comandos y botones disponibles.

**Ganar:**
- Cada juego tiene sus propias condiciones de victoria.

**Consejos:**
- Lee las reglas específicas de cada juego.
- ¡Diviértete y comparte tu pasión por el anime!
`;

// Formato de anime traducido al español
export const ANIME_FORMATS = {
  TV: 'Serie TV',
  MOVIE: 'Película',
  OVA: 'OVA',
  ONA: 'ONA',
  SPECIAL: 'Especial',
  MUSIC: 'Video Musical'
};
