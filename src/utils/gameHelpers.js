/**
 * Utilidades compartidas para los juegos
 */

import { EmbedBuilder } from 'discord.js';
import { COLORS, EMOJIS } from '../config/constants.js';

/**
 * Crea un embed de error estándar
 */
export function createErrorEmbed(message) {
  return new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle(`${EMOJIS.ERROR} Error`)
    .setDescription(message)
    .setTimestamp();
}

/**
 * Crea un embed de éxito estándar
 */
export function createSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJIS.SUCCESS} ${title}`)
    .setDescription(description)
    .setTimestamp();
}

/**
 * Crea un embed de información
 */
export function createInfoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

/**
 * Valida que el usuario esté en un canal de voz
 */
export function validateVoiceChannel(interaction) {
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    return {
      valid: false,
      error: 'Debes estar en un canal de voz para usar este comando.'
    };
  }
  return { valid: true, voiceChannel };
}

/**
 * Envía mensajes directos a múltiples jugadores
 */
export async function sendDMsToPlayers(players, embedCreator) {
  const dmPromises = players.map(async (player) => {
    try {
      const embed = embedCreator(player);
      await player.send({ embeds: [embed] });
      return { success: true, player };
    } catch (error) {
      console.error(`Error enviando DM a ${player.user.tag}:`, error);
      return { success: false, player };
    }
  });

  return await Promise.all(dmPromises);
}

/**
 * Formatea una lista de jugadores
 * Acepta tanto IDs (strings) como objetos de miembros
 */
export function formatPlayerList(players) {
  return players.map((m, idx) => {
    // Si es un string (ID), formatear como mención
    if (typeof m === 'string') {
      return `${idx + 1}. <@${m}>`;
    }
    // Si es un objeto con user.tag
    return `${idx + 1}. ${m.user.tag}`;
  }).join('\n');
}
