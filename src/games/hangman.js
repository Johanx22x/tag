/**
 * Comando Hangman - Ahorcado cooperativo de anime
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import gameManager from '../utils/GameManager.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed, formatPlayerList } from '../utils/gameHelpers.js';
import { COLORS, EMOJIS } from '../config/constants.js';
import SETTINGS from '../config/settings.js';
import anilistService from '../services/anilistService.js';

export const data = new SlashCommandBuilder()
  .setName('hangman')
  .setDescription('Ahorcado cooperativo de anime')
  .addSubcommand(subcommand =>
    subcommand.setName('start').setDescription('Inicia una partida de ahorcado')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('rules').setDescription('Muestra las reglas del juego')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('stop').setDescription('Detiene la partida actual')
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'start':
      return await handleStart(interaction);
    case 'rules':
      return await handleRules(interaction);
    case 'stop':
      return await handleStop(interaction);
  }
}

/**
 * Normaliza el título del anime para el juego
 * Convierte a mayúsculas, elimina acentos, caracteres especiales
 * Mantiene solo letras, números y espacios
 */
function normalizeTitle(title) {
  return title
    .normalize('NFD') // Descomponer caracteres con acentos
    .replace(/[\u0300-\u036f]/g, '') // Eliminar marcas diacríticas
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '') // Solo letras, números y espacios
    .replace(/\s+/g, ' ') // Normalizar espacios múltiples
    .trim();
}

/**
 * Renderiza el progreso del ahorcado
 */
function renderProgress(normalized, guessedLetters) {
  const result = normalized
    .split('')
    .map(char => {
      if (char === ' ') return '   '; // Espacio visible entre palabras
      if (guessedLetters.has(char)) return char;
      return '_';
    })
    .join(' ');
  
  // Usar bloque de código para evitar interpretación de Markdown
  return '```\n' + result + '\n```';
}

/**
 * Dibuja el ahorcado ASCII
 */
