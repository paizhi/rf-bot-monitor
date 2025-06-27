import axios from 'axios';
import FormData from 'form-data';
import { Socket, Channel } from 'phoenix';
import { config } from './config';
import {
    LoginResponseData,
    City,
    Union,
    Nation,
    Officer,
    PlayerProfileData,
    PlayerChannelPayload,
    AllPlayersChannelPayload,
    LocaleChannelPayload,
    CitiesResponse,
    UnionsResponse,
    PresenceDiffPayload,
    UnionMovementListener
} from './types';

import WebSocket from 'ws';

import { UnionActivityListener } from './types'

export class GameService {
    private token: string | null = null;
    private userId: number | null = null;
    private wsUrl: string | null = null;
    private socket: Socket | null = null;
    private playerChannel: Channel | null = null;
    private allPlayersChannel: Channel | null = null;
    private localeChannels: Map<string, Channel | null> = new Map();
    private readonly localesToJoin: string[] = ['zh_TW', 'zh_CN', 'jp', 'en'];
    private presenceDiffHandler: ((payload: PresenceDiffPayload) => void) | null = null;
    private unionActivityListener: UnionActivityListener | null = null;
    private unionMovementListener: UnionMovementListener | null = null;

    public cities: City[] = [];
    public unions: Union[] = [];

    public nations: Nation[] = [
        { id: 1, name: "紅軍" },
        { id: 2, name: "台灣" },
        { id: 3, name: "香港" },
        { id: 4, name: "藏國" },
        { id: 5, name: "維吾爾" },
        { id: 6, name: "哈薩克" },
        { id: 7, name: "滿洲" },
        { id: 8, name: "蒙古" },
        { id: 10, name: "反賊聯盟" }
    ];

    private playerChannelName: string = "";
    private readonly allPlayersChannelName: string = "all_players";
    private localeChannelName: string = "";


    constructor() {
        // this.localeChannelName = `locale:${config.locale}`;
    }

    public async login(): Promise<void> {
        const url = `https://${config.apiHost}/api/users/log_in`;
        const payload = new FormData();
        payload.append("user[email]", config.gameEmail);
        payload.append("user[password]", config.gamePassword);
        payload.append("locale", config.locale);
        payload.append("key", config.key);
        payload.append("app_version", config.appVersion);

        const headers = {
            Accept: "application/json, text/plain, */*",
            "x-requested-with": "tw.twhawk.reversedfront",
            ...payload.getHeaders(),
        };

        console.info(`[GameService] Attempting login with email ${config.gameEmail}...`);
        try {
            const response = await axios.post<LoginResponseData>(url, payload, { headers });
            const loginData = response.data;

            if (!loginData?.data?.user_token || !loginData?.data?.user_id) {
                throw new Error("Login response missing token or user_id.");
            }

            this.token = loginData.data.user_token;
            this.userId = loginData.data.user_id;
            this.wsUrl = `wss://${config.apiHost}/socket/websocket?userToken=${this.token}&locale=${config.locale}&vsn=2.0.0`;
            this.playerChannelName = `player:${this.userId}`;

            console.info(`[GameService] Login successful. Player ID: ${this.userId}`);
            await this.connectWebSocket();
        } catch (error: any) {
            const errorMessage = error.response?.data?.error ||
                error.response?.data?.message ||
                error.message ||
                "Unknown login error";
            console.error(`[GameService] Login failed: ${errorMessage}`);
            throw new Error(`Login failed: ${errorMessage}`);
        }
    }

    private async connectWebSocket(): Promise<void> {
        if (!this.wsUrl || !this.token || !this.userId) {
            throw new Error("Cannot connect WebSocket without login data.");
        }

        this.socket = new Socket(this.wsUrl, {
            transport: WebSocket,
            logger: (kind, msg, data) => { console.log(`[Socket] ${kind}: ${msg}`, data); }
        });

        return new Promise((resolve, reject) => {
            this.socket!.onOpen(() => {
                console.info("[GameService] WebSocket connected.");
                this.joinChannels().then(resolve).catch(reject);
            });
            this.socket!.onError((error) => {
                console.error("[GameService] WebSocket connection error:", error);
                reject(error);
            });
            this.socket!.onClose(() => {
                console.info("[GameService] WebSocket disconnected.");
                // Implement reconnection logic if needed
            });
            this.socket!.connect();
        });
    }

