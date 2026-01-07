/**
 * Comando Rules - Muestra reglas de cualquier juego
 */

import { SlashCommandBuilder } from 'discord.js';
import i18nService from '../services/i18n.js';
import * as impostor from '../games/impostor.js';
import * as hangman from '../games/hangman.js';
import * as guessopening from '../games/guessopening.js';
import * as guessrecommendations from '../games/guessrecommendations.js';
import * as guessimage from '../games/guessimage.js';

export const data = new SlashCommandBuilder()
  .setName('rules')
  .setDescription('Muestra las reglas de un juego')
  .addStringOption(option =>
    option
      .setName('juego')
      .setDescription('Selecciona el juego')
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
  const gameType = interaction.options.getString('juego');
  const locale = i18nService.getGuildLocale(interaction.guildId);

  // Añadir locale y método getSubcommand a la interacción
  interaction.locale = locale;
  interaction.options.getSubcommand = () => 'rules';

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
      return await interaction.reply({
        content: '❌ Juego no válido.',
        ephemeral: true
      });
  }
}
