import { Client, GatewayIntentBits, Interaction, CacheType, SlashCommandBuilder, EmbedBuilder, REST, Routes, ActivityType, ChannelType, TextChannel } from 'discord.js';
import { config } from './config';
import { GameService } from './GameService';
import { PresenceLogger } from './PresenceLogger';
import { UnionActivityLogger } from './UnionActivityLogger';
import { OnlineStatusService } from './OnlineStatusService';
import { UnionMovementLogger } from './UnionMovementLogger';
import { MonitoredUnionService } from './MonitoredUnionService';
import http from 'http';

http.createServer((_, res) => {
  res.writeHead(200);
  res.end('Bot is running');
}).listen(process.env.PORT || 3000);


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ]
});

const gameService = new GameService();
const onlineStatusService = new OnlineStatusService(gameService);
const monitoredUnionService = new MonitoredUnionService(client);

const presenceLogger = new PresenceLogger(client, onlineStatusService, monitoredUnionService);
const unionActivityLogger = new UnionActivityLogger(client, monitoredUnionService);
const unionMovementLogger = new UnionMovementLogger(client, gameService, monitoredUnionService);

// For periodic summary
let summaryInterval: NodeJS.Timeout | null = null;
let summaryChannelId: string | null = null;
let summaryIntervalDurationMs = 60 * 1000;