    private async joinChannels(): Promise<void> {
        if (!this.socket || !this.userId) throw new Error("Socket not initialized or user ID missing.");

        try {
            // Player Channel
            const playerPayload: PlayerChannelPayload = { fake: "ChannelPlayer", fake2: 1 };
            this.playerChannel = this.socket.channel(this.playerChannelName, playerPayload);
            await this.joinChannel(this.playerChannel, "Player Channel");

            // All Players Channel
            const allPlayersPayload: AllPlayersChannelPayload = { fake: "ChannelAllPlayer" };
            this.allPlayersChannel = this.socket.channel(this.allPlayersChannelName, allPlayersPayload);
            await this.joinChannel(this.allPlayersChannel, "All Players Channel");

            // Locale Channels
            for (const locale of this.localesToJoin) {
                const localeChannelName = `locale:${locale}`;
                const localePayload: LocaleChannelPayload = { fake: "locale" }; // Payload might need locale specifics if server expects
                const channel = this.socket.channel(localeChannelName, localePayload);
                this.localeChannels.set(locale, channel);
                await this.joinChannel(channel, `Locale Presence Channel (${locale})`);
            }

            console.info("[GameService] All channels joined.");
            this.listenForUpdates();
            await this.fetchInitialData();

        } catch (error) {
            console.error("[GameService] Failed to join one or more channels:", error);
            throw error;
        }
    }

    private joinChannel(channel: Channel, channelName: string): Promise<any> {
        return new Promise((resolve, reject) => {
            channel.join()
                .receive("ok", resp => {
                    console.info(`[GameService] Joined ${channelName} (${channel.topic}) successfully.`);
                    resolve(resp);
                })
                .receive("error", resp => {
                    console.error(`[GameService] Failed to join ${channelName} (${channel.topic}):`, resp);
                    reject(new Error(`Join ${channelName} failed: ${JSON.stringify(resp)}`));
                })
                .receive("timeout", () => {
                    console.error(`[GameService] Timeout joining ${channelName} (${channel.topic})`);
                    reject(new Error(`Timeout joining ${channelName}`));
                });
        });
    }

    private async fetchInitialData(): Promise<void> {
        if (!this.playerChannel) throw new Error("Player channel not available.");
        console.info("[GameService] Fetching initial cities and unions data...");

        try {
            const citiesPromise = new Promise<City[]>((resolve, reject) => {
                this.playerChannel!.push("cities", { body: "" })
                    .receive("ok", (response: CitiesResponse) => {
                        console.info("[GameService] Received cities data.");
                        this.cities = response.cities || [];
                        resolve(this.cities);
                    })
                    .receive("error", (reason: any) => {
                        console.error("[GameService] Error fetching cities:", reason);
                        reject(reason);
                    })
                    .receive("timeout", () => {
                         console.error("[GameService] Timeout fetching cities.");
                         reject("timeout");
                    });
            });

            const unionsPromise = new Promise<Union[]>((resolve, reject) => {
                this.playerChannel!.push("unions", { body: "" })
                    .receive("ok", (response: UnionsResponse) => {
                        console.info("[GameService] Received unions data.");
                        this.unions = response.unions || [];
                        resolve(this.unions);
                    })
                    .receive("error", (reason: any) => {
                        console.error("[GameService] Error fetching unions:", reason);
                        reject(reason);
                    })
                     .receive("timeout", () => {
                         console.error("[GameService] Timeout fetching unions.");
                         reject("timeout");
                    });
            });

            await Promise.all([citiesPromise, unionsPromise]);
            console.info("[GameService] Initial data fetched successfully.");
        } catch (error) {
            console.error("[GameService] Failed to fetch initial data:", error);
        }
    }

