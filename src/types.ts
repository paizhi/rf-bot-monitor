export interface LoginResponseData {
    data: {
        user_token: string;
        user_id: number;
    };
}

export interface Item {
    description: string;
    image: string; // Usually a path, e.g., /images/item.png
    image_url: string; // Full URL
    item_id: number | null;
    item_type: string; // e.g., "Defect card", "Fund", "Weapon", "Prop"
    name: string;
    quantity: number;
}

export interface CitySpoil {
    items: Item[];
    random: boolean;
    reference: number;
}

export interface Nation {
    id: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 10; // 9 is not used
    name: string;
}

export interface Chapter {
    name: string;
    number: string; // e.g., "I"
    serial: number;
}

export interface ControlUnionStub {
    id: number;
    name: string;
    nation_id: number;
}

export interface City {
    title: string;
    movable: boolean;
    point_description: string | null;
    map_building_frame: string;
    id: number;
    control_nation: Nation | null;
    bonus: any; // Type this if structure is known
    city_spoils: CitySpoil[];
    chapter: Chapter;
    status: string; // e.g., "normal", "battle"
    knife: boolean;
    capital: boolean;
    control_name: string; // Name of the controlling nation or union
    knife_clickable: boolean;
    sovereign_triangle_flag: string; // Image path
    energy_charge: number;
    y_position: number;
    can_appoint_minister: boolean;
    x_position: number;
    right_city_id: number | null;
    controlled: boolean;
    sword: boolean;
    down_city_id: number | null;
    nation_battle_score: number | null;
    map_sovereign: string; // Image path
    reward_collected: boolean;
    center_reference: boolean;
    sound_effect: string;
    hijackable: boolean;
    control_triangle_flag: string; // Image path
    union_base: boolean;
    nation_battle: any; // Type this if structure is known
    focus: boolean;
    map_building: string; // Image path
    window_view_image: string; // Image path
    spoil_reference: number;
    sovereign: string; // Name of the sovereign entity
    hq_word: string | null;
    reward: boolean;
    description: string;
    map_control: string; // Image path
    control_union: ControlUnionStub | null;
    left_city_id: number | null;
    up_city_id: number | null;
    map_pin: string; // Image path
    name: string; // City name
    hq: boolean;
}

export interface CitiesResponse {
    cities: City[];
}

export interface UnionCityStub {
    id: number;
    name: string;
    at: string; // ISO timestamp e.g., "2025-05-28T10:39:39Z"
}

export interface Medal {
    image: string; // Image path
    name: string;
}

export interface Officer {
    authority: number;
    half_image: string; // Image path
    image: string; // Image path (GIF)
    locale: string; // e.g., "zh_CN"
    name: string; // Officer's name
    title: string; // e.g., "領袖" (Leader)
    user_id: number;
}

export interface UnionNationStub {
    id: number;
}

export interface Union {
    active: boolean;
    city: UnionCityStub;
    confirm_dissolvable: boolean;
    control_cities: number;
    dissolvable: boolean;
    editable: boolean;
    free_join: boolean;
    id: number;
    joinable: boolean;
    leavable: boolean;
    locale: string; // e.g., "zh-TW"
    medal: Medal;
    member_cap: number;
    member_count: number;
    minister: boolean; // Is the player a minister in this union?
    move_to_city: UnionCityStub | null;
    move_to_city_cancellable: boolean;
    name: string; // Union name
    nation: UnionNationStub;
    officers: Officer[];
    power: number;
    random_pick: boolean;
    ranking_image: string; // Image path
    room_id: number | null;
    score: number;
    seal_image: string; // Image path
    show_union_channel: boolean;
    undo_dissolvable: boolean;
}

export interface UnionsResponse {
    unions: Union[];
}

// For player profile
export interface PlayerActiveSkill {
    activate_skill_point: number;
    description: string;
    image: string; // Image path
    level: string; // e.g., "I"
    name: string;
    id?: number; // Present in actor_prototype.active_skills
    background?: string; // Present in actor_prototype.active_skills
}

export interface ActorCategory {
    font_color: string; // e.g., "#ef7171"
    id: number;
    name: string; // e.g., "游击队"
}

export interface ActorPrototype {
    active_skills: PlayerActiveSkill[];
    actor_category: ActorCategory;
    blood_base_value: number;
    blood_elevation_value: number;
    description: string;
    ethnic_group: string;
    family: string;
    id: number; // Prototype ID
    name: string; // Character prototype name, e.g., "嘎瓦"
    offense_base_value: number;
    offense_elevation_value: number;
    origin: string;
    religion: string;
    religion_icon: string; // Image path
    sponsor: string | null;
    sponsor_gratitude: string | null;
    sponsor_image: string | null; // Image path
    talent_1: string;
    talent_2: string;
    vanguard: boolean;
}

export interface ActorOutfit {
    id: number;
    image: string; // GIF image path
    name: string;
}

export interface ActorPassiveSkill {
    description: string;
    level: number;
}

export interface ActorTeamInfo {
    alphabet_image: string; // Image path e.g. /images/team/A.png
    alphabet_in_team: string; // e.g. "A"
    id: number; // Team ID (seems to match PlayerTeam.id)
    position_in_team: number; // 1-based index
    power: number; // Power of this character in the team
    team_number: number; // e.g. 1
    team_roman_number: string; // e.g. "I"
}

