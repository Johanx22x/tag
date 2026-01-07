/**
 * Comando Guess Recommendations - Adivina el anime por sus recomendaciones
 */

import { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import fetch from 'node-fetch';
import stringSimilarity from 'string-similarity';
import gameManager from '../utils/GameManager.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed } from '../utils/gameHelpers.js';
import { COLORS, EMOJIS } from '../config/constants.js';
import SETTINGS from '../config/settings.js';

const ANILIST_API = 'https://graphql.anilist.co';

export const data = new SlashCommandBuilder()
  .setName('guessrecommendations')
  .setDescription('Adivina el anime por sus recomendaciones')
  .addSubcommand(subcommand =>
    subcommand.setName('start').setDescription('Inicia una ronda de adivinar por recomendaciones')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('rules').setDescription('Muestra las reglas del juego')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('stop').setDescription('Detiene la ronda actual')
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'start':
      return await handleStartRound(interaction);
    case 'rules':
      return await handleRules(interaction);
    case 'stop':
      return await handleStop(interaction);
  }
}

/**
 * Inicia una ronda de adivinar por recomendaciones
 */
async function handleStartRound(interaction) {
  // Solo hacer defer si no se hizo antes
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  // Verificar si ya hay una partida activa
  if (gameManager.isGameActive(interaction.guildId)) {
    return await interaction.editReply({
      embeds: [createErrorEmbed('Ya hay una partida activa en este servidor.')]
    });
  }

  // Obtener anime con recomendaciones
  let animeData;
  try {
    animeData = await fetchAnimeWithRecommendations();
  } catch (error) {
    console.error('Error obteniendo anime:', error);
    return await interaction.editReply({
      embeds: [createErrorEmbed('Error al obtener anime con recomendaciones. Por favor, intenta de nuevo.')]
    });
  }

  if (!animeData) {
    return await interaction.editReply({
      embeds: [createErrorEmbed('No se pudo obtener un anime con suficientes recomendaciones.')]
    });
  }

  const { anime, recommendations } = animeData;
  const animeTitle = anime.title.english || anime.title.romaji;
  const animeTitles = [anime.title.english, anime.title.romaji].filter(t => t); // Array con ambos títulos

  // Registrar partida
  gameManager.startGame(interaction.guildId, {
    type: 'guessrecommendations',
    answer: animeTitle,
    answerTitles: animeTitles, // Array con ambos títulos para validación
    currentHint: 0,
    collector: null,
    buttonCollector: null,
    revealTimeout: null
  });

  // Notificar inicio
  const startEmbed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('🔍 ¡Adivina el Anime por sus Recomendaciones!')
    .setDescription(
      `Se mostrarán **5 recomendaciones** de un anime popular, una cada ~12 segundos.\n\n` +
      `**Tiempo total:** 60 segundos\n` +
      `**Objetivo:** Escribe el nombre del anime en el chat\n\n` +
      `Preparando primera recomendación...`
    )
    .setFooter({ text: 'Usa /guessrecommendations stop para detener' })
    .setTimestamp();

  await interaction.editReply({ embeds: [startEmbed] });

  // Esperar 3 segundos antes de empezar
  await sleep(3000);

  // Mostrar primera recomendación inmediatamente
  const firstRec = recommendations[0];
  const firstEmbed = createRecommendationEmbed(firstRec, 1, recommendations.length);
  await interaction.followUp({ embeds: [firstEmbed] });

  // Mostrar recomendaciones progresivamente
  let currentRecommendation = 1; // Ya mostramos la primera
  let winner = null;
  const hintInterval = 12000; // 12 segundos entre pistas
  const totalTime = 60000; // 60 segundos total

  // Configurar collector para respuestas - INICIA DESPUÉS de mostrar la primera recomendación
  const filter = m => !m.author.bot;
  const collector = interaction.channel.createMessageCollector({ 
    filter, 
    time: totalTime 
  });
  
  // Guardar referencia al collector
  const currentGame = gameManager.getGame(interaction.guildId);
  if (currentGame) {
    currentGame.collector = collector;
  }

  collector.on('collect', async (msg) => {
    if (isCorrectAnswer(msg.content, animeTitles)) {
      winner = msg.author;
      collector.stop('guessed');
    }
  });

  // Mostrar recomendaciones una por una
  const hintIntervalId = setInterval(async () => {
    if (currentRecommendation >= recommendations.length || winner) {
      clearInterval(hintIntervalId);
      return;
    }

    try {
      const rec = recommendations[currentRecommendation];
      const embed = createRecommendationEmbed(rec, currentRecommendation + 1, recommendations.length);
      await interaction.followUp({ embeds: [embed] });
      currentRecommendation++;
    } catch (error) {
      console.error('Error mostrando recomendación:', error);
    }
  }, hintInterval);
  
  // Guardar referencia al interval en el juego
  if (currentGame) {
    currentGame.revealTimeout = hintIntervalId;
  }

  collector.on('end', async (collected, reason) => {
    clearInterval(hintIntervalId);
    
    // Si fue detenido manualmente, no hacer nada más
    if (reason === 'manual_stop') {
      return;
    }

    if (reason === 'guessed') {
      await handleCorrectGuess(interaction, anime, animeTitle, winner);
    } else {
      await handleTimeUp(interaction, anime, animeTitle);
    }
  });
}

