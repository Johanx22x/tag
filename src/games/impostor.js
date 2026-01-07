/**
 * Comando Impostor - Juego principal del bot
 * Cada jugador recibe un anime por DM excepto el impostor
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import anilistService from '../services/anilistService.js';
import gameManager from '../utils/GameManager.js';
import { selectImpostor, shuffleArray } from '../utils/random.js';
import { createErrorEmbed, createSuccessEmbed, validateVoiceChannel, sendDMsToPlayers, formatPlayerList } from '../utils/gameHelpers.js';
import { EMOJIS, COLORS, MESSAGES, GAME_RULES, ANIME_FORMATS } from '../config/constants.js';
import SETTINGS from '../config/settings.js';

export const data = new SlashCommandBuilder()
  .setName('impostor')
  .setDescription('Juega al Impostor con animes')
  .addSubcommand(subcommand =>
    subcommand.setName('start').setDescription('Inicia una partida de Impostor')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('rules').setDescription('Muestra las reglas del juego')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('stop').setDescription('Detiene la partida activa')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('ping').setDescription('Muestra la latencia y estado del bot')
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  
  switch (subcommand) {
    case 'start':
      return await handleStartGame(interaction);
    case 'rules':
      return await handleRules(interaction);
    case 'stop':
      return await handleStop(interaction);
    case 'ping':
      return await handlePing(interaction);
  }
}

/**
 * Inicia una nueva partida del juego Impostor
 */
async function handleStartGame(interaction) {
  // Validaciones iniciales
  const voiceValidation = validateVoiceChannel(interaction);
  if (!voiceValidation.valid) {
    return await interaction.reply({ 
      embeds: [createErrorEmbed(voiceValidation.error)], 
      ephemeral: true 
    });
  }

  const voiceChannel = voiceValidation.voiceChannel;

  // Verificar si ya hay una partida activa en el servidor
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

  // Responder según si ya se hizo defer o no
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: '⏳ Reclutando jugadores...' });
  } else {
    await interaction.reply({ content: '⏳ Reclutando jugadores...' });
  }

  // Crear interfaz de reclutamiento
  const { embed, button, row } = createRecruitmentUI(interaction.user, voiceChannel);
  const message = await interaction.editReply({ embeds: [embed], components: [row] });

  // Recolectar jugadores
  const players = await collectPlayers(message, voiceChannel, embed, button, row);

  // Validar número mínimo de jugadores
  if (players.size < SETTINGS.DEFAULT_MIN_PLAYERS) {
    button.setDisabled(true);
    await message.edit({ 
      embeds: [createGameCancelledEmbed(players.size)], 
      components: [new ActionRowBuilder().addComponents(button)] 
    });
    return;
  }

  // Obtener miembros del servidor
  const playerMembers = await fetchPlayerMembers(interaction.guild, players);

  // Iniciar el juego
  await startGame(interaction, message, playerMembers, voiceChannel, button);
}

/**
 * Crea la interfaz de reclutamiento de jugadores
 */
function createRecruitmentUI(user, voiceChannel) {
  const button = new ButtonBuilder()
    .setCustomId('join_game')
    .setLabel('🎮 Unirse a la Partida')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(button);

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('🎌 Nueva Partida de Impostor')
    .setDescription(
      `¡${user} está iniciando una partida!\n\n` +
      `Haz clic en el botón para unirte.\n` +
      `**Tiempo restante:** ${SETTINGS.DEFAULT_JOIN_TIME} segundos\n` +
      `**Jugadores necesarios:** Mínimo ${SETTINGS.DEFAULT_MIN_PLAYERS}`
    )
    .addFields(
      { name: 'Canal de Voz', value: voiceChannel.name, inline: true },
      { name: 'Jugadores Unidos', value: '0', inline: true }
    )
    .setFooter({ text: 'Solo los jugadores que hagan clic participarán' })
    .setTimestamp();

  return { embed, button, row };
}

/**
 * Recolecta jugadores que se unen a la partida
 */