export interface WeaponPrototype {
    description: string;
    image: string; // Image path
    name: string;
    power: string; // e.g., "小" (Small)
}

export interface ActorWeapon {
    id: number; // Weapon instance ID
    level: number;
    skill: number;
    weapon_prototype: WeaponPrototype;
    weapon_prototype_id: number;
}

export interface PlayerActor {
    active_skill: PlayerActiveSkill;
    actor_category_decor: string; // Image path
    actor_category_icon: string; // Image path
    actor_category_order: number;
    actor_prototype: ActorPrototype;
    blood: number; // Current blood/HP
    can_evolute: boolean;
    flag: string; // Image path
    gif_image: string; // Image path
    half_image: string; // Image path
    head_image: string; // Image path
    id: number; // Actor instance ID
    level: number;
    level_cap: number;
    nation: string; // Nation name
    nation_icon: string | null; // Image path
    nation_id: number;
    nation_order: number;
    no_weapon_image: string; // Image path
    no_weapon_name: string;
    offense: number; // Current offense
    outfits: ActorOutfit[];
    passive_skills: ActorPassiveSkill[];
    scarcity: string; // e.g., "SSR"
    scarcity_icon: string; // Image path
    scarcity_image: string; // Image path
    scarcity_order: number;
    skill: number;
    skill_percentage: number;
    team: ActorTeamInfo;
    usable_weapon_ids: number[];
    weapon: ActorWeapon | null; // Can be null if no weapon equipped
}

export interface PlayerTeam {
    actors: PlayerActor[];
    id: number; // Team ID
    power: number; // Total power of this team configuration
    team_number: number;
    team_roman_number: string; // e.g., "I"
}

export interface PlayerNationSeal {
    can_change: boolean;
    id: number | null;
    image: string; // Image path
}

export interface PlayerNation {
    commander: any; // Type if known
    icon: string; // Image path
    id: number; // Nation ID
    seal: PlayerNationSeal;
    unused_bonus_percentage: number | null;
}

export interface PlayerProfileOutfit {
    actor_id: number;
    image: string; // GIF image path
}

export interface PlayerStreetSite {
    id: number;
    image: string; // Image path
}

export interface PlayerUnionStub {
    id: number; // Union ID
}

export interface PlayerProfileData {
    can_add_contact: boolean;
    contact: boolean;
    first_team: PlayerTeam;
    flag: string; // Image path
    id: number; // User ID
    inserted_at: string; // ISO Date string
    level: number;
    locale: string; // e.g., "zh_CN"
    medal: Medal;
    nation: PlayerNation;
    nickname: string;
    organization: string | null;
    outfit: PlayerProfileOutfit;
    room_id: number;
    skill: number;
    skill_required: number;
    street_site: PlayerStreetSite;
    union: PlayerUnionStub | null;
    words: string | null;
}

export interface PlayerProfileResponse {
    status: "ok" | "error"; // And possibly other statuses
    response: PlayerProfileData;
    // Potentially an error field if status is "error"
    error?: string;
    message?: string;
}


// For WebSocket update messages
export interface UpdateDataCitiesPayload {
    cities: Partial<City>[]; // Array of partial city objects to update
}

export interface UpdateDataUnionsPayload {
    unions: Partial<Union>[]; // Array of partial union objects to update
}

// Payloads for joining channels
export interface PlayerChannelPayload {
    fake: "ChannelPlayer";
    fake2: 1; // Or number
}

export interface AllPlayersChannelPayload {
    fake: "ChannelAllPlayer";
}

export interface LocaleChannelPayload {
    fake: "locale";
}

export interface PresenceMeta {
    phx_ref: string;
    online_at: string;
}

export interface PresenceUser {
    metas: PresenceMeta[];
}

export interface PresenceDiffPayload {
    joins: { [userId: string]: PresenceUser }; // Keys are user IDs as strings
    leaves: { [userId: string]: PresenceUser }; // Keys are user IDs as strings
}

export interface UnionJoinInfo {
    userId: number;
    userName: string;
    unionId: number;
    unionName: string;
    newTitle: string;
}

export interface UnionLeaveInfo {
    userId: number;
    userName: string;
    unionId: number;
    unionName: string;
    oldTitle: string;
}

export interface UnionMoveToCityInfo {
    at: string; // ISO timestamp e.g., "2025-05-28T10:39:39Z"
    id: number; // Target city ID
    name: string; // Target city name
}

export interface UnionRankChangeInfo {
    userId: number;
    userName: string;
    unionId: number;
    unionName: string;
    oldTitle: string;
    newTitle: string;
}

export interface UnionActivityListener {
    onUnionJoin(data: UnionJoinInfo): void;
    onUnionLeave(data: UnionLeaveInfo): void;
    onUnionRankChange(data: UnionRankChangeInfo): void;
}

export interface UnionMovementLogInfo {
    unionId: number;
    unionName: string;
    currentCityId: number;     // City ID union is currently in
    currentCityName: string;   // City name union is currently in
    targetCity: UnionMoveToCityInfo; // The new target city and arrival info
    nationName: string | null;     // Nation of the moving union
}

export interface UnionMovementListener {
    onUnionMoveInitiated(data: UnionMovementLogInfo): void;
    // onUnionMoveCompletedOrCancelled(data: { unionId: number, unionName: string, previousTargetCityName: string }): void; // Optional for later
}