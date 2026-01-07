/**
 * Comando Stop - Detiene el juego activo en el servidor
 */

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import gameManager from '../utils/GameManager.js';
import i18nService from '../services/i18n.js';
import { createErrorEmbed, createInfoEmbed } from '../utils/gameHelpers.js';
import * as impostor from '../games/impostor.js';
import * as hangman from '../games/hangman.js';
import * as guessopening from '../games/guessopening.js';
import * as guessrecommendations from '../games/guessrecommendations.js';
import * as guessimage from '../games/guessimage.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Detiene el juego activo en este servidor');

export async function execute(interaction) {
  const game = gameManager.getGame(interaction.guildId);
  const locale = i18nService.getGuildLocale(interaction.guildId);

  if (!game) {
    return await interaction.reply({
      embeds: [createErrorEmbed(i18nService.t('errors.no_game_active', locale))],
      flags: MessageFlags.Ephemeral
    });
  }

  // Añadir locale y método getSubcommand a la interacción
  interaction.locale = locale;
  interaction.options.getSubcommand = () => 'stop';

  // Delegar al handler específico del juego según el tipo
  switch (game.type) {
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
      // Fallback: detener genéricamente
      gameManager.endGame(interaction.guildId);
      return await interaction.reply({
        embeds: [createInfoEmbed(
          '🛑 Juego Detenido',
          `El juego ha sido detenido por ${interaction.user}.`
        )]
      });
  }
}