async function collectPlayers(message, voiceChannel, embed, button, row) {
  const players = new Set();

  const collector = message.createMessageComponentCollector({
    filter: (i) => i.customId === 'join_game',
    time: SETTINGS.DEFAULT_JOIN_TIME * 1000
  });

  collector.on('collect', async (i) => {
    const member = i.member;

    // Validaciones
    if (!member?.voice?.channel || member.voice.channel.id !== voiceChannel.id) {
      return await i.reply({ 
        content: '❌ Debes estar en el mismo canal de voz para unirte', 
        flags: MessageFlags.Ephemeral 
      });
    }

    if (member.user.bot) {
      return await i.reply({ 
        content: '❌ Los bots no pueden jugar', 
        flags: MessageFlags.Ephemeral 
      });
    }

    if (players.has(member.id)) {
      return await i.reply({ 
        content: '⚠️ Ya estás en la partida', 
        flags: MessageFlags.Ephemeral 
      });
    }

    // Agregar jugador
    players.add(member.id);
    await i.reply({ content: '✅ Te has unido a la partida', flags: MessageFlags.Ephemeral });

    // Actualizar embed
    embed.data.fields[1].value = `${players.size}`;
    await message.edit({ embeds: [embed], components: [row] });
  });

  return new Promise((resolve) => {
    collector.on('end', () => resolve(players));
  });
}

/**
 * Obtiene los miembros del servidor de los IDs de jugadores
 */
async function fetchPlayerMembers(guild, playerIds) {
  const members = [];
  
  for (const playerId of playerIds) {
    try {
      const member = await guild.members.fetch(playerId);
      members.push(member);
    } catch (error) {
      console.error(`Error obteniendo miembro ${playerId}:`, error);
    }
  }

  return members;
}

/**
 * Inicia el juego y envía roles a los jugadores
 */
async function startGame(interaction, message, playerMembers, voiceChannel, button) {
  button.setDisabled(true);
  const disabledRow = new ActionRowBuilder().addComponents(button);

  // Seleccionar impostor y anime
  const shuffledPlayers = shuffleArray(playerMembers);
  const impostor = selectImpostor(shuffledPlayers);

  // Obtener anime aleatorio
  let anime;
  try {
    anime = await anilistService.getRandomAnime(SETTINGS.ANILIST_TOP_THRESHOLD);
  } catch (error) {
    console.error('Error obteniendo anime:', error);
    await message.edit({ 
      embeds: [createErrorEmbed(MESSAGES.ERRORS.API_ERROR)], 
      components: [disabledRow] 
    });
    return;
  }

  // Preparar información del anime
  const animeInfo = {
    title: anime.title.english || anime.title.romaji,
    format: ANIME_FORMATS[anime.format] || anime.format,
    score: anime.averageScore ? `${anime.averageScore}/100` : 'N/A'
  };

  // Enviar DMs a jugadores
  const results = await sendDMsToPlayers(playerMembers, (player) => {
    const isImpostor = player.id === impostor.id;
    return isImpostor ? createImpostorEmbed() : createPlayerEmbed(animeInfo);
  });

  // Verificar fallos en envío de DMs
  const failedDMs = results.filter(r => !r.success);
  if (failedDMs.length > 0) {
    const failedUsers = failedDMs.map(r => r.player.user.tag).join(', ');
    await message.edit({
      embeds: [createErrorEmbed(`${MESSAGES.ERRORS.DM_BLOCKED}\n\nUsuarios con DMs bloqueados: ${failedUsers}`)],
      components: [disabledRow]
    });
    return;
  }

  // Registrar partida en el GameManager
  gameManager.startGame(interaction.guildId, {
    channelId: voiceChannel.id,
    players: playerMembers.map(m => m.id),
    impostor: impostor.id,
    anime: animeInfo.title
  });

  // Enviar mensaje de éxito
  const randomizedPlayers = shuffleArray(playerMembers);
  const successEmbed = createGameStartedEmbed(playerMembers, voiceChannel, randomizedPlayers);
  await message.edit({ embeds: [successEmbed], components: [disabledRow] });

  console.log('🕵️ Impostor comenzado');

  // Auto-limpiar después de un tiempo
  setTimeout(() => {
    gameManager.endGame(interaction.guildId);
  }, SETTINGS.GAME_AUTO_CLEANUP_TIME * 1000);
}