/**
 * Maneja cuando alguien adivina correctamente
 */
async function handleCorrectGuess(interaction, anime, animeTitle, winner) {
  const successEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJIS.SUCCESS} ¡Correcto!`)
    .setDescription(`${winner} ha adivinado el anime!`)
    .addFields(
      { name: '📺 Anime', value: animeTitle, inline: false },
      { name: 'Formato', value: anime.format || 'N/A', inline: true },
      { name: 'Episodios', value: String(anime.episodes || 'N/A'), inline: true },
      { name: 'Score', value: anime.averageScore ? `${anime.averageScore}/100` : 'N/A', inline: true }
    )
    .setThumbnail(anime.coverImage.large)
    .setTimestamp();

  const continueButton = new ButtonBuilder()
    .setCustomId('guessrecommendations_continue')
    .setLabel('▶️ Continuar')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(continueButton);

  const message = await interaction.followUp({
    embeds: [successEmbed],
    components: [row]
  });

  // Esperar respuesta del botón (30s, luego terminar automáticamente)
  // max: 1 asegura que solo se procese un clic, evitando race conditions
  const buttonCollector = message.createMessageComponentCollector({ time: 30000, max: 1 });
  
  // Guardar referencia al collector de botones en el juego
  const currentGame = gameManager.getGame(interaction.guildId);
  if (currentGame) {
    currentGame.buttonCollector = buttonCollector;
  }

  buttonCollector.on('collect', async i => {
    if (i.customId === 'guessrecommendations_continue') {
      await i.deferReply();
      await message.edit({ components: [] });
      
      // Limpiar recursos del juego anterior
      const existingGame = gameManager.getGame(interaction.guildId);
      if (existingGame) {
        if (existingGame.buttonCollector) {
          existingGame.buttonCollector.stop('continued');
        }
        if (existingGame.collector) {
          existingGame.collector.stop('continued');
        }
        if (existingGame.revealTimeout) {
          clearInterval(existingGame.revealTimeout);
        }
      }
      
      gameManager.endGame(interaction.guildId);
      
      // Crear una nueva ronda
      await handleStartRound(i);
    }
  });

  buttonCollector.on('end', async (collected, reason) => {
    // Limpiar componentes del mensaje
    await message.edit({ components: [] }).catch(() => {});
  });
}

/**
 * Maneja cuando se acaba el tiempo
 */
async function handleTimeUp(interaction, anime, animeTitle) {
  const timeUpEmbed = new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle('⏱️ Tiempo Terminado')
    .setDescription(`Nadie adivinó el anime.`)
    .addFields(
      { name: '📺 Respuesta', value: animeTitle, inline: false },
      { name: 'Formato', value: anime.format || 'N/A', inline: true },
      { name: 'Episodios', value: String(anime.episodes || 'N/A'), inline: true },
      { name: 'Score', value: anime.averageScore ? `${anime.averageScore}/100` : 'N/A', inline: true }
    )
    .setThumbnail(anime.coverImage.large)
    .setTimestamp();

  const continueButton = new ButtonBuilder()
    .setCustomId('guessrecommendations_continue')
    .setLabel('▶️ Continuar')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(continueButton);

  const message = await interaction.followUp({
    embeds: [timeUpEmbed],
    components: [row]
  });

  // Esperar respuesta del botón (30s, luego terminar automáticamente)
  // max: 1 asegura que solo se procese un clic, evitando race conditions
  const buttonCollector = message.createMessageComponentCollector({ time: 30000, max: 1 });
  
  // Guardar referencia al collector de botones en el juego
  const currentGame = gameManager.getGame(interaction.guildId);
  if (currentGame) {
    currentGame.buttonCollector = buttonCollector;
  }

  buttonCollector.on('collect', async i => {
    if (i.customId === 'guessrecommendations_continue') {
      await i.deferReply();
      await message.edit({ components: [] });
      
      // Limpiar recursos del juego anterior
      const existingGame = gameManager.getGame(interaction.guildId);
      if (existingGame) {
        if (existingGame.buttonCollector) {
          existingGame.buttonCollector.stop('continued');
        }
        if (existingGame.collector) {
          existingGame.collector.stop('continued');
        }
        if (existingGame.revealTimeout) {
          clearInterval(existingGame.revealTimeout);
        }
      }
      
      gameManager.endGame(interaction.guildId);
      
      // Crear una nueva ronda
      await handleStartRound(i);
    }
  });

  buttonCollector.on('end', async (collected, reason) => {
    // Limpiar componentes del mensaje
    await message.edit({ components: [] }).catch(() => {});
  });
}

/**
 * Detiene la ronda actual
 */
async function handleStop(interaction) {
  const game = gameManager.getGame(interaction.guildId);

  if (!game || game.type !== 'guessrecommendations') {
    return await interaction.reply({
      embeds: [createErrorEmbed('No hay ninguna ronda activa de Guess Recommendations.')],
      flags: MessageFlags.Ephemeral
    });
  }

  const member = interaction.member;
  if (!member.permissions.has('ManageMessages')) {
    return await interaction.reply({
      embeds: [createErrorEmbed('Solo administradores pueden detener la ronda.')],
      flags: MessageFlags.Ephemeral
    });
  }

  // Detener collector de mensajes si existe
  if (game.collector) {
    game.collector.stop('manual_stop');
  }
  
  // Detener collector de botones si existe
  if (game.buttonCollector) {
    game.buttonCollector.stop('manual_stop');
  }
  
  // Cancelar timeout/interval de revelación si existe
  if (game.revealTimeout) {
    clearInterval(game.revealTimeout);
  }
  
  gameManager.endGame(interaction.guildId);
  console.log('📚 Guess Recommendations terminado');

  await interaction.reply({
    embeds: [createInfoEmbed('⏹️ Ronda Detenida', 'La ronda ha sido detenida por un administrador.')]
  });
}

/**
 * Muestra las reglas del juego
 */
async function handleRules(interaction) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('📖 Cómo Jugar Guess Recommendations')
    .setDescription(
      'El bot mostrará 5 recomendaciones de un anime popular, una por una.\n\n' +
      '**Objetivo:** Ser el primero en escribir el nombre correcto del anime en el chat.\n\n' +
      '**Reglas:**\n' +
      '• Las recomendaciones se muestran cada ~12 segundos\n' +
      '• Cada recomendación incluye imagen, votos y detalles\n' +
      '• Escribe el nombre del anime en el chat para responder\n' +
      '• El primer jugador en acertar gana la ronda\n' +
      '• Tiempo total: 60 segundos\n\n' +
      '**Pista:** Las recomendaciones se basan en datos de la comunidad de AniList'
    )
    .setFooter({ text: 'Usa /guessrecommendations start para comenzar' });

  await interaction.reply({ embeds: [embed] });
}

/**
 * Crea un embed para mostrar una recomendación
 */
function createRecommendationEmbed(recommendation, number, total) {
  const rec = recommendation.mediaRecommendation;
  
  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`🔍 Pista ${number}/${total}`)
    .setDescription(`Los fans de este anime también recomiendan:\n\n**${rec.title.english || rec.title.romaji}**`)
    .setThumbnail(rec.coverImage.large)
    .addFields(
      { name: '👍 Votos', value: String(recommendation.rating || 0), inline: true },
      { name: '📺 Formato', value: rec.format || 'N/A', inline: true },
      { name: '⭐ Score', value: rec.averageScore ? `${rec.averageScore}/100` : 'N/A', inline: true }
    );

  if (rec.genres && rec.genres.length > 0) {
    embed.addFields({
      name: '🎭 Géneros',
      value: rec.genres.slice(0, 3).join(', '),
      inline: false
    });
  }

  if (rec.description) {
    const shortDesc = rec.description.replace(/<[^>]*>/g, '').slice(0, 150);
    embed.addFields({
      name: '📝 Sinopsis',
      value: shortDesc + (rec.description.length > 150 ? '...' : ''),
      inline: false
    });
  }

  return embed;
}

/**
 * Obtiene un anime con recomendaciones desde AniList
 */
async function fetchAnimeWithRecommendations() {
  try {
    const randomPage = Math.floor(Math.random() * 5) + 1; // Top 250 animes
    
    const query = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          media(
            type: ANIME,
            sort: POPULARITY_DESC,
            format_in: [TV, MOVIE, OVA]
          ) {
            id
            title {
              romaji
              english
            }
            format
            episodes
            averageScore
            coverImage {
              large
            }
            recommendations(sort: RATING_DESC, perPage: 5) {
              nodes {
                rating
                mediaRecommendation {
                  id
                  title {
                    romaji
                    english
                  }
                  format
                  averageScore
                  coverImage {
                    large
                  }
                  genres
                  description
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      page: randomPage,
      perPage: 50
    };

    const response = await fetch(ANILIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query, variables })
    });

    const data = await response.json();
    const animes = data.data.Page.media;

    // Filtrar animes que tengan al menos 5 recomendaciones
    const validAnimes = animes.filter(anime => 
      anime.recommendations.nodes.length >= 5 &&
      anime.recommendations.nodes.every(rec => rec.mediaRecommendation)
    );

    if (validAnimes.length === 0) {
      return null;
    }

    // Seleccionar anime aleatorio
    const selectedAnime = validAnimes[Math.floor(Math.random() * validAnimes.length)];

    return {
      anime: selectedAnime,
      recommendations: selectedAnime.recommendations.nodes.slice(0, 5)
    };
  } catch (error) {
    console.error('Error en fetchAnimeWithRecommendations:', error);
    return null;
  }
}

/**
 * Valida si la respuesta del usuario es correcta
 * Acepta un título o un array de títulos [english, romaji]
 */
function isCorrectAnswer(userInput, correctTitles) {
  const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/gi, '');
  const userNorm = normalize(userInput);
  
  // Si correctTitles es un array, verificar contra ambos títulos
  const titlesToCheck = Array.isArray(correctTitles) ? correctTitles : [correctTitles];
  
  for (const title of titlesToCheck) {
    if (!title) continue; // Skip null/undefined titles
    const correctNorm = normalize(title);
    const similarity = stringSimilarity.compareTwoStrings(userNorm, correctNorm);
    if (similarity >= SETTINGS.OPENING_SIMILARITY_THRESHOLD) {
      return true;
    }
  }
  
  return false;
}

/**
 * Helper para sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
