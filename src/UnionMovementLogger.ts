import { Client, TextChannel, EmbedBuilder, ColorResolvable } from 'discord.js';
import { UnionMovementLogInfo, UnionMovementListener } from './types'; // Adjust path if UnionMovementListener is elsewhere
import { GameService } from './GameService'; // To potentially get more details if needed
import { MonitoredUnionService } from './MonitoredUnionService';

export class UnionMovementLogger implements UnionMovementListener {
    private client: Client;
    private gameService: GameService; // Useful for fetching full city/union names if only IDs are passed
    private logChannelId: string | null = null;
    private trackedFactionName: string | null = null; // For optional faction filtering
    private monitoredUnionService: MonitoredUnionService;

    private readonly MOVE_COLOR: ColorResolvable = '#F1C40F'; // Yellow

    constructor(client: Client, gameService: GameService, monitoredUnionService: MonitoredUnionService) {
        this.client = client;
        this.gameService = gameService;
        this.monitoredUnionService = monitoredUnionService;
    }

    public setLogChannel(channelId: string, factionName?: string | null): boolean {
        const channel = this.client.channels.cache.get(channelId);
        if (channel && channel.isTextBased()) {
            this.logChannelId = channelId;
            this.trackedFactionName = factionName?.trim() || null; // Store null if empty or undefined
            const factionMsg = this.trackedFactionName ? ` for faction ${this.trackedFactionName}` : ' for all factions';
            console.log(`[UnionMovementLogger] Log channel for movements set to: ${channelId}${factionMsg}`);
            (channel as TextChannel).send(`🚚 Union movement logging enabled${factionMsg}.`).catch(console.error);
            return true;
        }
        console.warn(`[UnionMovementLogger] Failed to set movement log channel: ${channelId} invalid.`);
        return false;
    }

    private async sendMessage(embed: EmbedBuilder): Promise<void> {
        if (!this.logChannelId) return;
        try {
            const channel = await this.client.channels.fetch(this.logChannelId);
            if (channel instanceof TextChannel) {
                await channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error(`[UnionMovementLogger] Failed to send message to ${this.logChannelId}:`, error);
        }
    }

    onUnionMoveInitiated(data: UnionMovementLogInfo): void {
        const arrivalDate = new Date(data.targetCity.at);
        const now = new Date();
        const diffMs = arrivalDate.getTime() - now.getTime();
        let arrivalCountdown = "已過期/即將到達";

        if (diffMs > 0) {
            const totalMinutes = Math.floor(diffMs / (1000 * 60));
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            arrivalCountdown = `約 ${hours > 0 ? `${hours}小時 ` : ''}${minutes}分鐘後`;
        }

        const currentCityDisplay = data.currentCityName ? `${data.currentCityName} (ID: ${data.currentCityId})` : '未知城市';
        const targetCityDisplay = `${data.targetCity.name} (ID: ${data.targetCity.id})`;

        const embed = new EmbedBuilder()
            .setColor(this.MOVE_COLOR)
            .setTitle('🚚 聯盟主力移動開始')
            .setDescription(`聯盟 **${data.unionName}** (ID: \`${data.unionId}\`)\n勢力: **${data.nationName || '未知'}**`)
            .addFields(
                { name: '從', value: currentCityDisplay, inline: true },
                { name: '至', value: targetCityDisplay, inline: true },
                { name: '預計到達時間', value: `${arrivalDate.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} (${arrivalCountdown})` }
            )
            .setTimestamp();
        console.log("[UnionMovementLogger] Movement initiated for union:", data.unionId, "from", currentCityDisplay, "to", targetCityDisplay);
        this.sendMessage(embed);

        // Log to monitored unions if applicable
        if (this.monitoredUnionService.isMonitored(data.unionId)) {
            console.log("[UnionMovementLogger] Logging movement for monitored union:", data.unionId);
            const arrivalDate = new Date(data.targetCity.at);
            const now = new Date();
            const diffMs = arrivalDate.getTime() - now.getTime();
            let arrivalCountdown = "已過期/即將到達";
            if (diffMs > 0) {
                const totalMinutes = Math.floor(diffMs / (1000 * 60));
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                arrivalCountdown = `約 ${hours > 0 ? `${hours}小時 ` : ''}${minutes}分鐘後`;
            }
            const currentCityDisplay = data.currentCityName ? `${data.currentCityName} (ID: ${data.currentCityId})` : '未知城市';
            const targetCityDisplay = `${data.targetCity.name} (ID: ${data.targetCity.id})`;

            const monitoredDetails = `從 ${currentCityDisplay} 前往 ${targetCityDisplay}\n預計到達時間: ${arrivalDate.toLocaleString('zh-TW', { hour12: false })} (${arrivalCountdown})`;
            this.monitoredUnionService.dispatchMovementEvent(
                data.unionId,
                data.unionName,
                monitoredDetails,
                new Date()
            );
        }
    }
}