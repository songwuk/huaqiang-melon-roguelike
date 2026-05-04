import type * as PIXI from 'pixi.js';

export type AudioTrigger =
  | 'spawn'
  | 'critical_hit'
  | 'boss_kill'
  | 'ultimate_ready'
  | 'zhengfu_theme'
  | 'enemy_launch'
  | 'burn_tick'
  | 'enemy_dash'
  | 'enemy_explode'
  | 'trap_tick';
export type EnemyKind = 'vendor' | 'thug' | 'scaleWeight' | 'boss';
export type LocaleCode = 'zh' | 'en' | 'fr';
export type InputMode = 'keyboard' | 'touch';
export type DamageKind = 'normal' | 'critical' | 'fire' | 'ice' | 'shatter';
export type DamageSourceId = 'vendorContact' | 'thugContact' | 'scaleWeightContact' | 'bossContact' | 'priceTrap' | 'scaleExplosion' | 'bossGuard';
export type WorldEventKind = 'fakeScale' | 'fairWeight' | 'marketAmbush' | 'challengePledge';
export type MetaGoalId = 'firstRoute' | 'perfectChallenge' | 'fairDeal' | 'ripeChain' | 'eventHunter';
export type SignatureMomentId = 'ripeStreak' | 'killSweep' | 'challengePerfect' | 'bossBreak' | 'fairDeal' | 'goalComplete';
export type RunObjectiveId = 'ripeRoute' | 'troubleRoute' | 'survivalRoute';
export type DeathAdviceId = 'contact' | 'trap' | 'boss' | 'scale' | 'default';
export type BossPhaseId = 'phase1' | 'phase2' | 'phase3' | 'phase4';
export type ArchetypeId = 'fire' | 'ice' | 'magnet' | 'temper';
export type UpgradeId =
  | 'motorcycle-dash'
  | 'magnet-detector'
  | 'cleaver-mastery'
  | 'market-fury'
  | 'fire-roasted-melon'
  | 'rage-blade'
  | 'juice-combustion'
  | 'flame-debt'
  | 'ice-chilled-melon'
  | 'frost-cleaver-back'
  | 'frozen-scale-effect'
  | 'shatter-crit'
  | 'hard-bargain'
  | 'rind-armor'
  | 'debt-collection'
  | 'last-stand-temper'
  | 'magnetic-rind'
  | 'street-smarts'
  | 'fair-scale'
  | 'combo-dealer'
  | 'steam-burst'
  | 'weight-collision'
  | 'black-hole-ignition'
  | 'split-melon'
  | 'loud-bargain'
  | 'ripe-or-bust'
  | 'melon-credit'
  | 'no-refunds';
export type CastId = 'huaqiang' | 'vendor' | 'thug' | 'scaleWeight' | 'scaleBoss';
export type BuffId = 'conqueror' | 'rageBlade' | 'burning' | 'burnZone' | 'frozen' | 'slowed' | 'magnetVortex' | 'magnetBoost';
export type UpgradeFaction = 'core' | 'fire' | 'ice' | 'magnet' | 'temper' | 'survival' | 'growth' | 'rare' | 'risk';
export type UpgradeTier = 'early' | 'archetype' | 'synergy' | 'milestone' | 'rare';

export interface LocalizedText {
  zh: string;
  en: string;
  fr: string;
}

