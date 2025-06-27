import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { PresenceDiffPayload, PresenceMeta } from './types';
import { OnlineStatusService, OnlinePlayerInfo } from './OnlineStatusService';
import { MonitoredUnionService } from './MonitoredUnionService';

export class PresenceLogger {
    private client: Client;
    private logChannelId: string | null = null;
    private onlineStatusService: OnlineStatusService;
    private monitoredUnionService: MonitoredUnionService;

    constructor(
        client: Client,
        onlineStatusService: OnlineStatusService,
        monitoredUnionService: MonitoredUnionService
    ) {
        this.client = client;
        this.onlineStatusService = onlineStatusService;
        this.monitoredUnionService = monitoredUnionService;
    }

    public setLogChannel(channelId: string): boolean {
        const channel = this.client.channels.cache.get(channelId);
        if (channel && channel.isTextBased()) {
            this.logChannelId = channelId;
            console.log(`[PresenceLogger] Log channel set to: ${channelId}`);
            (channel as TextChannel).send('Player online/offline status logging enabled for this channel.').catch(console.error);
            return true;
        }
        console.warn(`[PresenceLogger] Failed to set log channel: ${channelId} is not a valid text channel or not found.`);
        return false;
    }

    public getLogChannelId(): string | null {
        return this.logChannelId;
    }

    public async handlePresenceDiff(payload: PresenceDiffPayload): Promise<void> {
        const discordLogEvents: Array<{ embed: EmbedBuilder, type: 'join' | 'leave', userId: number }> = [];

        const processEntries = async (
            entries: { [userId: string]: { metas: PresenceMeta[] } },
            type: 'join' | 'leave'
        ) => {
            for (const userIdStr in entries) {
                const userId = parseInt(userIdStr, 10);
                if (isNaN(userId)) continue;

                const userData = entries[userIdStr];
                if (!userData.metas || userData.metas.length === 0) continue;
                const meta = userData.metas[0];
                const eventTimestampSeconds = parseInt(meta.online_at, 10);
                if (isNaN(eventTimestampSeconds)) continue;

                const eventDate = new Date(eventTimestampSeconds * 1000);
                const readableEventTime = eventDate.toLocaleString('zh-TW', { hour12: false });
                
                let playerInfo: OnlinePlayerInfo | null = null;
                let description = "";
                const embed = new EmbedBuilder().setTimestamp(type === 'join' ? eventDate : new Date());

                if (type === 'join') {
                    playerInfo = this.onlineStatusService.recordPlayerJoin(userId, eventTimestampSeconds);
                    if (!playerInfo) continue; // Should not happen if recordPlayerJoin always returns info
                    const unionNameString = playerInfo.unionName ? ` ${playerInfo.unionName} 的` : (playerInfo.nationName === "無聯盟" ? "" : " (無聯盟) 的");
                    description = `✅${unionNameString} **${playerInfo.userName || `玩家ID ${userId}`}** 於 ${readableEventTime} 上線了。 (勢力: ${playerInfo.nationName || '未知'})`;
                    embed.setColor(0x00FF00); // Green
                } else { // type === 'leave'
                    // For leave, get the stored join time from OnlinePlayerInfo
                    const storedPlayerInfo = this.onlineStatusService.getPlayerOnlineInfo(userId); // Get data before recording leave
                    playerInfo = this.onlineStatusService.recordPlayerLeave(userId); // This removes them
                    
                    if (!playerInfo && !storedPlayerInfo) { // If player wasn't tracked or already left
                        console.warn(`[PresenceLogger] Leave event for untracked or already left player ${userId}`);
                        continue;
                    }
                    const infoToUse = playerInfo || storedPlayerInfo!; // Use playerInfo if leave was successful, else fallback to stored for logging

                    const unionNameString = infoToUse.unionName ? ` ${infoToUse.unionName} 的` : (infoToUse.nationName === "無聯盟" ? "" : " (無聯盟) 的");
                    const joinTimeSeconds = infoToUse.joinTimestamp;
                    const currentTimeSeconds = Math.floor(Date.now() / 1000);
                    const durationSeconds = Math.max(0, currentTimeSeconds - joinTimeSeconds);

                    const hours = Math.floor(durationSeconds / 3600);
                    const minutes = Math.floor((durationSeconds % 3600) / 60);
                    const seconds = durationSeconds % 60;
                    const durationString = `${hours > 0 ? `${hours}小時 ` : ''}${minutes > 0 ? `${minutes}分鐘 ` : ''}${seconds}秒`;

                    description = `❌${unionNameString} **${infoToUse.userName || `玩家ID ${userId}`}** 於 ${new Date().toLocaleString('zh-TW', { hour12: false })} 下線了。 (勢力: ${infoToUse.nationName || '未知'})\n📜 上線時長：**${durationString}**`;
                    embed.setColor(0xFF0000); // Red
                }
                
                embed.setDescription(description);
                discordLogEvents.push({ embed, type, userId });

                // If the player is in a monitored union, log the presence event
                if (this.monitoredUnionService.isMonitored(playerInfo?.unionId)) {
                    const unionId = playerInfo?.unionId;
                    if (!unionId) {
                        console.warn(`[PresenceLogger] Player ${userId} is not in a monitored union, skipping presence event.`);
                        continue;
                    }
                    const nationName = playerInfo?.nationName || null;
                    this.monitoredUnionService.dispatchPresenceEvent(
                        unionId,
                        playerInfo?.userName || `玩家ID ${userId}`,
                        nationName,
                        type === 'join' ? 'online' : 'offline',
                        description,
                        eventTimestampSeconds
                    );
                }
            }
        };

        if (payload.joins && Object.keys(payload.joins).length > 0) {
            await processEntries(payload.joins, 'join');
        }
        if (payload.leaves && Object.keys(payload.leaves).length > 0) {
            await processEntries(payload.leaves, 'leave');
        }

        if (!this.logChannelId) {
            return;
        }

        try {
            const channel = await this.client.channels.fetch(this.logChannelId);
            if (channel instanceof TextChannel) {
                for (const logEvent of discordLogEvents) {
                    await channel.send({ embeds: [logEvent.embed] });
                }
            } else {
                console.error(`[PresenceLogger] Log channel ${this.logChannelId} found, but it's not a TextChannel.`);
            }
        } catch (error) {
            console.error(`[PresenceLogger] Failed to fetch or send message to channel ${this.logChannelId}:`, error);
        }
    }
}