/**
 * Comando Language - Cambia el idioma del bot
 */

import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import i18nService from '../services/i18n.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/gameHelpers.js';

export const data = new SlashCommandBuilder()
  .setName('language')
  .setDescription('Change bot language / Cambia el idioma del bot')
  .addStringOption(option =>
    option
      .setName('lang')
      .setDescription('Select language / Selecciona idioma')
      .setRequired(true)
      .addChoices(
        { name: '🇬🇧 English', value: 'en' },
        { name: '🇪🇸 Español', value: 'es' }
      )
  );

export async function execute(interaction) {
  const locale = interaction.options.getString('lang');
  
  // Verificar permisos
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    const currentLocale = i18nService.getGuildLocale(interaction.guildId);
    return await interaction.reply({
      embeds: [createErrorEmbed(i18nService.t('commands.language.no_permission', currentLocale))],
      flags: MessageFlags.Ephemeral
    });
  }

  // Cambiar idioma
  i18nService.setGuildLocale(interaction.guildId, locale);
  
  const successMessage = i18nService.t('commands.language.success', locale);
  
  await interaction.reply({
    embeds: [createSuccessEmbed('✅ Language / Idioma', successMessage)]
  });
}
