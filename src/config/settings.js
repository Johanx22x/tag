// Configuración global editable para todos los juegos
export const SETTINGS = {
  // Configuración de AniList
  ANILIST_TOP_THRESHOLD: 100, // Número de animes del top de Anilist a usar
  
  // Configuración de partidas Impostor
  DEFAULT_JOIN_TIME: 15, // Segundos para reclutamiento de jugadores
  DEFAULT_MIN_PLAYERS: 3, // Mínimo de jugadores por partida
  DEFAULT_MAX_PLAYERS: 20, // Máximo de jugadores por partida
  COMMAND_COOLDOWN: 30, // Segundos de cooldown entre comandos
  GAME_AUTO_CLEANUP_TIME: 1800, // Segundos (30 min) antes de limpiar partida automáticamente
  
  // Configuración para el juego de openings
  OPENING_SIMILARITY_THRESHOLD: 0.8, // Similitud mínima para aceptar respuesta (0-1)
  OPENING_ROUND_TIME: 30, // Segundos por ronda
  OPENING_INCLUDE_ENDINGS: true, // Incluir endings además de openings
  OPENING_DISCONNECT_TIMEOUT: 90, // Segundos antes de desconectar por inactividad
  OPENING_MAX_PAGES: 10, // Número de páginas de AnimeThemes a usar (10 páginas = ~500 animes top)
  
  // Configuración para el juego de ahorcado
  HANGMAN_MIN_PLAYERS: 1, // Mínimo de jugadores (solitario o cooperativo)
  HANGMAN_MAX_PLAYERS: 10, // Máximo de jugadores
  HANGMAN_RECRUITMENT_TIME: 20, // Segundos de reclutamiento
  HANGMAN_MAX_WRONG_GUESSES: 6, // Intentos fallidos permitidos
  HANGMAN_TURN_TIME: 30, // Segundos por turno
  
  // Configuración para el juego de adivinar imagen
  GUESSIMAGE_ROUND_TIME: 60, // Segundos por ronda
  GUESSIMAGE_BLUR_AMOUNT: 25, // Cantidad de blur inicial en px (100%)
  GUESSIMAGE_REVEAL_INTERVALS: [15, 30, 45], // Segundos para revelar 66%, 33%, 0% respectivamente
  GUESSIMAGE_SIMILARITY_THRESHOLD: 0.75, // Similitud mínima para aceptar respuesta
};

export default SETTINGS;