    private listenForUpdates(): void {
        // Existing 'update_data' for playerChannel
        if (this.playerChannel) {
            this.playerChannel.on("update_data", (payload: any) => {
                console.log(`[GameService] Received 'update_data' on ${this.playerChannel!.topic}:`, payload);
                 if (payload.cities && Array.isArray(payload.cities)) {
                    this.handleCityUpdates(payload.cities);
                }
                // Note: Officer/Union updates are specified to come on localeChannel by user.
                // If they can also come here, adjust logic.
            });
        }

        // Listener for allPlayersChannel ('delete_data' and 'update_data')
        if (this.allPlayersChannel) {
            this.allPlayersChannel.on("delete_data", (payload: any) => {
                if (payload.union_applicants && Array.isArray(payload.union_applicants)) {
                    payload.union_applicants.forEach((applicant: { id: number }) => {
                        console.log(`[GameService] Union applicant (ID: ${applicant.id}) was processed (removed from applicant list).`);
                        // This event is a precursor and doesn't directly trigger a user-facing log message here.
                        // The join will be detected from the 'officers' update.
                    });
                }
            });
            this.allPlayersChannel.on("update_data", async (payload: any) => {
                // Handle any 'update_data' relevant to all_players if necessary
                console.log(`[GameService] Received 'update_data' on ${this.allPlayersChannel!.topic}:`, payload);
                if (payload.unions && Array.isArray(payload.unions)) {
                    await this.handleUnionUpdates(payload.unions);
                }
                if (payload.cities && Array.isArray(payload.cities)) {
                    this.handleCityUpdates(payload.cities);
                }
            });
        }
        
        // Listeners for localeChannel ('presence_diff' and 'update_data' for unions)
        this.localeChannels.forEach((channel, locale) => {
            if (channel) {
                channel.on("presence_diff", (payload: PresenceDiffPayload) => {
                    if (this.presenceDiffHandler) {
                        this.presenceDiffHandler(payload); // This handler is locale-agnostic now
                    } else {
                        console.warn(`[GameService] presence_diff event received on ${locale}, but no presenceDiffHandler is set.`);
                    }
                });
                console.info(`[GameService] Listening for 'presence_diff' on ${channel.topic}`);
            } else {
                console.warn(`[GameService] Locale channel for ${locale} is not available.`);
            }
        });

        // only log "update_data" for localeChannel zh_TW
        const zhTWChannel = this.localeChannels.get('zh_TW');
        if (zhTWChannel) {
            zhTWChannel.on("update_data", async (payload: any) => {
                console.log(`[GameService] Received 'update_data' on ${zhTWChannel.topic} (Locale: zh_TW):`, payload);
                if (payload.unions && Array.isArray(payload.unions)) {
                    await this.handleUnionUpdates(payload.unions);
                }
                if (payload.cities && Array.isArray(payload.cities)) {
                    this.handleCityUpdates(payload.cities);
                }
            });
        } else {
            console.warn("[GameService] Locale channel for zh_TW is not available.");
        }
    }

    private handleCityUpdates(updatedCities: Partial<City>[]): void {
        updatedCities.forEach(updatedCity => {
            if (typeof updatedCity.id === 'undefined') return;
            const index = this.cities.findIndex(city => city.id === updatedCity.id);
            if (index !== -1) {
                this.cities[index] = { ...this.cities[index], ...updatedCity };
                console.log(`[GameService] Updated city ID: ${updatedCity.id}`);
            } else {
                // If city not found, you might want to add it or log a warning
                // this.cities.push(updatedCity as City); // If it's a new city
                console.warn(`[GameService] Received update for unknown city ID: ${updatedCity.id}`);
            }
        });
    }

