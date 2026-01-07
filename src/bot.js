/**
 * TAG - Interactive Anime Games Bot
 * Simplified command loading system
 */

import { Client, GatewayIntentBits, Collection, REST, Routes, MessageFlags } from 'discord.js';
import { readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import anilistService from './services/anilistService.js';
import gameManager from './utils/GameManager.js';

// Cargar variables de entorno
dotenv.config();

// Validar variables de entorno requeridas
const requiredEnvVars = ['DISCORD_TOKEN', 'CLIENT_ID'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Error: Variable de entorno ${envVar} no está definida`);
    process.exit(1);
  }
}

/**
 * Crea y configura el cliente de Discord
 */
function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.commands = new Collection();
  
  return client;
}

/**
 * Carga todos los comandos desde src/commands
 */
async function loadCommands(client) {
  const commandsPath = path.resolve('./src/commands');
  const commandFiles = readdirSync(commandsPath).filter(file => 
    file.endsWith('.js') && !file.includes('-new')
  );

  console.log(`🔄 Cargando ${commandFiles.length} comandos...`);

  for (const file of commandFiles) {
    try {
      const filePath = path.join(commandsPath, file);
      const fileURL = pathToFileURL(filePath).href;
      const command = await import(fileURL);

      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`  ✅ Comando cargado: ${command.data.name}`);
      } else {
        console.warn(`  ⚠️  Comando ${file} no tiene "data" o "execute"`);
      }
    } catch (error) {
      console.error(`  ❌ Error cargando ${file}:`, error);
    }
  }

  console.log(`✅ ${client.commands.size} comandos cargados\n`);
}

/**
 * Registra los slash commands en Discord
 */
async function registerSlashCommands(client) {
  const commands = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('🔄 Registrando comandos slash en Discord...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log(`✅ ${commands.length} comandos registrados en Discord\n`);
  } catch (error) {
    console.error('❌ Error registrando comandos:', error);
  }
}

/**
 * Configura los event handlers del bot
 */
function setupEventHandlers(client) {
  // Evento: Bot listo
  client.once('ready', async () => {
    console.log('═══════════════════════════════════════');
    console.log(`✅ Bot conectado como ${client.user.tag}`);
    console.log(`🌐 Servidores: ${client.guilds.cache.size}`);
    console.log(`👥 Usuarios: ${client.users.cache.size}`);
    console.log(`🎮 Comandos: ${client.commands.size}`);
    console.log('═══════════════════════════════════════\n');

    // Establecer estado del bot
    client.user.setActivity('Anime Games | /impostor', { type: 0 });

    // Inicializar servicio de AniList
    try {
      await anilistService.initialize();
    } catch (error) {
      console.error('❌ Error crítico inicializando AniList:', error);
      console.error('⚠️  El bot seguirá funcionando pero los juegos pueden fallar\n');
    }

    // Tarea periódica: Limpiar cooldowns expirados cada 5 minutos
    setInterval(() => {
      gameManager.cleanupCooldowns();
    }, 5 * 60 * 1000);
  });

  // Evento: Interacción creada (comandos slash)
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    
    if (!command) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: '⚠️ Comando no encontrado.', 
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Error ejecutando comando ${interaction.commandName}:`, error);
      
      try {
        const errorMessage = '❌ Hubo un error al ejecutar este comando.';
        
        // Verificar el estado de la interacción antes de responder
        if (interaction.replied) {
          // Si ya se respondió, intentar enviar un followUp
          await interaction.followUp({ 
            content: errorMessage, 
            flags: MessageFlags.Ephemeral 
          }).catch(() => {});
        } else if (interaction.deferred) {
          // Si se difirió pero no se respondió, usar editReply
          await interaction.editReply({ content: errorMessage }).catch(() => {});
        } else {
          // Si no se ha hecho nada, usar reply
          await interaction.reply({ 
            content: errorMessage, 
            flags: MessageFlags.Ephemeral 
          }).catch(() => {});
        }
      } catch (replyError) {
        console.error('❌ Error enviando mensaje de error:', replyError.message);
      }
    }
  });

  // Evento: Error del cliente
  client.on('error', (error) => {
    console.error('❌ Error del cliente Discord:', error);
  });

  // Evento: Advertencia
  client.on('warn', (warning) => {
    console.warn('⚠️  Advertencia:', warning);
  });

  // Evento: Reconexión
  client.on('shardReconnecting', () => {
    console.log('🔄 Reconectando al servidor de Discord...');
  });

  // Evento: Desconexión
  client.on('shardDisconnect', () => {
    console.log('🔌 Desconectado del servidor de Discord');
  });
}

/**
 * Inicia el bot
 */
async function startBot() {
  console.log('🚀 Iniciando TAG Bot...\n');

  const client = createClient();

  // Cargar comandos
  await loadCommands(client);

  // Registrar comandos en Discord
  await registerSlashCommands(client);

  // Configurar event handlers
  setupEventHandlers(client);

  // Conectar a Discord
  try {
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error('❌ Error al conectar con Discord:', error);
    process.exit(1);
  }
}

/**
 * Manejo de señales de terminación
 */
process.on('SIGINT', () => {
  console.log('\n👋 Cerrando bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Cerrando bot...');
  process.exit(0);
});

// Iniciar el bot
startBot();
