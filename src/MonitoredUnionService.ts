import fs from 'fs';
import path from 'path';
import { Client, TextChannel, EmbedBuilder, ColorResolvable } from 'discord.js';
const MONITORED_UNIONS_STATE_FILE_PATH = path.join(__dirname, 'monitored_unions_state.json');

interface MonitoredUnionState {
    logChannelId: string | null;
    unionIds: number[];
}

export class MonitoredUnionService {
    private client: Client;
    private monitoredUnions: Set<number> = new Set();
    private logChannelId: string | null = null;

    // Colors for different event types for monitored unions
    private readonly PRESENCE_COLOR: ColorResolvable = '#2ECC71'; // Greenish for presence
    private readonly ACTIVITY_COLOR: ColorResolvable = '#E74C3C'; // Reddish for activity
    private readonly MOVEMENT_COLOR_MONITORED: ColorResolvable = '#F39C12'; // Orange for movement

    constructor(client: Client) {
        this.client = client;
        this.loadState();
    }

    private loadState(): void {
        try {
            if (fs.existsSync(MONITORED_UNIONS_STATE_FILE_PATH)) {
                const rawData = fs.readFileSync(MONITORED_UNIONS_STATE_FILE_PATH, 'utf-8');
                const state: MonitoredUnionState = JSON.parse(rawData);
                this.logChannelId = state.logChannelId || null;
                this.monitoredUnions = new Set(state.unionIds || []);
                console.log(`[MonitoredUnionService] State loaded: ${this.monitoredUnions.size} unions monitored, channel: ${this.logChannelId}`);
            } else {
                console.log("[MonitoredUnionService] No existing state file found. Initializing fresh.");
            }
        } catch (error) {
            console.error("[MonitoredUnionService] Error loading state:", error);
        }
    }

    public saveState(): void {
        try {
            const state: MonitoredUnionState = {
                logChannelId: this.logChannelId,
                unionIds: Array.from(this.monitoredUnions),
            };
            fs.writeFileSync(MONITORED_UNIONS_STATE_FILE_PATH, JSON.stringify(state, null, 2));
            console.log("[MonitoredUnionService] State saved.");
        } catch (error) {
            console.error("[MonitoredUnionService] Error saving state:", error);
        }
    }

    public setMonitoringLogChannel(channelId: string): boolean {
        const channel = this.client.channels.cache.get(channelId);
        if (channel && channel.isTextBased()) {
            this.logChannelId = channelId;
            this.saveState(); // Save change
            console.log(`[MonitoredUnionService] Monitoring log channel set to: ${channelId}`);
            (channel as TextChannel).send(`📢 此頻道將用於接收已監控聯盟的所有活動記錄。`).catch(console.error);
            return true;
        }
        return false;
    }

    public addMonitoredUnion(unionId: number): boolean {
        if (this.monitoredUnions.has(unionId)) return false; // Already monitored
        this.monitoredUnions.add(unionId);
        this.saveState();
        console.log(`[MonitoredUnionService] Added union ID ${unionId} to monitoring list.`);
        return true;
    }

    public removeMonitoredUnion(unionId: number): boolean {
        if (!this.monitoredUnions.has(unionId)) return false; // Not monitored
        this.monitoredUnions.delete(unionId);
        this.saveState();
        console.log(`[MonitoredUnionService] Removed union ID ${unionId} from monitoring list.`);
        return true;
    }

    public listMonitoredUnions(): number[] {
        return Array.from(this.monitoredUnions);
    }

    public isMonitored(unionId: number | null | undefined): boolean {
        if (unionId === null || unionId === undefined) return false;
        return this.monitoredUnions.has(unionId);
    }

    // Generic method to log an event for a monitored union
    public async logMonitoredEvent(unionId: number, eventTitle: string, eventDetails: string, eventColor: ColorResolvable, originalTimestamp?: Date | number) {
        if (!this.logChannelId || !this.isMonitored(unionId)) {
            return;
        }

        try {
            const channel = await this.client.channels.fetch(this.logChannelId);
            if (channel instanceof TextChannel) {
                const embed = new EmbedBuilder()
                    .setTitle(`🛡️ 受監控聯盟事件: ${eventTitle}`)
                    .setDescription(eventDetails)
                    .setColor(eventColor)
                    .setTimestamp()
                    .setFooter({text: `聯盟 ID: ${unionId}`});
                await channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error(`[MonitoredUnionService] Failed to send monitored event log for union ${unionId}:`, error);
        }
    }

    // Specific helper methods to be called by other loggers
    public dispatchPresenceEvent(unionId: number, userName: string, nationName: string | null, status: 'online' | 'offline', details: string, timestamp: number) {
        if (this.isMonitored(unionId)) {
            const title = status === 'online' ? '成員上線' : '成員下線';
            const fullDetails = `玩家 **${userName}** (${nationName ? `勢力: ${nationName}, ` : ''}聯盟 ID: ${unionId})\n${details}`;
            this.logMonitoredEvent(unionId, title, fullDetails, this.PRESENCE_COLOR, timestamp);
        }
    }
    public dispatchActivityEvent(unionId: number, unionName: string, activityType: '加入' | '離開' | '職位變動', details: string, timestamp?: Date | number) {
         if (this.isMonitored(unionId)) {
            const title = `聯盟 ${unionName} - ${activityType}`;
            this.logMonitoredEvent(unionId, title, details, this.ACTIVITY_COLOR, timestamp);
        }
    }
    public dispatchMovementEvent(unionId: number, unionName: string, details: string, timestamp?: Date | number) {
        if (this.isMonitored(unionId)) {
            const title = `聯盟 ${unionName} - 主力移動`;
            this.logMonitoredEvent(unionId, title, details, this.MOVEMENT_COLOR_MONITORED, timestamp);
        }
    }
}