    private async handleUnionUpdates(updatedUnionsData: Partial<Union>[]): Promise<void> { // Made async
        let needsFullRefetch = false;
        for (const partialData of updatedUnionsData) {
            if (typeof partialData.id === 'undefined') continue;
            const existingUnion = this.unions.find(u => u.id === partialData.id);
            if (!existingUnion) {
                // If it's a new ID, and the data is sparse (e.g., missing name, city, nation, officers which are key for a functional Union object)
                // then it's likely the "new union created" event.
                if (!partialData.name || !partialData.city || !partialData.nation || !partialData.officers) {
                    console.log(`[GameService] New or sparsely-defined union ID ${partialData.id} detected. Payload:`, JSON.stringify(partialData));
                    needsFullRefetch = true;
                    break; 
                }
            }
        }

        if (needsFullRefetch) {
            await this.forceFetchAllUnions();
            // After a full re-fetch, this.unions is completely new.
            // The original updatedUnionsData batch is effectively superseded by the full fetch.
            // The diffing logic within forceFetchAllUnions handles changes discovered during the refresh.
            return;
        }

        // If no re-fetch was triggered, process the updates normally (careful merge and diff).
        for (const partialUnionData of updatedUnionsData) {
            if (typeof partialUnionData.id === 'undefined') {
                console.warn("[GameService] Processing partial update: Union update without ID (should have been caught).", partialUnionData);
                continue;
            }
            
            const unionIndex = this.unions.findIndex(u => u.id === partialUnionData.id);
            if (unionIndex === -1) {
                // This should ideally not happen if needsFullRefetch handled new IDs,
                // but as a fallback, log and skip if still not found.
                console.warn(`[GameService] Union ID ${partialUnionData.id} not found in cache for partial update. Payload:`, JSON.stringify(partialUnionData));
                continue;
            }
            
            let currentUnionInStore = this.unions[unionIndex];
            let oldOfficersForDiff: Officer[] = [];

            // Snapshot old officers only if the current partial update *contains* an 'officers' field
            // AND a listener is present, because only then will a diff occur for this specific partial update.
            if (partialUnionData.hasOwnProperty('officers') && this.unionActivityListener) {
                oldOfficersForDiff = (currentUnionInStore.officers && Array.isArray(currentUnionInStore.officers))
                    ? JSON.parse(JSON.stringify(currentUnionInStore.officers))
                    : [];
            }

            // Safely merge the partial update
            let updatedUnionObject: Union = { ...currentUnionInStore };
            for (const key in partialUnionData) {
                if (partialUnionData.hasOwnProperty(key)) {
                    (updatedUnionObject as any)[key] = (partialUnionData as any)[key];
                }
            }
            
            // CRITICAL: Ensure 'officers' is always an array.
            if (partialUnionData.hasOwnProperty('officers')) {
                updatedUnionObject.officers = partialUnionData.officers || [];
            } else if (!Array.isArray(updatedUnionObject.officers)) {
                updatedUnionObject.officers = [];
            }

            if (partialUnionData.hasOwnProperty('move_to_city')) {
                updatedUnionObject.move_to_city = partialUnionData.move_to_city !== undefined ? partialUnionData.move_to_city : null;
            }

            if (this.unionMovementListener && partialUnionData.hasOwnProperty('move_to_city')) {
                const newMoveTargetInPayload = updatedUnionObject.move_to_city; // This is UnionMoveToCityInfo | null from the payload
                const oldMoveTargetInCache = currentUnionInStore.move_to_city;

                if (newMoveTargetInPayload) {
                    // A new move is being set or an existing one is updated
                    if (!oldMoveTargetInCache || 
                        oldMoveTargetInCache.id !== newMoveTargetInPayload.id || 
                        oldMoveTargetInCache.at !== newMoveTargetInPayload.at) {
                        
                        const nation = this.nations.find(n => n.id === currentUnionInStore.nation.id); // Use pre-move nation info
                        this.unionMovementListener.onUnionMoveInitiated({
                            unionId: currentUnionInStore.id,
                            unionName: currentUnionInStore.name,
                            currentCityId: currentUnionInStore.city.id, // City before move starts/target changes
                            currentCityName: currentUnionInStore.city.name,
                            targetCity: newMoveTargetInPayload, // The new target from payload
                            nationName: nation ? nation.name : "未知勢力"
                        });
                    }
                } else if (oldMoveTargetInCache && !newMoveTargetInPayload) {
                    // move_to_city in payload is null, but it was previously set in our cache.
                    // This signifies a move completion (actual city changed in this or related payload) or cancellation.
                    console.log(`[GameService] Union ${currentUnionInStore.id} movement to ${oldMoveTargetInCache.name} appears completed/cancelled (move_to_city became null).`);
                }
            }

            this.unions[unionIndex] = updatedUnionObject;
            // console.log(`[GameService] Partially updated union ID: ${updatedUnionObject.id}. Officers count: ${updatedUnionObject.officers.length}`);

            // Officer Change Detection Logic - only if 'officers' was part of this specific partial update
            if (partialUnionData.hasOwnProperty('officers') && this.unionActivityListener) {
                const newOfficersFromPayload: Officer[] = updatedUnionObject.officers; // Guaranteed to be an array

                const oldOfficerMap = new Map(oldOfficersForDiff.map(o => [o.user_id, o]));
                const newOfficerMap = new Map(newOfficersFromPayload.map(o => [o.user_id, o]));

                for (const oldO of oldOfficersForDiff) {
                    const newO_match = newOfficerMap.get(oldO.user_id);
                    if (!newO_match) {
                        this.unionActivityListener.onUnionLeave({ userId: oldO.user_id, userName: oldO.name, unionId: updatedUnionObject.id, unionName: updatedUnionObject.name, oldTitle: oldO.title });
                    } else if (newO_match.title !== oldO.title || newO_match.authority !== oldO.authority) {
                        this.unionActivityListener.onUnionRankChange({ userId: newO_match.user_id, userName: newO_match.name, unionId: updatedUnionObject.id, unionName: updatedUnionObject.name, oldTitle: oldO.title, newTitle: newO_match.title });
                    }
                }
                for (const newO of newOfficersFromPayload) {
                    if (!oldOfficerMap.has(newO.user_id)) {
                        this.unionActivityListener.onUnionJoin({ userId: newO.user_id, userName: newO.name, unionId: updatedUnionObject.id, unionName: updatedUnionObject.name, newTitle: newO.title });
                    }
                }
            }
        }
    }