function drawHangman(wrongGuesses) {
  const stages = [
    // 0 errores
    '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
    // 1 error
    '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
    // 2 errores
    '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
    // 3 errores
    '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
    // 4 errores
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
    // 5 errores
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
    // 6 errores (perdido)
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```'
  ];
  
  return stages[Math.min(wrongGuesses, stages.length - 1)];
}

/**
 * Inicia el reclutamiento de jugadores
 */
async function handleStart(interaction) {
  if (gameManager.isGameActive(interaction.guildId)) {
    // Si ya se hizo defer, usar editReply, sino reply
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({
        embeds: [createErrorEmbed('Ya hay una partida activa en este servidor.')]
      });
    }
    return await interaction.reply({
      embeds: [createErrorEmbed('Ya hay una partida activa en este servidor.')],
      flags: MessageFlags.Ephemeral
    });
  }

  // Solo hacer defer si no se hizo antes
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  // Seleccionar anime aleatorio
  let animeList;
  try {
    animeList = await anilistService.getAnimes();
  } catch (error) {
    console.error('Error obteniendo animes:', error);
    return await interaction.editReply({
      embeds: [createErrorEmbed('El servicio de AniList no está disponible. Intenta más tarde.')]
    });
  }

  if (!animeList || animeList.length === 0) {
    return await interaction.editReply({
      embeds: [createErrorEmbed('No hay animes disponibles en este momento.')]
    });
  }

  const randomAnime = animeList[Math.floor(Math.random() * animeList.length)];
  const originalTitle = randomAnime.title.english || randomAnime.title.romaji;
  const normalizedTitle = normalizeTitle(originalTitle);

  // Crear botones de reclutamiento
  const joinButton = new ButtonBuilder()
    .setCustomId('hangman_join')
    .setLabel('Unirse')
    .setEmoji('✋')
    .setStyle(ButtonStyle.Success);

  const leaveButton = new ButtonBuilder()
    .setCustomId('hangman_leave')
    .setLabel('Salir')
    .setEmoji('🚪')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(joinButton, leaveButton);

  const recruitEmbed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('📝 Ahorcado de Anime - Reclutamiento')
    .setDescription(
      `¡Únete a la partida de ahorcado cooperativo!\n\n` +
      `**Jugadores:** 0/${SETTINGS.HANGMAN_MAX_PLAYERS}\n` +
      `**Mínimo requerido:** ${SETTINGS.HANGMAN_MIN_PLAYERS}\n` +
      `**Tiempo:** ${SETTINGS.HANGMAN_RECRUITMENT_TIME} segundos\n\n` +
      `🎮 **Reglas:**\n` +
      `• Por turnos, cada jugador propone una letra\n` +
      `• ${SETTINGS.HANGMAN_MAX_WRONG_GUESSES} fallos permitidos\n` +
      `• Adivinen el título del anime juntos\n` +
      `• ${SETTINGS.HANGMAN_TURN_TIME}s por turno`
    )
    .setFooter({ text: 'Presiona "Unirse" para jugar' })
    .setTimestamp();

  const message = await interaction.editReply({
    embeds: [recruitEmbed],
    components: [row]
  });

  // Inicializar datos del juego
  const players = new Set();
  
  gameManager.startGame(interaction.guildId, {
    type: 'hangman',
    phase: 'recruitment',
    players: players,
    originalTitle: originalTitle,
    normalizedTitle: normalizedTitle,
    guessedLetters: new Set(),
    wrongGuesses: 0,
    wrongLetters: new Set(),
    currentPlayerIndex: 0,
    messageId: message.id,
    consecutiveTimeouts: 0
  });

  // Collector para botones
  const collector = message.createMessageComponentCollector({
    time: SETTINGS.HANGMAN_RECRUITMENT_TIME * 1000
  });

  collector.on('collect', async i => {
    const game = gameManager.getGame(interaction.guildId);
    if (!game || game.phase !== 'recruitment') {
      return await i.reply({ content: 'Esta partida ya no está en reclutamiento.', flags: MessageFlags.Ephemeral });
    }

    if (i.customId === 'hangman_join') {
      if (game.players.size >= SETTINGS.HANGMAN_MAX_PLAYERS) {
        return await i.reply({ content: 'La partida está llena.', flags: MessageFlags.Ephemeral });
      }
      
      game.players.add(i.user.id);
      await i.reply({ content: '✅ Te has unido a la partida.', flags: MessageFlags.Ephemeral });
    } else if (i.customId === 'hangman_leave') {
      if (!game.players.has(i.user.id)) {
        return await i.reply({ content: 'No estás en la partida.', flags: MessageFlags.Ephemeral });
      }
      
      game.players.delete(i.user.id);
      await i.reply({ content: '👋 Has salido de la partida.', flags: MessageFlags.Ephemeral });
    }

    // Actualizar embed
    const updatedEmbed = EmbedBuilder.from(recruitEmbed)
      .setDescription(
        `¡Únete a la partida de ahorcado cooperativo!\n\n` +
        `**Jugadores:** ${game.players.size}/${SETTINGS.HANGMAN_MAX_PLAYERS}\n` +
        `**Mínimo requerido:** ${SETTINGS.HANGMAN_MIN_PLAYERS}\n` +
        `**Tiempo:** ${SETTINGS.HANGMAN_RECRUITMENT_TIME} segundos\n\n` +
        `🎮 **Reglas:**\n` +
        `• Por turnos, cada jugador propone una letra\n` +
        `• ${SETTINGS.HANGMAN_MAX_WRONG_GUESSES} fallos permitidos\n` +
        `• Adivinen el título del anime juntos\n` +
        `• ${SETTINGS.HANGMAN_TURN_TIME}s por turno\n\n` +
        `👥 **Jugadores unidos:**\n${formatPlayerList(Array.from(game.players))}`
      );

    await message.edit({ embeds: [updatedEmbed] });
  });

  collector.on('end', async () => {
    const game = gameManager.getGame(interaction.guildId);
    
    if (!game || game.phase !== 'recruitment') return;

    // Deshabilitar botones
    row.components.forEach(button => button.setDisabled(true));
    await message.edit({ components: [row] });

    // Verificar mínimo de jugadores
    if (game.players.size < SETTINGS.HANGMAN_MIN_PLAYERS) {
      gameManager.endGame(interaction.guildId);
      return await interaction.followUp({
        embeds: [createErrorEmbed(`No hay suficientes jugadores. Se necesitan al menos ${SETTINGS.HANGMAN_MIN_PLAYERS}.`)]
      });
    }

    // Iniciar juego
    await startGameplay(interaction, game);
  });
}

/**
 * Inicia la fase de juego
 */
async function startGameplay(interaction, game) {
  game.phase = 'playing';
  game.playersArray = Array.from(game.players);
  
  // Shuffle players
  game.playersArray.sort(() => Math.random() - 0.5);
  
  const startEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle('🎮 ¡Comienza el Ahorcado!')
    .setDescription(
      `**Anime a adivinar:**\n${renderProgress(game.normalizedTitle, game.guessedLetters)}\n\n` +
      `${drawHangman(game.wrongGuesses)}\n` +
      `**Letras incorrectas:** Ninguna\n` +
      `**Errores:** ${game.wrongGuesses}/${SETTINGS.HANGMAN_MAX_WRONG_GUESSES}\n\n` +
      `**Orden de turnos:**\n${formatPlayerList(game.playersArray)}`
    )
    .setFooter({ text: 'Escribe una letra en el chat cuando sea tu turno' })
    .setTimestamp();

  await interaction.followUp({ embeds: [startEmbed] });

  // Iniciar turno
  await nextTurn(interaction, game);
}

/**
 * Gestiona el siguiente turno
 */
async function nextTurn(interaction, game) {
  if (!game || game.phase !== 'playing') return;

  const currentPlayerId = game.playersArray[game.currentPlayerIndex];
  const currentPlayer = await interaction.client.users.fetch(currentPlayerId);

  const turnEmbed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`⏰ Turno de ${currentPlayer.username}`)
    .setDescription(
      `${renderProgress(game.normalizedTitle, game.guessedLetters)}\n\n` +
      `${drawHangman(game.wrongGuesses)}\n` +
      `**Letras incorrectas:** ${game.wrongLetters.size > 0 ? Array.from(game.wrongLetters).join(', ') : 'Ninguna'}\n` +
      `**Errores:** ${game.wrongGuesses}/${SETTINGS.HANGMAN_MAX_WRONG_GUESSES}\n\n` +
      `<@${currentPlayerId}>, escribe **una letra** en el chat (${SETTINGS.HANGMAN_TURN_TIME}s)`
    )
    .setTimestamp();

  await interaction.channel.send({ embeds: [turnEmbed] });

  // Collector para respuesta
  const filter = m => m.author.id === currentPlayerId && !m.author.bot;
  const collector = interaction.channel.createMessageCollector({
    filter,
    time: SETTINGS.HANGMAN_TURN_TIME * 1000,
    max: 1
  });

  collector.on('collect', async msg => {
    // Resetear timeouts consecutivos cuando alguien responde
    game.consecutiveTimeouts = 0;
    
    const letter = normalizeTitle(msg.content);
    
    // Validar que sea una sola letra
    if (letter.length !== 1 || !/[A-Z0-9]/.test(letter)) {
      await msg.reply({ content: '❌ Debes escribir una sola letra válida (A-Z, 0-9).', ephemeral: false });
      return await nextTurn(interaction, game);
    }

    // Verificar si ya fue usada
    if (game.guessedLetters.has(letter) || game.wrongLetters.has(letter)) {
      await msg.reply({ content: `❌ La letra **${letter}** ya fue usada. Pierdes el turno.`, ephemeral: false });
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.playersArray.length;
      return await nextTurn(interaction, game);
    }

    // Verificar si la letra está en el título
    if (game.normalizedTitle.includes(letter)) {
      game.guessedLetters.add(letter);
      await msg.reply({ content: `✅ ¡Correcto! La letra **${letter}** está en el título.`, ephemeral: false });
      
      // Verificar victoria
      const allLettersGuessed = game.normalizedTitle
        .split('')
        .every(char => char === ' ' || game.guessedLetters.has(char));
      
      if (allLettersGuessed) {
        return await handleVictory(interaction, game);
      }
    } else {
      game.wrongLetters.add(letter);
      game.wrongGuesses++;
      await msg.reply({ content: `❌ La letra **${letter}** no está en el título.`, ephemeral: false });
      
      // Verificar derrota
      if (game.wrongGuesses >= SETTINGS.HANGMAN_MAX_WRONG_GUESSES) {
        return await handleDefeat(interaction, game);
      }
    }

    // Siguiente jugador
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.playersArray.length;
    await nextTurn(interaction, game);
  });

  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      // Timeout - incrementar contador
      game.consecutiveTimeouts++;
      
      await interaction.channel.send({
        content: `⏱️ <@${currentPlayerId}> se quedó sin tiempo. (${game.consecutiveTimeouts}/2 timeouts)`
      });
      
      // Terminar juego después de 2 timeouts consecutivos
      if (game.consecutiveTimeouts >= 2) {
        return await handleTimeout(interaction, game);
      }
      
      const stillActive = gameManager.getGame(interaction.guildId);
      if (stillActive && stillActive.phase === 'playing') {
        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.playersArray.length;
        await nextTurn(interaction, game);
      }
    }
  });
}

/**
 * Maneja el fin del juego por inactividad
 */
async function handleTimeout(interaction, game) {
  const timeoutEmbed = new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle('⏱️ Juego Terminado por Inactividad')
    .setDescription(
      `El juego ha terminado debido a múltiples timeouts consecutivos.\n\n` +
      `**El anime era:** ${game.originalTitle}\n` +
      `**Progreso:** ${renderProgress(game.normalizedTitle, game.guessedLetters)}`
    )
    .setTimestamp();

  await interaction.channel.send({ embeds: [timeoutEmbed] });
  gameManager.endGame(interaction.guildId);
}

/**
 * Maneja la victoria
 */
async function handleVictory(interaction, game) {
  const victoryEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle('🎉 ¡Victoria!')
    .setDescription(
      `¡Han adivinado el anime!\n\n` +
      `**Anime:** ${game.originalTitle}\n` +
      `${renderProgress(game.normalizedTitle, game.guessedLetters)}\n\n` +
      `${drawHangman(game.wrongGuesses)}\n` +
      `**Errores cometidos:** ${game.wrongGuesses}/${SETTINGS.HANGMAN_MAX_WRONG_GUESSES}\n\n` +
      `**Jugadores:**\n${formatPlayerList(game.playersArray)}`
    )
    .setTimestamp();

  await interaction.channel.send({ embeds: [victoryEmbed] });
  gameManager.endGame(interaction.guildId);
}

/**
 * Maneja la derrota
 */
async function handleDefeat(interaction, game) {
  const defeatEmbed = new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle('💀 Derrota')
    .setDescription(
      `Se han agotado los intentos.\n\n` +
      `**El anime era:** ${game.originalTitle}\n` +
      `**Progreso:** ${renderProgress(game.normalizedTitle, game.guessedLetters)}\n\n` +
      `${drawHangman(game.wrongGuesses)}\n` +
      `**Letras incorrectas:** ${Array.from(game.wrongLetters).join(', ')}`
    )
    .setTimestamp();

  await interaction.channel.send({ embeds: [defeatEmbed] });
  gameManager.endGame(interaction.guildId);
}

/**
 * Muestra las reglas
 */
async function handleRules(interaction) {
  const rulesEmbed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('📖 Reglas del Ahorcado de Anime')
    .setDescription(
      `**Objetivo:**\n` +
      `Adivinar el título de un anime letra por letra antes de agotar los ${SETTINGS.HANGMAN_MAX_WRONG_GUESSES} intentos.\n\n` +
      `**Cómo jugar:**\n` +
      `1️⃣ Únete durante el reclutamiento\n` +
      `2️⃣ Espera tu turno\n` +
      `3️⃣ Escribe **una letra** (A-Z, 0-9) en el chat\n` +
      `4️⃣ Si aciertas, la letra se revela\n` +
      `5️⃣ Si fallas, pierdes un intento\n` +
      `6️⃣ Ganan si completan el título antes de ${SETTINGS.HANGMAN_MAX_WRONG_GUESSES} fallos\n\n` +
      `**Notas:**\n` +
      `• Los títulos se normalizan (sin acentos ni símbolos especiales)\n` +
      `• Tienes ${SETTINGS.HANGMAN_TURN_TIME} segundos por turno\n` +
      `• Las letras repetidas hacen perder el turno\n` +
      `• Es un juego cooperativo - ¡trabajen en equipo!`
    )
    .setFooter({ text: 'Usa /hangman start para jugar' })
    .setTimestamp();

  await interaction.reply({ embeds: [rulesEmbed] });
}

/**
 * Detiene la partida actual
 */
async function handleStop(interaction) {
  const game = gameManager.getGame(interaction.guildId);

  if (!game || game.type !== 'hangman') {
    return await interaction.reply({
      embeds: [createErrorEmbed('No hay ninguna partida de ahorcado activa.')],
      flags: MessageFlags.Ephemeral
    });
  }

  // Solo quien inició o un admin puede detener
  const member = interaction.member;
  if (!member.permissions.has('ManageMessages') && !game.players.has(interaction.user.id)) {
    return await interaction.reply({
      embeds: [createErrorEmbed('Solo los jugadores o administradores pueden detener la partida.')],
      flags: MessageFlags.Ephemeral
    });
  }

  // Detener collector si existe
  if (game.collector) {
    game.collector.stop('manual_stop');
  }
  
  gameManager.endGame(interaction.guildId);
  console.log('🎯 Hangman terminado');

  await interaction.reply({
    embeds: [createInfoEmbed(
      '🛑 Partida Detenida',
      `La partida de ahorcado ha sido detenida por ${interaction.user}.`
    )]
  });
}
