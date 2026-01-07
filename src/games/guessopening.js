/**
 * Comando Guess Opening - Adivina el anime por su opening
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState, VoiceConnectionStatus, StreamType, getVoiceConnection } from '@discordjs/voice';
import fetch from 'node-fetch';
import stringSimilarity from 'string-similarity';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';
import gameManager from '../utils/GameManager.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed, validateVoiceChannel } from '../utils/gameHelpers.js';
import { COLORS, EMOJIS } from '../config/constants.js';
import SETTINGS from '../config/settings.js';

const ANILIST_API = 'https://graphql.anilist.co';

/**
 * Prepara un recurso de audio desde una URL
 * @param {string} audioUrl - URL del audio a preparar
 * @returns {Promise<{resource, ffmpeg}>} - El recurso de audio y el proceso ffmpeg
 */
async function prepareAudioResource(audioUrl) {
  const ffmpegArgs = [
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '3',    // Reducido de 5 a 3
    '-analyzeduration', '0',         // No analizar el stream
    '-probesize', '32',              // Mínimo análisis
    '-fflags', '+nobuffer+discardcorrupt', // Sin buffer extra, descartar frames corruptos
    '-i', audioUrl,
    '-t', String(SETTINGS.OPENING_ROUND_TIME),
    '-vn',                           // No video
    '-acodec', 'libopus',           // Usar Opus directamente (mejor para Discord)
    '-loglevel', 'error',            // Solo errores críticos
    '-f', 'opus',
    '-ar', '48000',
    '-ac', '2',
    '-b:a', '128k',                  // Bitrate optimizado
    'pipe:1'
  ];
  
  const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  // Manejar errores de ffmpeg
  let ffmpegError = '';
  
  ffmpeg.stderr.on('data', (data) => {
    const errorText = data.toString();
    ffmpegError += errorText;
    if (errorText.toLowerCase().includes('error') && 
        !errorText.includes('Invalid argument') && 
        !errorText.includes('Error writing trailer')) {
      console.error('❌ FFmpeg error:', errorText);
    }
  });
  
  ffmpeg.on('error', (error) => {
    console.error('❌ Error spawning ffmpeg:', error);
  });
  
  ffmpeg.on('close', (code) => {
    const ignoredCodes = [0, 255, 4294967274, null];
    if (!ignoredCodes.includes(code) && ffmpegError && !ffmpegError.includes('Invalid argument')) {
      console.log(`ℹ️ FFmpeg closed with code: ${code}`);
    }
  });
  
  // Crear el recurso de audio con Opus
  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.OggOpus,
    inlineVolume: true
  });
  
  if (resource.volume) {
    resource.volume.setVolume(0.7);
  }
  
  return { resource, ffmpeg };
}