    public async forceFetchAllUnions(): Promise<void> {
        if (!this.playerChannel) {
            console.error("[GameService] Player channel not available for re-fetching unions.");
            return;
        }
        console.info("[GameService] Force re-fetching all unions data due to new/sparse union update...");
        
        // Create a deep snapshot of the current unions before they are replaced
        const oldUnionsSnapshot: Union[] = JSON.parse(JSON.stringify(this.unions || []));
        const oldUnionsMap = new Map(oldUnionsSnapshot.map(u => [u.id, u]));

        try {
            const response: UnionsResponse = await new Promise((resolve, reject) => {
                this.playerChannel!.push("unions", { body: "" }, 20 * 1000) // 20 seconds
                    .receive("ok", (res: UnionsResponse) => resolve(res)) // Ensure res is typed
                    .receive("error", (reason: any) => reject(reason))
                    .receive("timeout", () => reject(new Error("Timeout re-fetching all unions")));
            });

            // Replace the entire local cache with the fresh, complete list
            // Ensure every union object in the new list has 'officers' initialized as an array
            this.unions = response.unions
                ? response.unions.map(u => ({ ...u, officers: u.officers || [] }))
                : [];
            
            console.info(`[GameService] All unions re-fetched successfully. Total unions: ${this.unions.length}. Now diffing for changes.`);

            // After re-fetching, compare the new full list with the old snapshot
            // to detect any changes (joins, leaves, rank changes) across ALL unions.
            if (this.unionActivityListener) {
                const newUnionsMap = new Map(this.unions.map(u => [u.id, u]));

                // Check existing unions for changes and new unions
                newUnionsMap.forEach((newUnion, unionId) => {
                    const oldUnion = oldUnionsMap.get(unionId);
                    const currentNewOfficers = newUnion.officers || []; // Should be an array due to map above

                    if (!oldUnion) {
                        // This is a brand-new union that appeared in the full fetch.
                        // Log all its officers as "joins" to this new union.
                        currentNewOfficers.forEach(newO => {
                            this.unionActivityListener!.onUnionJoin({
                                userId: newO.user_id, userName: newO.name,
                                unionId: newUnion.id, unionName: newUnion.name,
                                newTitle: newO.title
                            });
                        });
                    } else {
                        // Existing union, compare officers
                        const oldOfficersFromSnapshot = oldUnion.officers || [];
                        const oldOfficerMapForDiff = new Map(oldOfficersFromSnapshot.map(o => [o.user_id, o]));
                        const newOfficerMapForDiff = new Map(currentNewOfficers.map(o => [o.user_id, o]));

                        // Detect Leaves & Rank Changes
                        for (const oldO of oldOfficersFromSnapshot) {
                            const newO_match = newOfficerMapForDiff.get(oldO.user_id);
                            if (!newO_match) {
                                this.unionActivityListener!.onUnionLeave({
                                    userId: oldO.user_id, userName: oldO.name,
                                    unionId: newUnion.id, unionName: newUnion.name,
                                    oldTitle: oldO.title
                                });
                            } else if (newO_match.title !== oldO.title || newO_match.authority !== oldO.authority) {
                                this.unionActivityListener!.onUnionRankChange({
                                    userId: newO_match.user_id, userName: newO_match.name,
                                    unionId: newUnion.id, unionName: newUnion.name,
                                    oldTitle: oldO.title, newTitle: newO_match.title
                                });
                            }
                        }
                        // Detect Joins
                        for (const newO of currentNewOfficers) {
                            if (!oldOfficerMapForDiff.has(newO.user_id)) {
                                this.unionActivityListener!.onUnionJoin({
                                    userId: newO.user_id, userName: newO.name,
                                    unionId: newUnion.id, unionName: newUnion.name,
                                    newTitle: newO.title
                                });
                            }
                        }
                    }
                });

                // Check for unions that were entirely removed
                oldUnionsMap.forEach((oldUnion, unionId) => {
                    if (!newUnionsMap.has(unionId) && oldUnion.officers && oldUnion.officers.length > 0) {
                        console.log(`[GameService] Union ${oldUnion.name} (ID: ${unionId}) appears to have been removed/disbanded.`);
                        oldUnion.officers.forEach(oldO => {
                            this.unionActivityListener!.onUnionLeave({
                                userId: oldO.user_id, userName: oldO.name,
                                unionId: oldUnion.id, unionName: oldUnion.name, // Log with old union name for context
                                oldTitle: oldO.title
                            });
                        });
                    }
                });
            }
        } catch (error) {
            console.error("[GameService] Error during force re-fetch or diffing of all unions:", error);
        }
    }

