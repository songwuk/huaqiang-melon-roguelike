import type { AudioTrigger, CastId, DamageSourceId, LocaleCode, MetaGoalId, MetaProfile, UpgradeFaction, UpgradeId, UpgradeTier } from './types';

export const LOCALE_STORAGE_KEY = 'huaqiang-melon-locale';
export const PROFILE_STORAGE_KEY = 'huaqiang-melon-profile';
export const CHINESE_ORIGINAL_AUDIO_MANIFEST_URL = '/assets/audio/zh/manifest.json';
export const AUDIO_TRIGGERS: AudioTrigger[] = [
  'spawn',
  'critical_hit',
  'boss_kill',
  'ultimate_ready',
  'zhengfu_theme',
  'enemy_launch',
  'burn_tick',
  'enemy_dash',
  'enemy_explode',
  'trap_tick',
];

export const DAMAGE_SOURCE_IDS: DamageSourceId[] = [
  'vendorContact',
  'thugContact',
  'scaleWeightContact',
  'bossContact',
  'priceTrap',
  'scaleExplosion',
  'bossGuard',
];

export const LOCALE_OPTIONS: Array<{ code: LocaleCode; label: string }> = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];

export const CAST_MEMBERS: Array<{ id: CastId; index: number }> = [
  { id: 'huaqiang', index: 0 },
  { id: 'vendor', index: 1 },
  { id: 'thug', index: 2 },
  { id: 'scaleWeight', index: 3 },
  { id: 'scaleBoss', index: 4 },
];

export const DEFAULT_META_PROFILE: MetaProfile = {
  bestLevel: 1,
  victories: 0,
  perfectChallenges: 0,
  eventsCompleted: 0,
  ripeHits: 0,
  maxRipeChain: 0,
};

export const META_GOAL_DEFINITIONS: Array<{ id: MetaGoalId; target: number; value: (profile: MetaProfile) => number }> = [
  { id: 'firstRoute', target: 5, value: (profile) => profile.bestLevel },
  { id: 'perfectChallenge', target: 1, value: (profile) => profile.perfectChallenges },
  { id: 'fairDeal', target: 1, value: (profile) => profile.victories },
  { id: 'ripeChain', target: 8, value: (profile) => profile.maxRipeChain },
  { id: 'eventHunter', target: 10, value: (profile) => profile.eventsCompleted },
];

export const UPGRADE_IDS: UpgradeId[] = [
  'motorcycle-dash',
  'magnet-detector',
  'cleaver-mastery',
  'market-fury',
  'fire-roasted-melon',
  'rage-blade',
  'juice-combustion',
  'flame-debt',
  'ice-chilled-melon',
  'frost-cleaver-back',
  'frozen-scale-effect',
  'shatter-crit',
  'hard-bargain',
  'rind-armor',
  'debt-collection',
  'last-stand-temper',
  'magnetic-rind',
  'street-smarts',
  'fair-scale',
  'combo-dealer',
  'steam-burst',
  'weight-collision',
  'black-hole-ignition',
  'split-melon',
  'loud-bargain',
  'ripe-or-bust',
  'melon-credit',
  'no-refunds',
];

export const MILESTONE_LEVELS = new Set([5, 10, 15]);
export const FINAL_BOSS_LEVEL = 15;
export const ARCHETYPE_FACTIONS = new Set<UpgradeFaction>(['fire', 'ice', 'magnet', 'temper']);
export const TERRAIN_TILE_SIZE = 96;
export const TERRAIN_PAD = 360;
export const EVENT_MIN_DISTANCE = 640;
export const EVENT_MAX_DISTANCE = 1180;
export const PROJECTILE_DESPAWN_MARGIN = 260;

export const UPGRADE_META: Record<UpgradeId, { faction: UpgradeFaction; tier: UpgradeTier; synergy?: UpgradeFaction[] }> = {
  'motorcycle-dash': { faction: 'core', tier: 'early' },
  'magnet-detector': { faction: 'magnet', tier: 'archetype' },
  'cleaver-mastery': { faction: 'core', tier: 'early' },
  'market-fury': { faction: 'temper', tier: 'early' },
  'fire-roasted-melon': { faction: 'fire', tier: 'archetype' },
  'rage-blade': { faction: 'temper', tier: 'archetype', synergy: ['fire'] },
  'juice-combustion': { faction: 'fire', tier: 'synergy' },
  'flame-debt': { faction: 'fire', tier: 'milestone', synergy: ['temper'] },
  'ice-chilled-melon': { faction: 'ice', tier: 'archetype' },
  'frost-cleaver-back': { faction: 'ice', tier: 'archetype' },
  'frozen-scale-effect': { faction: 'ice', tier: 'synergy', synergy: ['magnet'] },
  'shatter-crit': { faction: 'ice', tier: 'synergy' },
  'hard-bargain': { faction: 'survival', tier: 'early' },
  'rind-armor': { faction: 'survival', tier: 'early' },
  'debt-collection': { faction: 'survival', tier: 'synergy' },
  'last-stand-temper': { faction: 'temper', tier: 'synergy', synergy: ['survival'] },
  'magnetic-rind': { faction: 'magnet', tier: 'early' },
  'street-smarts': { faction: 'growth', tier: 'rare' },
  'fair-scale': { faction: 'growth', tier: 'early' },
  'combo-dealer': { faction: 'growth', tier: 'synergy' },
  'steam-burst': { faction: 'fire', tier: 'synergy', synergy: ['ice'] },
  'weight-collision': { faction: 'magnet', tier: 'synergy', synergy: ['ice'] },
  'black-hole-ignition': { faction: 'magnet', tier: 'synergy', synergy: ['fire'] },
  'split-melon': { faction: 'rare', tier: 'milestone' },
  'loud-bargain': { faction: 'risk', tier: 'rare' },
  'ripe-or-bust': { faction: 'risk', tier: 'rare' },
  'melon-credit': { faction: 'risk', tier: 'rare' },
  'no-refunds': { faction: 'risk', tier: 'rare', synergy: ['survival'] },
};