export interface LocaleCopy {
  localeLabel: string;
  title: string;
  conquerorTitle: string;
  portraitName: string;
  portraitRole: string;
  playerOnly: string;
  enemyCast: string;
  castButton: string;
  castTitle: string;
  castIntro: string;
  close: string;
  cast: Record<CastId, string>;
  level: string;
  health: string;
  metaGoalsButton: string;
  metaGoalsTitle: string;
  metaGoalComplete: string;
  metaGoals: Record<MetaGoalId, { title: string; desc: string }>;
  signatureMoments: Record<SignatureMomentId, { title: string; desc: string }>;
  runGoalTitle: string;
  runGoalSubtitle: string;
  runGoalActive: string;
  runGoalChoose: string;
  runGoalProgress: string;
  runGoalReward: string;
  runGoalComplete: string;
  runGoalBadge: string;
  runObjectives: Record<RunObjectiveId, { title: string; desc: string; route: string; reward: string; advice: string }>;
  buildStage: string;
  buildOnline: string;
  buildFinisher: string;
  buildBonus: string;
  archetypeEffects: Record<ArchetypeId, { online: string; finisher: string }>;
  landmarkRisk: string;
  landmarkReward: string;
  landmarkBadges: string;
  bossKeyMissing: string;
  bossKeyReady: string;
  cardUpgraded: string;
  temporaryBurst: string;
  rareVoice: string;
  bossPhaseLabel: string;
  bossPhases: Record<BossPhaseId, { title: string; desc: string }>;
  routeTag: string;
  tierLabels: Record<UpgradeTier, string>;
  deathReview: string;
  deathStats: string;
  deathMainThreat: string;
  deathAdviceTitle: string;
  deathAdvice: Record<DeathAdviceId, string>;
  runStats: {
    level: string;
    kills: string;
    events: string;
    ripeHits: string;
    damage: string;
    riskCards: string;
    survival: string;
  };
  damageTaken: string;
  damageFrom: string;
  lastDamage: string;
  recentDamage: string;
  temper: string;
  exp: string;
  throw: string;
  keyboardHint: string;
  touchHint: string;
  acquiredCards: string;
  activeBuffs: string;
  minimap: string;
  minimapSelf: string;
  minimapBoss: string;
  minimapEvent: string;
  minimapEnemies: string;
  cardDetails: string;
  buildPath: string;
  currentRoute: string;
  noRoute: string;
  factionLabels: Record<UpgradeFaction, string>;
  cardRecommendation: {
    opens: string;
    reinforces: string;
    synergy: string;
    rare: string;
    survival: string;
    growth: string;
    risk: string;
  };
  milestones: Record<'5' | '10' | '15', { title: string; desc: string }>;
  finalBossName: string;
  victory: string;
  objective: string;
  objectiveDistance: string;
  objectiveComplete: string;
  objectiveFailed: string;
  bossGuard: string;
  bossGuardBreak: string;
  damageSources: Record<DamageSourceId, string>;
  events: Record<WorldEventKind, { title: string; desc: string; risk: string; reward: string; complete: string }>;
  levelUp: string;
  tickerPaused: string;
  runEnded: string;
  restart: string;
  buffs: Record<BuffId, { title: string; desc: string }>;
  upgrades: Record<UpgradeId, { title: string; desc: string }>;
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface GameState {
  health: number;
  maxHealth: number;
  temper: number;
  maxTemper: number;
  exp: number;
  level: number;
  expToNext: number;
  luck: number;
  conqueror: boolean;
}

export interface EntityContract {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  active: boolean;
  sprite: PIXI.Graphics;
}

export interface PlayerContract extends EntityContract {
  moveSpeed: number;
  invulnTime: number;
}

export interface EnemyContract extends EntityContract {
  kind: EnemyKind;
  metal: boolean;
  elite: boolean;
  finalBoss: boolean;
  moveSpeed: number;
  touchDamage: number;
  expReward: number;
}

export interface ProjectileContract extends EntityContract {
  isRipe: boolean;
  damage: number;
  lifetime: number;
  knockbackForce: number;
  direction: Vector2;
  splitDepth: number;
}

export interface UpgradeCard {
  id: UpgradeId;
  apply: () => void;
}

export interface JuiceParticle {
  particle: PIXI.Particle;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export interface MagnetVortex {
  sprite: PIXI.Graphics;
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  strength: number;
}

export interface BurnZone {
  sprite: PIXI.Graphics;
  x: number;
  y: number;
  radius: number;
  damagePerSecond: number;
  life: number;
  maxLife: number;
  pulse: number;
  damageTick: number;
}

export interface PriceTrap {
  sprite: PIXI.Graphics;
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  pulse: number;
  damageTick: number;
}

export interface WorldEventNode {
  id: number;
  kind: WorldEventKind;
  sprite: PIXI.Graphics;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  timer: number;
  duration: number;
  spawnPulse: number;
  pulse: number;
  started: boolean;
  failed: boolean;
  bossGate: boolean;
  active: boolean;
}

export interface LandmarkBadge {
  id: number;
  kind: WorldEventKind;
  title: string;
  desc: string;
  faction: UpgradeFaction;
}

export interface BuffDisplay {
  id: BuffId;
  element: 'core' | 'fire' | 'ice';
  count?: number;
  pct?: number;
}

export interface DamageText {
  label: PIXI.Text;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export interface MetaProfile {
  bestLevel: number;
  victories: number;
  perfectChallenges: number;
  eventsCompleted: number;
  ripeHits: number;
  maxRipeChain: number;
}

export interface MetaGoalCard {
  id: MetaGoalId;
  title: string;
  desc: string;
  value: number;
  target: number;
  pct: number;
  complete: boolean;
}

export interface RunObjectiveDefinition {
  id: RunObjectiveId;
  faction: UpgradeFaction;
  target: number;
  value: () => number;
  applyStart: () => void;
  applyComplete: () => void;
}

export interface RunObjectiveCard {
  id: RunObjectiveId;
  title: string;
  desc: string;
  route: string;
  reward: string;
  faction: UpgradeFaction;
  value: number;
  target: number;
  pct: number;
  selected: boolean;
  complete: boolean;
}

export interface PlayerDamageLog {
  id: number;
  amount: number;
  source: DamageSourceId;
  direction: string;
  hpAfter: number;
}

export interface AudioManifestEntry {
  subtitle: LocalizedText;
  frequency: number;
  duration: number;
  wave: OscillatorType;
  volume?: number;
}

export interface OriginalAudioManifestEntry {
  src: string;
  volume?: number;
}

export type OriginalAudioManifest = Partial<Record<AudioTrigger, OriginalAudioManifestEntry>>;
export type RawOriginalAudioManifest = Partial<Record<AudioTrigger, string | OriginalAudioManifestEntry>> & Record<string, unknown>;

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
}
