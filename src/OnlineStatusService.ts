import { GameService } from './GameService';

export interface OnlinePlayerInfo {
    userId: number;
    joinTimestamp: number; // UNIX timestamp in seconds
    nationName: string | null; // Resolved nation name
    unionId: number | null;
    unionName: string | null;
    userName: string | null; // Player's in-game name
}

export class OnlineStatusService {
    private gameService: GameService;
    private onlinePlayers: Map<number, OnlinePlayerInfo> = new Map(); // Key: userId
    private recentlyOffline: Map<number, number> = new Map();
    private nationOnlineCounts: Map<string, number> = new Map();

    constructor(gameService: GameService) {
        this.gameService = gameService;
        this.initializeNationCounts();
    }

    public initializeNationCounts(): void {
        this.gameService.nations.forEach(nation => { // Assumes gameService.nations is populated
            this.nationOnlineCounts.set(nation.name, 0);
        });
        this.nationOnlineCounts.set("無聯盟", 0); // For players not found in a union or whose union has no nation
    }

    private resolvePlayerAffiliation(userId: number): { nationName: string | null, unionId: number | null, unionName: string | null, userName: string | null } {
        for (const union of this.gameService.unions) { // Assumes gameService.unions is populated
            try {
                const officer = union.officers.find(o => o.user_id === userId);
                if (officer) {
                    const nationEntry = this.gameService.nations.find(n => n.id === union.nation.id);
                    return {
                        nationName: nationEntry ? nationEntry.name : "未知勢力", // Map to a known nation name
                        unionId: union.id,
                        unionName: union.name,
                        userName: officer.name,
                    };
                }
            } catch (error) {
                console.error(`[OnlineStatusService] Error resolving affiliation for user ${userId} in union ${union.id}:`, error);
                console.log(`[OnlineStatusService] Union data:`, union);

                // save union data to a file for debugging
                const fs = require('fs');
                const unionData = JSON.stringify(union, null, 2);
                fs.writeFileSync(`union_${union.id}_debug.json`, unionData, 'utf8');
            }
        }
        // Fallback if player is not found as an officer in any loaded union
        // We might not know their name here unless we fetch their profile, which is too slow for presence events.
        return { nationName: "無聯盟", unionId: null, unionName: null, userName: `玩家ID ${userId}` };
    }

    public recordPlayerJoin(userId: number, joinTimestampSeconds: number): OnlinePlayerInfo {
        // If player is already marked online, update their join time if this is a newer session
        if (this.onlinePlayers.has(userId)) {
            const existingPlayer = this.onlinePlayers.get(userId)!;
            if (joinTimestampSeconds > existingPlayer.joinTimestamp) {
                existingPlayer.joinTimestamp = joinTimestampSeconds; // Freshen join time
            }
            // No change in nation count as they were already counted.
            return existingPlayer;
        }

        const affiliation = this.resolvePlayerAffiliation(userId);
        const playerInfo: OnlinePlayerInfo = {
            userId,
            joinTimestamp: joinTimestampSeconds,
            ...affiliation
        };

        this.onlinePlayers.set(userId, playerInfo);

        const nationToCount = playerInfo.nationName || "無聯盟";
        this.nationOnlineCounts.set(nationToCount, (this.nationOnlineCounts.get(nationToCount) || 0) + 1);
        
        console.log(`[OnlineStatusService] JOIN: ${playerInfo.userName} (Nation: ${nationToCount}). Total for nation: ${this.nationOnlineCounts.get(nationToCount)}`);
        return playerInfo;
    }

    public recordPlayerLeave(userId: number): OnlinePlayerInfo | null {
        const playerInfo = this.onlinePlayers.get(userId);
        if (playerInfo) {
            this.onlinePlayers.delete(userId);
            this.recentlyOffline.set(userId, Date.now());
            const nationToCount = playerInfo.nationName || "無聯盟";
            this.nationOnlineCounts.set(nationToCount, Math.max(0, (this.nationOnlineCounts.get(nationToCount) || 1) - 1));
            console.log(`[OnlineStatusService] LEAVE: ${playerInfo.userName} (Nation: ${nationToCount}). Total for nation: ${this.nationOnlineCounts.get(nationToCount)}`);
            return playerInfo;
        }
        return null;
    }

    public isPlayerOnline(userId: number): boolean {
        return this.onlinePlayers.has(userId);
    }

    public getPlayerOnlineInfo(userId: number): OnlinePlayerInfo | undefined {
        return this.onlinePlayers.get(userId);
    }

    public getNationOnlineCounts(): ReadonlyMap<string, number> {
        return new Map(this.nationOnlineCounts); // Return a copy
    }

    public getTotalOfflineCount(): number {
        return this.recentlyOffline.size;
    }
    
    public getOnlinePlayerCountInUnion(unionId: number): number {
        let count = 0;
        const targetUnion = this.gameService.unions.find(u => u.id === unionId);
        if (targetUnion) {
            for (const officer of targetUnion.officers) {
                if (this.isPlayerOnline(officer.user_id)) {
                    count++;
                }
            }
        }
        return count;
    }

    public getOnlinePlayerCountInCity(cityId: number): number {
        let cityOnlineCount = 0;
        const unionsInCity = this.gameService.getUnionsByCityId(cityId);
        for (const union of unionsInCity) {
            // Summing up online players from officers of each union in the city
            for (const officer of union.officers) {
                if (this.isPlayerOnline(officer.user_id)) {
                    cityOnlineCount++;
                }
            }
        }
        return cityOnlineCount;
    }

    public getPlayerStatus(userId: number): 'Online' | 'Offline' | 'Unknown' {
        if (this.onlinePlayers.has(userId)) return 'Online';
        if (this.recentlyOffline.has(userId)) {
            return 'Offline';
        }
        return 'Unknown';
    }
}