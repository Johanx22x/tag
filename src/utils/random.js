/**
 * Funciones de utilidad para selección aleatoria
 */

/**
 * Selecciona un elemento aleatorio de un array
 */
export function randomElement(array) {
  if (!array || array.length === 0) {
    throw new Error('El array está vacío o es inválido');
  }
  // Usar crypto para mejor aleatoriedad si está disponible
  const randomIndex = Math.floor(Math.random() * array.length);
  console.log(`🎲 Seleccionando índice ${randomIndex} de ${array.length} elementos`);
  return array[randomIndex];
}

/**
 * Selecciona un impostor aleatorio de la lista de jugadores
 */
export function selectImpostor(players) {
  return randomElement(players);
}

/**
 * Mezcla un array usando el algoritmo Fisher-Yates
 */
export function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
