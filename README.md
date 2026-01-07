# 🎌 TAG - Anime Games Bot

TAG is a Discord bot that offers interactive and fun games related to anime.

## 🎮 Available Games

### Impostor
A social deduction game where players receive an anime via DM, except one player - the impostor - who must pretend to know it.

**How to play:**
1. Join a voice channel
2. Use `/impostor start`
3. Players click "Join Game"
4. Everyone receives their role via DM
5. Give clues and find the impostor!

**Commands:**
- `/impostor start` - Start a new game
- `/impostor rules` - Show game rules
- `/impostor ping` - Check bot status

### Guess Opening
Listen to anime openings and endings and guess the anime name as fast as you can!

**Commands:**
- `/guessopening start` - Start a round
- `/guessopening rules` - Show game rules
- `/guessopening stop` - Stop current round

**Features:**
- Randomly selects from all available openings and endings
- Bot stays in voice channel between rounds (disconnects after 90s of inactivity)
- Configurable to include only openings or both openings and endings

### Guess Recommendations
Discover the anime by its recommendations from AniList community!

**Commands:**
- `/guessrecommendations start` - Start a round
- `/guessrecommendations rules` - Show game rules
- `/guessrecommendations stop` - Stop current round

**Features:**
- Shows 5 recommendations progressively (one every ~12 seconds)
- Each recommendation includes cover image, votes, format, score, genres, and synopsis
- 60 seconds total to guess the anime
- Based on real community data from AniList

## ✨ Features

- ✅ Uses AniList API for anime data (Top 500)
- ✅ Smart caching system (updates every 24h)
- ✅ Private DM system for game roles
- ✅ Voice channel integration for audio games
- ✅ Cooldown system to prevent spam
- ✅ Clean and modular architecture

## 📋 Requirements

- **Node.js** >= 18.0.0
- **npm** or **yarn**
- Discord Bot Token

## 🚀 Quick Start

### 1. Clone the repository

```bash
git clone <your-repository>
cd ImpostorDiscordBot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file and edit it:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
```

Get your credentials at: https://discord.com/developers/applications

### 4. Verify setup

```bash
npm run verify
```

### 5. Start the bot

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## 🏗️ Project Structure

```
src/
├── bot.js                    # Main entry point
├── commands/                 # Slash commands
│   ├── impostor.js          # Impostor game
│   └── guessopening.js      # Guess Opening game
├── services/                 # External services
│   └── anilistService.js    # AniList API integration
├── utils/                    # Shared utilities
│   ├── GameManager.js       # Centralized game state manager
│   ├── gameHelpers.js       # Reusable helper functions
│   └── random.js            # Random utilities
└── config/                   # Configuration
    ├── constants.js         # Bot constants
    └── settings.js          # Editable settings
```

## ⚙️ Configuration

Edit `src/config/settings.js` to customize:

```javascript
export const SETTINGS = {
  ANILIST_TOP_THRESHOLD: 100,      // Top N animes to use
  DEFAULT_JOIN_TIME: 15,            // Seconds to join game
  DEFAULT_MIN_PLAYERS: 3,           // Minimum players required
  COMMAND_COOLDOWN: 30,             // Cooldown between commands
  OPENING_ROUND_TIME: 30,           // Time per opening round
  OPENING_SIMILARITY_THRESHOLD: 0.8,// Answer similarity threshold
  OPENING_INCLUDE_ENDINGS: true,    // Include endings (not just openings)
  OPENING_DISCONNECT_TIMEOUT: 90    // Seconds before disconnecting from voice
};
```

## 🤖 Bot Permissions

Required Discord permissions:
- Send Messages
- Send Messages in Threads
- Embed Links
- Use Slash Commands
- Connect (for voice)
- Speak (for audio playback)

## 🐛 Troubleshooting

### "Environment variable not defined"
**Solution:** Verify that `.env` exists and contains `DISCORD_TOKEN` and `CLIENT_ID`

### "Could not send DM"
**Solution:** Users must allow DMs from server members in their Discord settings

### "Command not found"
**Solution:** Wait 1-2 minutes for Discord to register the slash commands

## 📝 Adding New Games

1. Create a new file in `src/commands/` (e.g., `mygame.js`)

2. Use this template:

```javascript
import { SlashCommandBuilder } from 'discord.js';
import gameManager from '../utils/GameManager.js';

export const data = new SlashCommandBuilder()
  .setName('mygame')
  .setDescription('Your game description')
  .addSubcommand(subcommand =>
    subcommand.setName('start').setDescription('Start the game')
  );

export async function execute(interaction) {
  // Your game logic here
}
```

3. Restart the bot - it will load automatically!

## 🛠️ Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the bot in production mode |
| `npm run dev` | Start with auto-reload (development) |
| `npm run verify` | Verify environment setup |

## 🎯 Architecture Highlights

- **Independent Commands:** Each game is a self-contained slash command
- **Centralized State:** GameManager handles active games and cooldowns
- **Reusable Helpers:** Shared functions for common tasks
- **Clean Separation:** Commands, services, utils, and config are clearly separated

## 📄 License

MIT License

## 🙏 Credits

- **AniList API** - Anime data
- **AnimeThemes** - Opening audio
- **Discord.js** - Discord library

## 🤝 Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

Made with ❤️ for anime fans
