import { Client, TextChannel, EmbedBuilder, ColorResolvable } from 'discord.js';
import { UnionActivityListener, UnionJoinInfo, UnionLeaveInfo, UnionRankChangeInfo } from './types'; // Adjust path if interface is elsewhere
import { MonitoredUnionService } from './MonitoredUnionService';

export class UnionActivityLogger implements UnionActivityListener {
    private client: Client;
    private logChannelId: string | null = null;
    private monitoredUnionService: MonitoredUnionService;

    // Define colors for different events
    private readonly JOIN_COLOR: ColorResolvable = '#3498DB';       // Blue
    private readonly LEAVE_COLOR: ColorResolvable = '#E67E22';      // Orange
    private readonly RANK_CHANGE_COLOR: ColorResolvable = '#9B59B6'; // Purple

    constructor(client: Client, monitoredUnionService: MonitoredUnionService) {
        this.client = client;
        this.monitoredUnionService = monitoredUnionService;
    }

    public setLogChannel(channelId: string): boolean {
        const channel = this.client.channels.cache.get(channelId);
        if (channel && channel.isTextBased()) {
            this.logChannelId = channelId;
            console.log(`[UnionActivityLogger] Log channel set to: ${channelId}`);
            // Optional: Send a confirmation message to the channel
            // (channel as TextChannel).send('Union activity logging has been configured for this channel.').catch(console.error);
            return true;
        }
        console.warn(`[UnionActivityLogger] Failed to set log channel: ${channelId} is not a valid text channel or not found.`);
        return false;
    }

    private async sendMessage(embed: EmbedBuilder): Promise<void> {
        if (!this.logChannelId) {
            // console.warn("[UnionActivityLogger] Log channel ID not set. Skipping message.");
            return;
        }
        try {
            const channel = await this.client.channels.fetch(this.logChannelId);
            if (channel instanceof TextChannel) {
                await channel.send({ embeds: [embed] });
            } else {
                console.error(`[UnionActivityLogger] Log channel ${this.logChannelId} found, but it's not a TextChannel.`);
            }
        } catch (error) {
            console.error(`[UnionActivityLogger] Failed to fetch or send message to channel ${this.logChannelId}:`, error);
        }
    }

    onUnionJoin(data: UnionJoinInfo): void {
        const embed = new EmbedBuilder()
            .setColor(this.JOIN_COLOR)
            .setTitle('聯盟成員加入')
            .setDescription(`✅ **${data.userName}** (ID: \`${data.userId}\`) 加入了聯盟 **${data.unionName}** (ID: \`${data.unionId}\`).`)
            .addFields({ name: '職位', value: data.newTitle || '成員' })
            .setTimestamp();
        this.sendMessage(embed);

        // Log to monitored unions if applicable
        if (this.monitoredUnionService.isMonitored(data.unionId)) {
            const monitoredDetails = `玩家 **${data.userName}** (ID: \`${data.userId}\`) 加入，新職位：${data.newTitle || '成員'}`;
            this.monitoredUnionService.dispatchActivityEvent(
                data.unionId,
                data.unionName,
                '加入',
                monitoredDetails,
                new Date()
            )
        }
    }

    onUnionLeave(data: UnionLeaveInfo): void {
        const embed = new EmbedBuilder()
            .setColor(this.LEAVE_COLOR)
            .setTitle('聯盟成員離開')
            .setDescription(`❌ **${data.userName}** (ID: \`${data.userId}\`) 離開了聯盟 **${data.unionName}** (ID: \`${data.unionId}\`).`)
            .addFields({ name: '原職位', value: data.oldTitle || '成員' })
            .setTimestamp();
        this.sendMessage(embed);

        // Log to monitored unions if applicable
        if (this.monitoredUnionService.isMonitored(data.unionId)) {
            const monitoredDetails = `玩家 **${data.userName}** (ID: \`${data.userId}\`) 離開，原職位：${data.oldTitle || '成員'}`;
            this.monitoredUnionService.dispatchActivityEvent(
                data.unionId,
                data.unionName,
                '離開',
                monitoredDetails,
                new Date()
            )
        }
    }

    onUnionRankChange(data: UnionRankChangeInfo): void {
        const embed = new EmbedBuilder()
            .setColor(this.RANK_CHANGE_COLOR)
            .setTitle('聯盟成員職位變動')
            .setDescription(`🔄 **${data.userName}** (ID: \`${data.userId}\`) 在聯盟 **${data.unionName}** (ID: \`${data.unionId}\`) 的職位發生了變化。`)
            .addFields(
                { name: '原職位', value: data.oldTitle || '成員', inline: true },
                { name: '新職位', value: data.newTitle || '成員', inline: true }
            )
            .setTimestamp();
        this.sendMessage(embed);

        // Log to monitored unions if applicable
        if (this.monitoredUnionService.isMonitored(data.unionId)) {
            const monitoredDetails = `玩家 **${data.userName}** (ID: \`${data.userId}\`) 職位變更，原職位：${data.oldTitle || '成員'} -> 新職位：${data.newTitle || '成員'}`;
            this.monitoredUnionService.dispatchActivityEvent(
                data.unionId,
                data.unionName,
                '職位變動',
                monitoredDetails,
                new Date()
            )
        }
    }
}