/**
 * Muestra las reglas del juego
 */
async function handleRules(interaction) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('📖 Cómo Jugar al Impostor')
    .setDescription(GAME_RULES)
    .setFooter({ text: 'Usa /impostor start para comenzar una partida' });

  await interaction.reply({ embeds: [embed] });
}

/**
 * Detiene la partida activa
 */
async function handleStop(interaction) {
  const game = gameManager.getGame(interaction.guildId);
  
  if (!game) {
    const errorEmbed = createErrorEmbed('No hay ninguna partida activa en este servidor.');
    return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
  }

  if (game.type !== 'impostor') {
    const errorEmbed = createErrorEmbed('Este comando solo puede detener partidas de Impostor.');
    return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
  }

  // Limpiar el juego
  gameManager.endGame(interaction.guildId);
  console.log('🕵️ Impostor terminado');

  const successEmbed = createSuccessEmbed('Partida de Impostor detenida correctamente.');
  await interaction.reply({ embeds: [successEmbed] });
}

/**
 * Muestra información de ping y estado
 */
async function handlePing(interaction) {
  const sent = await interaction.deferReply({ fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const apiLatency = Math.round(interaction.client.ws.ping);

  const cacheInfo = anilistService.getCacheInfo();
  const gameStats = gameManager.getStats();

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('🏓 Pong!')
    .addFields(
      { name: 'Latencia del Bot', value: `${latency}ms`, inline: true },
      { name: 'Latencia API Discord', value: `${apiLatency}ms`, inline: true },
      { name: 'Estado', value: '🟢 Online', inline: true },
      { name: 'Animes en Cache', value: `${cacheInfo.totalAnimes}`, inline: true },
      { name: 'Partidas Activas', value: `${gameStats.activeGames}`, inline: true },
      { name: 'Cooldowns Activos', value: `${gameStats.cooldownsActive}`, inline: true }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ============================================
// Funciones auxiliares para crear embeds
// ============================================

function createPlayerEmbed(animeInfo) {
  return new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`${EMOJIS.ANIME} Tu Rol: Jugador`)
    .setDescription(
      `**Anime:** ${animeInfo.title}\n` +
      `**Formato:** ${animeInfo.format}\n` +
      `**Puntuación:** ${animeInfo.score}`
    )
    .addFields({
      name: 'Tu Misión',
      value: 'Describe el anime con pistas para ayudar a encontrar al impostor. ¡Sé específico!'
    })
    .setFooter({ text: 'No compartas esta información con otros jugadores' })
    .setTimestamp();
}

function createImpostorEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle(`${EMOJIS.IMPOSTOR} ¡Eres el IMPOSTOR!`)
    .setDescription('No conoces el anime, pero debes fingir que sí.')
    .addFields(
      {
        name: 'Tu Misión',
        value: 'Intenta adivinar el anime escuchando las pistas de los demás sin ser descubierto'
      },
      {
        name: 'Estrategia',
        value: 'Da pistas vagas y genéricas. Observa las pistas de otros para deducir el anime'
      }
    )
    .setFooter({ text: 'Mantén esto en secreto' })
    .setTimestamp();
}

function createGameCancelledEmbed(playersJoined) {
  return new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle(`${EMOJIS.ERROR} Partida Cancelada`)
    .setDescription(
      `No se unieron suficientes jugadores.\n` +
      `**Unidos:** ${playersJoined}\n` +
      `**Necesarios:** Mínimo ${SETTINGS.DEFAULT_MIN_PLAYERS}`
    )
    .setTimestamp();
}

function createGameStartedEmbed(playerMembers, voiceChannel, randomizedPlayers) {
  return new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJIS.SUCCESS} Partida Iniciada`)
    .setDescription(MESSAGES.SUCCESS.ROLES_SENT)
    .addFields(
      { name: 'Jugadores', value: `${playerMembers.length}`, inline: true },
      { name: 'Canal', value: voiceChannel.name, inline: true },
      { name: 'Participantes (orden aleatorio)', value: formatPlayerList(randomizedPlayers), inline: false }
    )
    .setTimestamp();
}
