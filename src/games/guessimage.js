/**
 * Comando Guess Image - Adivina el anime o personaje por imagen difuminada
 */

import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fetch from 'node-fetch';
import stringSimilarity from 'string-similarity';
import gameManager from '../utils/GameManager.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed } from '../utils/gameHelpers.js';
import { COLORS } from '../config/constants.js';
import SETTINGS from '../config/settings.js';
import anilistService from '../services/anilistService.js';

const ANILIST_API = 'https://graphql.anilist.co';

export const data = new SlashCommandBuilder()
  .setName('guessimage')
  .setDescription('Adivina el anime o personaje por imagen difuminada')
  .addSubcommand(subcommand =>
    subcommand
      .setName('start')
      .setDescription('Inicia una ronda de adivinar imagen')
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
 * Aplica blur a una imagen
 */
async function applyBlur(imageUrl, blurAmount) {
  try {
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();
    const image = await loadImage(Buffer.from(buffer));
    
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    // Aplicar blur usando filter
    ctx.filter = `blur(${blurAmount}px)`;
    ctx.drawImage(image, 0, 0);
    
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error aplicando blur:', error);
    return null;
  }
}

/**
 * Obtiene datos de anime o personaje de AniList
 */
async function fetchRandomTarget(type) {
  if (type === 'anime') {
    return await fetchRandomAnime();
  } else {
    return await fetchRandomCharacter();
  }
}

/**
 * Obtiene un anime aleatorio con imagen
 */
async function fetchRandomAnime() {
  // Esperar a que el servicio esté listo
  await anilistService.waitForReady();
  
  // Obtener animes del cache
  const animes = await anilistService.getAnimes();
  
  if (animes.length === 0) return null;
  
  // Seleccionar uno aleatorio
  const anime = animes[Math.floor(Math.random() * animes.length)];
  
  // Obtener la imagen desde AniList API ya que el cache no tiene imágenes
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title {
          romaji
          english
        }
        coverImage {
          large
        }
        format
        averageScore
      }
    }
  `;
  
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { id: anime.id }
      })
    });
    
    const data = await response.json();
    const media = data.data?.Media;
    
    if (!media || !media.coverImage?.large) {
      // Recursivamente intentar con otro anime
      return await fetchRandomAnime();
    }
    
    return {
      type: 'anime',
      name: media.title.english || media.title.romaji,
      alternativeName: media.title.romaji, // Guardar también el nombre romaji
      imageUrl: media.coverImage.large,
      additionalInfo: {
        format: media.format,
        score: media.averageScore
      }
    };
  } catch (error) {
    console.error('Error obteniendo imagen del anime:', error);
    return null;
  }
}

/**
 * Obtiene un personaje aleatorio con imagen
 */
async function fetchRandomCharacter() {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        characters(sort: FAVOURITES_DESC) {
          id
          name {
            full
            native
          }
          image {
            large
          }
          media(sort: POPULARITY_DESC, perPage: 1) {
            nodes {
              title {
                romaji
                english
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    page: Math.floor(Math.random() * 10) + 1,
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
  const characters = data.data.Page.characters.filter(c => c.image?.large && c.media?.nodes?.length > 0);
  
  if (characters.length === 0) return null;
  
  const character = characters[Math.floor(Math.random() * characters.length)];
  const anime = character.media.nodes[0];
  
  return {
    type: 'character',
    name: character.name.full,
    imageUrl: character.image.large,
    additionalInfo: {
      anime: anime.title.english || anime.title.romaji
    }
  };
}

/**
 * Valida si la respuesta es correcta
 */
function isCorrectAnswer(answer, target) {
  const normalize = (str) => str.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  const normalizedAnswer = normalize(answer);
  
  // Para animes, validar contra el nombre principal
  const normalizedCorrect = normalize(target.name);
  
  if (normalizedAnswer === normalizedCorrect) return true;
  
  let similarity = stringSimilarity.compareTwoStrings(normalizedAnswer, normalizedCorrect);
  if (similarity >= SETTINGS.GUESSIMAGE_SIMILARITY_THRESHOLD) return true;
  
  // Si es un anime y tiene nombre alternativo (romaji), validar también contra él
  if (target.type === 'anime' && target.alternativeName && target.alternativeName !== target.name) {
    const normalizedAlternative = normalize(target.alternativeName);
    
    if (normalizedAnswer === normalizedAlternative) return true;
    
    const altSimilarity = stringSimilarity.compareTwoStrings(normalizedAnswer, normalizedAlternative);
    if (altSimilarity >= SETTINGS.GUESSIMAGE_SIMILARITY_THRESHOLD) return true;
  }
  
  return false;
}

/**
 * Inicia una ronda - Muestra menú de selección
 */
async function handleStartRound(interaction) {
  // Solo hacer defer si no se hizo antes
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  if (gameManager.isGameActive(interaction.guildId)) {
    return await interaction.editReply({
      embeds: [createErrorEmbed('Ya hay una partida activa en este servidor.')]
    });
  }

  // Mostrar menú de selección de tipo de juego
  const selectionEmbed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('🎮 Guess Image - Configuración')
    .setDescription(
      '**Selecciona el tipo de juego:**\n\n' +
      '📺 **Anime** - Adivina el anime por su portada\n' +
      '👤 **Personaje** - Adivina el personaje\n' +
      '🎲 **Ambos** - Aleatorio entre anime y personaje'
    )
    .setFooter({ text: 'Selecciona una opción para comenzar' })
    .setTimestamp();

  const animeButton = new ButtonBuilder()
    .setCustomId('guessimage_type_anime')
    .setLabel('📺 Anime')
    .setStyle(ButtonStyle.Primary);

  const characterButton = new ButtonBuilder()
    .setCustomId('guessimage_type_character')
    .setLabel('👤 Personaje')
    .setStyle(ButtonStyle.Success);

  const bothButton = new ButtonBuilder()
    .setCustomId('guessimage_type_both')
    .setLabel('🎲 Ambos')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(animeButton, characterButton, bothButton);

  const message = await interaction.editReply({
    embeds: [selectionEmbed],
    components: [row]
  });

  // Esperar selección (60 segundos)
  const collector = message.createMessageComponentCollector({ 
    time: 60000,
    max: 1
  });

  collector.on('collect', async i => {
    // Obtener tipo seleccionado
    let gameType = 'both';
    if (i.customId === 'guessimage_type_anime') {
      gameType = 'anime';
    } else if (i.customId === 'guessimage_type_character') {
      gameType = 'character';
    }

    // Defer la interacción del botón
    await i.deferUpdate();

    // Remover botones
    await message.edit({ components: [] });

    // Iniciar el juego con el tipo seleccionado
    await startRound(i, gameType);
  });

  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      await message.edit({ 
        components: [],
        embeds: [createErrorEmbed('Tiempo agotado. Usa `/start guessimage` para intentar de nuevo.')]
      });
    }
  });
}

/**
 * Inicia la ronda con el tipo seleccionado
 */
async function startRound(interaction, gameType) {
  
  // Determinar tipo real si es "both"
  let actualType = gameType;
  if (gameType === 'both') {
    actualType = Math.random() < 0.5 ? 'anime' : 'character';
  }

  // Obtener target aleatorio
  let target;
  try {
    target = await fetchRandomTarget(actualType);
  } catch (error) {
    console.error('Error obteniendo target:', error);
    // Usar followUp si la interacción ya fue respondida (viene de botón)
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp({
        embeds: [createErrorEmbed('Error al obtener imagen. Por favor, intenta de nuevo.')],
        ephemeral: true
      });
    }
    return await interaction.editReply({
      embeds: [createErrorEmbed('Error al obtener imagen. Por favor, intenta de nuevo.')]
    });
  }

  if (!target) {
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp({
        embeds: [createErrorEmbed('No se pudo obtener una imagen válida.')],
        ephemeral: true
      });
    }
    return await interaction.editReply({
      embeds: [createErrorEmbed('No se pudo obtener una imagen válida.')]
    });
  }

  // Aplicar blur a la imagen
  const blurredImage = await applyBlur(target.imageUrl, SETTINGS.GUESSIMAGE_BLUR_AMOUNT);
  
  if (!blurredImage) {
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp({
        embeds: [createErrorEmbed('Error procesando la imagen.')],
        ephemeral: true
      });
    }
    return await interaction.editReply({
      embeds: [createErrorEmbed('Error procesando la imagen.')]
    });
  }

  const attachment = new AttachmentBuilder(blurredImage, { name: 'blurred.png' });

  const typeText = target.type === 'anime' ? '📺 Anime' : '👤 Personaje';
  
  const startEmbed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`🔍 ¡Adivina el ${typeText}!`)
    .setDescription(
      `Se mostrará una imagen difuminada. ¡Adivina quién o qué es!\n\n` +
      `**Tiempo:** ${SETTINGS.GUESSIMAGE_ROUND_TIME} segundos\n` +
      `**Imagen clara en:** ${SETTINGS.GUESSIMAGE_BLUR_TIME} segundos\n\n` +
      `Escribe tu respuesta en el chat.`
    )
    .setImage('attachment://blurred.png')
    .setFooter({ text: 'La imagen se revelará gradualmente' })
    .setTimestamp();

  // Enviar mensaje según el tipo de interacción
  let gameMessage;
  if (interaction.replied || (interaction.deferred && interaction.message)) {
    // Si ya fue respondida (viene del menú de selección), usar followUp
    gameMessage = await interaction.followUp({
      embeds: [startEmbed],
      files: [attachment]
    });
  } else {
    // Si no ha sido respondida, usar editReply
    await interaction.editReply({
      embeds: [startEmbed],
      files: [attachment]
    });
    gameMessage = await interaction.fetchReply();
  }

  // Registrar partida
  gameManager.startGame(interaction.guildId, {
    type: 'guessimage',
    gameType: gameType,
    target: target,
    channelId: interaction.channelId,
    startTime: Date.now(),
    revealTimeout: null,
    collector: null, // Guardar referencia al collector de mensajes
    buttonCollector: null // Guardar referencia al collector de botones
  });

  const game = gameManager.getGame(interaction.guildId);

  // Programar revelación de imagen clara
  game.revealTimeout = setTimeout(async () => {
    const game = gameManager.getGame(interaction.guildId);
    if (!game || game.type !== 'guessimage') return;

    const clearAttachment = new AttachmentBuilder(target.imageUrl);
    const revealEmbed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle('🔓 Imagen Revelada')
      .setDescription(`¡Ahora puedes ver la imagen completa! Tienes ${SETTINGS.GUESSIMAGE_BLUR_TIME} segundos más.`)
      .setImage(target.imageUrl)
      .setTimestamp();

    await interaction.followUp({
      embeds: [revealEmbed]
    });
  }, SETTINGS.GUESSIMAGE_BLUR_TIME * 1000);

  // Esperar respuestas
  const filter = m => !m.author.bot;
  const collector = interaction.channel.createMessageCollector({ 
    filter, 
    time: SETTINGS.GUESSIMAGE_ROUND_TIME * 1000 
  });
  
  // Guardar collector en el estado del juego
  if (game) {
    game.collector = collector;
  }

  let winner = null;

  collector.on('collect', async (msg) => {
    if (isCorrectAnswer(msg.content, target)) {
      winner = msg.author;
      collector.stop('guessed');
      
      // Cancelar timeout de revelación de imagen
      const game = gameManager.getGame(interaction.guildId);
      if (game && game.revealTimeout) {
        clearTimeout(game.revealTimeout);
      }
      
      await handleCorrectGuess(interaction, target, winner, gameType);
    }
  });

  collector.on('end', async (collected, reason) => {
    // Limpiar timeout de revelación
    const game = gameManager.getGame(interaction.guildId);
    if (game && game.revealTimeout) {
      clearTimeout(game.revealTimeout);
    }
    
    // Si fue detenido manualmente, no hacer nada más
    if (reason === 'manual_stop') {
      return;
    }
    
    // Si no adivinaron, mostrar respuesta
    if (reason !== 'guessed') {
      await handleTimeUp(interaction, target, gameType);
    }
    
    gameManager.endGame(interaction.guildId);
  });
}

/**
 * Maneja cuando alguien adivina correctamente
 */
async function handleCorrectGuess(interaction, target, winner, originalGameType) {
  const typeText = target.type === 'anime' ? 'Anime' : 'Personaje';
  const typeEmoji = target.type === 'anime' ? '📺' : '👤';
  
  // Para animes, mostrar ambos nombres si existen
  let nameDisplay = target.name;
  if (target.type === 'anime' && target.alternativeName && target.alternativeName !== target.name) {
    nameDisplay = `${target.name}\n*${target.alternativeName}*`;
  }
  
  const successEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle('🎉 ¡Correcto!')
    .setDescription(`${winner} ha adivinado correctamente!`)
    .addFields(
      { name: `${typeEmoji} ${typeText}`, value: nameDisplay, inline: true }
    )
    .setThumbnail(target.imageUrl)
    .setTimestamp();

  if (target.additionalInfo) {
    if (target.type === 'anime') {
      successEmbed.addFields(
        { name: 'Formato', value: target.additionalInfo.format || 'N/A', inline: true },
        { name: 'Score', value: target.additionalInfo.score ? `${target.additionalInfo.score}/100` : 'N/A', inline: true }
      );
    } else {
      successEmbed.addFields(
        { name: 'Aparece en', value: target.additionalInfo.anime, inline: false }
      );
    }
  }

  const continueButton = new ButtonBuilder()
    .setCustomId('guessimage_continue')
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
    if (i.customId === 'guessimage_continue') {
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
          clearTimeout(existingGame.revealTimeout);
        }
      }
      
      gameManager.endGame(interaction.guildId);
      
      // Crear una nueva ronda usando la ButtonInteraction
      await startRound(i, originalGameType);
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
async function handleTimeUp(interaction, target, originalGameType) {
  const typeText = target.type === 'anime' ? 'Anime' : 'Personaje';
  const typeEmoji = target.type === 'anime' ? '📺' : '👤';
  
  // Para animes, mostrar ambos nombres si existen
  let nameDisplay = target.name;
  if (target.type === 'anime' && target.alternativeName && target.alternativeName !== target.name) {
    nameDisplay = `${target.name}\n*${target.alternativeName}*`;
  }
  
  const timeUpEmbed = new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle('⏱️ Tiempo Terminado')
    .setDescription(`Nadie adivinó correctamente.`)
    .addFields(
      { name: `${typeEmoji} ${typeText}`, value: nameDisplay, inline: true }
    )
    .setThumbnail(target.imageUrl)
    .setTimestamp();

  if (target.additionalInfo) {
    if (target.type === 'anime') {
      timeUpEmbed.addFields(
        { name: 'Formato', value: target.additionalInfo.format || 'N/A', inline: true },
        { name: 'Score', value: target.additionalInfo.score ? `${target.additionalInfo.score}/100` : 'N/A', inline: true }
      );
    } else {
      timeUpEmbed.addFields(
        { name: 'Aparece en', value: target.additionalInfo.anime, inline: false }
      );
    }
  }

  const continueButton = new ButtonBuilder()
    .setCustomId('guessimage_continue')
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
    if (i.customId === 'guessimage_continue') {
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
          clearTimeout(existingGame.revealTimeout);
        }
      }
      
      gameManager.endGame(interaction.guildId);
      
      // Crear una nueva ronda usando la ButtonInteraction
      await startRound(i, originalGameType);
    }
  });

  buttonCollector.on('end', async (collected, reason) => {
    // Limpiar componentes del mensaje
    await message.edit({ components: [] }).catch(() => {});
  });
}

/**
 * Muestra las reglas
 */
async function handleRules(interaction) {
  const rulesEmbed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('📖 Reglas de Guess Image')
    .setDescription(
      `**Objetivo:**\n` +
      `Adivinar el anime o personaje mostrado en la imagen difuminada.\n\n` +
      `**Cómo jugar:**\n` +
      `1️⃣ Se muestra una imagen muy difuminada\n` +
      `2️⃣ Escribe tu respuesta en el chat\n` +
      `3️⃣ A los ${SETTINGS.GUESSIMAGE_BLUR_TIME}s se revela la imagen completa\n` +
      `4️⃣ Tienes ${SETTINGS.GUESSIMAGE_ROUND_TIME}s totales para adivinar\n` +
      `5️⃣ Usa el botón "Continuar" para jugar otra ronda\n\n` +
      `**Tipos de juego:**\n` +
      `• **Solo Animes:** Adivina portadas de anime\n` +
      `• **Solo Personajes:** Adivina personajes famosos\n` +
      `• **Ambos:** Aleatorio entre anime y personaje\n\n` +
      `**Consejos:**\n` +
      `• Las primeras letras cuentan mucho\n` +
      `• Puedes escribir múltiples intentos\n` +
      `• La respuesta no necesita ser exacta (${SETTINGS.GUESSIMAGE_SIMILARITY_THRESHOLD * 100}% similitud)`
    )
    .setFooter({ text: 'Usa /start game:guessimage para jugar' })
    .setTimestamp();

  await interaction.reply({ embeds: [rulesEmbed] });
}

/**
 * Detiene la ronda actual
 */
async function handleStop(interaction) {
  const game = gameManager.getGame(interaction.guildId);

  if (!game || game.type !== 'guessimage') {
    return await interaction.reply({
      embeds: [createErrorEmbed('No hay ninguna ronda activa de Guess Image.')],
      ephemeral: true
    });
  }

  const member = interaction.member;
  if (!member.permissions.has('ManageMessages')) {
    return await interaction.reply({
      embeds: [createErrorEmbed('Solo los administradores pueden detener la ronda.')],
      ephemeral: true
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
  
  // Cancelar timeout de revelación si existe
  if (game.revealTimeout) {
    clearTimeout(game.revealTimeout);
  }
  
  // Terminar juego
  gameManager.endGame(interaction.guildId);
  console.log('🖼️ Guess Image terminado');

  await interaction.reply({
    embeds: [createInfoEmbed(
      '🛑 Ronda Detenida',
      `La ronda de Guess Image ha sido detenida por ${interaction.user}.`
    )]
  });
}
