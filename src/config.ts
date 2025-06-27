import dotenv from 'dotenv';
dotenv.config();

export const config = {
    discordBotToken: process.env.DISCORD_BOT_TOKEN || '',
    gameEmail: process.env.GAME_EMAIL || 'fuheng',
    gamePassword: process.env.GAME_PASSWORD || 'cgsh10931021',
    apiHost: process.env.GAME_API_HOST || 'api.komisureiya.com',
    locale: process.env.GAME_LOCALE || 'zh_TW',
    key: process.env.GAME_KEY || 'rfront2023',
    appVersion: process.env.GAME_APP_VERSION || '2.21',
    clientAppId: '1388137302752100442' // For registering slash commands
};