export const data = new SlashCommandBuilder()
  .setName('guessopening')
  .setDescription('Adivina el anime por su opening')
  .addSubcommand(subcommand =>
    subcommand.setName('start').setDescription('Inicia una ronda de adivinar el opening')
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
 * Inicia una ronda de adivinar el opening
 */
async function handleStartRound(interaction) {
  // Solo hacer defer si no se hizo antes
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  // Validar canal de voz
  const voiceValidation = validateVoiceChannel(interaction);
  if (!voiceValidation.valid) {
    return await interaction.editReply({ embeds: [createErrorEmbed(voiceValidation.error)] });
  }

  const voiceChannel = voiceValidation.voiceChannel;

  // Verificar si ya hay una partida activa
  if (gameManager.isGameActive(interaction.guildId)) {
    return await interaction.editReply({
      embeds: [createErrorEmbed('Ya hay una partida activa en este servidor.')]
    });
  }

  await startRound(interaction, voiceChannel);
}

/**
 * Inicia una nueva ronda del juego
 */
async function startRound(interaction, voiceChannel, preloadedData = null, preloadedAudioResource = null) {
  console.log('🎵 Guess Opening comenzado');

  // Usar datos precargados si están disponibles, sino obtener nuevos
  let openingData;
  
  if (preloadedData) {
    openingData = preloadedData;
  } else {
    try {
      openingData = await fetchRandomOpening();
    } catch (error) {
      console.error('Error obteniendo opening:', error);
      return await interaction.editReply({
        embeds: [createErrorEmbed('Error al obtener opening. Por favor, intenta de nuevo.')]
      });
    }

    if (!openingData) {
      return await interaction.editReply({
        embeds: [createErrorEmbed('No se pudo obtener un opening. Por favor, intenta de nuevo.')]
      });
    }
  }

  const { audioUrl, animeTitle, animeTitles, themeType, themeNumber } = openingData;

  // Reutilizar conexión existente si está activa, o crear una nueva
  let connection = getVoiceConnection(interaction.guildId);
  
  if (connection && (connection.state.status === VoiceConnectionStatus.Ready || connection.state.status === VoiceConnectionStatus.Signalling || connection.state.status === VoiceConnectionStatus.Connecting)) {
    // Cancelar timeout de desconexión si existe
    if (disconnectTimeouts.has(interaction.guildId)) {
      clearTimeout(disconnectTimeouts.get(interaction.guildId));
      disconnectTimeouts.delete(interaction.guildId);
    }
  } else {
    // Si no hay conexión o está en mal estado, crear una nueva
    if (connection) {
      connection.destroy();
    }
    
    try {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });

      // Esperar a que la conexión esté completamente lista
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (error) {
      console.error('❌ Error estableciendo conexión de voz:', error);
      if (connection) {
        connection.destroy();
      }
      return await interaction.editReply({
        embeds: [createErrorEmbed('No pude conectarme al canal de voz. Intenta de nuevo.')]
      });
    }
  }

  // Crear y configurar el reproductor de audio
  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: 'pause',
      maxMissedFrames: 50  // Tolerancia a pérdida de frames
    }
  });
  
  let resource;
  let ffmpeg;
  
  // Verificar si hay un recurso de audio precargado para esta ronda
  if (preloadedAudioResource?.audioUrl === audioUrl) {
    resource = preloadedAudioResource.resource;
    ffmpeg = preloadedAudioResource.ffmpeg;
  } else {
    // Preparar el audio normalmente
    try {
      const prepared = await prepareAudioResource(audioUrl);
      resource = prepared.resource;
      ffmpeg = prepared.ffmpeg;
    } catch (error) {
      console.error('❌ Error creando recurso de audio:', error);
      if (ffmpeg) {
        ffmpeg.kill();
      }
      connection.destroy();
      return await interaction.editReply({
        embeds: [createErrorEmbed('Error preparando el audio. Intenta de nuevo.')]
      });
    }
  }

  // Manejar eventos del reproductor ANTES de reproducir
  let isPlaying = false;
  let startTime = Date.now();
  
  player.on(AudioPlayerStatus.Playing, () => {
    if (!isPlaying) {
      isPlaying = true;
      // Actualizar el gameStartTime cuando el audio realmente empiece
      gameStartTime = Date.now();
      const currentGame = gameManager.getGame(interaction.guildId);
      if (currentGame) {
        currentGame.startTime = gameStartTime;
      }
      
      scheduleDisconnect(interaction.guildId, connection);
      
      // Iniciar precarga completa de la siguiente ronda en segundo plano
      fetchRandomOpening().then(async nextData => {
        const currentGame = gameManager.getGame(interaction.guildId);
        if (currentGame && nextData) {
          currentGame.nextRoundData = nextData;
          
          // Precargar también el audio procesado
          try {
            const prepared = await prepareAudioResource(nextData.audioUrl);
            if (gameManager.getGame(interaction.guildId)) {
              currentGame.nextAudioResource = {
                resource: prepared.resource,
                ffmpeg: prepared.ffmpeg,
                audioUrl: nextData.audioUrl
              };
            } else {
              // El juego terminó, limpiar recursos
              prepared.ffmpeg.kill();
            }
          } catch (err) {
            // Silenciosamente ignorar errores de precarga
          }
        }
      }).catch(err => {
        // Silenciosamente ignorar errores de precarga
      });
    }
  });

  player.on(AudioPlayerStatus.Idle, () => {
    // Reproducción finalizada
  });

  player.on(AudioPlayerStatus.Buffering, () => {
    // Buffering
  });

  player.on('error', error => {
    console.error('❌ Error en el reproductor:', error);
  });
  
  // Suscribir PRIMERO, luego reproducir
  const subscription = connection.subscribe(player);
  
  if (!subscription) {
    console.error('❌ No se pudo suscribir el player a la conexión');
    if (ffmpeg) {
      ffmpeg.kill();
    }
    connection.destroy();
    return await interaction.editReply({
      embeds: [createErrorEmbed('Error conectando el reproductor. Intenta de nuevo.')]
    });
  }
  
  // Reproducir el audio inmediatamente
  player.play(resource);
  
  // Esperar a que empiece a reproducir realmente (máximo 12 segundos para buffering)
  const playingPromise = new Promise((resolve) => {
    const maxWaitTime = 12000; // 12 segundos para conexiones lentas
    const startTime = Date.now();
    
    const checkInterval = setInterval(() => {
      if (isPlaying) {
        clearInterval(checkInterval);
        resolve(true);
      }
      // Si excede el tiempo, verificar una última vez
      if (Date.now() - startTime > maxWaitTime) {
        clearInterval(checkInterval);
        resolve(isPlaying);
      }
    }, 100);
  });
  
  const didStart = await playingPromise;
  
  if (!didStart) {
    console.error('❌ El audio no comenzó a reproducirse después de 12 segundos');
    if (ffmpeg) {
      ffmpeg.kill();
    }
    player.stop();
    
    // No desconectar, solo mostrar error con botón de continuar
    const errorEmbed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle('❌ Error')
      .setDescription('El audio tardó demasiado en iniciar. Intenta de nuevo.')
      .setTimestamp();

    const continueButton = new ButtonBuilder()
      .setCustomId('guessopening_continue')
      .setLabel('▶️ Continuar')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(continueButton);

    const message = await interaction.editReply({
      embeds: [errorEmbed],
      components: [row]
    });

    // Esperar respuesta del botón (30s, luego terminar automáticamente)
    const buttonCollector = message.createMessageComponentCollector({ time: 30000, max: 1 });

    buttonCollector.on('collect', async i => {
      if (i.customId === 'guessopening_continue') {
        await i.deferReply();
        await message.edit({ components: [] });
        
        // Obtener datos precargados si existen
        const existingGame = gameManager.getGame(interaction.guildId);
        const preloadedData = existingGame?.nextRoundData || null;
        const preloadedAudioResource = existingGame?.nextAudioResource || null;
        
        // NO destruir la conexión, se reutilizará en la nueva ronda
        
        // Crear una nueva ronda con datos precargados si existen
        await startRound(i, voiceChannel, preloadedData, preloadedAudioResource);
      }
    });

    buttonCollector.on('end', async (collected, reason) => {
      // Limpiar componentes del mensaje
      await message.edit({ components: [] }).catch(() => {});
      
      // NO destruir la conexión, la función scheduleDisconnect() maneja la desconexión automática
    });
    
    return;
  }

  // Registrar partida con gameStartTime que se actualizará cuando el audio empiece
  let gameStartTime = Date.now(); // Tiempo inicial, se actualizará en Playing event
  gameManager.startGame(interaction.guildId, {
    type: 'guessopening',
    channelId: voiceChannel.id,
    answer: animeTitle,
    answerTitles: animeTitles, // Array con ambos títulos para validación
    connection: connection,
    player: player,
    ffmpegProcess: ffmpeg,
    startTime: gameStartTime,
    collector: null,
    buttonCollector: null
  });

  // Registrar partida en gameManager
  gameManager.startGame(interaction.guildId, {
    type: 'guessopening',
    channelId: voiceChannel.id,
    answer: animeTitle,
    animeTitles: animeTitles,
    player: player,
    ffmpegProcess: ffmpeg,
    connection: connection
  });

  // Notificar inicio
  const themeText = SETTINGS.OPENING_INCLUDE_ENDINGS 
    ? 'Opening o Ending' 
    : 'Opening';
  
  await interaction.editReply({
    embeds: [createInfoEmbed(
      `🎵 ¡Adivina el ${themeText}!`,
      `Escucha el tema musical y escribe el nombre del anime en el chat.\n\n` +
      `**Tiempo:** ${SETTINGS.OPENING_ROUND_TIME} segundos\n` +
      `**Tipo:** ${themeType}\n` +
      `**Fuente:** AnimeThemes`
    )]
  });

  // Calcular tiempo restante para el collector (asegurar que no sea negativo)
  // gameStartTime se registra cuando el audio empieza a reproducirse
  const elapsedTime = gameStartTime ? Math.floor((Date.now() - gameStartTime) / 1000) : 0;
  const remainingTime = Math.max(1, SETTINGS.OPENING_ROUND_TIME - elapsedTime);

  // Esperar respuestas
  const filter = m => !m.author.bot;
  const collector = interaction.channel.createMessageCollector({ 
    filter, 
    time: remainingTime * 1000 
  });
  
  // Guardar referencia al collector
  const currentGame = gameManager.getGame(interaction.guildId);
  if (currentGame) {
    currentGame.collector = collector;
  }

  let winner = null;

  collector.on('collect', async (msg) => {
    if (isCorrectAnswer(msg.content, animeTitles)) {
      winner = msg.author;
      collector.stop('guessed');
      
      // No mostrar mensaje aquí, se mostrará en el handler de 'end'
    }
  });

  collector.on('end', async (collected, reason) => {
    // Si fue detenido manualmente, no hacer nada más
    if (reason === 'manual_stop') {
      return;
    }
    
    // Limpiar audio
    const game = gameManager.getGame(interaction.guildId);
    
    try {
      player.stop();
    } catch (error) {
      console.error('Error deteniendo player:', error);
    }
    
    // Matar proceso ffmpeg si aún está corriendo
    try {
      if (game?.ffmpegProcess && !game.ffmpegProcess.killed) {
        game.ffmpegProcess.kill('SIGTERM');
      }
    } catch (error) {
      // Ignorar errores al matar el proceso
    }

    // Mostrar resultado según el motivo
    if (reason === 'guessed') {
      await handleCorrectGuess(interaction, animeTitle, winner, voiceChannel);
    } else {
      await handleTimeUp(interaction, animeTitle, voiceChannel);
    }
  });

  // No necesitamos el auto-cleanup aquí, lo maneja scheduleDisconnect
}

