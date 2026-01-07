# TAG - Discord Anime Games Bot

A Discord bot providing interactive anime-themed games with voice channel integration and multi-language support.

## Games

### Impostor
Social deduction game where players must identify who doesn't know the assigned anime.

Commands: `/impostor start | rules | ping`

### Guess Opening
Identify anime by listening to opening and ending themes.

Commands: `/guessopening start | rules | stop`

### Guess Image
Identify anime or characters from blurred images with progressive reveal.

Commands: `/guessimage start | rules | stop`

### Guess Recommendations
Discover anime through its community recommendations.

Commands: `/guessrecommendations start | rules | stop`

### Hangman
Classic word-guessing game with anime titles.

Commands: `/hangman start | rules | stop`

## Features

- AniList API integration for anime metadata
- AnimeThemes API for audio streaming
- SQLite caching with 24-hour refresh cycle
- Voice channel persistence across rounds
- Audio preloading for instant playback
- Dual language support (English/Romaji)
- Fuzzy matching for answer validation
- Configurable game parameters

## Requirements

- Node.js >= 18.0.0
- FFmpeg (for audio processing)
- Discord Bot Token with Message Content intent

## Installation

```bash
git clone <repository-url>
cd tag
npm install
```

Create `.env` file:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_client_id
```

Start the bot:

```bash
npm start
```

Development mode with auto-reload:

```bash
npm run dev
```

## Project Structure

```
src/
├── bot.js                      # Main entry point
├── commands/                   # Slash command handlers
│   ├── language.js
│   ├── rules.js
│   ├── start.js
│   └── stop.js
├── games/                      # Game implementations
│   ├── guessimage.js
│   ├── guessopening.js
│   ├── guessrecommendations.js
│   ├── hangman.js
│   └── impostor.js
├── services/                   # External API integrations
│   ├── anilistService.js
│   ├── database.js
│   └── i18n.js
├── utils/                      # Shared utilities
│   ├── GameManager.js
│   ├── gameHelpers.js
│   └── random.js
├── config/                     # Configuration
│   ├── constants.js
│   └── settings.js
├── locales/                    # Translations
│   ├── en.json
│   └── es.json
└── data/                       # SQLite cache
```

## Configuration

Key settings in `src/config/settings.js`:

```javascript
ANILIST_TOP_THRESHOLD: 500          // Number of top anime to cache
OPENING_ROUND_TIME: 30               // Round duration (seconds)
OPENING_INCLUDE_ENDINGS: true        // Include ending themes
OPENING_DISCONNECT_TIMEOUT: 90       // Voice disconnect delay
GUESSIMAGE_BLUR_AMOUNT: 20           // Initial blur intensity
```

## Required Permissions

- Send Messages
- Embed Links
- Use Slash Commands
- Connect (voice)
- Speak (voice)

## Architecture

- Modular game system with independent implementations
- Centralized state management via GameManager
- SQLite caching layer for API responses
- Audio preloading and streaming optimization
- Internationalization support

## License

MIT
