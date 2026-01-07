/**
 * Comando Start - Inicia cualquier juego disponible
 */

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import i18nService from '../services/i18n.js';
import { createErrorEmbed } from '../utils/gameHelpers.js';
import * as impostor from '../games/impostor.js';
import * as hangman from '../games/hangman.js';
import * as guessopening from '../games/guessopening.js';
import * as guessrecommendations from '../games/guessrecommendations.js';
import * as guessimage from '../games/guessimage.js';

export const data = new SlashCommandBuilder()
  .setName('start')
  .setDescription('Start a game / Inicia un juego')
  .addStringOption(option =>
    option
      .setName('game')
      .setDescription('Select the game / Selecciona el juego')
      .setRequired(true)
      .addChoices(
        { name: '🎭 Impostor', value: 'impostor' },
        { name: '📝 Hangman', value: 'hangman' },
        { name: '🎵 Guess Opening', value: 'guessopening' },
        { name: '🔍 Guess Recommendations', value: 'guessrecommendations' },
        { name: '🖼️ Guess Image', value: 'guessimage' }
      )
  );

export async function execute(interaction) {
  try {
    // DEFER INMEDIATO para evitar timeout (3 segundos)
    // Esto debe ser lo primero que se ejecute
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const gameType = interaction.options.getString('game');
    const locale = i18nService.getGuildLocale(interaction.guildId);

    // Añadir locale y método getSubcommand a la interacción
    interaction.locale = locale;
    interaction.options.getSubcommand = () => 'start';

    switch (gameType) {
      case 'impostor':
        return await impostor.execute(interaction);
      case 'hangman':
        return await hangman.execute(interaction);
      case 'guessopening':
        return await guessopening.execute(interaction);
      case 'guessrecommendations':
        return await guessrecommendations.execute(interaction);
      case 'guessimage':
        return await guessimage.execute(interaction);
      default:
        return await interaction.editReply({
          embeds: [createErrorEmbed(i18nService.t('errors.invalid_game', locale))]
        });
    }
  } catch (error) {
    console.error('Error in start command:', error);
    
    // Manejar respuesta según el estado de la interacción
    const errorMessage = '❌ Hubo un error al iniciar el juego.';
    
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content: errorMessage });
    } else if (!interaction.replied) {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
    
    throw error;
  }
}