/**
 * Maneja cuando alguien adivina correctamente
 */
async function handleCorrectGuess(interaction, animeTitle, winner, voiceChannel) {
  const successEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle('🎉 ¡Correcto!')
    .setDescription(`${winner} ha adivinado el anime!`)
    .addFields(
      { name: '🎵 Anime', value: animeTitle, inline: false }
    )
    .setTimestamp();

  const continueButton = new ButtonBuilder()
    .setCustomId('guessopening_continue')
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
    if (i.customId === 'guessopening_continue') {
      await i.deferReply();
      await message.edit({ components: [] });
      
      // Obtener datos precargados si existen
      const existingGame = gameManager.getGame(interaction.guildId);
      const preloadedData = existingGame?.nextRoundData || null;
      
      // Limpiar recursos del juego anterior (excepto la conexión)
      if (existingGame) {
        if (existingGame.buttonCollector) {
          existingGame.buttonCollector.stop('continued');
        }
        if (existingGame.collector) {
          existingGame.collector.stop('continued');
        }
        // NO destruir la conexión, se reutilizará en la nueva ronda
      }
      
      gameManager.endGame(interaction.guildId);
      
      // Crear una nueva ronda con datos precargados si existen
      await startRound(i, voiceChannel, preloadedData);
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
async function handleTimeUp(interaction, animeTitle, voiceChannel) {
  const timeUpEmbed = new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle('⏱️ Tiempo Terminado')
    .setDescription(`Nadie adivinó el anime.`)
    .addFields(
      { name: '🎵 Respuesta', value: animeTitle, inline: false }
    )
    .setTimestamp();

  const continueButton = new ButtonBuilder()
    .setCustomId('guessopening_continue')
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
    if (i.customId === 'guessopening_continue') {
      await i.deferReply();
      await message.edit({ components: [] });
      
      // Obtener datos precargados si existen
      const existingGame = gameManager.getGame(interaction.guildId);
      const preloadedData = existingGame?.nextRoundData || null;
      const preloadedAudioResource = existingGame?.nextAudioResource || null;
      
      // Limpiar recursos del juego anterior (excepto la conexión)
      if (existingGame) {
        if (existingGame.buttonCollector) {
          existingGame.buttonCollector.stop('continued');
        }
        if (existingGame.collector) {
          existingGame.collector.stop('continued');
        }
        // NO destruir la conexión, se reutilizará en la nueva ronda
      }
      
      gameManager.endGame(interaction.guildId);
      
      // Crear una nueva ronda con datos precargados si existen
      await startRound(i, voiceChannel, preloadedData, preloadedAudioResource);
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

  if (!game || game.type !== 'guessopening') {
    return await interaction.reply({
      embeds: [createErrorEmbed('No hay ninguna ronda activa de Guess Opening.')],
      flags: MessageFlags.Ephemeral
    });
  }

  // Solo el que inició o un admin puede detener
  const member = interaction.member;
  if (!member.permissions.has('ManageMessages')) {
    return await interaction.reply({
      embeds: [createErrorEmbed('Solo administradores pueden detener la ronda.')],
      flags: MessageFlags.Ephemeral
    });
  }

  // Detener player
  try {
    game.player?.stop();
  } catch (error) {
    console.error('Error deteniendo player:', error);
  }
  
  // Matar proceso ffmpeg si existe
  try {
    if (game.ffmpegProcess && !game.ffmpegProcess.killed) {
      game.ffmpegProcess.kill('SIGTERM');
    }
  } catch (error) {
    console.error('Error matando ffmpeg:', error);
  }
  
  // Limpiar audio precargado si existe
  try {
    if (game.nextAudioResource?.ffmpeg && !game.nextAudioResource.ffmpeg.killed) {
      game.nextAudioResource.ffmpeg.kill('SIGTERM');
      console.log('🧹 Audio precargado limpiado');
    }
  } catch (error) {
    console.error('Error limpiando audio precargado:', error);
  }
  
  // Detener collector de mensajes si existe
  if (game.collector) {
    game.collector.stop('manual_stop');
  }
  
  // Detener collector de botones si existe
  if (game.buttonCollector) {
    game.buttonCollector.stop('manual_stop');
  }
  
  gameManager.endGame(interaction.guildId);
  
  // Programar desconexión
  if (game.connection) {
    scheduleDisconnect(interaction.guildId, game.connection);
  }

  await interaction.reply({
    embeds: [createInfoEmbed('⏹️ Ronda Detenida', 'La ronda ha sido detenida por un administrador.')]
  });
}

// Map para rastrear timeouts de desconexión por servidor
const disconnectTimeouts = new Map();

/**
 * Programa la desconexión del bot del canal de voz después de un período de inactividad
 */
function scheduleDisconnect(guildId, connection) {
  // Cancelar timeout anterior si existe
  if (disconnectTimeouts.has(guildId)) {
    clearTimeout(disconnectTimeouts.get(guildId));
  }

  // Programar nueva desconexión en 90 segundos
  const disconnectTime = SETTINGS.OPENING_DISCONNECT_TIMEOUT * 1000;
  const timeout = setTimeout(() => {
    // Verificar si hay una partida activa
    if (!gameManager.isGameActive(guildId)) {
      try {
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
          connection.destroy();
          console.log(`🔌 Desconectado del canal de voz en servidor ${guildId} por inactividad`);
        }
      } catch (error) {
        console.error('Error al desconectar:', error);
      }
      disconnectTimeouts.delete(guildId);
    }
  }, disconnectTime);

  disconnectTimeouts.set(guildId, timeout);
  console.log(`⏱️ Desconexión programada en ${SETTINGS.OPENING_DISCONNECT_TIMEOUT}s para servidor ${guildId}`);
}

/**
 * Muestra las reglas del juego
 */
async function handleRules(interaction) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('📖 Cómo Jugar Guess Opening')
    .setDescription(
      'El bot reproducirá el opening de un anime popular.\n\n' +
      '**Objetivo:** Ser el primero en escribir el nombre correcto del anime en el chat.\n\n' +
      '**Reglas:**\n' +
      '• Escucha atentamente el opening\n' +
      '• Escribe el nombre del anime en el chat\n' +
      '• No es necesario que sea exacto, hay margen de similitud\n' +
      '• El primer jugador en acertar gana la ronda\n\n' +
      `**Tiempo por ronda:** ${SETTINGS.OPENING_ROUND_TIME} segundos`
    )
    .setFooter({ text: 'Usa /guessopening start para comenzar' });

  await interaction.reply({ embeds: [embed] });
}

/**
 * Obtiene un opening o ending aleatorio directamente desde AnimeThemes
 */
async function fetchRandomOpening() {
  try {
    // Obtener animes con themes de forma aleatoria
    const randomPage = Math.floor(Math.random() * 50) + 1; // Páginas 1-50 (animes más populares)
    
    const response = await fetch(
      `https://api.animethemes.moe/anime?page[size]=50&page[number]=${randomPage}&include=animethemes.animethemeentries.videos.audio&filter[has]=resources`
    );
    
    const data = await response.json();
    const animes = data.anime || [];

    if (animes.length === 0) {
      return null;
    }

    // Seleccionar un anime aleatorio de la página
    const anime = animes[Math.floor(Math.random() * animes.length)];
    
    // Recopilar TODOS los themes disponibles (openings y endings si están habilitados)
    const availableThemes = [];
    
    for (const theme of anime.animethemes || []) {
      // Incluir openings siempre
      if (theme.type === 'OP' && theme.animethemeentries?.length) {
        for (const entry of theme.animethemeentries) {
          if (entry.videos?.length) {
            const video = entry.videos[0];
            // Preferir audio OGG si está disponible, sino usar video WebM
            const audioUrl = video.audio?.link 
              ? (video.audio.link.startsWith('http') ? video.audio.link : `https://animethemes.moe${video.audio.link}`)
              : (video.link.startsWith('http') ? video.link : `https://animethemes.moe${video.link}`);
            
            availableThemes.push({
              audioUrl,
              type: 'Opening',
              number: theme.sequence || 1,
              isAudioOnly: !!video.audio?.link
            });
          }
        }
      }
      
      // Incluir endings si está habilitado en settings
      if (SETTINGS.OPENING_INCLUDE_ENDINGS && theme.type === 'ED' && theme.animethemeentries?.length) {
        for (const entry of theme.animethemeentries) {
          if (entry.videos?.length) {
            const video = entry.videos[0];
            // Preferir audio OGG si está disponible, sino usar video WebM
            const audioUrl = video.audio?.link 
              ? (video.audio.link.startsWith('http') ? video.audio.link : `https://animethemes.moe${video.audio.link}`)
              : (video.link.startsWith('http') ? video.link : `https://animethemes.moe${video.link}`);
            
            availableThemes.push({
              audioUrl,
              type: 'Ending',
              number: theme.sequence || 1,
              isAudioOnly: !!video.audio?.link
            });
          }
        }
      }
    }

    // Si no hay themes disponibles, intentar con otro anime
    if (availableThemes.length === 0) {
      for (const altAnime of animes) {
        const altThemes = [];
        
        for (const theme of altAnime.animethemes || []) {
          if (theme.type === 'OP' && theme.animethemeentries?.length) {
            for (const entry of theme.animethemeentries) {
              if (entry.videos?.length) {
                const video = entry.videos[0];
                const audioUrl = video.audio?.link 
                  ? (video.audio.link.startsWith('http') ? video.audio.link : `https://animethemes.moe${video.audio.link}`)
                  : (video.link.startsWith('http') ? video.link : `https://animethemes.moe${video.link}`);
                
                altThemes.push({
                  audioUrl,
                  type: 'Opening',
                  number: theme.sequence || 1,
                  isAudioOnly: !!video.audio?.link
                });
              }
            }
          }
          
          if (SETTINGS.OPENING_INCLUDE_ENDINGS && theme.type === 'ED' && theme.animethemeentries?.length) {
            for (const entry of theme.animethemeentries) {
              if (entry.videos?.length) {
                const video = entry.videos[0];
                const audioUrl = video.audio?.link 
                  ? (video.audio.link.startsWith('http') ? video.audio.link : `https://animethemes.moe${video.audio.link}`)
                  : (video.link.startsWith('http') ? video.link : `https://animethemes.moe${video.link}`);
                
                altThemes.push({
                  audioUrl,
                  type: 'Ending',
                  number: theme.sequence || 1,
                  isAudioOnly: !!video.audio?.link
                });
              }
            }
          }
        }
        
        if (altThemes.length > 0) {
          const randomTheme = altThemes[Math.floor(Math.random() * altThemes.length)];
          console.log(`🎵 Seleccionado: ${altAnime.name} - ${randomTheme.type} ${randomTheme.number} ${randomTheme.isAudioOnly ? '(Audio)' : '(WebM)'}`);
          
          return {
            audioUrl: randomTheme.audioUrl,
            animeTitle: altAnime.name,
            themeType: randomTheme.type,
            themeNumber: randomTheme.number
          };
        }
      }
      return null;
    }

    // Seleccionar un theme aleatorio de todos los disponibles
    const selectedTheme = availableThemes[Math.floor(Math.random() * availableThemes.length)];
    
    console.log(`🎵 Seleccionado: ${anime.name} - ${selectedTheme.type} ${selectedTheme.number} ${selectedTheme.isAudioOnly ? '(Audio)' : '(WebM)'} (de ${availableThemes.length} disponibles)`);
    
    // Buscar títulos en inglés y romaji desde AniList
    let animeTitles = [anime.name]; // Por defecto, solo el nombre de AnimeThemes
    try {
      const anilistQuery = `
        query ($search: String) {
          Media(search: $search, type: ANIME) {
            title {
              english
              romaji
            }
          }
        }
      `;
      
      const anilistResponse = await fetch(ANILIST_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: anilistQuery,
          variables: { search: anime.name }
        })
      });
      
      const anilistData = await anilistResponse.json();
      if (anilistData.data?.Media?.title) {
        const titles = anilistData.data.Media.title;
        animeTitles = [titles.english, titles.romaji].filter(t => t); // Filtrar nulls
        if (animeTitles.length === 0) animeTitles = [anime.name]; // Fallback
      }
    } catch (error) {
      console.log('No se pudieron obtener títulos alternativos, usando solo el nombre de AnimeThemes');
    }
    
    return {
      audioUrl: selectedTheme.audioUrl,
      animeTitle: anime.name, // Para mostrar
      animeTitles: animeTitles, // Para validación [english, romaji]
      themeType: selectedTheme.type,
      themeNumber: selectedTheme.number
    };
  } catch (error) {
    console.error('Error en fetchRandomOpening:', error);
    return null;
  }
}

/**
 * Obtiene la duración de un video usando ffprobe
 */
async function getVideoDuration(url) {
  return new Promise((resolve) => {
    const ffprobeArgs = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      url
    ];
    
    // Usar ffprobe (viene con ffmpeg-static)
    const ffprobePath = ffmpegPath.replace('ffmpeg.exe', 'ffprobe.exe').replace('ffmpeg', 'ffprobe');
    const ffprobe = spawn(ffprobePath, ffprobeArgs);
    
    let output = '';
    
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ffprobe.on('close', () => {
      const duration = parseFloat(output.trim());
      resolve(isNaN(duration) ? 90 : Math.floor(duration)); // Default 90s si falla
    });
    
    ffprobe.on('error', () => {
      resolve(90); // Default 90s si hay error
    });
  });
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