    public async fetchPlayerProfile(targetUserId: number): Promise<PlayerProfileData | null> {
        if (!this.playerChannel) {
            console.error("[GameService] Player channel not available for fetching profile.");
            return new Promise((_resolve, reject) => {
                reject(new Error("Player channel not available"));
            });
        }
        console.info(`[GameService] Fetching profile for user ID: ${targetUserId}`);

        return new Promise((resolve, reject) => {
            this.playerChannel!
                .push("profile", { user_id: targetUserId })
                .receive("ok", (profileData: PlayerProfileData) => {
                    console.info(`[GameService] Successfully received profile data for user ID: ${targetUserId}`);
                    resolve(profileData);
                })
                .receive("error", (reason: any) => {
                    console.error(`[GameService] Error fetching profile for ${targetUserId}:`, reason);
                    reject(reason);
                })
                .receive("timeout", () => {
                    console.error(`[GameService] Timeout fetching profile for ${targetUserId}.`);
                    reject(new Error("Timeout fetching profile"));
                });
        });
    }

    public getCityByIdOrName(identifier: string | number): City | undefined {
        if (typeof identifier === 'number') {
            return this.cities.find(city => city.id === identifier);
        }
        return this.cities.find(city => city.name.toLowerCase() === identifier.toLowerCase() || city.title.toLowerCase() === identifier.toLowerCase());
    }

    public getUnionsByCityId(cityId: number): Union[] {
        return this.unions.filter(union => union.city?.id === cityId);
    }
    
    public getUnionByIdOrName(identifier: string | number): Union | undefined {
        if (typeof identifier === 'number') {
            return this.unions.find(u => u.id === identifier);
        }
        return this.unions.find(u => u.name.toLowerCase() === identifier.toLowerCase());
    }

    // Get cities controlled by a specific faction, and at the same time a union is in that city
    public getCitiesByFaction(factionName: string): City[] {
        if (!factionName) {
            console.error("[GameService] Faction name is required to filter cities.");
            return [];
        }
        
        return this.cities.filter(city => {
            const faction = city.control_nation?.name;
            const union = this.getUnionsByCityId(city.id);
            return faction === factionName && union.length > 0;
        }
        );
    }

    public setPresenceDiffHandler(handler: (payload: PresenceDiffPayload) => void): void {
        this.presenceDiffHandler = handler;
    }

    public setUnionActivityListener(listener: UnionActivityListener): void {
        this.unionActivityListener = listener;
    }

    public setUnionMovementListener(listener: UnionMovementListener): void {
        this.unionMovementListener = listener;
    }
}