const commands = [
    new SlashCommandBuilder()
        .setName('查詢城市')
        .setDescription('搜索城市，並列出該城市的聯盟主力。')
        .addStringOption(option =>
            option.setName('城市id或名稱')
                .setDescription('城市ID或名稱')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('查詢玩家')
        .setDescription('搜索玩家資料。')
        .addIntegerOption(option =>
            option.setName('玩家id')
                .setDescription('玩家ID')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('查詢聯盟')
        .setDescription('搜索聯盟資料。')
        .addStringOption(option =>
            option.setName('聯盟id或名稱')
                .setDescription('聯盟ID或名稱')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('勢力布防')
        .setDescription('搜索整個勢力的布防資料。')
        .addStringOption(option =>
            option.setName('勢力名稱')
                .setDescription('勢力名稱')
                .setRequired(true)
                .addChoices(
                    { name: '紅軍', value: '紅軍' },
                    { name: '臺灣', value: '臺灣' },
                    { name: '蒙古', value: '蒙古' },
                    { name: '哈薩克', value: '哈薩克' },
                    { name: '西藏', value: '西藏' },
                    { name: '反賊', value: '反賊' },
                    { name: '香港', value: '香港' },
                    { name: '維吾爾', value: '維吾爾' },
                    { name: '滿洲', value: '滿洲' },
                )),
    new SlashCommandBuilder()
        .setName('設定記錄頻道')
        .setDescription('設定玩家上下線狀態的記錄頻道。')
        .addChannelOption(option =>
            option.setName('頻道')
                .setDescription('要發送記錄的頻道。')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),
    new SlashCommandBuilder()
        .setName('設定總覽頻道')
        .setDescription('設定定時玩家在線總覽的頻道。')
        .addChannelOption(option =>
            option.setName('頻道')
                .setDescription('總覽訊息的頻道。')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)),
    new SlashCommandBuilder()
        .setName('立即總覽')
        .setDescription('立即發送一次玩家在線總覽。'),
    new SlashCommandBuilder()
        .setName('設定總覽間隔')
        .setDescription('設定定時玩家在線總覽的間隔時間（分鐘）。')
        .addIntegerOption(option =>
            option.setName('分鐘')
                .setDescription('間隔時間（分鐘）')
                .setRequired(true)
                .setMinValue(1)),
    new SlashCommandBuilder()
        .setName('追蹤聯盟')
        .setDescription('追蹤聯盟主力移動事件')
        .addChannelOption(option => 
            option.setName('頻道')
                .setDescription('要發送移動紀錄的頻道。')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        )
        .addStringOption(option =>
            option.setName('勢力名稱')
            .setDescription('可選：只追蹤特定勢力的聯盟（留空則追蹤所有）')
            .setRequired(false)
            .addChoices(
                { name: '紅軍', value: '紅軍' },
                { name: '臺灣', value: '臺灣' },
                { name: '蒙古', value: '蒙古' },
                { name: '哈薩克', value: '哈薩克' },
                { name: '西藏', value: '西藏' },
                { name: '反賊', value: '反賊' },
                { name: '香港', value: '香港' },
                { name: '維吾爾', value: '維吾爾' },
                { name: '滿洲', value: '滿洲' }
            )
        ),
    new SlashCommandBuilder()
        .setName('監控聯盟')
        .setDescription('管理特定聯盟的事件監控')
        .addSubcommand(sub => sub
            .setName('頻道設定')
            .setDescription('設定監控聯盟所有事件的紀錄頻道')
            .addChannelOption(opt => opt.setName('頻道').setDescription('紀錄頻道').setRequired(true).addChannelTypes(ChannelType.GuildText))
        )
        .addSubcommand(sub => sub
            .setName('添加')
            .setDescription('添加一個聯盟到監控列表。')
            .addIntegerOption(opt => opt.setName('聯盟id').setDescription('要監控的聯盟ID').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('移除')
            .setDescription('從監控列表移除一個聯盟。')
            .addIntegerOption(opt => opt.setName('聯盟id').setDescription('要移除監控的聯盟ID').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('列表')
            .setDescription('列出當前所有受監控的聯盟。')),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(config.discordBotToken);

async function registerCommands() {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationGuildCommands(config.clientAppId, '1362627214885261422'),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
}


client.once('ready', async () => {
    if (!client.user) {
        console.error("Client user is not available.");
        return;
    }
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Bot is in ${client.guilds.cache.size} servers.`);
    client.user.setActivity('the game server', { type: ActivityType.Watching }); // Custom status

    try {
        await registerCommands(); // Register slash commands

        gameService.setPresenceDiffHandler(presenceLogger.handlePresenceDiff.bind(presenceLogger));
        gameService.setUnionActivityListener(unionActivityLogger);
        gameService.setUnionMovementListener(unionMovementLogger);
        
        await gameService.login(); // Connects and fetches initial data
        console.log("[Bot] GameService initialized and connected.");

        // Start periodic summary if a channel was previously set (e.g., loaded from config/db)
        // For now, it starts sending if setsummarychannel is used.
        if (summaryChannelId && !summaryInterval) {
             summaryInterval = setInterval(sendOnlineSummary, summaryIntervalDurationMs); // Every 1 minute
        }
    } catch (error) {
        console.error("[Bot] Failed to initialize GameService:", error);
        // Handle this case, maybe shutdown or retry
    }
});

async function sendOnlineSummary() {
    if (!summaryChannelId) return;
    const targetChannel = await client.channels.fetch(summaryChannelId).catch(() => null);
    if (!targetChannel || !(targetChannel instanceof TextChannel)) {
        console.error(`[Bot] Summary channel ${summaryChannelId} not found or not a text channel for periodic summary.`);
        return;
    }

    const nationCounts = onlineStatusService.getNationOnlineCounts();
    const embed = new EmbedBuilder()
        .setTitle('📈 各勢力在線玩家總覽')
        .setColor(0x00D2FF)
        .setTimestamp();

    let totalOnline = 0;
    let descriptionLines = [];
    for (const [nationName, count] of nationCounts) {
        if (count > 0) { // Only show nations with online players or always show all
            descriptionLines.push(`**${nationName}**: ${count} 名玩家`);
        }
        totalOnline += count;
    }
    embed.setDescription(descriptionLines.join('\n') || '目前沒有偵測到在線玩家。');
    embed.setFooter({ text: `總在線玩家數 (已偵測): ${totalOnline}\n總離線玩家數 (已偵測): ${onlineStatusService.getTotalOfflineCount()}` });

    try {
        await targetChannel.send({ embeds: [embed] });
    } catch (e) {
        console.error(`[Bot] Failed to send summary to ${summaryChannelId}:`, e);
    }
}

const gracefulShutdown = () => {
    console.log('[Bot] Attempting graceful shutdown...');
    if (summaryInterval) clearInterval(summaryInterval);
    monitoredUnionService.saveState();
    console.log('[Bot] State saved for services. Exiting.');
    client.destroy();
    // Allow a brief moment for writes to complete if truly necessary, though writeFileSync is synchronous
    setTimeout(() => process.exit(0), 500); 
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

client.on('interactionCreate', async (interaction: Interaction<CacheType>) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
        switch (commandName) {
            case '查詢城市': { // Added block scope for clarity
                const cityIdentifier = interaction.options.getString('城市id或名稱', true);
                await interaction.deferReply(); // Defer reply as this might take longer now

                const cityIdNum = parseInt(cityIdentifier);
                const city = gameService.getCityByIdOrName(isNaN(cityIdNum) ? cityIdentifier : cityIdNum);

                if (!city) {
                    await interaction.editReply({ content: `城市 "${cityIdentifier}" 未找到。` });
                    return;
                }

                const unionsInCity = gameService.getUnionsByCityId(city.id);

                const cityEmbed = new EmbedBuilder()
                    .setTitle(`在 ${city.name} (ID: ${city.id}) 的聯盟主力列表`)
                    .setColor(0x00AE86)
                    .setTimestamp();

                if (unionsInCity.length === 0) {
                    cityEmbed.setDescription('該城市目前沒有任何聯盟主力。');
                } else {
                    // Sort unions by their overall power first (as before)
                    unionsInCity.sort((a, b) => (b.power || 0) - (a.power || 0));

                    for (const union of unionsInCity.slice(0, 10)) { // Limit to 10 unions for readability
                        let onlineMembersPower = 0;
                        let onlineMemberCount = 0;

                        if (union.officers && union.officers.length > 0) {
                            for (const officer of union.officers) {
                                if (onlineStatusService.isPlayerOnline(officer.user_id)) {
                                    onlineMemberCount++;
                                    // To get individual officer power, we need to fetch their profile
                                    // This is the expensive part.
                                    try {
                                        const profile = await gameService.fetchPlayerProfile(officer.user_id);
                                        if (profile && profile.first_team && profile.first_team.actors) {
                                            let singleOfficerPower = 0;
                                            profile.first_team.actors.forEach(actor => {
                                                singleOfficerPower += actor.team.power;
                                            });
                                            onlineMembersPower += singleOfficerPower;
                                        }
                                    } catch (e) {
                                        console.warn(`[查詢城市] Failed to fetch profile for officer ${officer.user_id} in union ${union.id} to calculate online power:`, e);
                                    }
                                }
                            }
                        }
                        
                        cityEmbed.addFields({
                            name: `${union.name} (ID: ${union.id})`,
                            value: `成員: ${union.member_count}/${union.member_cap}\n` +
                                   `在線成員戰力: **${onlineMembersPower}** (${onlineMemberCount} 人在線)\n` +
                                   `聯盟總戰力: ${union.power || '未知'}`
                        });
                    }

                    if (unionsInCity.length > 10) {
                        cityEmbed.setFooter({ text: `顯示 ${unionsInCity.length} 個聯盟中的前十個（按總戰力排序）。` });
                    }
                }
                await interaction.editReply({ embeds: [cityEmbed] });
                break;
            }
            case '查詢玩家':
                const userId = interaction.options.getInteger('玩家id', true);
                await interaction.deferReply(); // Defer reply as fetching profile can take time

                const profile = await gameService.fetchPlayerProfile(userId);
                if (!profile) {
                    await interaction.editReply({ content: `找不到玩家ID：${userId}。玩家可能不存在或發生錯誤。` });
                    return;
                }

                let totalPower = 0;
                let powerFormula = "";
                const sortedActors = [...profile.first_team.actors].sort((a, b) => a.team.position_in_team - b.team.position_in_team);

                sortedActors.forEach((actor, index) => {
                    totalPower += actor.team.power;
                    powerFormula += `${actor.team.power}${index < sortedActors.length - 1 ? " + " : ""}`;
                });
                if (sortedActors.length === 0) {
                    powerFormula = "0 (沒有幹員)";
                } else {
                    powerFormula += ` = ${totalPower}`;
                }

                const nationName = gameService.nations.find(nation => nation.id === profile.nation.id)?.name || "未知勢力";

                const userEmbed = new EmbedBuilder()
                    .setTitle(`玩家資料: ${profile.nickname} (ID: ${profile.id})`)
                    .setColor(0x0099FF)
                    .addFields(
                        { name: '等級', value: profile.level.toString(), inline: true },
                        { name: '勢力', value: nationName, inline: true },
                        { name: '聯盟', value: profile.union ? `ID: ${profile.union.id}` : 'N/A', inline: true },
                        { name: '戰力', value: powerFormula },
                    )
                    .setTimestamp();

                if (profile.first_team.actors.length > 0) {
                    let actorsField = "";
                    sortedActors.slice(0,5).forEach(actor => {
                        actorsField += `**${actor.actor_prototype.name} (${actor.level})級** - 戰力: ${actor.team.power} (${actor.team.alphabet_in_team}位)\n`;
                    });
                    userEmbed.addFields({name: "幹員列表", value: actorsField || "沒有幹員。"});
                }


                await interaction.editReply({ embeds: [userEmbed] });
                break;
            case '查詢聯盟': {
                const unionIdentifier = interaction.options.getString('聯盟id或名稱', true);
                await interaction.deferReply();
                const unionIdNum = parseInt(unionIdentifier);
                const union = gameService.getUnionByIdOrName(isNaN(unionIdNum) ? unionIdentifier : unionIdNum);

                if (!union) {
                    await interaction.editReply({ content: `聯盟 "${unionIdentifier}" 未找到。` });
                    return;
                }

                let calculatedTotalPower = 0;
                let membersProcessedForPowerCalc = 0;
                let officersField = "";

                if (union.officers.length > 0) {
                    for (const officer of union.officers) {
                        let onlineStatusString = "⚪ 未知"; // Default status
                        const status = onlineStatusService.getPlayerStatus(officer.user_id);
                        if (status === 'Online') onlineStatusString = "🟢 在線";
                        else if (status === 'Offline') onlineStatusString = "🔴 離線";
                        else onlineStatusString = "⚪ 未知";
                        
                        let officerPower = 0;
                        // Fetching profile for each officer to get power can be slow.
                        // Consider a notice if it takes too long, or do it selectively.
                        try {
                            const officerProfile = await gameService.fetchPlayerProfile(officer.user_id);
                            if (officerProfile) {
                                officerProfile.first_team.actors.forEach(actor => {
                                    officerPower += actor.team.power; // Sum actor powers for this officer
                                });
                                calculatedTotalPower += officerPower;
                                membersProcessedForPowerCalc++;
                            }
                        } catch (e) {
                            console.warn(`[Bot] Failed to fetch profile for officer ${officer.user_id} to get power:`, e);
                        }
                        officersField += `${officer.name} (ID: ${officer.user_id}) - ${officer.title || '成員'} - 戰力: ${officerPower || '未知'} - ${onlineStatusString}\n`;
                    }
                } else {
                    officersField = "該聯盟目前沒有已記錄的成員。";
                }

                const unionEmbed = new EmbedBuilder()
                    .setTitle(`聯盟資料: ${union.name} (ID: ${union.id})`)
                    .setColor(0xDAA520)
                    .addFields(
                        { name: '主力所在城市', value: `${union.city.name} (ID: ${union.city.id})`, inline: true },
                        { name: '成員數量', value: `${union.member_count}/${union.member_cap}`, inline: true },
                        { name: '聯盟總戰力 (提供)', value: union.power.toString(), inline: true }, // Server-provided power
                        { name: `計算得出總戰力 (從 ${membersProcessedForPowerCalc} 名已分析成員)`, value: calculatedTotalPower.toString() }
                    )
                    .addFields({ name: "幹部/成員列表", value: officersField.substring(0, 1020) || "無" }) // Limit field length
                    .setTimestamp();
                await interaction.editReply({ embeds: [unionEmbed] });
                break;
            }

            case '勢力布防': {
                const factionName = interaction.options.getString('勢力名稱', true);
                await interaction.deferReply();
                const factionCities = gameService.getCitiesByFaction(factionName);
                factionCities.sort((a, b) => gameService.getUnionsByCityId(b.id).length - gameService.getUnionsByCityId(a.id).length);

                if (factionCities.length === 0) {
                    await interaction.editReply({ content: `勢力 "${factionName}" 未找到或沒有布防資料。` });
                    return;
                }
                
                const factionEmbed = new EmbedBuilder()
                    .setTitle(`勢力 "${factionName}" 的布防資料`)
                    .setColor(0xFF4500)
                    .setTimestamp();

                const fieldsToShow = factionCities.slice(0, 25); // Discord embed field limit

                for (const city of fieldsToShow) {
                    const unionsInCity = gameService.getUnionsByCityId(city.id);
                    const totalPowerInCity = unionsInCity.reduce((sum, u) => sum + (u.power || 0), 0); // Use u.power if available
                    const onlinePlayersInCity = onlineStatusService.getOnlinePlayerCountInCity(city.id); // New call
                    factionEmbed.addFields({
                        name: `${city.name} (ID: ${city.id})`,
                        value: `聯盟數量: ${unionsInCity.length}\n總戰力: ${totalPowerInCity}\n在線玩家: ${onlinePlayersInCity}`,
                        inline: true
                    });
                }
                 if (factionCities.length > 25) {
                    factionEmbed.setFooter({text: `顯示 ${factionCities.length} 個城市中的前 25 個。`});
                }
                await interaction.editReply({ embeds: [factionEmbed] });
                break;
            }
            
            case '設定總覽頻道': {
                const channelOption = interaction.options.getChannel('頻道', true);
                summaryChannelId = channelOption.id;
                if (summaryInterval) {
                    clearInterval(summaryInterval);
                }
                summaryInterval = setInterval(sendOnlineSummary, 60000 * 60); // Send every minute
                await sendOnlineSummary(); // Send one immediately
                await interaction.reply({ content: `玩家在線總覽將會每分鐘發送到 <#${channelOption.id}>。`, ephemeral: true });
                break;
            }
            case '立即總覽': {
                 if (!summaryChannelId) {
                    await interaction.reply({ content: '請先使用 /setsummarychannel (設定總覽頻道) 指令設定總覽頻道。', ephemeral: true });
                    return;
                }
                await interaction.deferReply({ephemeral: true});
                await sendOnlineSummary();
                await interaction.editReply({ content: '在線總覽已發送到指定頻道。' });
                break;
            }
            case '設定記錄頻道':
            {
                const channelOption = interaction.options.getChannel('頻道', true);
                const presenceSuccess = presenceLogger.setLogChannel(channelOption.id);
                const unionSuccess = unionActivityLogger.setLogChannel(channelOption.id);

                if (presenceSuccess && unionSuccess) {
                    await interaction.reply({ content: `所有狀態記錄 (上下線、聯盟變動) 將會發送到 <#${channelOption.id}>。`, ephemeral: true });
                } else {
                    await interaction.reply({ content: `設定記錄頻道時發生部分或全部失敗。請確認機器人權限。`, ephemeral: true });
                }
                break;
            }
            case '設定總覽間隔': {
                const intervalMinutes = interaction.options.getInteger('分鐘', true);
                if (intervalMinutes < 1) {
                    await interaction.reply({ content: '間隔時間必須至少為 1 分鐘。', ephemeral: true });
                    return;
                }
                summaryIntervalDurationMs = intervalMinutes * 60 * 1000;
                if (summaryInterval) {
                    clearInterval(summaryInterval);
                }
                summaryInterval = setInterval(sendOnlineSummary, summaryIntervalDurationMs);
                await sendOnlineSummary(); // Send one immediately
                await interaction.reply({ content: `在線總覽間隔已設定為 ${intervalMinutes} 分鐘。`, ephemeral: true });
                break;
            }
            case '追蹤聯盟': {
                const channelOption = interaction.options.getChannel('頻道', true);
                const factionName = interaction.options.getString('勢力名稱') || null; // Optional, can be null
                const success = unionMovementLogger.setLogChannel(channelOption.id, factionName);
                if (success) {
                    await interaction.reply({ content: `聯盟主力移動紀錄已設定到 <#${channelOption.id}>。${factionName ? `只追蹤 ${factionName} 的聯盟。` : ''}`, ephemeral: true });
                } else {
                    await interaction.reply({ content: `設定聯盟主力移動紀錄頻道失敗。請確認機器人權限。`, ephemeral: true });
                }
                break;
            }
            case '監控聯盟': {
                const subcommand = interaction.options.getSubcommand();
                switch (subcommand) {
                    case '頻道設定': {
                        const channelOption = interaction.options.getChannel('頻道', true);
                        const success = monitoredUnionService.setMonitoringLogChannel(channelOption.id);
                        if (success) {
                            await interaction.reply({ content: `聯盟事件監控紀錄已設定到 <#${channelOption.id}>。`, ephemeral: true });
                        } else {
                            await interaction.reply({ content: `設定聯盟事件監控紀錄頻道失敗。請確認機器人權限。`, ephemeral: true });
                        }
                        break;
                    }
                    case '添加': {
                        const unionId = interaction.options.getInteger('聯盟id', true);
                        const unionData = gameService.getUnionByIdOrName(unionId);
                        if (!unionData) {
                            await interaction.reply({ content: `聯盟 ID ${unionId} 未找到。` });
                            return;
                        }
                        if (monitoredUnionService.addMonitoredUnion(unionId)) {
                            await interaction.reply({ content: `已將聯盟 ID ${unionId} (${unionData.name}) 添加到監控列表。` });
                        } else {
                            await interaction.reply({ content: `聯盟 ID ${unionId} 已在監控列表中。` });
                        }
                        break;
                    }
                    case '移除': {
                        const unionId = interaction.options.getInteger('聯盟id', true);
                        if (monitoredUnionService.removeMonitoredUnion(unionId)) {
                            await interaction.reply({ content: `已從監控列表中移除聯盟 ID ${unionId}。` });
                        } else {
                            await interaction.reply({ content: `聯盟 ID ${unionId} 不在監控列表中。` });
                        }
                        break;
                    }
                    case '列表': {
                        const monitoredUnions = monitoredUnionService.listMonitoredUnions();
                        if (monitoredUnions.length === 0) {
                            await interaction.reply({ content: '目前沒有任何受監控的聯盟。', ephemeral: true });
                        } else {
                            const unionList = monitoredUnions.map(id => {
                                const unionData = gameService.getUnionByIdOrName(id);
                                return unionData ? `${unionData.name} (ID: ${unionData.id})` : `未知聯盟 ID: ${id}`;
                            }).join('\n');
                            await interaction.reply({ content: `受監控的聯盟列表:\n${unionList}` });
                        }
                        break;
                    }
                }
                break;
            }
        }
    } catch (error) {
        console.error("[Bot] Error handling interaction:", error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '運行指令時出現錯誤！', ephemeral: true });
        } else {
            await interaction.reply({ content: '運行指令時出現錯誤！', ephemeral: true });
        }
    }
});

client.login(config.discordBotToken);