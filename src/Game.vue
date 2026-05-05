<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { gsap } from 'gsap';
import * as PIXI from 'pixi.js';
import {
  ARCHETYPE_FACTIONS,
  CAST_MEMBERS,
  DAMAGE_SOURCE_IDS,
  EVENT_MAX_DISTANCE,
  EVENT_MIN_DISTANCE,
  FINAL_BOSS_LEVEL,
  LOCALE_OPTIONS,
  LOCALE_STORAGE_KEY,
  META_GOAL_DEFINITIONS,
  MILESTONE_LEVELS,
  PROJECTILE_DESPAWN_MARGIN,
  TERRAIN_PAD,
  TERRAIN_TILE_SIZE,
  UPGRADE_IDS,
  UPGRADE_META,
} from './game/constants';
import { Enemy } from './game/entities/Enemy';
import { chooseEnemyKindForLevel, eliteChanceForLevel } from './game/entities/enemyScaling';
import { Player } from './game/entities/Player';
import { Projectile } from './game/entities/Projectile';
import { COPY } from './game/i18n';
import { AudioManifestManager } from './game/systems/audio';
import { createDamageSummary, loadMetaProfile, parseLocale, saveMetaProfile as persistMetaProfile } from './game/systems/profile';
import { allocateGameId } from './game/utils/ids';
import { clamp, distanceSq, intersects, normalize, randomFloat } from './game/utils/math';
import { ObjectPool } from './game/utils/objectPool';
import type {
  ArchetypeId,
  BossPhaseId,
  BuffDisplay,
  BuffId,
  BurnZone,
  DamageKind,
  DamageSourceId,
  DamageText,
  EnemyKind,
  GameState,
  InputMode,
  JuiceParticle,
  LandmarkBadge,
  LocaleCode,
  MagnetVortex,
  MetaGoalCard,
  MetaGoalId,
  MetaProfile,
  PlayerDamageLog,
  PriceTrap,
  RunObjectiveCard,
  RunObjectiveDefinition,
  RunObjectiveId,
  SignatureMomentId,
  TribunalRewardId,
  UpgradeCard,
  UpgradeFaction,
  UpgradeId,
  Vector2,
  WorldEventKind,
  WorldEventNode,
} from './game/types';

const canvasHost = ref<HTMLDivElement | null>(null);
const subtitleEl = ref<HTMLDivElement | null>(null);
const subtitleText = ref('');
const subtitleVisible = ref(false);
const runObjectiveOpen = ref(true);
const levelUpOpen = ref(false);
const gameOverOpen = ref(false);
const gameWon = ref(false);
const castPanelOpen = ref(false);
const metaGoalsOpen = ref(false);
const upgradeChoices = ref<UpgradeCard[]>([]);
const acquiredUpgradeIds = ref<UpgradeId[]>([]);
const selectedUpgradeId = ref<UpgradeId | null>(null);
const currentUpgradeLevel = ref(1);
const damageLogs = ref<PlayerDamageLog[]>([]);
const landmarkBadges = ref<LandmarkBadge[]>([]);
const currentLocale = ref<LocaleCode>(parseLocale(typeof window === 'undefined' ? null : window.localStorage.getItem(LOCALE_STORAGE_KEY)));
const metaProfile = reactive<MetaProfile>(loadMetaProfile());
const selectedRunObjectiveId = ref<RunObjectiveId | null>(null);
const runObjectiveCompleted = ref(false);
const runStats = reactive({
  survivalSeconds: 0,
  kills: 0,
  eventsCompleted: 0,
  ripeHits: 0,
  damageTaken: 0,
  riskCards: 0,
  maxLevel: 1,
});
const runDamageBySource = reactive<Record<DamageSourceId, number>>(createDamageSummary());
const milestoneOverlay = reactive({
  visible: false,
  title: '',
  desc: '',
  tone: 'early' as 'early' | 'legend' | 'final',
});

const gameState = reactive<GameState>({
  health: 160,
  maxHealth: 160,
  temper: 0,
  maxTemper: 100,
  exp: 0,
  level: 1,
  expToNext: 120,
  luck: 14,
  conqueror: false,
});

const hud = reactive({
  hpPct: 100,
  temperPct: 0,
  expPct: 0,
  burningEnemies: 0,
  frozenEnemies: 0,
  slowedEnemies: 0,
  chilledMetalEnemies: 0,
  burnZones: 0,
  magnetVortices: 0,
  eventActive: false,
  eventKind: null as WorldEventKind | null,
  eventProgress: 0,
  eventDistance: 0,
  eventDirection: '•',
  eventStarted: false,
  eventFailed: false,
  bossGatePending: false,
  bossGateCleared: false,
  mapRange: 1600,
  mapEnemyCount: 0,
  mapEnemies: [] as Array<{ id: number; x: number; y: number; elite: boolean; metal: boolean }>,
  mapBossActive: false,
  mapBossX: 50,
  mapBossY: 50,
  mapBossDistance: 0,
  mapEventActive: false,
  mapEventX: 50,
  mapEventY: 50,
  mapEventDistance: 0,
  mapEventKind: null as WorldEventKind | null,
  mapPlayerAngle: 90,
});

const damageAlert = reactive({
  visible: false,
  amount: 0,
  source: 'thugContact' as DamageSourceId,
  direction: '•',
  hpAfter: 0,
});

const signatureMoment = reactive({
  visible: false,
  title: '',
  desc: '',
  tone: 'gold' as 'gold' | 'red' | 'green',
});

const bossPhaseAlert = reactive({
  active: false,
  visible: false,
  phase: 0,
  title: '',
  desc: '',
});

const tuning = reactive({
  projectileSpeed: 820,
  projectileDamage: 24,
  projectileLifetime: 0.95,
  baseFireCooldown: 0.22,
  ripeBaseChance: 0.18,
  criticalMultiplier: 1.9,
  unripeKnockback: 1280,
  magnetChance: 0.09,
  magnetRadius: 148,
  magnetStrength: 980,
  enemySpawnInterval: 0.52,
  bossSpawnInterval: 28,
  playerSpeed: 292,
  dashCharges: 0,
  damageReduction: 0,
  riskDamageTakenMultiplier: 1,
  killHeal: 0,
  killHealMultiplier: 1,
  expMultiplier: 1,
  extraUpgradeChoices: 0,
});

const RUN_OBJECTIVE_DEFINITIONS: RunObjectiveDefinition[] = [
  {
    id: 'ripeRoute',
    faction: 'fire',
    target: 24,
    value: () => runStats.ripeHits,
    applyStart: () => {
      gameState.luck += 4;
      tuning.ripeBaseChance += 0.04;
    },
    applyComplete: () => {
      tuning.criticalMultiplier += 0.18;
      gainExp(120 + gameState.level * 10);
    },
  },
  {
    id: 'troubleRoute',
    faction: 'risk',
    target: 2,
    value: () => runStats.eventsCompleted + runStats.riskCards,
    applyStart: () => {
      tuning.expMultiplier += 0.08;
      tuning.riskDamageTakenMultiplier *= 1.05;
    },
    applyComplete: () => {
      gameState.luck += 6;
      gainExp(180 + gameState.level * 16);
    },
  },
  {
    id: 'survivalRoute',
    faction: 'survival',
    target: 150,
    value: () => Math.floor(runStats.survivalSeconds),
    applyStart: () => {
      gameState.maxHealth += 15;
      gameState.health = clamp(gameState.health + 15, 0, gameState.maxHealth);
      tuning.playerSpeed *= 1.04;
    },
    applyComplete: () => {
      tuning.damageReduction = clamp(tuning.damageReduction + 0.06, 0, 0.48);
      gameState.health = clamp(gameState.health + 35, 0, gameState.maxHealth);
    },
  },
];

const keyboard = reactive({
  up: false,
  down: false,
  left: false,
  right: false,
  attack: false,
});

const joystick = reactive({
  active: false,
  pointerId: -1,
  vectorX: 0,
  vectorY: 0,
  knobX: 0,
  knobY: 0,
});

const throwTouch = reactive({
  active: false,
  pointerId: -1,
  x: 0,
  y: 0,
});

const copy = computed(() => COPY[currentLocale.value]);
const titleText = computed(() => (gameState.conqueror ? copy.value.conquerorTitle : copy.value.title));
const temperText = computed(() => `${Math.round(gameState.temper)} / ${gameState.maxTemper}`);
const inputMode = ref<InputMode>('keyboard');
const isTouchControls = computed(() => inputMode.value === 'touch');
const inputHint = computed(() => (isTouchControls.value ? copy.value.touchHint : copy.value.keyboardHint));
const acquiredUpgradeCards = computed(() => acquiredUpgradeIds.value.map((id) => ({ id, title: upgradeTitle(id) })));
const selectedUpgrade = computed(() => {
  const id = selectedUpgradeId.value ?? acquiredUpgradeIds.value.at(-1) ?? null;
  return id ? { id, title: upgradeTitle(id), desc: upgradeDesc(id) } : null;
});
const activeBuffCards = computed<BuffDisplay[]>(() => {
  const buffs: BuffDisplay[] = [];
  if (gameState.conqueror) {
    buffs.push({ id: 'conqueror', element: 'fire', pct: hud.temperPct });
  }
  if (hasUpgrade('rage-blade') && gameState.temper >= gameState.maxTemper * 0.6) {
    buffs.push({ id: 'rageBlade', element: 'fire', pct: hud.temperPct });
  }
  if (hud.burnZones > 0) {
    buffs.push({ id: 'burnZone', element: 'fire', count: hud.burnZones });
  }
  if (hud.burningEnemies > 0) {
    buffs.push({ id: 'burning', element: 'fire', count: hud.burningEnemies });
  }
  if (hud.frozenEnemies > 0) {
    buffs.push({ id: 'frozen', element: 'ice', count: hud.frozenEnemies });
  }
  if (hud.slowedEnemies > 0) {
    buffs.push({ id: 'slowed', element: 'ice', count: hud.slowedEnemies });
  }
  if (hud.magnetVortices > 0) {
    buffs.push({ id: 'magnetVortex', element: 'core', count: hud.magnetVortices });
  }
  if (hasUpgrade('frozen-scale-effect') && hud.chilledMetalEnemies > 0) {
    buffs.push({ id: 'magnetBoost', element: 'ice', count: hud.chilledMetalEnemies });
  }
  return buffs;
});
const factionCounts = computed(() => {
  const counts: Record<UpgradeFaction, number> = {
    core: 0,
    fire: 0,
    ice: 0,
    magnet: 0,
    temper: 0,
    survival: 0,
    growth: 0,
    rare: 0,
    risk: 0,
  };
  for (const id of acquiredUpgradeIds.value) {
    counts[UPGRADE_META[id].faction] += 1;
  }
  return counts;
});
const dominantFaction = computed<UpgradeFaction | null>(() => {
  let best: UpgradeFaction | null = null;
  let bestCount = 0;
  for (const faction of Object.keys(factionCounts.value) as UpgradeFaction[]) {
    if (faction === 'core' || faction === 'rare' || faction === 'risk') {
      continue;
    }
    const count = factionCounts.value[faction];
    if (count > bestCount) {
      best = faction;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : null;
});
const routeText = computed(() => {
  const faction = dominantFaction.value;
  if (!faction) {
    return copy.value.noRoute;
  }
  return copy.value.factionLabels[faction];
});
const buildFactionChips = computed(() =>
  (['fire', 'ice', 'magnet', 'temper', 'survival', 'growth', 'risk'] as UpgradeFaction[])
    .map((faction) => ({ faction, count: factionCounts.value[faction], label: copy.value.factionLabels[faction] }))
    .filter((item) => item.count > 0),
);
const runObjectiveCards = computed<RunObjectiveCard[]>(() =>
  RUN_OBJECTIVE_DEFINITIONS.map((definition) => {
    const value = definition.value();
    const copyEntry = copy.value.runObjectives[definition.id];
    return {
      id: definition.id,
      title: copyEntry.title,
      desc: copyEntry.desc,
      route: copyEntry.route,
      reward: copyEntry.reward,
      faction: definition.faction,
      value,
      target: definition.target,
      pct: clamp((value / definition.target) * 100, 0, 100),
      selected: selectedRunObjectiveId.value === definition.id,
      complete: selectedRunObjectiveId.value === definition.id && runObjectiveCompleted.value,
    };
  }),
);
const activeRunObjective = computed(() => runObjectiveCards.value.find((card) => card.selected) ?? null);
const archetypeTracks = computed(() =>
  (['fire', 'ice', 'magnet', 'temper'] as ArchetypeId[])
    .map((faction) => {
      const count = factionCounts.value[faction];
      const stage = Math.min(count, 3);
      const online = count >= 2;
      const finisher = count >= 3;
      return {
        faction,
        count,
        stage,
        label: copy.value.factionLabels[faction],
        state: finisher ? copy.value.buildFinisher : online ? copy.value.buildOnline : copy.value.buildStage,
        effect: finisher ? copy.value.archetypeEffects[faction].finisher : copy.value.archetypeEffects[faction].online,
        online,
        finisher,
      };
    })
    .filter((track) => track.count > 0),
);
const activeBossPhase = computed(() => {
  if (!bossPhaseAlert.active || bossPhaseAlert.phase <= 0) {
    return null;
  }
  return {
    phase: bossPhaseAlert.phase,
    title: bossPhaseAlert.title,
    desc: bossPhaseAlert.desc,
  };
});
const bossGateNotice = computed(() => {
  if (!hud.bossGatePending || hud.bossGateCleared || runtime.finalBossActive || runtime.finalBossDefeated) {
    return null;
  }
  return {
    title: copy.value.events.challengePledge.title,
    desc: copy.value.bossKeyMissing,
  };
});
const activeObjective = computed(() => {
  if (!hud.eventActive || !hud.eventKind) {
    return null;
  }
  return {
    kind: hud.eventKind,
    title: copy.value.events[hud.eventKind].title,
    desc: copy.value.events[hud.eventKind].desc,
    risk: copy.value.events[hud.eventKind].risk,
    reward: copy.value.events[hud.eventKind].reward,
    distance: Math.round(hud.eventDistance / 10),
    progress: Math.round(hud.eventProgress),
    direction: hud.eventDirection,
    started: hud.eventStarted,
    failed: hud.eventFailed,
  };
});
const metaGoalCards = computed<MetaGoalCard[]>(() =>
  META_GOAL_DEFINITIONS.map((definition) => {
    const value = definition.value(metaProfile);
    return {
      id: definition.id,
      title: copy.value.metaGoals[definition.id].title,
      desc: copy.value.metaGoals[definition.id].desc,
      value,
      target: definition.target,
      pct: clamp((value / definition.target) * 100, 0, 100),
      complete: value >= definition.target,
    };
  }),
);
const completedMetaGoalCount = computed(() => metaGoalCards.value.filter((goal) => goal.complete).length);
const lastDamageLog = computed(() => damageLogs.value[0] ?? null);
const topDamageSourceId = computed<DamageSourceId | null>(() => {
  let best: DamageSourceId | null = null;
  let bestValue = 0;
  for (const id of DAMAGE_SOURCE_IDS) {
    const value = runDamageBySource[id];
    if (value > bestValue) {
      best = id;
      bestValue = value;
    }
  }
  return best;
});
const deathAdviceKey = computed<DeathAdviceId>(() => {
  const source = topDamageSourceId.value;
  if (!source) {
    return 'default';
  }
  if (source === 'priceTrap') {
    return 'trap';
  }
  if (source === 'bossContact' || source === 'bossGuard') {
    return 'boss';
  }
  if (source === 'scaleWeightContact' || source === 'scaleExplosion') {
    return 'scale';
  }
  return 'contact';
});
const deathAdviceText = computed(() => {
  if (gameWon.value && selectedRunObjectiveId.value) {
    return copy.value.runObjectives[selectedRunObjectiveId.value].advice;
  }
  return copy.value.deathAdvice[deathAdviceKey.value];
});
const topDamageSourceText = computed(() => (topDamageSourceId.value ? copy.value.damageSources[topDamageSourceId.value] : ''));
const minimapStatus = computed(() => {
  if (hud.mapBossActive) {
    return `${copy.value.minimapBoss} ${Math.round(hud.mapBossDistance / 10)}m`;
  }
  if (hud.mapEventActive && hud.mapEventKind) {
    return `${copy.value.minimapEvent} ${Math.round(hud.mapEventDistance / 10)}m`;
  }
  return `${copy.value.minimapEnemies} ${hud.mapEnemyCount}`;
});
const runStatCards = computed(() => [
  { label: copy.value.runStats.level, value: `${runStats.maxLevel}` },
  { label: copy.value.runStats.kills, value: `${runStats.kills}` },
  { label: copy.value.runStats.events, value: `${runStats.eventsCompleted}` },
  { label: copy.value.runStats.ripeHits, value: `${runStats.ripeHits}` },
  { label: copy.value.runStats.damage, value: `${Math.round(runStats.damageTaken)}` },
  { label: copy.value.runStats.survival, value: formatRunTime(runStats.survivalSeconds) },
]);

function saveMetaProfile() {
  persistMetaProfile(metaProfile);
}

function completedMetaGoalIds() {
  return new Set(metaGoalCards.value.filter((goal) => goal.complete).map((goal) => goal.id));
}

function seedAnnouncedMetaGoals() {
  runtime.announcedMetaGoals = completedMetaGoalIds();
}

function refreshMetaGoalCompletions() {
  for (const goal of metaGoalCards.value) {
    if (!goal.complete || runtime.announcedMetaGoals.has(goal.id)) {
      continue;
    }
    runtime.announcedMetaGoals.add(goal.id);
    showSubtitle(`${copy.value.metaGoalComplete}: ${goal.title}`);
    triggerSignatureMoment('goalComplete', 'green');
  }
}

function updateMetaBestLevel(level: number) {
  if (level <= metaProfile.bestLevel) {
    return;
  }
  metaProfile.bestLevel = level;
  saveMetaProfile();
  refreshMetaGoalCompletions();
}

function incrementMetaProfile(key: keyof MetaProfile, amount = 1) {
  metaProfile[key] += amount;
  if (key === 'ripeHits' && metaProfile.ripeHits % 10 !== 0) {
    return;
  }
  saveMetaProfile();
  refreshMetaGoalCompletions();
}

function updateMetaMaxRipeChain(chain: number) {
  if (chain <= metaProfile.maxRipeChain) {
    return;
  }
  metaProfile.maxRipeChain = chain;
  saveMetaProfile();
  refreshMetaGoalCompletions();
}

function formatRunTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

function resetRunStats() {
  runStats.survivalSeconds = 0;
  runStats.kills = 0;
  runStats.eventsCompleted = 0;
  runStats.ripeHits = 0;
  runStats.damageTaken = 0;
  runStats.riskCards = 0;
  runStats.maxLevel = 1;
  for (const id of DAMAGE_SOURCE_IDS) {
    runDamageBySource[id] = 0;
  }
}

function resetRunObjectiveSelection() {
  selectedRunObjectiveId.value = null;
  runObjectiveCompleted.value = false;
  runObjectiveOpen.value = true;
  resetRunStats();
}

function selectedRunObjectiveDefinition() {
  return RUN_OBJECTIVE_DEFINITIONS.find((definition) => definition.id === selectedRunObjectiveId.value) ?? null;
}

function chooseRunObjective(id: RunObjectiveId) {
  const definition = RUN_OBJECTIVE_DEFINITIONS.find((item) => item.id === id);
  if (!definition) {
    return;
  }
  selectedRunObjectiveId.value = id;
  runObjectiveCompleted.value = false;
  runObjectiveOpen.value = false;
  definition.applyStart();
  showSubtitle(copy.value.runObjectives[id].title);
  updateHud();
  if (!levelUpOpen.value && !gameOverOpen.value) {
    runtime.app?.ticker.start();
  }
}

function checkRunObjectiveCompletion() {
  const definition = selectedRunObjectiveDefinition();
  if (!definition || runObjectiveCompleted.value || definition.value() < definition.target) {
    return;
  }
  runObjectiveCompleted.value = true;
  definition.applyComplete();
  showSubtitle(`${copy.value.runGoalComplete}: ${copy.value.runObjectives[definition.id].title}`);
  triggerSignatureMoment('goalComplete', 'green');
  const player = runtime.player;
  if (player) {
    emitJuice(player.x, player.y, definition.faction === 'survival' ? 0x75d64b : definition.faction === 'risk' ? 0xfb923c : 0xef3340, 76);
  }
}

function bossPhaseId(phase: number): BossPhaseId {
  if (phase >= 4) {
    return 'phase4';
  }
  if (phase === 3) {
    return 'phase3';
  }
  if (phase === 2) {
    return 'phase2';
  }
  return 'phase1';
}

function showBossPhaseAlert(phase: number, boss?: Enemy) {
  const phaseCopy = copy.value.bossPhases[bossPhaseId(phase)];
  bossPhaseAlert.active = true;
  bossPhaseAlert.visible = true;
  bossPhaseAlert.phase = phase;
  bossPhaseAlert.title = phaseCopy.title;
  bossPhaseAlert.desc = phaseCopy.desc;
  showSubtitle(`${copy.value.bossPhaseLabel} ${phase}: ${phaseCopy.title}`);
  if (boss) {
    emitJuice(boss.x, boss.y, phase >= 4 ? 0xef3340 : phase >= 3 ? 0xffe45c : 0xa1a1aa, phase >= 4 ? 70 : 44);
  }

  void nextTick(() => {
    const el = document.querySelector('.boss-phase-toast');
    if (!el) {
      return;
    }
    gsap.killTweensOf(el);
    gsap.fromTo(
      el,
      { opacity: 0, x: 18, scale: 0.94 },
      {
        opacity: 1,
        x: 0,
        scale: 1,
        duration: 0.16,
        ease: 'back.out(2)',
        onComplete: () => {
          gsap.to(el, {
            opacity: 0,
            x: 16,
            delay: 1.15,
            duration: 0.28,
            ease: 'power2.in',
            onComplete: () => {
              bossPhaseAlert.visible = false;
            },
          });
        },
      },
    );
  });
}

function damageSourceLabel(id: DamageSourceId) {
  return copy.value.damageSources[id];
}

function damageLogText(log: PlayerDamageLog) {
  return `-${Math.round(log.amount)} · ${damageSourceLabel(log.source)} ${log.direction} · ${copy.value.health} ${Math.round(log.hpAfter)}`;
}

function upgradeTitle(id: UpgradeId) {
  return copy.value.upgrades[id].title;
}

function upgradeDesc(id: UpgradeId) {
  return copy.value.upgrades[id].desc;
}

function buffTitle(id: BuffId) {
  return copy.value.buffs[id].title;
}

function buffDesc(id: BuffId) {
  return copy.value.buffs[id].desc;
}

function upgradeArtClass(id: UpgradeId) {
  return `upgrade-art--${id}`;
}

function upgradeFaction(id: UpgradeId) {
  return UPGRADE_META[id].faction;
}

function upgradeFactionLabel(id: UpgradeId) {
  return copy.value.factionLabels[upgradeFaction(id)];
}

function upgradeTierLabel(id: UpgradeId) {
  return copy.value.tierLabels[UPGRADE_META[id].tier];
}

function upgradeElementClass(id: UpgradeId) {
  return upgradeFaction(id);
}

function upgradeRecommendation(id: UpgradeId) {
  const meta = UPGRADE_META[id];
  if (meta.faction === 'risk') {
    return copy.value.cardRecommendation.risk;
  }
  if (meta.tier === 'rare' || meta.tier === 'milestone' || meta.faction === 'rare') {
    return copy.value.cardRecommendation.rare;
  }
  if (meta.synergy?.some((faction) => factionCounts.value[faction] > 0)) {
    return copy.value.cardRecommendation.synergy;
  }
  if (meta.faction === 'survival') {
    return copy.value.cardRecommendation.survival;
  }
  if (meta.faction === 'growth') {
    return copy.value.cardRecommendation.growth;
  }
  if (factionCounts.value[meta.faction] > 0) {
    return copy.value.cardRecommendation.reinforces;
  }
  return copy.value.cardRecommendation.opens;
}

function hasUpgrade(id: UpgradeId) {
  return acquiredUpgradeIds.value.includes(id);
}

function selectUpgrade(id: UpgradeId) {
  selectedUpgradeId.value = id;
}

function archetypeCount(faction: ArchetypeId) {
  return factionCounts.value[faction];
}

function archetypeOnline(faction: ArchetypeId) {
  return archetypeCount(faction) >= 2;
}

function archetypeFinisher(faction: ArchetypeId) {
  return archetypeCount(faction) >= 3;
}

function announceArchetypeBreakpoints(id: UpgradeId) {
  const faction = UPGRADE_META[id].faction;
  if (faction !== 'fire' && faction !== 'ice' && faction !== 'magnet' && faction !== 'temper') {
    return;
  }
  const count = archetypeCount(faction);
  const key = `${faction}:${Math.min(count, 3)}`;
  if (count < 2 || runtime.announcedArchetypes.has(key)) {
    return;
  }
  runtime.announcedArchetypes.add(key);
  const label = copy.value.factionLabels[faction];
  const state = count >= 3 ? copy.value.buildFinisher : copy.value.buildOnline;
  showSubtitle(`${label} ${state}`);
  const player = runtime.player;
  if (player) {
    const color = faction === 'fire' || faction === 'temper' ? 0xef3340 : faction === 'ice' ? 0x9be7ff : 0x38bdf8;
    emitJuice(player.x, player.y, color, count >= 3 ? 82 : 48);
  }
  shake(count >= 3 ? 18 : 11);
  hitStop(count >= 3 ? 70 : 40);
}

function addLandmarkBadge(kind: WorldEventKind, faction: UpgradeFaction) {
  const eventCopy = copy.value.events[kind];
  const badge: LandmarkBadge = {
    id: allocateGameId(),
    kind,
    title: eventCopy.title,
    desc: eventCopy.reward,
    faction,
  };
  landmarkBadges.value = [badge, ...landmarkBadges.value.filter((item) => item.kind !== kind)].slice(0, 4);
}

function upgradeOwnedCardFromLandmark(preferredFactions: UpgradeFaction[]) {
  const preferred = acquiredUpgradeIds.value.find((id) => preferredFactions.includes(UPGRADE_META[id].faction));
  const dominant = dominantFaction.value
    ? acquiredUpgradeIds.value.find((id) => UPGRADE_META[id].faction === dominantFaction.value)
    : null;
  const fallback = acquiredUpgradeIds.value.find((id) => UPGRADE_META[id].faction !== 'risk') ?? acquiredUpgradeIds.value[0] ?? null;
  const target = preferred ?? dominant ?? fallback;
  if (!target) {
    gainExp(80 + gameState.level * 10);
    return false;
  }
  selectedUpgradeId.value = target;
  applyUpgradeEffect(target);
  showSubtitle(`${copy.value.cardUpgraded}: ${upgradeTitle(target)}`);
  return true;
}

function prefersTouchInput() {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

function resetTouchControls() {
  joystick.active = false;
  joystick.pointerId = -1;
  joystick.vectorX = 0;
  joystick.vectorY = 0;
  joystick.knobX = 0;
  joystick.knobY = 0;
  throwTouch.active = false;
  throwTouch.pointerId = -1;
}

function resetKeyboardControls() {
  keyboard.up = false;
  keyboard.down = false;
  keyboard.left = false;
  keyboard.right = false;
  keyboard.attack = false;
}

function setInputMode(mode: InputMode) {
  if (inputMode.value === mode) {
    return;
  }
  inputMode.value = mode;
  if (mode === 'keyboard') {
    resetTouchControls();
    return;
  }
  keyboard.attack = false;
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && target.matches('input, select, textarea, button, [contenteditable="true"]');
}

function isMovementKey(key: string) {
  return key === 'w' || key === 'a' || key === 's' || key === 'd' || key.startsWith('arrow');
}

function isThrowKey(key: string) {
  return key === ' ' || key === 'spacebar' || key === 'j' || key === 'k' || key === 'enter';
}

function currentEnemySpawnInterval() {
  const pressure = gameState.level >= 15 ? 0.1 : gameState.level >= 10 ? 0.07 : gameState.level >= 5 ? 0.03 : 0;
  return Math.max(0.38, tuning.enemySpawnInterval - pressure - gameState.level * 0.006);
}

const runtime = {
  app: null as PIXI.Application | null,
  world: null as PIXI.Container | null,
  backgroundLayer: null as PIXI.Graphics | null,
  terrainLayer: null as PIXI.Graphics | null,
  entityLayer: null as PIXI.Container | null,
  projectileLayer: null as PIXI.Container | null,
  effectLayer: null as PIXI.Container | null,
  eventLayer: null as PIXI.Container | null,
  magnetLayer: null as PIXI.Container | null,
  healthBarLayer: null as PIXI.Container | null,
  damageTextLayer: null as PIXI.Container | null,
  juiceLayer: null as PIXI.ParticleContainer<PIXI.Particle> | null,
  player: null as Player | null,
  projectiles: [] as Projectile[],
  enemies: [] as Enemy[],
  worldEvents: [] as WorldEventNode[],
  magnets: [] as MagnetVortex[],
  burnZones: [] as BurnZone[],
  priceTraps: [] as PriceTrap[],
  particles: [] as JuiceParticle[],
  freeParticles: [] as JuiceParticle[],
  damageTexts: [] as DamageText[],
  freeDamageTexts: [] as DamageText[],
  projectilePool: null as ObjectPool<Projectile> | null,
  enemyPool: null as ObjectPool<Enemy> | null,
  audio: null as AudioManifestManager | null,
  resizeObserver: null as ResizeObserver | null,
  tickerHandler: null as ((ticker: PIXI.Ticker) => void) | null,
  keyDownHandler: null as ((event: KeyboardEvent) => void) | null,
  keyUpHandler: null as ((event: KeyboardEvent) => void) | null,
  audioUnlockHandler: null as (() => void) | null,
  hudRaf: 0,
  damageAlertTimer: 0,
  fireCooldown: 0,
  spawnClock: 0,
  bossClock: 0,
  eventClock: 0,
  nextEventDelay: 7,
  playerSlowTime: 0,
  hitStop: 0,
  shakeTime: 0,
  shakeIntensity: 0,
  shakeOffsetX: 0,
  shakeOffsetY: 0,
  cameraX: 0,
  cameraY: 0,
  terrainKey: '',
  pendingLevelUps: 0,
  pendingLevelQueue: [] as number[],
  triggeredMilestones: new Set<number>(),
  finalBossPending: false,
  finalBossActive: false,
  finalBossDefeated: false,
  bossGatePending: false,
  bossGateCleared: false,
  finalBossPhase: 0,
  finalBossAbilityClock: 0,
  finalBossGuardTime: 0,
  finalBossGuardCooldown: 0,
  ultimateAnnounced: false,
  ripeHitChain: 0,
  killChain: 0,
  killChainTime: 0,
  signatureMomentCooldown: 0,
  announcedMetaGoals: new Set<MetaGoalId>(),
  announcedArchetypes: new Set<string>(),
  landmarkBurstTime: 0,
  landmarkBurstDamage: 0,
  landmarkBurstFireRate: 0,
  lastAimDirection: { x: 1, y: 0 } as Vector2,
  destroyed: false,
};

function showSubtitle(text: string) {
  subtitleText.value = text;
  subtitleVisible.value = true;
  void nextTick(() => {
    const el = subtitleEl.value;
    if (!el) {
      return;
    }
    gsap.killTweensOf(el);
    gsap.fromTo(
      el,
      { xPercent: -50, y: -8, scale: 0.86, opacity: 0, rotate: -1 },
      {
        xPercent: -50,
        y: 0,
        scale: 1,
        opacity: 1,
        rotate: 0,
        duration: 0.14,
        ease: 'back.out(2)',
        onComplete: () => {
          gsap.to(el, {
            xPercent: -50,
            opacity: 0,
            y: -10,
            scale: 1.02,
            delay: 0.58,
            duration: 0.22,
            ease: 'power2.in',
            onComplete: () => {
              subtitleVisible.value = false;
            },
          });
        },
      },
    );
  });
}

function triggerSignatureMoment(id: SignatureMomentId, tone: 'gold' | 'red' | 'green' = 'gold') {
  if (runtime.signatureMomentCooldown > 0 && id !== 'fairDeal') {
    return;
  }
  const moment = copy.value.signatureMoments[id];
  signatureMoment.title = moment.title;
  signatureMoment.desc = moment.desc;
  signatureMoment.tone = tone;
  signatureMoment.visible = true;
  runtime.signatureMomentCooldown = id === 'fairDeal' ? 0 : 2.2;

  const player = runtime.player;
  if (player) {
    const color = tone === 'red' ? 0xef3340 : tone === 'green' ? 0x75d64b : 0xffe45c;
    emitJuice(player.x, player.y, color, id === 'fairDeal' ? 120 : 70);
    emitJuice(player.x, player.y, tone === 'red' ? 0xffe45c : 0xef3340, 30);
  }
  shake(id === 'fairDeal' ? 28 : 18);
  hitStop(id === 'fairDeal' ? 120 : 75);

  void nextTick(() => {
    const el = document.querySelector('.signature-moment');
    if (!el) {
      return;
    }
    gsap.killTweensOf(el);
    gsap.fromTo(
      el,
      { scale: 0.62, opacity: 0, y: 24, rotate: -2 },
      {
        scale: 1,
        opacity: 1,
        y: 0,
        rotate: 0,
        duration: 0.18,
        ease: 'back.out(2.6)',
        onComplete: () => {
          gsap.to(el, {
            opacity: 0,
            y: -20,
            delay: id === 'fairDeal' ? 1.4 : 0.82,
            duration: 0.28,
            ease: 'power2.in',
            onComplete: () => {
              signatureMoment.visible = false;
            },
          });
        },
      },
    );
  });
}

function getStageSize() {
  const app = runtime.app;
  return app ? { width: app.renderer.width, height: app.renderer.height } : { width: 1, height: 1 };
}

function getViewportBounds() {
  const size = getStageSize();
  return {
    left: runtime.cameraX,
    right: runtime.cameraX + size.width,
    top: runtime.cameraY,
    bottom: runtime.cameraY + size.height,
    width: size.width,
    height: size.height,
  };
}

function screenToWorld(clientX: number, clientY: number) {
  const rect = canvasHost.value?.getBoundingClientRect();
  const localX = rect ? clientX - rect.left : clientX;
  const localY = rect ? clientY - rect.top : clientY;
  return {
    x: runtime.cameraX + localX - runtime.shakeOffsetX,
    y: runtime.cameraY + localY - runtime.shakeOffsetY,
  };
}

function drawBackground() {
  const bg = runtime.backgroundLayer;
  if (!bg) {
    return;
  }
  const size = getStageSize();
  const danger = gameState.conqueror || runtime.finalBossPhase >= 3;
  bg.clear();
  bg.beginFill(danger ? 0x3b0507 : 0x07090e);
  bg.drawRect(0, 0, size.width, size.height);
  bg.endFill();
  bg.beginFill(danger ? 0xd91f28 : 0x173325, danger ? 0.24 : 0.18);
  bg.drawCircle(size.width * 0.5, size.height * 0.44, Math.max(size.width, size.height) * 0.42);
  bg.endFill();
  drawWorldTerrain();
}

function drawWorldTerrain() {
  const terrain = runtime.terrainLayer;
  if (!terrain) {
    return;
  }
  const viewport = getViewportBounds();
  const left = viewport.left - TERRAIN_PAD;
  const top = viewport.top - TERRAIN_PAD;
  const right = viewport.right + TERRAIN_PAD;
  const bottom = viewport.bottom + TERRAIN_PAD;
  const width = right - left;
  const height = bottom - top;
  const danger = gameState.conqueror || runtime.finalBossPhase >= 3;
  terrain.clear();
  terrain.beginFill(danger ? 0x260607 : 0x0a1110);
  terrain.drawRect(left, top, width, height);
  terrain.endFill();

  terrain.lineStyle(1, danger ? 0x6f1d1b : 0x173325, 0.32);
  const gridLeft = Math.floor(left / TERRAIN_TILE_SIZE) * TERRAIN_TILE_SIZE;
  const gridTop = Math.floor(top / TERRAIN_TILE_SIZE) * TERRAIN_TILE_SIZE;
  for (let x = gridLeft; x <= right; x += TERRAIN_TILE_SIZE) {
    terrain.moveTo(x, top);
    terrain.lineTo(x, bottom);
  }
  for (let y = gridTop; y <= bottom; y += TERRAIN_TILE_SIZE) {
    terrain.moveTo(left, y);
    terrain.lineTo(right, y);
  }

  const chunkSize = TERRAIN_TILE_SIZE * 5;
  const chunkLeft = Math.floor(left / chunkSize) - 1;
  const chunkRight = Math.ceil(right / chunkSize) + 1;
  const chunkTop = Math.floor(top / chunkSize) - 1;
  const chunkBottom = Math.ceil(bottom / chunkSize) + 1;
  for (let cx = chunkLeft; cx <= chunkRight; cx += 1) {
    for (let cy = chunkTop; cy <= chunkBottom; cy += 1) {
      const hash = Math.abs((cx * 73856093) ^ (cy * 19349663));
      if (hash % 5 > 1) {
        continue;
      }
      const stall = {
        x: cx * chunkSize + 120 + (hash % 180),
        y: cy * chunkSize + 110 + ((hash >> 3) % 190),
        w: 180 + (hash % 70),
        h: 74 + ((hash >> 5) % 44),
        color: [0x3f2d17, 0x27391e, 0x3a1c1f, 0x22262b][hash % 4],
      };
      terrain.beginFill(stall.color, 0.72);
      terrain.drawRect(stall.x - stall.w / 2, stall.y - stall.h / 2, stall.w, stall.h);
      terrain.endFill();
      terrain.beginFill(0x75d64b, 0.58);
      for (let i = 0; i < 5; i += 1) {
        terrain.drawCircle(stall.x - stall.w * 0.36 + i * 34, stall.y - 8 + (i % 2) * 18, 13);
      }
      terrain.endFill();
    }
  }

  terrain.beginFill(0x000000, 0.16);
  terrain.drawCircle(0, 0, 190);
  terrain.endFill();
  terrain.lineStyle(3, danger ? 0xef3340 : 0x75d64b, 0.2);
  terrain.drawCircle(0, 0, 190);
}

function grantImmediateLevelUp() {
  gameState.level += 1;
  runStats.maxLevel = Math.max(runStats.maxLevel, gameState.level);
  gameState.expToNext = Math.round(gameState.expToNext * 1.34);
  runtime.pendingLevelQueue.push(gameState.level);
  runtime.pendingLevelUps += 1;
  updateMetaBestLevel(gameState.level);
  triggerLevelMilestone(gameState.level);
}

function applyUpgradeEffect(id: UpgradeId) {
  if (id === 'motorcycle-dash') {
    tuning.playerSpeed *= 1.18;
    tuning.dashCharges += 1;
    return;
  }
  if (id === 'magnet-detector') {
    tuning.magnetChance = clamp(tuning.magnetChance * 2, 0, 0.65);
    tuning.magnetRadius += 46;
    return;
  }
  if (id === 'cleaver-mastery') {
    tuning.projectileDamage += 9;
    tuning.baseFireCooldown *= 0.88;
    tuning.ripeBaseChance += 0.05;
    return;
  }
  if (id === 'market-fury') {
    gameState.maxHealth += 20;
    gameState.health = clamp(gameState.health + 20, 0, gameState.maxHealth);
    gameState.luck += 12;
    return;
  }
  if (id === 'hard-bargain') {
    gameState.maxHealth += 35;
    gameState.health = clamp(gameState.health + 35, 0, gameState.maxHealth);
    return;
  }
  if (id === 'rind-armor') {
    tuning.damageReduction = clamp(tuning.damageReduction + 0.12, 0, 0.48);
    return;
  }
  if (id === 'debt-collection') {
    tuning.killHeal += 2.4;
    return;
  }
  if (id === 'magnetic-rind') {
    tuning.magnetRadius += 28;
    tuning.expMultiplier += 0.12;
    return;
  }
  if (id === 'street-smarts') {
    tuning.extraUpgradeChoices = Math.max(tuning.extraUpgradeChoices, 1);
    return;
  }
  if (id === 'fair-scale') {
    tuning.expMultiplier += 0.18;
    gameState.luck += 6;
    return;
  }
  if (id === 'loud-bargain') {
    tuning.projectileDamage *= 1.35;
    tuning.riskDamageTakenMultiplier *= 1.18;
    return;
  }
  if (id === 'ripe-or-bust') {
    tuning.ripeBaseChance += 0.18;
    tuning.unripeKnockback *= 0.75;
    return;
  }
  if (id === 'melon-credit') {
    gameState.maxHealth = Math.max(90, gameState.maxHealth - 20);
    gameState.health = clamp(gameState.health, 0, gameState.maxHealth);
    grantImmediateLevelUp();
    return;
  }
  if (id === 'no-refunds') {
    tuning.criticalMultiplier += 0.38;
    tuning.killHealMultiplier = 0;
  }
}

function shuffleCopy<T>(items: T[]) {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const item = deck[i];
    deck[i] = deck[j];
    deck[j] = item;
  }
  return deck;
}

function synergyReady(id: UpgradeId) {
  const meta = UPGRADE_META[id];
  return meta.synergy?.some((faction) => factionCounts.value[faction] > 0) ?? false;
}

function runObjectivePreferredFactions(): UpgradeFaction[] {
  if (selectedRunObjectiveId.value === 'ripeRoute') {
    return ['fire', 'temper', 'core'];
  }
  if (selectedRunObjectiveId.value === 'troubleRoute') {
    return ['risk', 'growth', 'survival'];
  }
  if (selectedRunObjectiveId.value === 'survivalRoute') {
    return ['survival', 'ice', 'core'];
  }
  return [];
}

function upgradeWeightForLevel(id: UpgradeId, level: number) {
  const meta = UPGRADE_META[id];
  let weight = 1;
  if (level < 5) {
    weight += meta.tier === 'early' ? 5 : 0;
    weight += meta.faction === 'survival' || meta.faction === 'growth' || meta.faction === 'core' ? 2 : 0;
  } else if (level === 5) {
    weight += meta.tier === 'archetype' || ARCHETYPE_FACTIONS.has(meta.faction) ? 7 : 0;
  } else if (level < 10) {
    weight += meta.tier === 'archetype' ? 4 : 0;
    weight += synergyReady(id) ? 4 : 0;
    weight += meta.tier === 'early' ? 1 : 0;
  } else if (level === 10) {
    weight += meta.tier === 'rare' || meta.tier === 'milestone' ? 7 : 0;
    weight += meta.tier === 'synergy' ? 3 : 0;
  } else if (level < 15) {
    weight += meta.tier === 'synergy' ? 5 : 0;
    weight += synergyReady(id) ? 4 : 0;
    weight += meta.tier === 'rare' ? 2 : 0;
  } else {
    weight += meta.tier === 'milestone' || meta.tier === 'rare' ? 6 : 0;
    weight += meta.tier === 'synergy' ? 4 : 0;
    weight += synergyReady(id) ? 4 : 0;
  }
  if (dominantFaction.value && meta.faction === dominantFaction.value) {
    weight += 2;
  }
  if (meta.faction === 'fire' || meta.faction === 'ice' || meta.faction === 'magnet' || meta.faction === 'temper') {
    const count = archetypeCount(meta.faction);
    if (count === 1) {
      weight += 4;
    } else if (count >= 2) {
      weight += meta.tier === 'synergy' || meta.tier === 'milestone' ? 6 : 3;
    }
  }
  if (dominantFaction.value && meta.synergy?.includes(dominantFaction.value)) {
    weight += factionCounts.value[dominantFaction.value] >= 2 ? 4 : 2;
  }
  if (runObjectivePreferredFactions().includes(meta.faction)) {
    weight += 3;
  }
  return weight;
}

function buildUpgradeChoices(level: number): UpgradeCard[] {
  const slots = 3 + Math.min(tuning.extraUpgradeChoices, 1);
  const available = UPGRADE_IDS.filter((id) => !hasUpgrade(id));
  const weighted = available
    .map((id) => ({ id, score: Math.random() * upgradeWeightForLevel(id, level) }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.id);
  const ids =
    weighted.length >= slots
      ? weighted
      : [...weighted, ...shuffleCopy(UPGRADE_IDS.filter((id) => hasUpgrade(id)))];
  return ids.map((id) => ({
    id,
    apply: () => {
      applyUpgradeEffect(id);
    },
  }));
}

function pickUpgradeChoices() {
  upgradeChoices.value = buildUpgradeChoices(currentUpgradeLevel.value).slice(0, 3 + Math.min(tuning.extraUpgradeChoices, 1));
}

function pauseForLevelUp() {
  if (!runtime.app || gameOverOpen.value) {
    return;
  }
  currentUpgradeLevel.value = runtime.pendingLevelQueue[0] ?? gameState.level;
  pickUpgradeChoices();
  levelUpOpen.value = true;
  runtime.app.ticker.stop();
}

function chooseUpgrade(card: UpgradeCard) {
  if (!hasUpgrade(card.id)) {
    acquiredUpgradeIds.value = [...acquiredUpgradeIds.value, card.id];
    announceArchetypeBreakpoints(card.id);
    if (upgradeFaction(card.id) === 'risk') {
      runStats.riskCards += 1;
      checkRunObjectiveCompletion();
    }
  }
  selectedUpgradeId.value = card.id;
  card.apply();
  levelUpOpen.value = false;
  runtime.pendingLevelQueue.shift();
  runtime.pendingLevelUps = Math.max(0, runtime.pendingLevelUps - 1);
  if (runtime.pendingLevelUps > 0) {
    pauseForLevelUp();
    return;
  }
  runtime.app?.ticker.start();
  if (runtime.bossGatePending && !runtime.bossGateCleared && !runtime.worldEvents.some((event) => event.active)) {
    spawnWorldEvent('challengePledge', true);
    showBossGateCue();
  }
  if (runtime.finalBossPending && runtime.bossGateCleared && !runtime.finalBossActive && !runtime.finalBossDefeated) {
    runtime.finalBossPending = false;
    spawnEnemy(true, true);
  }
}

function gainExp(value: number) {
  gameState.exp += value * tuning.expMultiplier;
  while (gameState.exp >= gameState.expToNext) {
    gameState.exp -= gameState.expToNext;
    gameState.level += 1;
    runStats.maxLevel = Math.max(runStats.maxLevel, gameState.level);
    gameState.expToNext = Math.round(gameState.expToNext * 1.34);
    runtime.pendingLevelQueue.push(gameState.level);
    runtime.pendingLevelUps += 1;
    updateMetaBestLevel(gameState.level);
    triggerLevelMilestone(gameState.level);
  }
}

function addTemper(value: number) {
  if (gameState.conqueror) {
    return;
  }
  const archetypeBonus = archetypeOnline('temper') ? (archetypeFinisher('temper') ? 1.28 : 1.14) : 1;
  gameState.temper = clamp(gameState.temper + value * archetypeBonus, 0, gameState.maxTemper);
  if (gameState.temper >= gameState.maxTemper) {
    enterConquerorMode();
  } else if (gameState.temper >= gameState.maxTemper * 0.82 && !runtime.ultimateAnnounced) {
    runtime.ultimateAnnounced = true;
    void runtime.audio?.play('ultimate_ready', true);
  }
}

function enterConquerorMode() {
  if (gameState.conqueror) {
    return;
  }
  gameState.conqueror = true;
  gameState.temper = gameState.maxTemper;
  drawBackground();
  shake(18);
  void runtime.audio?.play('ultimate_ready', true);
  window.setTimeout(() => {
    void runtime.audio?.play('zhengfu_theme', true);
  }, 340);
}

function currentFireCooldown() {
  let cooldown = gameState.conqueror ? tuning.baseFireCooldown / 3 : tuning.baseFireCooldown;
  if (archetypeOnline('temper')) {
    cooldown *= archetypeFinisher('temper') ? 0.84 : 0.92;
  }
  if (runtime.landmarkBurstTime > 0) {
    cooldown *= 1 - runtime.landmarkBurstFireRate;
  }
  return cooldown;
}

function shake(intensity: number) {
  runtime.shakeIntensity = Math.max(runtime.shakeIntensity, intensity);
  runtime.shakeTime = Math.max(runtime.shakeTime, 0.22);
}

function hitStop(ms = 50) {
  runtime.hitStop = Math.max(runtime.hitStop, ms / 1000);
}

function milestoneKey(level: number) {
  return String(level) as '5' | '10' | '15';
}

function emitMilestoneExplosion(level: number) {
  const player = runtime.player;
  if (!player) {
    return;
  }
  const color = level >= 15 ? 0xef3340 : level >= 10 ? 0xffe45c : 0x75d64b;
  emitJuice(player.x, player.y, color, level >= 10 ? 96 : 58);
  emitJuice(player.x, player.y, level >= 15 ? 0xfacc15 : 0x9be7ff, level >= 15 ? 48 : 26);
}

function presentMilestoneOverlay(title: string, desc: string, tone: 'early' | 'legend' | 'final', hold = 1.05) {
  milestoneOverlay.title = title;
  milestoneOverlay.desc = desc;
  milestoneOverlay.tone = tone;
  milestoneOverlay.visible = true;
  void nextTick(() => {
    const el = document.querySelector('.milestone-burst');
    if (!el) {
      return;
    }
    gsap.killTweensOf(el);
    gsap.fromTo(
      el,
      { scale: 0.72, opacity: 0, y: 18 },
      {
        scale: 1,
        opacity: 1,
        y: 0,
        duration: 0.2,
        ease: 'back.out(2.4)',
        onComplete: () => {
          gsap.to(el, {
            opacity: 0,
            y: -18,
            delay: hold,
            duration: 0.32,
            ease: 'power2.in',
            onComplete: () => {
              milestoneOverlay.visible = false;
            },
          });
        },
      },
    );
  });
}

function triggerMilestoneOverlay(level: number) {
  const milestone = copy.value.milestones[milestoneKey(level)];
  presentMilestoneOverlay(milestone.title, milestone.desc, level >= 15 ? 'final' : level >= 10 ? 'legend' : 'early');
}

function showBossGateCue() {
  presentMilestoneOverlay(copy.value.events.challengePledge.title, copy.value.bossKeyMissing, 'final', 2.2);
  showSubtitle(copy.value.bossKeyMissing);
}

function triggerLevelMilestone(level: number) {
  if (!MILESTONE_LEVELS.has(level) || runtime.triggeredMilestones.has(level)) {
    return;
  }
  runtime.triggeredMilestones.add(level);
  triggerMilestoneOverlay(level);
  showSubtitle(copy.value.milestones[milestoneKey(level)].title);
  emitMilestoneExplosion(level);
  shake(level >= 15 ? 26 : level >= 10 ? 20 : 14);
  hitStop(level >= 10 ? 95 : 70);
  if (level === 15) {
    runtime.bossGatePending = !runtime.bossGateCleared;
    runtime.finalBossPending = runtime.bossGateCleared;
    gameState.temper = clamp(gameState.temper + 35, 0, gameState.maxTemper);
    showBossGateCue();
    void runtime.audio?.play('ultimate_ready', true);
  }
}

function updateShake(dt: number) {
  if (runtime.shakeTime <= 0) {
    runtime.shakeIntensity = 0;
    runtime.shakeOffsetX = 0;
    runtime.shakeOffsetY = 0;
    return;
  }
  runtime.shakeTime = Math.max(0, runtime.shakeTime - dt);
  runtime.shakeIntensity *= 0.9;
  runtime.shakeOffsetX = randomFloat(-runtime.shakeIntensity, runtime.shakeIntensity);
  runtime.shakeOffsetY = randomFloat(-runtime.shakeIntensity, runtime.shakeIntensity);
}

function updateCamera(dt = 0, immediate = false) {
  const world = runtime.world;
  const player = runtime.player;
  if (!world || !player) {
    return;
  }
  const size = getStageSize();
  const targetX = player.x - size.width * 0.5;
  const targetY = player.y - size.height * 0.5;
  const t = immediate ? 1 : 1 - Math.pow(0.0008, Math.max(0.001, dt));
  runtime.cameraX += (targetX - runtime.cameraX) * t;
  runtime.cameraY += (targetY - runtime.cameraY) * t;
  world.position.set(-runtime.cameraX + runtime.shakeOffsetX, -runtime.cameraY + runtime.shakeOffsetY);
  const terrainKey = `${Math.floor(runtime.cameraX / TERRAIN_TILE_SIZE)}:${Math.floor(runtime.cameraY / TERRAIN_TILE_SIZE)}:${Math.ceil(size.width)}:${Math.ceil(size.height)}:${gameState.conqueror}:${runtime.finalBossPhase >= 3}`;
  if (terrainKey !== runtime.terrainKey) {
    runtime.terrainKey = terrainKey;
    drawWorldTerrain();
  }
}

function initPools() {
  runtime.projectilePool = new ObjectPool(() => new Projectile(), 220);
  runtime.enemyPool = new ObjectPool(() => new Enemy(), 180);

  for (const projectile of runtime.projectilePool.allCreated()) {
    runtime.projectileLayer?.addChild(projectile.sprite);
  }
  for (const enemy of runtime.enemyPool.allCreated()) {
    runtime.entityLayer?.addChild(enemy.sprite);
    runtime.healthBarLayer?.addChild(enemy.healthBar);
  }
}

function spawnEnemy(forceBoss = false, finalBoss = false) {
  const pool = runtime.enemyPool;
  const layer = runtime.entityLayer;
  if (!pool || !layer || runtime.enemies.length > 170) {
    return;
  }
  const viewport = getViewportBounds();
  const side = Math.floor(Math.random() * 4);
  const pad = finalBoss ? 100 : forceBoss ? 70 : 38;
  const rawX = side === 1 ? viewport.right + pad : side === 3 ? viewport.left - pad : randomFloat(viewport.left, viewport.right);
  const rawY = side === 0 ? viewport.top - pad : side === 2 ? viewport.bottom + pad : randomFloat(viewport.top, viewport.bottom);
  const x = rawX;
  const y = rawY;
  const kind: EnemyKind = forceBoss || finalBoss ? 'boss' : chooseEnemyKindForLevel(gameState.level);
  const elite = !forceBoss && !finalBoss && Math.random() < eliteChanceForLevel(gameState.level);
  const enemy = pool.acquire();
  if (!enemy.sprite.parent) {
    layer.addChild(enemy.sprite);
  }
  if (!enemy.healthBar.parent) {
    runtime.healthBarLayer?.addChild(enemy.healthBar);
  }
  enemy.spawn(x, y, gameState.level, kind, elite, finalBoss);
  runtime.enemies.push(enemy);

  if (finalBoss) {
    runtime.finalBossActive = true;
    runtime.finalBossPhase = 1;
    runtime.finalBossAbilityClock = 0;
    runtime.finalBossGuardTime = 0;
    runtime.finalBossGuardCooldown = 6.5;
    showBossPhaseAlert(1, enemy);
    shake(24);
    void runtime.audio?.play('ultimate_ready', true);
  } else if (kind === 'boss') {
    void runtime.audio?.play('spawn');
  }
}

function spawnEnemyAt(x: number, y: number, kind: EnemyKind, elite = false) {
  const pool = runtime.enemyPool;
  const layer = runtime.entityLayer;
  if (!pool || !layer || runtime.enemies.length > 170) {
    return null;
  }
  const enemy = pool.acquire();
  if (!enemy.sprite.parent) {
    layer.addChild(enemy.sprite);
  }
  if (!enemy.healthBar.parent) {
    runtime.healthBarLayer?.addChild(enemy.healthBar);
  }
  enemy.spawn(x, y, gameState.level, kind, elite, false);
  runtime.enemies.push(enemy);
  return enemy;
}

function drawWorldEvent(event: WorldEventNode) {
  const sprite = event.sprite;
  const pct = event.maxHp > 0 ? clamp(event.hp / event.maxHp, 0, 1) : 1;
  sprite.clear();
  sprite.lineStyle(3, event.bossGate ? 0xef3340 : event.started ? 0xef3340 : 0xffe45c, 0.78);
  sprite.beginFill(event.bossGate ? 0x260305 : event.started ? 0x3b0507 : 0x111113, 0.62);
  sprite.drawCircle(0, 0, event.radius);
  sprite.endFill();
  sprite.lineStyle(1, 0xffffff, 0.14);
  sprite.drawCircle(0, 0, event.radius + 8 + Math.sin(event.pulse * 6) * 4);

  if (event.kind === 'fakeScale') {
    sprite.beginFill(0x22262b);
    sprite.drawRect(-32, -20, 64, 42);
    sprite.endFill();
    sprite.beginFill(0x84cc16);
    sprite.drawRect(-24, -12, 48, 16);
    sprite.endFill();
    sprite.beginFill(0xef3340);
    sprite.drawRect(-18, -6, 8, 5);
    sprite.drawRect(10, -6, 8, 5);
    sprite.endFill();
    sprite.beginFill(0x050505, 0.88);
    sprite.drawRect(-35, 30, 70, 8);
    sprite.endFill();
    sprite.beginFill(0xffe45c, 0.9);
    sprite.drawRect(-35, 30, 70 * pct, 8);
    sprite.endFill();
  } else if (event.kind === 'fairWeight') {
    sprite.beginFill(0xffe45c);
    sprite.drawRect(-18, -28, 36, 16);
    sprite.drawRect(-28, -12, 56, 40);
    sprite.endFill();
    sprite.beginFill(0x75d64b);
    sprite.drawRect(-14, -2, 28, 8);
    sprite.endFill();
  } else if (event.kind === 'challengePledge') {
    sprite.beginFill(event.failed ? 0x3f1d1d : event.bossGate ? 0x450a0a : 0x1f2937, 0.88);
    sprite.drawRect(-38, -28, 76, 56);
    sprite.endFill();
    sprite.beginFill(event.failed ? 0xef3340 : event.bossGate ? 0xef3340 : 0xffe45c);
    sprite.drawRect(-24, -14, 48, 8);
    sprite.drawRect(-24, 2, 36, 8);
    sprite.drawRect(18, 14, 8, 8);
    sprite.endFill();
    if (event.bossGate) {
      sprite.beginFill(0xffe45c, 0.95);
      sprite.drawRect(-4, -40, 8, 12);
      sprite.drawRect(-18, -34, 36, 7);
      sprite.endFill();
    }
    if (event.started) {
      const timePct = clamp(event.timer / event.duration, 0, 1);
      sprite.beginFill(0x050505, 0.9);
      sprite.drawRect(-34, 32, 68, 8);
      sprite.endFill();
      sprite.beginFill(event.failed ? 0xef3340 : 0xffe45c, 0.96);
      sprite.drawRect(-34, 32, 68 * timePct, 8);
      sprite.endFill();
    }
  } else {
    sprite.beginFill(0xef3340, 0.82);
    sprite.drawRect(-30, -24, 60, 48);
    sprite.endFill();
    sprite.beginFill(0xffe45c);
    sprite.drawRect(-20, -12, 40, 8);
    sprite.drawRect(-20, 6, 40, 8);
    sprite.endFill();
    if (event.started) {
      const timePct = clamp(event.timer / event.duration, 0, 1);
      sprite.beginFill(0x050505, 0.9);
      sprite.drawRect(-34, 32, 68, 8);
      sprite.endFill();
      sprite.beginFill(0xef3340, 0.96);
      sprite.drawRect(-34, 32, 68 * timePct, 8);
      sprite.endFill();
    }
  }
  sprite.position.set(event.x, event.y);
  sprite.scale.set(1 + Math.sin(event.pulse * 5) * 0.025);
}

function randomEventPosition(distanceScale = 1) {
  const player = runtime.player;
  const angle = randomFloat(0, Math.PI * 2);
  const distance = randomFloat(EVENT_MIN_DISTANCE * distanceScale, EVENT_MAX_DISTANCE * distanceScale);
  return {
    x: (player?.x ?? 0) + Math.cos(angle) * distance,
    y: (player?.y ?? 0) + Math.sin(angle) * distance,
  };
}

function spawnWorldEvent(forceKind?: WorldEventKind, bossGate = false) {
  const layer = runtime.eventLayer;
  if (!layer || runtime.worldEvents.some((event) => event.active)) {
    return;
  }
  const kinds: WorldEventKind[] =
    gameState.level >= 8
      ? ['fakeScale', 'fairWeight', 'marketAmbush', 'challengePledge']
      : gameState.level >= 6
        ? ['fakeScale', 'fairWeight', 'challengePledge']
        : ['fakeScale', 'fairWeight'];
  const kind = forceKind ?? kinds[Math.floor(Math.random() * kinds.length)];
  const isBossGate = bossGate || (kind === 'challengePledge' && gameState.level >= FINAL_BOSS_LEVEL && runtime.bossGatePending);
  const pos = randomEventPosition(isBossGate ? 1.12 : 1);
  const sprite = new PIXI.Graphics();
  layer.addChild(sprite);
  const duration = isBossGate ? 26 : kind === 'marketAmbush' ? 24 : kind === 'challengePledge' ? 18 : 0;
  const event: WorldEventNode = {
    id: allocateGameId(),
    kind,
    sprite,
    x: pos.x,
    y: pos.y,
    radius: isBossGate ? 88 : kind === 'marketAmbush' || kind === 'challengePledge' ? 72 : 58,
    hp: kind === 'fakeScale' ? 140 + gameState.level * 28 : 1,
    maxHp: kind === 'fakeScale' ? 140 + gameState.level * 28 : 1,
    timer: duration,
    duration,
    spawnPulse: 0,
    pulse: 0,
    started: false,
    failed: false,
    bossGate: isBossGate,
    active: true,
  };
  drawWorldEvent(event);
  runtime.worldEvents.push(event);
  showSubtitle(isBossGate ? copy.value.bossKeyMissing : copy.value.events[kind].title);
  if (kind === 'fakeScale') {
    for (let i = 0; i < 2; i += 1) {
      const angle = randomFloat(0, Math.PI * 2);
      spawnEnemyAt(event.x + Math.cos(angle) * 190, event.y + Math.sin(angle) * 190, 'scaleWeight', gameState.level >= 10);
    }
  }
}

function tribunalRewardForHealth(healthRatio: number): {
  id: TribunalRewardId;
  multiplier: number;
  luck: number;
  heal: number;
  temper: number;
  perfect: boolean;
} {
  const ratio = clamp(healthRatio, 0, 1);
  if (ratio >= 0.995) {
    return { id: 'perfect', multiplier: 1, luck: 4, heal: 18, temper: 30, perfect: true };
  }
  if (ratio >= 0.8) {
    return { id: 'great', multiplier: 0.85, luck: 3, heal: 14, temper: 24, perfect: false };
  }
  if (ratio >= 0.5) {
    return { id: 'pass', multiplier: 0.6, luck: 2, heal: 10, temper: 16, perfect: false };
  }
  return { id: 'barely', multiplier: 0.3, luck: 1, heal: 6, temper: 10, perfect: false };
}

function completeWorldEvent(event: WorldEventNode) {
  if (!event.active) {
    return;
  }
  event.active = false;
  const eventCopy = copy.value.events[event.kind];
  if (event.kind !== 'challengePledge') {
    showSubtitle(eventCopy.complete);
  }
  if (event.kind === 'fakeScale') {
    gainExp(140 + gameState.level * 22);
    gameState.luck += 3;
    addLandmarkBadge(event.kind, 'magnet');
    upgradeOwnedCardFromLandmark(['magnet', dominantFaction.value ?? 'core']);
    emitJuice(event.x, event.y, 0xffe45c, 48);
    spawnMagnetVortex(event.x, event.y);
  } else if (event.kind === 'fairWeight') {
    gainExp(95 + gameState.level * 14);
    gameState.health = clamp(gameState.health + 24, 0, gameState.maxHealth);
    gameState.luck += 2;
    tuning.damageReduction = clamp(tuning.damageReduction + 0.015, 0, 0.5);
    addLandmarkBadge(event.kind, 'survival');
    emitJuice(event.x, event.y, 0x75d64b, 36);
    for (let i = 0; i < 2; i += 1) {
      const angle = randomFloat(0, Math.PI * 2);
      spawnEnemyAt(event.x + Math.cos(angle) * 220, event.y + Math.sin(angle) * 220, 'vendor', false);
    }
  } else if (event.kind === 'marketAmbush') {
    gainExp(180 + gameState.level * 26);
    addTemper(24);
    runtime.landmarkBurstTime = 12;
    runtime.landmarkBurstDamage = 0.22;
    runtime.landmarkBurstFireRate = 0.18;
    addLandmarkBadge(event.kind, 'temper');
    showSubtitle(copy.value.temporaryBurst);
    emitJuice(event.x, event.y, 0xef3340, 54);
  } else {
    const healthRatio = gameState.maxHealth > 0 ? gameState.health / gameState.maxHealth : 0;
    const reward = tribunalRewardForHealth(healthRatio);
    gainExp(Math.round((220 + gameState.level * 28) * reward.multiplier));
    gameState.health = clamp(gameState.health + reward.heal, 0, gameState.maxHealth);
    gameState.luck += reward.luck;
    addTemper(reward.temper);
    const badgeFaction = reward.perfect || reward.id === 'great' ? 'rare' : reward.id === 'pass' ? 'temper' : 'survival';
    const burstColor = reward.perfect ? 0xffe45c : reward.id === 'great' ? 0xfacc15 : reward.id === 'pass' ? 0x75d64b : 0xa1a1aa;
    const burstCount = reward.perfect ? 62 : reward.id === 'great' ? 48 : reward.id === 'pass' ? 36 : 24;
    addLandmarkBadge(event.kind, badgeFaction);
    showSubtitle(`${eventCopy.complete} ${copy.value.tribunalRewards[reward.id]}`);
    emitJuice(event.x, event.y, burstColor, burstCount);
    if (reward.perfect) {
      upgradeOwnedCardFromLandmark(['fire', 'temper', dominantFaction.value ?? 'core']);
      showSubtitle(copy.value.rareVoice);
      void runtime.audio?.play('critical_hit', true);
      triggerSignatureMoment('challengePerfect', 'green');
      incrementMetaProfile('perfectChallenges');
    }
    if (event.bossGate) {
      runtime.bossGatePending = false;
      runtime.bossGateCleared = true;
      runtime.finalBossPending = true;
      showSubtitle(copy.value.bossKeyReady);
      void runtime.audio?.play('ultimate_ready', true);
    }
  }
  runStats.eventsCompleted += 1;
  incrementMetaProfile('eventsCompleted');
  checkRunObjectiveCompletion();
  shake(16);
  event.sprite.destroy();
  runtime.worldEvents = runtime.worldEvents.filter((item) => item !== event);
  runtime.nextEventDelay = randomFloat(32, 46);
  runtime.eventClock = 0;
  if (runtime.finalBossPending && runtime.bossGateCleared && !runtime.finalBossActive && !runtime.finalBossDefeated) {
    runtime.finalBossPending = false;
    spawnEnemy(true, true);
  }
}

function updateWorldEvents(dt: number) {
  if (!runtime.worldEvents.some((event) => event.active)) {
    if (runtime.bossGatePending && !runtime.bossGateCleared && !runtime.finalBossActive && !runtime.finalBossDefeated) {
      runtime.eventClock = 0;
      spawnWorldEvent('challengePledge', true);
      return;
    }
    runtime.eventClock += dt;
    if (runtime.eventClock >= runtime.nextEventDelay) {
      runtime.eventClock = 0;
      spawnWorldEvent();
    }
    return;
  }

  const player = runtime.player;
  for (const event of [...runtime.worldEvents]) {
    if (!event.active) {
      continue;
    }
    event.pulse += dt;
    drawWorldEvent(event);
    if (!player) {
      continue;
    }

    const playerClose = distanceSq(player.x, player.y, event.x, event.y) <= (player.radius + event.radius) ** 2;
    if (event.kind === 'fairWeight' && playerClose) {
      completeWorldEvent(event);
      continue;
    }
    if (event.kind === 'marketAmbush') {
      if (!event.started && distanceSq(player.x, player.y, event.x, event.y) <= 128 * 128) {
        event.started = true;
        event.spawnPulse = 0.2;
        showSubtitle(copy.value.events.marketAmbush.title);
      }
      if (event.started) {
        event.timer = Math.max(0, event.timer - dt);
        event.spawnPulse -= dt;
        if (event.spawnPulse <= 0) {
          event.spawnPulse = runtime.finalBossActive ? 1.6 : 2.2;
          for (let i = 0; i < 3; i += 1) {
            const angle = randomFloat(0, Math.PI * 2);
            spawnEnemyAt(event.x + Math.cos(angle) * 170, event.y + Math.sin(angle) * 170, chooseEnemyKindForLevel(gameState.level), gameState.level >= 10 && Math.random() < 0.18);
          }
        }
        if (event.timer <= 0) {
          completeWorldEvent(event);
        }
      }
    }
    if (event.kind === 'challengePledge') {
      if (!event.started && distanceSq(player.x, player.y, event.x, event.y) <= 128 * 128) {
        event.started = true;
        event.spawnPulse = event.bossGate ? 0.75 : 1.1;
        showSubtitle(event.bossGate ? copy.value.bossKeyMissing : copy.value.events.challengePledge.title);
      }
      if (event.started) {
        event.timer = Math.max(0, event.timer - dt);
        event.spawnPulse -= dt;
        if (event.spawnPulse <= 0) {
          event.spawnPulse = event.bossGate ? 2.35 : 3.6;
          const count = event.bossGate ? 3 : gameState.level >= 12 ? 2 : 1;
          for (let i = 0; i < count; i += 1) {
            const angle = randomFloat(0, Math.PI * 2);
            const distance = randomFloat(210, 280);
            spawnEnemyAt(
              event.x + Math.cos(angle) * distance,
              event.y + Math.sin(angle) * distance,
              chooseEnemyKindForLevel(Math.max(1, gameState.level - 2)),
              false,
            );
          }
        }
        if (event.timer <= 0) {
          completeWorldEvent(event);
        }
      }
    }
  }
}

function releaseEnemy(index: number) {
  const enemy = runtime.enemies[index];
  runtime.enemyPool?.release(enemy);
  runtime.enemies.splice(index, 1);
}

function releaseProjectile(index: number) {
  const projectile = runtime.projectiles[index];
  runtime.projectilePool?.release(projectile);
  runtime.projectiles.splice(index, 1);
}

function projectileBuildDamageScale() {
  let scale = gameState.conqueror ? 1.35 : 1;
  if (runtime.landmarkBurstTime > 0) {
    scale *= 1 + runtime.landmarkBurstDamage;
  }
  if (hasUpgrade('combo-dealer')) {
    const archetypeCount = (['fire', 'ice', 'magnet', 'temper', 'survival', 'growth'] as UpgradeFaction[]).reduce(
      (total, faction) => total + (factionCounts.value[faction] > 0 ? 1 : 0),
      0,
    );
    scale *= 1 + archetypeCount * 0.045;
  }
  return scale;
}

function spawnProjectileInDirection(direction: Vector2, playThrowEffect = true) {
  const pool = runtime.projectilePool;
  const layer = runtime.projectileLayer;
  const player = runtime.player;
  if (!pool || !layer || !player || runtime.fireCooldown > 0) {
    return;
  }

  const isRipe = Math.random() < clamp(tuning.ripeBaseChance + gameState.luck * 0.006, 0.08, 0.92);
  const projectile = pool.acquire();
  if (!projectile.sprite.parent) {
    layer.addChild(projectile.sprite);
  }
  projectile.spawn(player.x, player.y, direction, isRipe, projectileBuildDamageScale(), tuning);
  runtime.projectiles.push(projectile);
  runtime.fireCooldown = currentFireCooldown();
  if (playThrowEffect) {
    void runtime.audio?.playEffect('spawn');
  }
}

function spawnSplitProjectiles(source: Projectile, x: number, y: number) {
  const pool = runtime.projectilePool;
  const layer = runtime.projectileLayer;
  if (!pool || !layer || source.splitDepth > 0) {
    return;
  }
  for (const angleOffset of [-0.54, 0.54]) {
    const cos = Math.cos(angleOffset);
    const sin = Math.sin(angleOffset);
    const direction = {
      x: source.direction.x * cos - source.direction.y * sin,
      y: source.direction.x * sin + source.direction.y * cos,
    };
    const projectile = pool.acquire();
    if (!projectile.sprite.parent) {
      layer.addChild(projectile.sprite);
    }
    projectile.spawn(x, y, normalize(direction.x, direction.y), source.isRipe, projectileBuildDamageScale(), tuning, source.splitDepth + 1);
    runtime.projectiles.push(projectile);
  }
}

function spawnProjectile(targetX: number, targetY: number, playThrowEffect = true) {
  const player = runtime.player;
  if (!player) {
    return;
  }
  const target = screenToWorld(targetX, targetY);
  const direction = normalize(target.x - player.x, target.y - player.y);
  runtime.lastAimDirection = direction;
  spawnProjectileInDirection(direction, playThrowEffect);
}

function keyboardAimDirection() {
  const player = runtime.player;
  if (!player) {
    return runtime.lastAimDirection;
  }

  let target: Vector2 | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const enemy of runtime.enemies) {
    if (!enemy.active) {
      continue;
    }
    const dist = distanceSq(player.x, player.y, enemy.x, enemy.y);
    if (dist < nearestDistance) {
      target = { x: enemy.x, y: enemy.y };
      nearestDistance = dist;
    }
  }

  for (const event of runtime.worldEvents) {
    if (!event.active || event.kind !== 'fakeScale') {
      continue;
    }
    const dist = distanceSq(player.x, player.y, event.x, event.y);
    if (dist < nearestDistance) {
      target = { x: event.x, y: event.y };
      nearestDistance = dist;
    }
  }

  return target ? normalize(target.x - player.x, target.y - player.y) : runtime.lastAimDirection;
}

function spawnKeyboardProjectile(playThrowEffect = true) {
  const direction = keyboardAimDirection();
  runtime.lastAimDirection = direction;
  spawnProjectileInDirection(direction, playThrowEffect);
}

function ensureJuiceParticle(color: number) {
  const layer = runtime.juiceLayer;
  if (!layer) {
    return null;
  }
  const particle = runtime.freeParticles.pop();
  if (particle) {
    particle.particle.tint = color;
    particle.particle.alpha = 1;
    return particle;
  }
  const pixiParticle = new PIXI.Particle({
    texture: PIXI.Texture.WHITE,
    anchorX: 0.5,
    anchorY: 0.5,
    scaleX: 5,
    scaleY: 5,
    tint: color,
    alpha: 0,
  });
  layer.addParticle(pixiParticle);
  return { particle: pixiParticle, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0 } satisfies JuiceParticle;
}

function emitJuice(x: number, y: number, color: number, count: number) {
  for (let i = 0; i < count; i += 1) {
    const particle = ensureJuiceParticle(color);
    if (!particle) {
      return;
    }
    const angle = randomFloat(0, Math.PI * 2);
    const speed = randomFloat(80, 360);
    particle.x = x;
    particle.y = y;
    particle.vx = Math.cos(angle) * speed;
    particle.vy = Math.sin(angle) * speed;
    particle.maxLife = randomFloat(0.2, 0.58);
    particle.life = particle.maxLife;
    particle.particle.x = x;
    particle.particle.y = y;
    const scale = randomFloat(3.5, 8);
    particle.particle.scaleX = scale;
    particle.particle.scaleY = scale;
    particle.particle.alpha = 1;
    runtime.particles.push(particle);
  }
}

function updateParticles(dt: number) {
  for (let i = runtime.particles.length - 1; i >= 0; i -= 1) {
    const particle = runtime.particles[i];
    particle.life -= dt;
    if (particle.life <= 0) {
      particle.particle.alpha = 0;
      runtime.particles.splice(i, 1);
      runtime.freeParticles.push(particle);
      continue;
    }
    particle.vx *= 0.93;
    particle.vy = particle.vy * 0.93 + 420 * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.particle.x = particle.x;
    particle.particle.y = particle.y;
    particle.particle.alpha = particle.life / particle.maxLife;
  }
}

function damageColor(kind: DamageKind) {
  if (kind === 'critical') return 0xfff1a8;
  if (kind === 'fire') return 0xff8a1f;
  if (kind === 'ice' || kind === 'shatter') return 0x9be7ff;
  return 0xffffff;
}

function ensureDamageText() {
  const layer = runtime.damageTextLayer;
  if (!layer) {
    return null;
  }
  const existing = runtime.freeDamageTexts.pop();
  if (existing) {
    existing.label.visible = true;
    existing.label.alpha = 1;
    return existing;
  }

  const label = new PIXI.Text({
    text: '',
    style: {
      fontFamily: 'Courier New, monospace',
      fontSize: 16,
      fontWeight: '900',
      fill: 0xffffff,
    },
  });
  label.anchor.set(0.5);
  layer.addChild(label);
  return { label, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0 } satisfies DamageText;
}

function showDamageText(x: number, y: number, amount: number, kind: DamageKind) {
  if (amount <= 0) {
    return;
  }
  const item = ensureDamageText();
  if (!item) {
    return;
  }
  item.x = x + randomFloat(-9, 9);
  item.y = y - randomFloat(4, 14);
  item.vx = randomFloat(-18, 18);
  item.vy = kind === 'critical' || kind === 'shatter' ? -86 : -66;
  item.life = kind === 'critical' || kind === 'shatter' ? 0.82 : 0.62;
  item.maxLife = item.life;
  item.label.text = `-${Math.max(1, Math.round(amount))}`;
  item.label.tint = damageColor(kind);
  item.label.alpha = 1;
  item.label.scale.set(kind === 'critical' || kind === 'shatter' ? 1.28 : 1);
  item.label.position.set(item.x, item.y);
  runtime.damageTexts.push(item);
}

function updateDamageTexts(dt: number) {
  for (let i = runtime.damageTexts.length - 1; i >= 0; i -= 1) {
    const item = runtime.damageTexts[i];
    item.life -= dt;
    if (item.life <= 0) {
      item.label.visible = false;
      runtime.damageTexts.splice(i, 1);
      runtime.freeDamageTexts.push(item);
      continue;
    }
    item.vy += 95 * dt;
    item.x += item.vx * dt;
    item.y += item.vy * dt;
    const pct = item.life / item.maxLife;
    item.label.alpha = clamp(pct * 1.2, 0, 1);
    item.label.position.set(item.x, item.y);
  }
}

function applyEnemyDamage(enemy: Enemy, amount: number, kind: DamageKind, show = true) {
  if (amount <= 0 || !enemy.active) {
    return;
  }
  enemy.hp = Math.max(0, enemy.hp - amount);
  enemy.updateHealthBar();
  if (show) {
    showDamageText(enemy.x, enemy.y - enemy.radius, amount, kind);
  }
}

function damageSourceForEnemy(enemy: Enemy): DamageSourceId {
  if (enemy.finalBoss || enemy.kind === 'boss') {
    return 'bossContact';
  }
  if (enemy.kind === 'vendor') {
    return 'vendorContact';
  }
  if (enemy.kind === 'scaleWeight') {
    return 'scaleWeightContact';
  }
  return 'thugContact';
}

function showPlayerDamageAlert(amount: number, source: DamageSourceId, sourceX: number, sourceY: number) {
  const player = runtime.player;
  const direction = player ? directionSymbol(sourceX - player.x, sourceY - player.y) : '•';
  const log: PlayerDamageLog = {
    id: allocateGameId(),
    amount,
    source,
    direction,
    hpAfter: gameState.health,
  };
  damageLogs.value = [log, ...damageLogs.value].slice(0, 4);
  damageAlert.amount = amount;
  damageAlert.source = source;
  damageAlert.direction = direction;
  damageAlert.hpAfter = gameState.health;
  damageAlert.visible = true;

  if (runtime.damageAlertTimer) {
    window.clearTimeout(runtime.damageAlertTimer);
  }
  runtime.damageAlertTimer = window.setTimeout(() => {
    damageAlert.visible = false;
    runtime.damageAlertTimer = 0;
  }, 1700);
}

function damagePlayer(
  amount: number,
  sourceX: number,
  sourceY: number,
  temperGain: number,
  invulnTime = 0.42,
  knockback = 620,
  source: DamageSourceId = 'thugContact',
) {
  const player = runtime.player;
  if (!player || player.invulnTime > 0 || gameOverOpen.value) {
    return false;
  }
  player.invulnTime = invulnTime + (hasUpgrade('rind-armor') ? 0.1 : 0);
  const damage = Math.max(1, amount * tuning.riskDamageTakenMultiplier * (1 - tuning.damageReduction));
  gameState.health = clamp(gameState.health - damage, 0, gameState.maxHealth);
  runStats.damageTaken += damage;
  runDamageBySource[source] += damage;
  showPlayerDamageAlert(damage, source, sourceX, sourceY);
  for (const event of runtime.worldEvents) {
    if (event.active && event.kind === 'challengePledge' && event.started && !event.failed) {
      event.failed = true;
      showSubtitle(copy.value.objectiveRewardReduced);
      drawWorldEvent(event);
    }
  }
  const lowHealthBonus = hasUpgrade('last-stand-temper') && gameState.health / gameState.maxHealth <= 0.35 ? 1.45 : 1;
  addTemper(temperGain * lowHealthBonus);
  const away = normalize(player.x - sourceX, player.y - sourceY);
  player.vx += away.x * knockback;
  player.vy += away.y * knockback;
  emitJuice(player.x, player.y, 0xfacc15, 12);
  showDamageText(player.x, player.y - player.radius, damage, 'normal');
  shake(Math.max(8, Math.min(18, damage)));
  if (gameState.health <= 0) {
    gameOverOpen.value = true;
    runtime.app?.ticker.stop();
  }
  return true;
}

function fireDamageMultiplier() {
  let multiplier = gameState.conqueror && hasUpgrade('flame-debt') ? 2 : 1;
  if (archetypeOnline('fire')) {
    multiplier *= archetypeFinisher('fire') ? 1.42 : 1.22;
  }
  if (runtime.landmarkBurstTime > 0) {
    multiplier *= 1 + runtime.landmarkBurstDamage * 0.7;
  }
  return multiplier;
}

function iceControlMultiplier() {
  if (!archetypeOnline('ice')) {
    return 1;
  }
  return archetypeFinisher('ice') ? 1.38 : 1.18;
}

function igniteEnemy(enemy: Enemy, duration: number, damagePerSecond: number) {
  enemy.burnTime = Math.max(enemy.burnTime, duration);
  enemy.burnDamagePerSecond = Math.max(enemy.burnDamagePerSecond, damagePerSecond * fireDamageMultiplier());
  enemy.burnPulse = Math.max(enemy.burnPulse, 0.08);
  enemy.sprite.tint = 0xffa040;
  void runtime.audio?.playEffect('burn_tick', 260);
  if (hasUpgrade('steam-burst') && (enemy.slowTime > 0 || enemy.freezeTime > 0) && enemy.steamCooldown <= 0) {
    enemy.steamCooldown = 0.78;
    triggerSteamBurst(enemy.x, enemy.y);
  }
}

function applySlow(enemy: Enemy, duration: number, multiplier: number) {
  enemy.slowTime = Math.max(enemy.slowTime, duration * iceControlMultiplier());
  enemy.slowMultiplier = Math.min(enemy.slowMultiplier, multiplier);
  enemy.sprite.tint = enemy.freezeTime > 0 ? 0x9be7ff : 0xbdefff;
}

function freezeEnemy(enemy: Enemy, duration: number) {
  if (enemy.kind === 'boss') {
    applySlow(enemy, duration * 2.2, 0.42);
    return;
  }
  const scaledDuration = duration * iceControlMultiplier();
  enemy.freezeTime = Math.max(enemy.freezeTime, scaledDuration);
  enemy.slowTime = Math.max(enemy.slowTime, scaledDuration);
  enemy.slowMultiplier = Math.min(enemy.slowMultiplier, 0.12);
  enemy.sprite.tint = 0x9be7ff;
}

function spawnBurnZone(x: number, y: number) {
  const layer = runtime.effectLayer;
  if (!layer) {
    return;
  }
  const sprite = new PIXI.Graphics();
  sprite.beginFill(0xff5a1f, 0.18);
  sprite.drawCircle(0, 0, 42);
  sprite.endFill();
  sprite.lineStyle(3, 0xfacc15, 0.5);
  sprite.drawCircle(0, 0, 42);
  sprite.beginFill(0xef3340, 0.72);
  sprite.drawRect(-6, -28, 12, 20);
  sprite.drawRect(-20, -12, 10, 18);
  sprite.drawRect(12, -9, 10, 18);
  sprite.endFill();
  sprite.position.set(x, y);
  layer.addChild(sprite);
  void runtime.audio?.playEffect('enemy_launch', 180);
  void runtime.audio?.playEffect('burn_tick', 260);
  runtime.burnZones.push({
    sprite,
    x,
    y,
    radius: 58,
    damagePerSecond: 12 * fireDamageMultiplier(),
    life: 2.5,
    maxLife: 2.5,
    pulse: 0,
    damageTick: 0.28,
  });
}

function spawnPriceTrap(x: number, y: number) {
  const layer = runtime.effectLayer;
  if (!layer || runtime.priceTraps.length >= 6) {
    return;
  }
  const sprite = new PIXI.Graphics();
  sprite.beginFill(0x111113, 0.74);
  sprite.drawCircle(0, 0, 44);
  sprite.endFill();
  sprite.lineStyle(3, 0xffe45c, 0.72);
  sprite.drawCircle(0, 0, 44);
  sprite.beginFill(0xef3340, 0.82);
  sprite.drawRect(-28, -18, 56, 30);
  sprite.endFill();
  sprite.beginFill(0xffe45c, 0.95);
  sprite.drawRect(-18, -8, 36, 6);
  sprite.drawRect(-18, 4, 28, 6);
  sprite.endFill();
  sprite.position.set(x, y);
  layer.addChild(sprite);
  void runtime.audio?.playEffect('enemy_launch', 160);
  runtime.priceTraps.push({
    sprite,
    x,
    y,
    radius: 46,
    life: 3.8,
    maxLife: 3.8,
    pulse: 0,
    damageTick: 0.32,
  });
}

function updatePriceTraps(dt: number) {
  const player = runtime.player;
  for (let i = runtime.priceTraps.length - 1; i >= 0; i -= 1) {
    const trap = runtime.priceTraps[i];
    trap.life -= dt;
    if (trap.life <= 0) {
      trap.sprite.destroy();
      runtime.priceTraps.splice(i, 1);
      continue;
    }

    trap.pulse += dt;
    trap.damageTick -= dt;
    trap.sprite.alpha = clamp(trap.life / trap.maxLife, 0, 1);
    trap.sprite.rotation = Math.sin(trap.pulse * 3) * 0.03;
    trap.sprite.scale.set(1 + Math.sin(trap.pulse * 7) * 0.035);

    if (!player || distanceSq(player.x, player.y, trap.x, trap.y) > trap.radius * trap.radius) {
      continue;
    }
    runtime.playerSlowTime = Math.max(runtime.playerSlowTime, 0.2);
    if (trap.damageTick <= 0) {
      trap.damageTick = 0.58;
      void runtime.audio?.playEffect('trap_tick', 240);
      damagePlayer(4 + gameState.level * 0.28, trap.x, trap.y, 4, 0.22, 150, 'priceTrap');
    }
  }
}

function triggerSteamBurst(x: number, y: number) {
  emitJuice(x, y, 0xbdefff, 18);
  emitJuice(x, y, 0xffa040, 12);
  void runtime.audio?.playEffect('enemy_explode', 240);
  shake(8);
  for (const nearby of runtime.enemies) {
    if (!nearby.active || distanceSq(nearby.x, nearby.y, x, y) > 76 * 76) {
      continue;
    }
    applyEnemyDamage(nearby, 18 + gameState.level * 1.4, 'ice');
    applySlow(nearby, 0.85, 0.72);
  }
}

function explodeMagnetIgnition(magnet: MagnetVortex) {
  if (!hasUpgrade('black-hole-ignition')) {
    return;
  }
  let triggered = false;
  for (const enemy of runtime.enemies) {
    if (!enemy.active || enemy.burnTime <= 0 || distanceSq(enemy.x, enemy.y, magnet.x, magnet.y) > magnet.radius * magnet.radius) {
      continue;
    }
    triggered = true;
    applyEnemyDamage(enemy, 24 + gameState.level * 1.6, 'fire');
    igniteEnemy(enemy, 1.2, 10);
  }
  if (triggered) {
    emitJuice(magnet.x, magnet.y, 0xff7a1a, 42);
    void runtime.audio?.playEffect('enemy_explode', 260);
    shake(12);
    hitStop(45);
  }
}

function updateBurnZones(dt: number) {
  for (let i = runtime.burnZones.length - 1; i >= 0; i -= 1) {
    const zone = runtime.burnZones[i];
    zone.life -= dt;
    if (zone.life <= 0) {
      zone.sprite.destroy();
      runtime.burnZones.splice(i, 1);
      continue;
    }

    zone.pulse += dt;
    zone.damageTick -= dt;
    const showTick = zone.damageTick <= 0;
    if (showTick) {
      zone.damageTick = 0.34;
    }
    const pct = zone.life / zone.maxLife;
    zone.sprite.alpha = clamp(pct, 0, 1);
    zone.sprite.scale.set(1 + Math.sin(zone.pulse * 9) * 0.04);

    for (const enemy of runtime.enemies) {
      if (!enemy.active || distanceSq(enemy.x, enemy.y, zone.x, zone.y) > zone.radius * zone.radius) {
        continue;
      }
      applyEnemyDamage(enemy, zone.damagePerSecond * dt, 'fire', false);
      if (showTick) {
        void runtime.audio?.playEffect('burn_tick', 260);
        showDamageText(enemy.x, enemy.y - enemy.radius, zone.damagePerSecond * 0.34, 'fire');
      }
      igniteEnemy(enemy, 0.35, zone.damagePerSecond * 0.35);
    }
  }
}

function updateEnemyStatuses(dt: number) {
  for (const enemy of runtime.enemies) {
    if (!enemy.active) {
      continue;
    }
    if (enemy.burnTime > 0) {
      enemy.burnTime = Math.max(0, enemy.burnTime - dt);
      applyEnemyDamage(enemy, enemy.burnDamagePerSecond * dt, 'fire', false);
      enemy.burnPulse -= dt;
      if (enemy.burnPulse <= 0) {
        enemy.burnPulse = 0.14;
        emitJuice(enemy.x, enemy.y, 0xff7a1a, 2);
        void runtime.audio?.playEffect('burn_tick', 260);
        showDamageText(enemy.x, enemy.y - enemy.radius, enemy.burnDamagePerSecond * 0.14, 'fire');
      }
    }
    if (enemy.freezeTime > 0) {
      enemy.freezeTime = Math.max(0, enemy.freezeTime - dt);
    }
    if (enemy.steamCooldown > 0) {
      enemy.steamCooldown = Math.max(0, enemy.steamCooldown - dt);
    }
    if (enemy.slowTime > 0) {
      enemy.slowTime = Math.max(0, enemy.slowTime - dt);
      if (enemy.slowTime <= 0) {
        enemy.slowMultiplier = 1;
      }
    }

    if (enemy.freezeTime > 0) {
      enemy.sprite.tint = 0x9be7ff;
    } else if (enemy.slowTime > 0) {
      enemy.sprite.tint = 0xbdefff;
    } else if (enemy.burnTime > 0) {
      enemy.sprite.tint = 0xffa040;
    } else {
      enemy.sprite.tint = 0xffffff;
      enemy.burnDamagePerSecond = 0;
    }
  }
}

function spawnMagnetVortex(x: number, y: number) {
  const layer = runtime.magnetLayer;
  if (!layer) {
    return;
  }
  const sprite = new PIXI.Graphics();
  sprite.beginFill(0x000000, 0.86);
  sprite.drawCircle(0, 0, 18);
  sprite.endFill();
  sprite.lineStyle(3, 0x38bdf8, 0.9);
  sprite.drawCircle(0, 0, 31);
  sprite.lineStyle(2, 0xfacc15, 0.85);
  sprite.moveTo(-20, 0);
  sprite.lineTo(20, 0);
  sprite.moveTo(0, -20);
  sprite.lineTo(0, 20);
  sprite.position.set(x, y);
  layer.addChild(sprite);
  const magnetMultiplier = archetypeOnline('magnet') ? (archetypeFinisher('magnet') ? 1.32 : 1.16) : 1;
  runtime.magnets.push({
    sprite,
    x,
    y,
    radius: tuning.magnetRadius * magnetMultiplier,
    life: 1.25,
    maxLife: 1.25,
    strength: tuning.magnetStrength * magnetMultiplier,
  });
}

function updateMagnets(dt: number) {
  for (let i = runtime.magnets.length - 1; i >= 0; i -= 1) {
    const magnet = runtime.magnets[i];
    magnet.life -= dt;
    if (magnet.life <= 0) {
      explodeMagnetIgnition(magnet);
      magnet.sprite.destroy();
      runtime.magnets.splice(i, 1);
      continue;
    }
    const pct = 1 - magnet.life / magnet.maxLife;
    magnet.sprite.rotation += dt * 8;
    magnet.sprite.scale.set(1 + pct * 2.4);
    magnet.sprite.alpha = magnet.life / magnet.maxLife;

    for (const enemy of runtime.enemies) {
      if (!enemy.active || !enemy.metal) {
        continue;
      }
      const distSq = distanceSq(enemy.x, enemy.y, magnet.x, magnet.y);
      if (distSq > magnet.radius * magnet.radius) {
        continue;
      }
      const direction = normalize(magnet.x - enemy.x, magnet.y - enemy.y);
      const falloff = 1 - Math.sqrt(distSq) / magnet.radius;
      const statusPull = hasUpgrade('frozen-scale-effect') && (enemy.slowTime > 0 || enemy.freezeTime > 0) ? 1.65 : 1;
      enemy.vx += direction.x * magnet.strength * statusPull * falloff * dt;
      enemy.vy += direction.y * magnet.strength * statusPull * falloff * dt;
      if (archetypeFinisher('magnet')) {
        applyEnemyDamage(enemy, (5 + gameState.level * 0.45) * falloff * dt, 'normal', false);
      }
      if (hasUpgrade('weight-collision') && enemy.metal && (enemy.slowTime > 0 || enemy.freezeTime > 0)) {
        enemy.magnetDamagePulse -= dt;
        applyEnemyDamage(enemy, (8 + gameState.level * 0.8) * falloff * dt, 'ice', false);
        if (enemy.magnetDamagePulse <= 0) {
          enemy.magnetDamagePulse = 0.22;
          showDamageText(enemy.x, enemy.y - enemy.radius, (8 + gameState.level * 0.8) * 0.22, 'ice');
        }
      }
    }
  }
}

function damageEnemy(enemy: Enemy, projectile: Projectile) {
  const critical = projectile.isRipe;
  const wasChilled = enemy.slowTime > 0 || enemy.freezeTime > 0;
  let damage = critical ? projectile.damage * tuning.criticalMultiplier : projectile.damage;
  let damageKind: DamageKind = critical ? 'critical' : 'normal';
  if (critical && wasChilled && hasUpgrade('shatter-crit')) {
    damage += 26 + gameState.level * 2;
    damageKind = 'shatter';
    emitJuice(enemy.x, enemy.y, 0x9be7ff, enemy.kind === 'boss' ? 26 : 10);
    shake(7);
  }
  if (wasChilled && archetypeFinisher('ice')) {
    damage += 10 + gameState.level * 1.1;
    damageKind = damageKind === 'normal' ? 'ice' : damageKind;
  }
  addTemper(critical ? 8 : 4);
  if (critical) {
    runtime.ripeHitChain += 1;
    runStats.ripeHits += 1;
    incrementMetaProfile('ripeHits');
    updateMetaMaxRipeChain(runtime.ripeHitChain);
    checkRunObjectiveCompletion();
    if (runtime.ripeHitChain === 6 || (runtime.ripeHitChain > 6 && runtime.ripeHitChain % 12 === 0)) {
      triggerSignatureMoment('ripeStreak', 'red');
    }
  } else {
    runtime.ripeHitChain = 0;
  }

  if (critical) {
    void runtime.audio?.play('critical_hit');
    emitJuice(enemy.x, enemy.y, 0xef3340, enemy.kind === 'boss' ? 44 : 18);
    if (hasUpgrade('fire-roasted-melon') || (archetypeFinisher('fire') && Math.random() < 0.35)) {
      spawnBurnZone(enemy.x, enemy.y);
    }
    if (hasUpgrade('juice-combustion')) {
      for (const nearby of runtime.enemies) {
        if (!nearby.active || nearby === enemy || distanceSq(nearby.x, nearby.y, enemy.x, enemy.y) > 86 * 86) {
          continue;
        }
        igniteEnemy(nearby, 2.1, 11);
      }
    }
    shake(11);
    hitStop(50);
  } else {
    const away = normalize(enemy.x - projectile.x, enemy.y - projectile.y);
    enemy.vx += away.x * projectile.knockbackForce;
    enemy.vy += away.y * projectile.knockbackForce;
    emitJuice(enemy.x, enemy.y, 0x67b84d, enemy.kind === 'boss' ? 28 : 12);
    if (hasUpgrade('ice-chilled-melon')) {
      applySlow(enemy, 1.8, 0.65);
      emitJuice(enemy.x, enemy.y, 0x9be7ff, enemy.kind === 'boss' ? 16 : 7);
    }
  }

  if (hasUpgrade('rage-blade') && gameState.temper >= gameState.maxTemper * 0.6) {
    damage += (10 + gameState.level * 1.5) * fireDamageMultiplier();
    damageKind = critical ? damageKind : 'fire';
    igniteEnemy(enemy, 1.35, 8);
  }

  if (enemy.finalBoss && runtime.finalBossGuardTime > 0) {
    const guardBroken = !critical || wasChilled;
    if (guardBroken) {
      runtime.finalBossGuardTime = 0;
      runtime.finalBossGuardCooldown = 7.5;
      damage *= 1.25;
      showSubtitle(copy.value.bossGuardBreak);
      emitJuice(enemy.x, enemy.y, 0xffe45c, 36);
      triggerSignatureMoment('bossBreak', 'gold');
      shake(18);
      hitStop(70);
    } else {
      damage *= 0.22;
      damageKind = 'normal';
      emitJuice(enemy.x, enemy.y, 0xa1a1aa, 14);
      damagePlayer(5 + gameState.level * 0.35, enemy.x, enemy.y, 3, 0.18, 240, 'bossGuard');
    }
  }

  applyEnemyDamage(enemy, damage, damageKind);

  if (critical && hasUpgrade('split-melon') && projectile.splitDepth === 0) {
    spawnSplitProjectiles(projectile, enemy.x, enemy.y);
  }

  if (hasUpgrade('frost-cleaver-back') && Math.random() < 0.18) {
    freezeEnemy(enemy, 0.62);
    emitJuice(enemy.x, enemy.y, 0xbdefff, enemy.kind === 'boss' ? 18 : 8);
  }

  if (Math.random() < tuning.magnetChance) {
    spawnMagnetVortex(projectile.x, projectile.y);
  }
}

function resolveCollisions() {
  for (let i = runtime.projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = runtime.projectiles[i];
    let projectileReleased = false;
    for (const event of [...runtime.worldEvents]) {
      if (!event.active || event.kind !== 'fakeScale') {
        continue;
      }
      const radius = projectile.radius + event.radius;
      if (distanceSq(projectile.x, projectile.y, event.x, event.y) > radius * radius) {
        continue;
      }
      const damage = projectile.isRipe ? projectile.damage * tuning.criticalMultiplier : projectile.damage;
      event.hp = Math.max(0, event.hp - damage);
      showDamageText(event.x, event.y - event.radius, damage, projectile.isRipe ? 'critical' : 'normal');
      emitJuice(event.x, event.y, 0xffe45c, projectile.isRipe ? 22 : 10);
      if (event.hp <= 0) {
        completeWorldEvent(event);
      } else {
        drawWorldEvent(event);
      }
      releaseProjectile(i);
      projectileReleased = true;
      break;
    }
    if (projectileReleased) {
      continue;
    }
    for (let j = runtime.enemies.length - 1; j >= 0; j -= 1) {
      const enemy = runtime.enemies[j];
      if (!enemy.active || !intersects(projectile, enemy)) {
        continue;
      }
      damageEnemy(enemy, projectile);
      releaseProjectile(i);
      break;
    }
  }

  const player = runtime.player;
  if (!player) {
    return;
  }
  for (let i = runtime.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = runtime.enemies[i];
    if (!enemy.active) {
      continue;
    }
    if (enemy.hp <= 0) {
      runtime.killChain += 1;
      runtime.killChainTime = 2.6;
      runStats.kills += 1;
      if (runtime.killChain === 12 || runtime.killChain === 24) {
        triggerSignatureMoment('killSweep', 'red');
      }
      if (enemy.kind === 'boss') {
        void runtime.audio?.play('boss_kill', true);
      }
      gainExp(enemy.expReward);
      if (tuning.killHeal > 0 && tuning.killHealMultiplier > 0) {
        const healScale = enemy.finalBoss ? 8 : enemy.kind === 'boss' ? 4.5 : enemy.elite ? 2.2 : 1;
        gameState.health = clamp(gameState.health + tuning.killHeal * healScale * tuning.killHealMultiplier, 0, gameState.maxHealth);
      }
      emitJuice(enemy.x, enemy.y, enemy.metal ? 0xa1a1aa : 0xef3340, enemy.kind === 'boss' ? 52 : 18);
      if (enemy.finalBoss) {
        runtime.finalBossActive = false;
        runtime.finalBossDefeated = true;
        bossPhaseAlert.active = false;
        bossPhaseAlert.visible = false;
        gameWon.value = true;
        incrementMetaProfile('victories');
        triggerSignatureMoment('fairDeal', 'gold');
        showSubtitle(copy.value.victory);
        shake(30);
        hitStop(120);
        releaseEnemy(i);
        gameOverOpen.value = true;
        runtime.app?.ticker.stop();
        continue;
      }
      releaseEnemy(i);
      continue;
    }
    if (intersects(player, enemy) && player.invulnTime <= 0) {
      const hit = damagePlayer(
        enemy.touchDamage,
        enemy.x,
        enemy.y,
        enemy.kind === 'boss' ? 18 : 11,
        tuning.dashCharges > 0 ? 0.62 : 0.42,
        620,
        damageSourceForEnemy(enemy),
      );
      if (hit) {
        const away = normalize(enemy.x - player.x, enemy.y - player.y);
        enemy.vx += away.x * 620;
        enemy.vy += away.y * 620;
      }
    }
  }
}

function currentPlayerSpeed() {
  const lowHealthBoost = hasUpgrade('last-stand-temper') && gameState.health / gameState.maxHealth <= 0.35 ? 1.22 : 1;
  const trapSlow = runtime.playerSlowTime > 0 ? 0.78 : 1;
  return tuning.playerSpeed * lowHealthBoost * trapSlow;
}

function updatePlayer(dt: number) {
  const player = runtime.player;
  if (!player) {
    return;
  }
  runtime.playerSlowTime = Math.max(0, runtime.playerSlowTime - dt);
  const keyboardX = (keyboard.right ? 1 : 0) - (keyboard.left ? 1 : 0);
  const keyboardY = (keyboard.down ? 1 : 0) - (keyboard.up ? 1 : 0);
  const inputX = clamp(keyboardX + joystick.vectorX, -1, 1);
  const inputY = clamp(keyboardY + joystick.vectorY, -1, 1);
  const direction = Math.hypot(inputX, inputY) > 0.08 ? normalize(inputX, inputY) : { x: 0, y: 0 };
  if (direction.x !== 0 || direction.y !== 0) {
    runtime.lastAimDirection = direction;
  }
  const speed = currentPlayerSpeed();
  player.vx = direction.x * speed;
  player.vy = direction.y * speed;
  player.update(dt);
  player.tickInvulnerability(dt);
  player.syncSprite();
}

function updateVendorPressure(enemy: Enemy, player: Player, dt: number) {
  if (gameState.level < 7 && !enemy.elite) {
    return false;
  }
  enemy.abilityCooldown -= dt;
  if (enemy.abilityCooldown > 0) {
    return false;
  }
  enemy.abilityCooldown = randomFloat(7.6, 11.0) * (enemy.elite ? 0.82 : 1);
  const lead = normalize(player.vx, player.vy);
  const offset = Math.hypot(player.vx, player.vy) > 20 ? 82 : 0;
  spawnPriceTrap(player.x + lead.x * offset + randomFloat(-64, 64), player.y + lead.y * offset + randomFloat(-64, 64));
  void runtime.audio?.playEffect('enemy_launch', 160);
  emitJuice(enemy.x, enemy.y, 0xffe45c, 7);
  return true;
}

function updateThugPressure(enemy: Enemy, player: Player, dt: number) {
  if (gameState.level < 8 && !enemy.elite) {
    return false;
  }
  if (enemy.dashTime > 0) {
    enemy.dashTime = Math.max(0, enemy.dashTime - dt);
    enemy.vx = enemy.dashDirection.x * enemy.moveSpeed * 3.2;
    enemy.vy = enemy.dashDirection.y * enemy.moveSpeed * 3.2;
    enemy.sprite.tint = 0xef3340;
    return true;
  }
  if (enemy.dashWindup > 0) {
    enemy.dashWindup = Math.max(0, enemy.dashWindup - dt);
    enemy.vx *= 0.88;
    enemy.vy *= 0.88;
    enemy.sprite.tint = enemy.dashWindup > 0 ? 0xffe45c : 0xef3340;
    if (enemy.dashWindup <= 0) {
      enemy.dashTime = 0.18;
      enemy.dashDirection = normalize(player.x - enemy.x, player.y - enemy.y);
      void runtime.audio?.playEffect('enemy_dash', 170);
      emitJuice(enemy.x, enemy.y, 0xef3340, 8);
    }
    return true;
  }
  enemy.abilityCooldown -= dt;
  if (enemy.abilityCooldown <= 0 && distanceSq(enemy.x, enemy.y, player.x, player.y) < 280 * 280) {
    enemy.abilityCooldown = randomFloat(7.4, 10.6) * (enemy.elite ? 0.78 : 1);
    enemy.dashWindup = 0.5;
    enemy.dashDirection = normalize(player.x - enemy.x, player.y - enemy.y);
    return true;
  }
  return false;
}

function explodeScaleWeight(enemy: Enemy) {
  if (!enemy.active || enemy.hp <= 0) {
    return;
  }
  const player = runtime.player;
  if (player && distanceSq(player.x, player.y, enemy.x, enemy.y) <= 102 * 102) {
    damagePlayer(12 + gameState.level * 0.7, enemy.x, enemy.y, 14, 0.42, 520, 'scaleExplosion');
  }
  for (const nearby of runtime.enemies) {
    if (!nearby.active || nearby === enemy || distanceSq(nearby.x, nearby.y, enemy.x, enemy.y) > 88 * 88) {
      continue;
    }
    const away = normalize(nearby.x - enemy.x, nearby.y - enemy.y);
    nearby.vx += away.x * 300;
    nearby.vy += away.y * 300;
  }
  emitJuice(enemy.x, enemy.y, 0xa1a1aa, 34);
  void runtime.audio?.playEffect('enemy_explode', 260);
  showDamageText(enemy.x, enemy.y - enemy.radius, enemy.hp, 'normal');
  enemy.hp = 0;
  enemy.updateHealthBar();
  shake(14);
}

function updateScaleWeightPressure(enemy: Enemy, player: Player, dt: number) {
  if (gameState.level < 12 && !enemy.elite) {
    return false;
  }
  if (enemy.detonateTime > 0) {
    enemy.detonateTime = Math.max(0, enemy.detonateTime - dt);
    enemy.vx *= 0.74;
    enemy.vy *= 0.74;
    enemy.sprite.tint = Math.sin(enemy.detonateTime * 32) > 0 ? 0xef3340 : 0xffe45c;
    if (enemy.detonateTime <= 0) {
      explodeScaleWeight(enemy);
    }
    return true;
  }
  if (distanceSq(enemy.x, enemy.y, player.x, player.y) < 72 * 72) {
    enemy.detonateTime = enemy.elite ? 0.82 : 1.02;
    void runtime.audio?.playEffect('trap_tick', 260);
    emitJuice(enemy.x, enemy.y, 0xffe45c, 6);
    return true;
  }
  return false;
}

function updateEnemies(dt: number) {
  const player = runtime.player;
  if (!player) {
    return;
  }
  for (const enemy of runtime.enemies) {
    if (!enemy.active) {
      continue;
    }
    if (enemy.kind === 'vendor' && updateVendorPressure(enemy, player, dt)) {
      enemy.vx *= 0.92;
      enemy.vy *= 0.92;
    }
    if (enemy.kind === 'thug' && updateThugPressure(enemy, player, dt)) {
      enemy.update(dt);
      continue;
    }
    if (enemy.kind === 'scaleWeight' && updateScaleWeightPressure(enemy, player, dt)) {
      enemy.update(dt);
      continue;
    }
    const direction = normalize(player.x - enemy.x, player.y - enemy.y);
    const statusSpeed = enemy.freezeTime > 0 ? 0 : enemy.slowMultiplier;
    enemy.vx += (direction.x * enemy.moveSpeed * statusSpeed - enemy.vx) * 0.09;
    enemy.vy += (direction.y * enemy.moveSpeed * statusSpeed - enemy.vy) * 0.09;
    enemy.vx *= 0.985;
    enemy.vy *= 0.985;
    enemy.update(dt);
  }
}

function updateFinalBoss(dt: number) {
  if (!runtime.finalBossActive) {
    return;
  }
  const boss = runtime.enemies.find((enemy) => enemy.finalBoss && enemy.active);
  if (!boss) {
    runtime.finalBossActive = false;
    bossPhaseAlert.active = false;
    bossPhaseAlert.visible = false;
    return;
  }

  const hpPct = boss.hp / boss.maxHp;
  const nextPhase = hpPct <= 0.25 ? 4 : hpPct <= 0.5 ? 3 : hpPct <= 0.75 ? 2 : 1;
  if (nextPhase > runtime.finalBossPhase) {
    runtime.finalBossPhase = nextPhase;
    showBossPhaseAlert(nextPhase, boss);
    shake(nextPhase >= 4 ? 28 : nextPhase >= 3 ? 22 : 16);
    if (nextPhase >= 3) {
      void runtime.audio?.play('ultimate_ready', true);
      drawBackground();
    }
  }

  runtime.finalBossGuardTime = Math.max(0, runtime.finalBossGuardTime - dt);
  runtime.finalBossGuardCooldown = Math.max(0, runtime.finalBossGuardCooldown - dt);
  if (runtime.finalBossPhase >= 2 && runtime.finalBossGuardCooldown <= 0 && runtime.finalBossGuardTime <= 0) {
    runtime.finalBossGuardTime = runtime.finalBossPhase >= 4 ? 2.7 : runtime.finalBossPhase >= 3 ? 2.4 : 2.1;
    runtime.finalBossGuardCooldown = runtime.finalBossPhase >= 4 ? 7.8 : runtime.finalBossPhase >= 3 ? 9.2 : 11.0;
    showSubtitle(copy.value.bossGuard);
    void runtime.audio?.playEffect('trap_tick', 280);
    emitJuice(boss.x, boss.y, 0xffe45c, 28);
    shake(12);
  }
  if (runtime.finalBossGuardTime > 0) {
    boss.sprite.tint = Math.sin(runtime.finalBossGuardTime * 18) > 0 ? 0xffe45c : 0x84cc16;
    boss.vx *= 0.82;
    boss.vy *= 0.82;
    return;
  }

  runtime.finalBossAbilityClock += dt;
  const interval = runtime.finalBossPhase >= 4 ? 2.7 : runtime.finalBossPhase === 3 ? 3.2 : runtime.finalBossPhase === 2 ? 4.1 : 4.6;
  if (runtime.finalBossAbilityClock < interval) {
    return;
  }
  runtime.finalBossAbilityClock = 0;

  const count = runtime.finalBossPhase >= 4 ? 4 : runtime.finalBossPhase === 3 ? 3 : runtime.finalBossPhase === 2 ? 2 : 1;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + randomFloat(-0.22, 0.22);
    const radius = randomFloat(118, 178);
    const kind: EnemyKind = i % 2 === 0 ? 'scaleWeight' : 'thug';
    spawnEnemyAt(
      boss.x + Math.cos(angle) * radius,
      boss.y + Math.sin(angle) * radius,
      kind,
      runtime.finalBossPhase >= 4 ? Math.random() < 0.52 : runtime.finalBossPhase >= 3 && Math.random() < 0.35,
    );
  }

  if (runtime.finalBossPhase >= 2) {
    spawnMagnetVortex(boss.x, boss.y);
  }
  if (runtime.finalBossPhase >= 3) {
    const player = runtime.player;
    if (player && Math.random() < (runtime.finalBossPhase >= 4 ? 0.72 : 0.5)) {
      spawnPriceTrap(player.x + randomFloat(-160, 160), player.y + randomFloat(-160, 160));
    }
    if (Math.random() < (runtime.finalBossPhase >= 4 ? 0.62 : 0.45)) {
      spawnBurnZone(boss.x + randomFloat(-88, 88), boss.y + randomFloat(-88, 88));
    }
  }
}

function updateProjectiles(dt: number) {
  const viewport = getViewportBounds();
  for (let i = runtime.projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = runtime.projectiles[i];
    projectile.lifetime -= dt;
    projectile.update(dt);
    if (
      projectile.lifetime <= 0 ||
      projectile.x < viewport.left - PROJECTILE_DESPAWN_MARGIN ||
      projectile.x > viewport.right + PROJECTILE_DESPAWN_MARGIN ||
      projectile.y < viewport.top - PROJECTILE_DESPAWN_MARGIN ||
      projectile.y > viewport.bottom + PROJECTILE_DESPAWN_MARGIN
    ) {
      releaseProjectile(i);
    }
  }
}

function directionSymbol(dx: number, dy: number) {
  const angle = Math.atan2(dy, dx);
  const octant = Math.round(angle / (Math.PI / 4));
  return ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][((octant % 8) + 8) % 8] ?? '•';
}

function minimapPoint(x: number, y: number) {
  const player = runtime.player;
  if (!player) {
    return { x: 50, y: 50, distance: 0 };
  }
  const dx = x - player.x;
  const dy = y - player.y;
  const range = hud.mapRange;
  return {
    x: clamp(50 + (dx / range) * 48, 4, 96),
    y: clamp(50 + (dy / range) * 48, 4, 96),
    distance: Math.hypot(dx, dy),
  };
}

function updateMinimapPlayerAngle() {
  const keyboardX = (keyboard.right ? 1 : 0) - (keyboard.left ? 1 : 0);
  const keyboardY = (keyboard.down ? 1 : 0) - (keyboard.up ? 1 : 0);
  const moveX = clamp(keyboardX + joystick.vectorX, -1, 1);
  const moveY = clamp(keyboardY + joystick.vectorY, -1, 1);
  const source = Math.hypot(runtime.lastAimDirection.x, runtime.lastAimDirection.y) > 0.08 ? runtime.lastAimDirection : { x: moveX, y: moveY };
  if (Math.hypot(source.x, source.y) <= 0.08) {
    return;
  }
  hud.mapPlayerAngle = (Math.atan2(source.y, source.x) * 180) / Math.PI + 90;
}

function updateHud() {
  hud.hpPct = clamp((gameState.health / gameState.maxHealth) * 100, 0, 100);
  hud.temperPct = clamp((gameState.temper / gameState.maxTemper) * 100, 0, 100);
  hud.expPct = clamp((gameState.exp / gameState.expToNext) * 100, 0, 100);
  let burningEnemies = 0;
  let frozenEnemies = 0;
  let slowedEnemies = 0;
  let chilledMetalEnemies = 0;
  for (const enemy of runtime.enemies) {
    if (!enemy.active) {
      continue;
    }
    const frozen = enemy.freezeTime > 0;
    const slowed = enemy.slowTime > 0;
    if (enemy.burnTime > 0) {
      burningEnemies += 1;
    }
    if (frozen) {
      frozenEnemies += 1;
    } else if (slowed) {
      slowedEnemies += 1;
    }
    if (enemy.metal && (frozen || slowed)) {
      chilledMetalEnemies += 1;
    }
  }
  hud.burningEnemies = burningEnemies;
  hud.frozenEnemies = frozenEnemies;
  hud.slowedEnemies = slowedEnemies;
  hud.chilledMetalEnemies = chilledMetalEnemies;
  hud.burnZones = runtime.burnZones.length;
  hud.magnetVortices = runtime.magnets.length;
  hud.bossGatePending = runtime.bossGatePending;
  hud.bossGateCleared = runtime.bossGateCleared;
  updateMinimapPlayerAngle();
  const event = runtime.worldEvents.find((item) => item.active) ?? null;
  hud.eventActive = Boolean(event);
  hud.eventKind = event?.kind ?? null;
  hud.eventStarted = event?.started ?? false;
  hud.eventFailed = event?.failed ?? false;
  if (event && runtime.player) {
    const dx = event.x - runtime.player.x;
    const dy = event.y - runtime.player.y;
    hud.eventDistance = Math.hypot(dx, dy);
    hud.eventDirection = directionSymbol(dx, dy);
    hud.eventProgress =
      event.kind === 'fakeScale'
        ? (1 - event.hp / event.maxHp) * 100
        : (event.kind === 'marketAmbush' || event.kind === 'challengePledge') && event.started
          ? (1 - event.timer / event.duration) * 100
          : 0;
  } else {
    hud.eventDistance = 0;
    hud.eventDirection = '•';
    hud.eventProgress = 0;
    hud.eventFailed = false;
  }

  const boss = runtime.enemies.find((enemy) => enemy.active && enemy.finalBoss) ?? null;
  const mapBoss = boss ? minimapPoint(boss.x, boss.y) : null;
  hud.mapBossActive = Boolean(boss);
  hud.mapBossX = mapBoss?.x ?? 50;
  hud.mapBossY = mapBoss?.y ?? 50;
  hud.mapBossDistance = mapBoss?.distance ?? 0;

  const mapEvent = event ? minimapPoint(event.x, event.y) : null;
  hud.mapEventActive = Boolean(event);
  hud.mapEventX = mapEvent?.x ?? 50;
  hud.mapEventY = mapEvent?.y ?? 50;
  hud.mapEventDistance = mapEvent?.distance ?? 0;
  hud.mapEventKind = event?.kind ?? null;

  const player = runtime.player;
  const activeEnemies = runtime.enemies.filter((enemy) => enemy.active && !enemy.finalBoss);
  hud.mapEnemyCount = activeEnemies.length;
  hud.mapEnemies = player
    ? activeEnemies
        .map((enemy) => ({
          enemy,
          distanceSq: distanceSq(player.x, player.y, enemy.x, enemy.y),
        }))
        .sort((a, b) => a.distanceSq - b.distanceSq)
        .slice(0, 18)
        .map(({ enemy }) => {
          const point = minimapPoint(enemy.x, enemy.y);
          return {
            id: enemy.id,
            x: point.x,
            y: point.y,
            elite: enemy.elite || enemy.kind === 'boss',
            metal: enemy.metal,
          };
        })
    : [];
}

function startHudLoop() {
  const loop = () => {
    if (runtime.destroyed) {
      return;
    }
    updateHud();
    runtime.hudRaf = requestAnimationFrame(loop);
  };
  runtime.hudRaf = requestAnimationFrame(loop);
}

function restartRun() {
  const player = runtime.player;
  const app = runtime.app;
  if (!player || !app) {
    return;
  }

  gameState.health = 160;
  gameState.maxHealth = 160;
  gameState.temper = 0;
  gameState.exp = 0;
  gameState.level = 1;
  gameState.expToNext = 120;
  gameState.luck = 14;
  gameState.conqueror = false;
  runtime.ultimateAnnounced = false;
  runtime.pendingLevelUps = 0;
  runtime.pendingLevelQueue.length = 0;
  runtime.triggeredMilestones.clear();
  runtime.finalBossPending = false;
  runtime.finalBossActive = false;
  runtime.finalBossDefeated = false;
  runtime.bossGatePending = false;
  runtime.bossGateCleared = false;
  runtime.finalBossPhase = 0;
  runtime.finalBossAbilityClock = 0;
  runtime.finalBossGuardTime = 0;
  runtime.finalBossGuardCooldown = 0;
  runtime.ripeHitChain = 0;
  runtime.killChain = 0;
  runtime.killChainTime = 0;
  runtime.signatureMomentCooldown = 0;
  runtime.announcedArchetypes.clear();
  runtime.landmarkBurstTime = 0;
  runtime.landmarkBurstDamage = 0;
  runtime.landmarkBurstFireRate = 0;
  runtime.fireCooldown = 0;
  runtime.spawnClock = 0;
  runtime.bossClock = 0;
  runtime.eventClock = 0;
  runtime.nextEventDelay = 7;
  runtime.playerSlowTime = 0;
  runtime.cameraX = 0;
  runtime.cameraY = 0;
  runtime.shakeOffsetX = 0;
  runtime.shakeOffsetY = 0;
  runtime.lastAimDirection = { x: 1, y: 0 };
  signatureMoment.visible = false;
  bossPhaseAlert.active = false;
  bossPhaseAlert.visible = false;
  bossPhaseAlert.phase = 0;
  damageAlert.visible = false;
  damageLogs.value = [];
  landmarkBadges.value = [];
  resetRunObjectiveSelection();
  if (runtime.damageAlertTimer) {
    window.clearTimeout(runtime.damageAlertTimer);
    runtime.damageAlertTimer = 0;
  }
  resetKeyboardControls();
  resetTouchControls();

  tuning.projectileDamage = 24;
  tuning.projectileSpeed = 820;
  tuning.projectileLifetime = 0.95;
  tuning.baseFireCooldown = 0.22;
  tuning.ripeBaseChance = 0.18;
  tuning.criticalMultiplier = 1.9;
  tuning.unripeKnockback = 1280;
  tuning.magnetChance = 0.09;
  tuning.magnetRadius = 148;
  tuning.magnetStrength = 980;
  tuning.enemySpawnInterval = 0.52;
  tuning.bossSpawnInterval = 28;
  tuning.playerSpeed = 292;
  tuning.dashCharges = 0;
  tuning.damageReduction = 0;
  tuning.riskDamageTakenMultiplier = 1;
  tuning.killHeal = 0;
  tuning.killHealMultiplier = 1;
  tuning.expMultiplier = 1;
  tuning.extraUpgradeChoices = 0;

  runtime.enemyPool?.releaseAll(runtime.enemies);
  runtime.projectilePool?.releaseAll(runtime.projectiles);
  for (const event of runtime.worldEvents) {
    event.sprite.destroy();
  }
  runtime.worldEvents.length = 0;
  for (const magnet of runtime.magnets) {
    magnet.sprite.destroy();
  }
  runtime.magnets.length = 0;
  for (const zone of runtime.burnZones) {
    zone.sprite.destroy();
  }
  runtime.burnZones.length = 0;
  for (const trap of runtime.priceTraps) {
    trap.sprite.destroy();
  }
  runtime.priceTraps.length = 0;
  for (const particle of runtime.particles) {
    particle.particle.alpha = 0;
    runtime.freeParticles.push(particle);
  }
  runtime.particles.length = 0;
  for (const text of runtime.damageTexts) {
    text.label.visible = false;
    runtime.freeDamageTexts.push(text);
  }
  runtime.damageTexts.length = 0;
  acquiredUpgradeIds.value = [];
  selectedUpgradeId.value = null;

  player.setPosition(0, 0);
  player.invulnTime = 0;
  player.draw();
  runtime.terrainKey = '';
  drawBackground();
  updateCamera(0, true);

  gameOverOpen.value = false;
  gameWon.value = false;
  levelUpOpen.value = false;
  milestoneOverlay.visible = false;
  currentUpgradeLevel.value = 1;
  updateHud();
  app.ticker.stop();
}

function onJoystickDown(event: PointerEvent) {
  setInputMode('touch');
  void runtime.audio?.unlock();
  joystick.active = true;
  joystick.pointerId = event.pointerId;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  onJoystickMove(event);
}

function onJoystickMove(event: PointerEvent) {
  if (!joystick.active || joystick.pointerId !== event.pointerId) {
    return;
  }
  const el = event.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const max = rect.width * 0.34;
  const len = Math.hypot(dx, dy);
  const scale = len > max ? max / len : 1;
  joystick.knobX = dx * scale;
  joystick.knobY = dy * scale;
  joystick.vectorX = clamp(dx / max, -1, 1);
  joystick.vectorY = clamp(dy / max, -1, 1);
}

function onJoystickUp(event: PointerEvent) {
  if (joystick.pointerId !== event.pointerId) {
    return;
  }
  joystick.active = false;
  joystick.pointerId = -1;
  joystick.vectorX = 0;
  joystick.vectorY = 0;
  joystick.knobX = 0;
  joystick.knobY = 0;
}

function onThrowDown(event: PointerEvent) {
  setInputMode('touch');
  void runtime.audio?.unlock();
  throwTouch.active = true;
  throwTouch.pointerId = event.pointerId;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  onThrowMove(event);
  spawnProjectile(event.clientX, event.clientY, false);
  void runtime.audio?.play('spawn');
}

function onThrowMove(event: PointerEvent) {
  if (!throwTouch.active || throwTouch.pointerId !== event.pointerId) {
    return;
  }
  throwTouch.x = event.clientX;
  throwTouch.y = event.clientY;
}

function onThrowUp(event: PointerEvent) {
  if (throwTouch.pointerId !== event.pointerId) {
    return;
  }
  throwTouch.active = false;
  throwTouch.pointerId = -1;
}

function bindKeyboard() {
  runtime.keyDownHandler = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      return;
    }
    const key = event.key.toLowerCase();
    if (!isMovementKey(key) && !isThrowKey(key)) {
      return;
    }
    if (event.repeat && isThrowKey(key)) {
      event.preventDefault();
      return;
    }
    setInputMode('keyboard');
    void runtime.audio?.unlock();
    event.preventDefault();
    if (key === 'w' || key === 'arrowup') keyboard.up = true;
    if (key === 's' || key === 'arrowdown') keyboard.down = true;
    if (key === 'a' || key === 'arrowleft') keyboard.left = true;
    if (key === 'd' || key === 'arrowright') keyboard.right = true;
    if (isThrowKey(key) && !keyboard.attack) {
      keyboard.attack = true;
      spawnKeyboardProjectile(false);
      void runtime.audio?.play('spawn');
    }
  };
  runtime.keyUpHandler = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      return;
    }
    const key = event.key.toLowerCase();
    if (!isMovementKey(key) && !isThrowKey(key)) {
      return;
    }
    event.preventDefault();
    if (key === 'w' || key === 'arrowup') keyboard.up = false;
    if (key === 's' || key === 'arrowdown') keyboard.down = false;
    if (key === 'a' || key === 'arrowleft') keyboard.left = false;
    if (key === 'd' || key === 'arrowright') keyboard.right = false;
    if (isThrowKey(key)) keyboard.attack = false;
  };
  window.addEventListener('keydown', runtime.keyDownHandler);
  window.addEventListener('keyup', runtime.keyUpHandler);
}

function bindAudioUnlock() {
  runtime.audioUnlockHandler = () => {
    void runtime.audio?.unlock();
  };
  window.addEventListener('pointerdown', runtime.audioUnlockHandler, { passive: true });
  window.addEventListener('touchstart', runtime.audioUnlockHandler, { passive: true });
  window.addEventListener('keydown', runtime.audioUnlockHandler, { passive: true });
}

function unbindAudioUnlock() {
  if (!runtime.audioUnlockHandler) {
    return;
  }
  window.removeEventListener('pointerdown', runtime.audioUnlockHandler);
  window.removeEventListener('touchstart', runtime.audioUnlockHandler);
  window.removeEventListener('keydown', runtime.audioUnlockHandler);
  runtime.audioUnlockHandler = null;
}

function unbindKeyboard() {
  if (runtime.keyDownHandler) {
    window.removeEventListener('keydown', runtime.keyDownHandler);
    runtime.keyDownHandler = null;
  }
  if (runtime.keyUpHandler) {
    window.removeEventListener('keyup', runtime.keyUpHandler);
    runtime.keyUpHandler = null;
  }
}

function setupResize(host: HTMLDivElement, app: PIXI.Application, player: Player) {
  const resize = () => {
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    app.renderer.resize(width, height);
    app.stage.hitArea = new PIXI.Rectangle(0, 0, width, height);
    player.setPosition(player.x, player.y);
    runtime.terrainKey = '';
    drawBackground();
    updateCamera(0, true);
  };
  runtime.resizeObserver = new ResizeObserver(resize);
  runtime.resizeObserver.observe(host);
  resize();
}

async function initEngine() {
  const host = canvasHost.value;
  if (!host) {
    return;
  }

  runtime.destroyed = false;
  runtime.audio = new AudioManifestManager(showSubtitle, () => currentLocale.value);

  const app = new PIXI.Application();
  await app.init({
    antialias: false,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    backgroundAlpha: 1,
    backgroundColor: 0x07090e,
  });

  const canvas = app.canvas as HTMLCanvasElement;
  canvas.className = 'h-full w-full';
  host.appendChild(canvas);

  const world = new PIXI.Container();
  const backgroundLayer = new PIXI.Graphics();
  const terrainLayer = new PIXI.Graphics();
  const entityLayer = new PIXI.Container();
  const projectileLayer = new PIXI.Container();
  const effectLayer = new PIXI.Container();
  const eventLayer = new PIXI.Container();
  const magnetLayer = new PIXI.Container();
  const healthBarLayer = new PIXI.Container();
  const damageTextLayer = new PIXI.Container();
  const juiceLayer = new PIXI.ParticleContainer<PIXI.Particle>({
    texture: PIXI.Texture.WHITE,
    dynamicProperties: {
      vertex: true,
      position: true,
      color: true,
    },
  });

  app.stage.addChild(backgroundLayer);
  app.stage.addChild(world);
  world.addChild(terrainLayer);
  world.addChild(effectLayer);
  world.addChild(eventLayer);
  world.addChild(entityLayer);
  world.addChild(projectileLayer);
  world.addChild(magnetLayer);
  world.addChild(juiceLayer);
  world.addChild(healthBarLayer);
  world.addChild(damageTextLayer);

  const player = new Player(gameState.maxHealth, tuning.playerSpeed);
  player.setActive(true);
  entityLayer.addChild(player.sprite);

  runtime.app = app;
  runtime.world = world;
  runtime.backgroundLayer = backgroundLayer;
  runtime.terrainLayer = terrainLayer;
  runtime.entityLayer = entityLayer;
  runtime.projectileLayer = projectileLayer;
  runtime.effectLayer = effectLayer;
  runtime.eventLayer = eventLayer;
  runtime.magnetLayer = magnetLayer;
  runtime.healthBarLayer = healthBarLayer;
  runtime.damageTextLayer = damageTextLayer;
  runtime.juiceLayer = juiceLayer;
  runtime.player = player;
  seedAnnouncedMetaGoals();
  updateMetaBestLevel(gameState.level);

  initPools();
  setupResize(host, app, player);
  bindKeyboard();
  bindAudioUnlock();

  runtime.tickerHandler = (ticker: PIXI.Ticker) => {
    let dt = Math.min(0.033, ticker.deltaMS / 1000);

    if (runtime.hitStop > 0) {
      runtime.hitStop = Math.max(0, runtime.hitStop - dt);
      updateShake(dt);
      updateCamera(dt);
      return;
    }

    if (runObjectiveOpen.value || levelUpOpen.value || gameOverOpen.value) {
      return;
    }

    runStats.survivalSeconds += dt;
    checkRunObjectiveCompletion();

    runtime.signatureMomentCooldown = Math.max(0, runtime.signatureMomentCooldown - dt);
    runtime.landmarkBurstTime = Math.max(0, runtime.landmarkBurstTime - dt);
    if (runtime.killChainTime > 0) {
      runtime.killChainTime = Math.max(0, runtime.killChainTime - dt);
      if (runtime.killChainTime <= 0) {
        runtime.killChain = 0;
      }
    }

    runtime.fireCooldown = Math.max(0, runtime.fireCooldown - dt);
    if (runtime.fireCooldown <= 0) {
      if (keyboard.attack) {
        spawnKeyboardProjectile(false);
      }
      if (throwTouch.active) {
        spawnProjectile(throwTouch.x, throwTouch.y);
      }
    }

    runtime.spawnClock += dt;
    runtime.bossClock += dt;
    if (runtime.spawnClock >= currentEnemySpawnInterval()) {
      runtime.spawnClock = 0;
      spawnEnemy();
    }
    if (!runtime.finalBossActive && !runtime.finalBossDefeated && gameState.level < FINAL_BOSS_LEVEL && runtime.bossClock >= tuning.bossSpawnInterval) {
      runtime.bossClock = 0;
      spawnEnemy(true);
    }
    if (runtime.finalBossPending && runtime.bossGateCleared && !levelUpOpen.value && !runtime.finalBossActive && !runtime.finalBossDefeated) {
      runtime.finalBossPending = false;
      spawnEnemy(true, true);
    }

    if (gameState.conqueror) {
      const conquerorDrain = archetypeFinisher('temper') ? 6.2 : archetypeOnline('temper') ? 7.1 : 8;
      gameState.temper = Math.max(0, gameState.temper - conquerorDrain * dt);
      if (gameState.temper <= 0) {
        gameState.conqueror = false;
        runtime.ultimateAnnounced = false;
        drawBackground();
      }
    }

    updatePlayer(dt);
    updateWorldEvents(dt);
    updateEnemyStatuses(dt);
    updateEnemies(dt);
    updateFinalBoss(dt);
    updateProjectiles(dt);
    updateMagnets(dt);
    updateBurnZones(dt);
    updatePriceTraps(dt);
    resolveCollisions();
    updateParticles(dt);
    updateDamageTexts(dt);
    updateShake(dt);
    updateCamera(dt);

    if (runtime.pendingLevelUps > 0 && !levelUpOpen.value) {
      pauseForLevelUp();
    }
  };

  app.ticker.add(runtime.tickerHandler);
  if (runObjectiveOpen.value) {
    app.ticker.stop();
  }
  startHudLoop();
}

async function cleanupEngine() {
  runtime.destroyed = true;
  if (runtime.hudRaf) {
    cancelAnimationFrame(runtime.hudRaf);
    runtime.hudRaf = 0;
  }
  if (runtime.damageAlertTimer) {
    window.clearTimeout(runtime.damageAlertTimer);
    runtime.damageAlertTimer = 0;
  }
  runtime.resizeObserver?.disconnect();
  runtime.resizeObserver = null;
  unbindAudioUnlock();
  unbindKeyboard();
  resetKeyboardControls();
  resetTouchControls();

  if (runtime.app) {
    if (runtime.tickerHandler) {
      runtime.app.ticker.remove(runtime.tickerHandler);
    }
    runtime.app.destroy(true);
  }
  await runtime.audio?.destroy();

  runtime.app = null;
  runtime.world = null;
  runtime.backgroundLayer = null;
  runtime.terrainLayer = null;
  runtime.entityLayer = null;
  runtime.projectileLayer = null;
  runtime.effectLayer = null;
  runtime.eventLayer = null;
  runtime.magnetLayer = null;
  runtime.healthBarLayer = null;
  runtime.damageTextLayer = null;
  runtime.juiceLayer = null;
  runtime.player = null;
  runtime.projectiles.length = 0;
  runtime.enemies.length = 0;
  runtime.worldEvents.length = 0;
  runtime.magnets.length = 0;
  runtime.burnZones.length = 0;
  runtime.priceTraps.length = 0;
  runtime.particles.length = 0;
  runtime.freeParticles.length = 0;
  runtime.damageTexts.length = 0;
  runtime.freeDamageTexts.length = 0;
  runtime.pendingLevelQueue.length = 0;
  runtime.triggeredMilestones.clear();
  runtime.finalBossPending = false;
  runtime.finalBossActive = false;
  runtime.finalBossDefeated = false;
  runtime.bossGatePending = false;
  runtime.bossGateCleared = false;
  runtime.finalBossPhase = 0;
  runtime.finalBossAbilityClock = 0;
  runtime.finalBossGuardTime = 0;
  runtime.finalBossGuardCooldown = 0;
  runtime.ripeHitChain = 0;
  runtime.killChain = 0;
  runtime.killChainTime = 0;
  runtime.signatureMomentCooldown = 0;
  runtime.announcedArchetypes.clear();
  runtime.landmarkBurstTime = 0;
  runtime.landmarkBurstDamage = 0;
  runtime.landmarkBurstFireRate = 0;
  runtime.announcedMetaGoals.clear();
  signatureMoment.visible = false;
  bossPhaseAlert.active = false;
  bossPhaseAlert.visible = false;
  bossPhaseAlert.phase = 0;
  damageAlert.visible = false;
  damageLogs.value = [];
  landmarkBadges.value = [];
  resetRunObjectiveSelection();
  selectedUpgradeId.value = null;
  milestoneOverlay.visible = false;
}

onMounted(() => {
  inputMode.value = prefersTouchInput() ? 'touch' : 'keyboard';
  void initEngine();
});

watch(currentLocale, (locale) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
});

onUnmounted(() => {
  void cleanupEngine();
});
</script>

<template>
  <main class="game-shell" :class="{ conqueror: gameState.conqueror, 'touch-controls': isTouchControls, 'keyboard-controls': !isTouchControls }">
    <div ref="canvasHost" class="canvas-host" />

    <div class="crt-overlay" aria-hidden="true" />
    <div class="vignette" aria-hidden="true" />
    <div class="damage-flash" :class="{ visible: damageAlert.visible }" aria-hidden="true" />

    <section class="hud">
      <div class="portrait-frame" aria-hidden="true">
        <div class="portrait-sprite" />
        <div class="portrait-scan" />
      </div>

      <div class="hud-main">
        <div class="hud-title">
          <div>
            <h1>{{ titleText }}</h1>
            <p class="portrait-caption">
              <strong>{{ copy.portraitName }}</strong>
              <span>{{ copy.portraitRole }}</span>
              <em>{{ copy.playerOnly }}</em>
            </p>
          </div>
          <div class="hud-actions">
            <span>{{ copy.level }} {{ gameState.level }}</span>
            <button
              type="button"
              class="meta-toggle"
              :aria-expanded="metaGoalsOpen"
              @click="metaGoalsOpen = !metaGoalsOpen"
            >
              {{ copy.metaGoalsButton }} {{ completedMetaGoalCount }}/{{ META_GOAL_DEFINITIONS.length }}
            </button>
            <button
              type="button"
              class="cast-toggle"
              :aria-expanded="castPanelOpen"
              @click="castPanelOpen = !castPanelOpen"
            >
              {{ copy.castButton }}
            </button>
            <label class="locale-control">
              <span>{{ copy.localeLabel }}</span>
              <select v-model="currentLocale" :aria-label="copy.localeLabel">
                <option v-for="option in LOCALE_OPTIONS" :key="option.code" :value="option.code">
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>
        </div>

        <div class="meter-group">
          <div class="meter">
            <div class="meter-row">
              <span>{{ copy.health }}</span>
              <span>{{ Math.round(gameState.health) }} / {{ gameState.maxHealth }}</span>
            </div>
            <div class="meter-track">
              <div class="meter-fill hp" :style="{ width: `${hud.hpPct}%` }" />
            </div>
          </div>

          <div class="meter">
            <div class="meter-row">
              <span>{{ copy.temper }}</span>
              <span>{{ temperText }}</span>
            </div>
            <div class="meter-track">
              <div class="meter-fill temper" :style="{ width: `${hud.temperPct}%` }" />
            </div>
          </div>

          <div class="meter">
            <div class="meter-row">
              <span>{{ copy.exp }}</span>
              <span>{{ Math.round(gameState.exp) }} / {{ gameState.expToNext }}</span>
            </div>
            <div class="meter-track">
              <div class="meter-fill exp" :style="{ width: `${hud.expPct}%` }" />
            </div>
          </div>
        </div>

        <div class="build-route">
          <span>{{ copy.currentRoute }}: <strong>{{ routeText }}</strong></span>
          <div v-if="buildFactionChips.length" class="build-chip-row">
            <small
              v-for="chip in buildFactionChips"
              :key="chip.faction"
              :class="chip.faction"
            >
              {{ chip.label }} {{ chip.count }}
            </small>
          </div>
        </div>

        <div v-if="archetypeTracks.length" class="archetype-track-list" :aria-label="copy.buildStage">
          <article
            v-for="track in archetypeTracks"
            :key="track.faction"
            class="archetype-track"
            :class="[track.faction, { online: track.online, finisher: track.finisher }]"
          >
            <div>
              <strong>{{ track.label }}</strong>
              <span>{{ track.state }} {{ Math.min(track.count, 3) }}/3</span>
            </div>
            <small>{{ track.effect }}</small>
            <i><b :style="{ width: `${(track.stage / 3) * 100}%` }" /></i>
          </article>
        </div>

        <div v-if="activeRunObjective" class="run-goal-strip" :class="[activeRunObjective.faction, { complete: activeRunObjective.complete }]">
          <div>
            <span>{{ copy.runGoalActive }}</span>
            <strong>{{ activeRunObjective.title }}</strong>
          </div>
          <small>
            {{ copy.runGoalProgress }}
            {{ Math.min(activeRunObjective.value, activeRunObjective.target) }}/{{ activeRunObjective.target }}
          </small>
          <i><b :style="{ width: `${activeRunObjective.pct}%` }" /></i>
        </div>

        <div
          v-if="activeRunObjective?.complete"
          class="run-goal-badge"
          :class="activeRunObjective.faction"
        >
          <span>{{ copy.runGoalBadge }}</span>
          <strong>{{ activeRunObjective.reward }}</strong>
        </div>

        <div v-if="landmarkBadges.length" class="landmark-badges" :aria-label="copy.landmarkBadges">
          <span>{{ copy.landmarkBadges }}</span>
          <div>
            <small
              v-for="badge in landmarkBadges"
              :key="badge.id"
              :class="badge.faction"
              :title="badge.desc"
            >
              {{ badge.title }}
            </small>
          </div>
        </div>
      </div>
    </section>

    <section class="minimap-panel" :aria-label="copy.minimap">
      <header>
        <span>{{ copy.minimap }}</span>
        <strong>{{ minimapStatus }}</strong>
      </header>
      <svg class="minimap-svg" viewBox="0 0 100 100" role="img">
        <defs>
          <radialGradient id="minimapGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(255, 228, 92, 0.18)" />
            <stop offset="100%" stop-color="rgba(0, 0, 0, 0)" />
          </radialGradient>
        </defs>
        <rect x="3" y="3" width="94" height="94" rx="8" />
        <circle class="minimap-range" cx="50" cy="50" r="44" />
        <path class="minimap-cross" d="M50 8v84M8 50h84" />
        <circle
          v-for="enemy in hud.mapEnemies"
          :key="enemy.id"
          class="minimap-dot enemy"
          :class="{ elite: enemy.elite, metal: enemy.metal }"
          :cx="enemy.x"
          :cy="enemy.y"
          :r="enemy.elite ? 2.2 : 1.55"
        />
        <circle
          v-if="hud.mapEventActive"
          class="minimap-dot event"
          :class="hud.mapEventKind ?? ''"
          :cx="hud.mapEventX"
          :cy="hud.mapEventY"
          r="3.1"
        />
        <circle
          v-if="hud.mapBossActive"
          class="minimap-dot boss"
          :cx="hud.mapBossX"
          :cy="hud.mapBossY"
          r="4.2"
        />
        <path
          class="minimap-player"
          d="M50 42 L57 59 L50 55 L43 59 Z"
          :transform="`rotate(${hud.mapPlayerAngle} 50 50)`"
        />
      </svg>
      <footer>
        <span><i class="self" />{{ copy.minimapSelf }}</span>
        <span><i class="boss" />{{ copy.minimapBoss }}</span>
        <span><i class="event" />{{ copy.minimapEvent }}</span>
      </footer>
    </section>

    <section v-if="metaGoalsOpen" class="meta-goals-panel" :aria-label="copy.metaGoalsTitle">
      <div class="meta-goals-head">
        <strong>{{ copy.metaGoalsTitle }}</strong>
        <button type="button" @click="metaGoalsOpen = false">{{ copy.close }}</button>
      </div>
      <div class="meta-goal-list">
        <article v-for="goal in metaGoalCards" :key="goal.id" class="meta-goal" :class="{ complete: goal.complete }">
          <div>
            <strong>{{ goal.title }}</strong>
            <span>{{ goal.desc }}</span>
          </div>
          <small>{{ Math.min(goal.value, goal.target) }}/{{ goal.target }}</small>
          <i><b :style="{ width: `${goal.pct}%` }" /></i>
        </article>
      </div>
    </section>

    <section v-if="acquiredUpgradeCards.length" class="owned-upgrades" :aria-label="copy.acquiredCards">
      <h2>{{ copy.acquiredCards }}</h2>
      <div class="owned-upgrade-grid">
        <button
          v-for="card in acquiredUpgradeCards"
          :key="card.id"
          type="button"
          class="owned-upgrade"
          :class="[upgradeElementClass(card.id), upgradeArtClass(card.id), { selected: selectedUpgrade?.id === card.id }]"
          :title="`${card.title}: ${upgradeDesc(card.id)}`"
          @click="selectUpgrade(card.id)"
        >
          <span class="owned-upgrade-icon" aria-hidden="true">
            <i class="art-core" />
            <i class="art-effect" />
            <i class="art-mark" />
          </span>
        </button>
      </div>
      <div v-if="selectedUpgrade" class="owned-upgrade-detail" :class="[upgradeElementClass(selectedUpgrade.id), upgradeArtClass(selectedUpgrade.id)]">
        <div class="owned-upgrade-detail-art" aria-hidden="true">
          <i class="art-core" />
          <i class="art-effect" />
          <i class="art-mark" />
        </div>
        <div>
          <span>{{ copy.cardDetails }} · {{ copy.routeTag }} {{ upgradeFactionLabel(selectedUpgrade.id) }}</span>
          <strong>{{ selectedUpgrade.title }}</strong>
          <p>{{ selectedUpgrade.desc }}</p>
        </div>
      </div>
    </section>

    <section v-if="activeBuffCards.length" class="active-buffs" :aria-label="copy.activeBuffs">
      <h2>{{ copy.activeBuffs }}</h2>
      <div class="active-buff-grid">
        <div
          v-for="buff in activeBuffCards"
          :key="buff.id"
          class="active-buff"
          :class="buff.element"
          :title="`${buffTitle(buff.id)}: ${buffDesc(buff.id)}`"
        >
          <span class="buff-pixel" aria-hidden="true" />
          <div>
            <strong>{{ buffTitle(buff.id) }}</strong>
            <small v-if="buff.count">x{{ buff.count }}</small>
            <small v-else-if="buff.pct !== undefined">{{ Math.round(buff.pct) }}%</small>
          </div>
        </div>
      </div>
    </section>

    <section v-if="castPanelOpen" class="cast-popover" aria-label="Pixel character portraits">
      <div class="cast-popover-head">
        <div>
          <h2>{{ copy.castTitle }}</h2>
          <p>{{ copy.castIntro }}</p>
        </div>
        <button type="button" @click="castPanelOpen = false">{{ copy.close }}</button>
      </div>

      <div class="cast-grid">
        <div
          v-for="member in CAST_MEMBERS"
          :key="member.id"
          class="cast-card"
          :class="{ active: member.id === 'huaqiang' }"
        >
          <div class="cast-avatar" :style="{ '--portrait-index': member.index }" />
          <span>{{ copy.cast[member.id] }}</span>
          <small>{{ member.id === 'huaqiang' ? copy.playerOnly : copy.enemyCast }}</small>
        </div>
      </div>
    </section>

    <div v-show="subtitleVisible" ref="subtitleEl" class="subtitle">
      {{ subtitleText }}
    </div>

    <div
      v-if="signatureMoment.visible"
      class="signature-moment"
      :class="signatureMoment.tone"
      aria-live="polite"
    >
      <strong>{{ signatureMoment.title }}</strong>
      <span>{{ signatureMoment.desc }}</span>
    </div>

    <section v-show="damageAlert.visible" class="damage-alert" aria-live="assertive">
      <strong>{{ copy.damageTaken }} -{{ Math.round(damageAlert.amount) }}</strong>
      <span>{{ copy.damageFrom }}：{{ damageSourceLabel(damageAlert.source) }} {{ damageAlert.direction }}</span>
      <small>{{ copy.health }} {{ Math.round(damageAlert.hpAfter) }} / {{ gameState.maxHealth }}</small>
    </section>

    <div
      v-if="milestoneOverlay.visible"
      class="milestone-burst"
      :class="milestoneOverlay.tone"
      aria-live="polite"
    >
      <strong>{{ milestoneOverlay.title }}</strong>
      <span>{{ milestoneOverlay.desc }}</span>
    </div>

    <section v-if="activeObjective" class="objective-chip" :class="activeObjective.kind" aria-live="polite">
      <div class="objective-chip-head">
        <span>{{ copy.objective }}</span>
        <strong>{{ activeObjective.direction }} {{ activeObjective.title }}</strong>
      </div>
      <p>{{ activeObjective.desc }}</p>
      <div class="objective-risk-reward">
        <small><b>{{ copy.landmarkRisk }}</b>{{ activeObjective.risk }}</small>
        <small><b>{{ copy.landmarkReward }}</b>{{ activeObjective.reward }}</small>
      </div>
      <div class="objective-chip-foot">
        <small>{{ copy.objectiveDistance }} {{ activeObjective.distance }}m</small>
        <small v-if="activeObjective.kind === 'fairWeight'">{{ copy.objectiveComplete }}</small>
        <small v-else-if="activeObjective.failed">{{ copy.objectiveRewardReduced }}</small>
        <small v-else>{{ activeObjective.progress }}%</small>
      </div>
      <div class="objective-progress">
        <i :style="{ width: `${activeObjective.kind === 'fairWeight' ? 100 : activeObjective.progress}%` }" />
      </div>
    </section>

    <section v-if="activeBossPhase" class="boss-phase-chip" aria-live="polite">
      <span>{{ copy.bossPhaseLabel }} {{ activeBossPhase.phase }}</span>
      <strong>{{ activeBossPhase.title }}</strong>
      <small>{{ activeBossPhase.desc }}</small>
    </section>

    <section v-if="bossGateNotice" class="boss-gate-chip" aria-live="assertive">
      <span>{{ copy.finalBossName }}</span>
      <strong>{{ bossGateNotice.title }}</strong>
      <small>{{ bossGateNotice.desc }}</small>
    </section>

    <div v-if="bossPhaseAlert.visible" class="boss-phase-toast" aria-live="assertive">
      <span>{{ copy.bossPhaseLabel }} {{ bossPhaseAlert.phase }}</span>
      <strong>{{ bossPhaseAlert.title }}</strong>
      <small>{{ bossPhaseAlert.desc }}</small>
    </div>

    <div class="input-hint" :class="{ touch: isTouchControls }">
      {{ inputHint }}
    </div>

    <div
      v-if="isTouchControls"
      class="joystick"
      @pointerdown.prevent="onJoystickDown"
      @pointermove.prevent="onJoystickMove"
      @pointerup.prevent="onJoystickUp"
      @pointercancel.prevent="onJoystickUp"
    >
      <div class="joystick-knob" :style="{ transform: `translate(${joystick.knobX}px, ${joystick.knobY}px)` }" />
    </div>

    <div
      v-if="isTouchControls"
      class="throw-zone"
      @pointerdown.prevent="onThrowDown"
      @pointermove.prevent="onThrowMove"
      @pointerup.prevent="onThrowUp"
      @pointercancel.prevent="onThrowUp"
    >
      <span>{{ copy.throw }}</span>
    </div>

    <section v-if="runObjectiveOpen" class="modal-scrim">
      <div class="modal run-goal-modal">
        <div class="modal-head">
          <h2>
            {{ copy.runGoalTitle }}
            <small>{{ copy.runGoalSubtitle }}</small>
          </h2>
          <span>{{ copy.tickerPaused }}</span>
        </div>
        <div class="run-goal-grid">
          <button
            v-for="goal in runObjectiveCards"
            :key="goal.id"
            type="button"
            class="run-goal-card"
            :class="goal.faction"
            @click="chooseRunObjective(goal.id)"
          >
            <div class="run-goal-card-head">
              <small>{{ goal.route }}</small>
              <strong>{{ goal.title }}</strong>
            </div>
            <p>{{ goal.desc }}</p>
            <div class="run-goal-reward">
              <span>{{ copy.runGoalReward }}</span>
              <em>{{ goal.reward }}</em>
            </div>
            <b>{{ copy.runGoalChoose }}</b>
          </button>
        </div>
      </div>
    </section>

    <section v-if="levelUpOpen" class="modal-scrim">
      <div class="modal">
        <div class="modal-head">
          <h2>
            {{ copy.levelUp }}
            <small v-if="MILESTONE_LEVELS.has(currentUpgradeLevel)">
              {{ copy.milestones[milestoneKey(currentUpgradeLevel)].title }}
            </small>
          </h2>
          <span>{{ copy.tickerPaused }}</span>
        </div>
        <div class="upgrade-grid" :class="{ four: upgradeChoices.length > 3 }">
          <button
            v-for="card in upgradeChoices"
            :key="card.id"
            type="button"
            class="upgrade-card"
            :class="[upgradeElementClass(card.id), upgradeArtClass(card.id)]"
            @click="chooseUpgrade(card)"
          >
            <div class="upgrade-card-meta">
              <small>{{ copy.routeTag }} {{ upgradeFactionLabel(card.id) }}</small>
              <small>{{ upgradeTierLabel(card.id) }}</small>
              <small>{{ upgradeRecommendation(card.id) }}</small>
            </div>
            <strong>{{ upgradeTitle(card.id) }}</strong>
            <span>{{ upgradeDesc(card.id) }}</span>
            <div class="upgrade-art" aria-hidden="true">
              <i class="art-core" />
              <i class="art-effect" />
              <i class="art-mark" />
            </div>
          </button>
        </div>
      </div>
    </section>

    <section v-if="gameOverOpen" class="modal-scrim">
      <div class="modal game-over">
        <h2>{{ gameWon ? copy.victory : copy.runEnded }}</h2>
        <div class="death-review">
          <span>{{ copy.deathReview }} · {{ copy.deathStats }}</span>
          <div class="death-stat-grid">
            <small v-for="stat in runStatCards" :key="stat.label">
              <b>{{ stat.value }}</b>
              {{ stat.label }}
            </small>
          </div>
          <p v-if="topDamageSourceId">
            {{ copy.deathMainThreat }}：
            <strong>{{ topDamageSourceText }}</strong>
          </p>
          <p>
            {{ copy.deathAdviceTitle }}：
            <strong>{{ deathAdviceText }}</strong>
          </p>
        </div>
        <div v-if="!gameWon && lastDamageLog" class="death-cause">
          <span>{{ copy.lastDamage }}</span>
          <strong>{{ damageLogText(lastDamageLog) }}</strong>
        </div>
        <div v-if="!gameWon && damageLogs.length > 1" class="death-log">
          <span>{{ copy.recentDamage }}</span>
          <small v-for="log in damageLogs.slice(1)" :key="log.id">{{ damageLogText(log) }}</small>
        </div>
        <button type="button" @click="restartRun">{{ copy.restart }}</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.game-shell {
  --panel: rgba(10, 10, 12, 0.68);
  --line: rgba(255, 255, 255, 0.18);
  --yellow: #ffe45c;
  --red: #ef3340;
  --green: #75d64b;
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  touch-action: none;
  color: #f8fafc;
  background: #07090e;
}

.game-shell.conqueror {
  background: #3b0507;
}

.canvas-host {
  position: absolute;
  inset: 0;
}

.crt-overlay {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 10;
  background:
    linear-gradient(rgba(255, 255, 255, 0.045) 50%, rgba(0, 0, 0, 0.18) 50%),
    linear-gradient(90deg, rgba(255, 0, 0, 0.035), rgba(0, 255, 64, 0.025), rgba(0, 128, 255, 0.035));
  background-size: 100% 4px, 6px 100%;
  mix-blend-mode: screen;
  opacity: 0.52;
}

.crt-overlay::after {
  content: "";
  position: absolute;
  inset: -2px;
  transform: translate(1px, 0);
  border-left: 2px solid rgba(239, 51, 64, 0.18);
  border-right: 2px solid rgba(56, 189, 248, 0.14);
  filter: blur(0.5px);
}

.vignette {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 11;
  background: radial-gradient(circle at center, transparent 42%, rgba(0, 0, 0, 0.68) 100%);
}

.hud {
  position: absolute;
  top: max(12px, env(safe-area-inset-top));
  left: 12px;
  z-index: 20;
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 12px;
  width: min(590px, calc(100vw - 24px));
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(8px);
}

.portrait-frame {
  position: relative;
  width: 112px;
  height: 128px;
  overflow: hidden;
  border: 2px solid rgba(255, 228, 92, 0.72);
  border-radius: 6px;
  background:
    linear-gradient(180deg, rgba(255, 228, 92, 0.16), transparent 42%),
    #09090b;
  box-shadow:
    inset 0 0 0 4px rgba(0, 0, 0, 0.62),
    0 0 26px rgba(255, 228, 92, 0.16);
}

.portrait-sprite {
  position: absolute;
  left: 8px;
  top: 6px;
  width: 96px;
  height: 96px;
  background-image: url('/assets/huaqiang-hero-pixel.svg');
  background-repeat: no-repeat;
  background-size: 96px 96px;
  background-position: 0 0;
  image-rendering: pixelated;
  transform: scale(1.08);
  transform-origin: center;
}

.portrait-frame::after {
  content: "";
  position: absolute;
  inset: auto 8px 8px;
  height: 14px;
  background:
    linear-gradient(90deg, transparent, rgba(255, 228, 92, 0.78), transparent),
    repeating-linear-gradient(90deg, rgba(255, 228, 92, 0.16) 0 4px, transparent 4px 8px);
  opacity: 0.82;
}

.portrait-scan {
  pointer-events: none;
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0 2px, transparent 2px 5px);
  mix-blend-mode: screen;
  opacity: 0.42;
}

.hud-main {
  min-width: 0;
}

.hud-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.hud-title h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1;
  letter-spacing: 0;
}

.portrait-caption {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 7px 0 0;
  color: rgba(248, 250, 252, 0.72);
  font-size: 11px;
  line-height: 1.2;
  text-transform: uppercase;
}

.portrait-caption strong {
  color: #fff7cc;
}

.portrait-caption em {
  padding: 1px 5px;
  border: 1px solid rgba(255, 228, 92, 0.4);
  border-radius: 999px;
  color: var(--yellow);
  font-style: normal;
}

.hud-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: max-content;
}

.meta-toggle,
.cast-toggle {
  height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(255, 228, 92, 0.32);
  border-radius: 6px;
  background: rgba(255, 228, 92, 0.1);
  color: #fff7cc;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.meta-toggle {
  border-color: rgba(117, 214, 75, 0.34);
  background: rgba(117, 214, 75, 0.1);
  color: #ecfccb;
}

.meta-toggle:hover,
.meta-toggle[aria-expanded="true"],
.cast-toggle:hover,
.cast-toggle[aria-expanded="true"] {
  border-color: rgba(255, 228, 92, 0.68);
  background: rgba(255, 228, 92, 0.18);
}

.locale-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.locale-control select {
  height: 28px;
  min-width: 96px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.48);
  color: #f8fafc;
  font: inherit;
  font-size: 12px;
  outline: none;
}

.hud-title span,
.meter-row {
  font-size: 12px;
  color: rgba(248, 250, 252, 0.82);
}

.meter-group {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.meter-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
}

.meter-track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}

.meter-fill {
  height: 100%;
  border-radius: inherit;
  transition: width 90ms linear;
}

.meter-fill.hp {
  background: var(--red);
}

.meter-fill.temper {
  background: var(--yellow);
}

.meter-fill.exp {
  background: var(--green);
}

.build-route {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  color: rgba(248, 250, 252, 0.72);
  font-size: 11px;
}

.build-route strong {
  color: #fff7cc;
}

.build-chip-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}

.build-chip-row small,
.upgrade-card-meta small {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  color: rgba(248, 250, 252, 0.76);
  font-size: 9px;
  font-weight: 900;
  line-height: 1;
}

.build-chip-row small {
  padding: 3px 5px;
}

.build-chip-row .fire,
.upgrade-card.fire .upgrade-card-meta small:first-child {
  border-color: rgba(248, 113, 22, 0.42);
  color: #fed7aa;
}

.build-chip-row .ice,
.upgrade-card.ice .upgrade-card-meta small:first-child {
  border-color: rgba(125, 211, 252, 0.42);
  color: #bae6fd;
}

.build-chip-row .magnet,
.upgrade-card.magnet .upgrade-card-meta small:first-child {
  border-color: rgba(56, 189, 248, 0.42);
  color: #7dd3fc;
}

.build-chip-row .temper,
.upgrade-card.temper .upgrade-card-meta small:first-child {
  border-color: rgba(239, 51, 64, 0.46);
  color: #fecaca;
}

.build-chip-row .survival,
.upgrade-card.survival .upgrade-card-meta small:first-child {
  border-color: rgba(117, 214, 75, 0.46);
  color: #d9f99d;
}

.build-chip-row .growth,
.upgrade-card.growth .upgrade-card-meta small:first-child {
  border-color: rgba(255, 228, 92, 0.48);
  color: #fef08a;
}

.build-chip-row .risk,
.upgrade-card.risk .upgrade-card-meta small:first-child {
  border-color: rgba(251, 146, 60, 0.52);
  color: #fed7aa;
}

.archetype-track-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
}

.archetype-track {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 7px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.22);
}

.archetype-track.online {
  border-color: rgba(255, 228, 92, 0.38);
  background:
    repeating-linear-gradient(90deg, rgba(255, 228, 92, 0.045) 0 5px, transparent 5px 10px),
    rgba(0, 0, 0, 0.26);
}

.archetype-track.finisher {
  border-color: rgba(255, 228, 92, 0.68);
  box-shadow: inset 0 0 22px rgba(255, 228, 92, 0.08);
}

.archetype-track.fire {
  --track-color: #f97316;
}

.archetype-track.ice {
  --track-color: #7dd3fc;
}

.archetype-track.magnet {
  --track-color: #38bdf8;
}

.archetype-track.temper {
  --track-color: #ef3340;
}

.archetype-track > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.archetype-track strong {
  color: #fff7cc;
  font-size: 10px;
  line-height: 1;
}

.archetype-track span {
  color: var(--track-color);
  font-size: 9px;
  font-weight: 900;
  line-height: 1;
  text-transform: uppercase;
}

.archetype-track small {
  overflow: hidden;
  color: rgba(248, 250, 252, 0.62);
  font-size: 9px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archetype-track i {
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}

.archetype-track b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--track-color), #ffe45c);
}

.run-goal-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 10px;
  align-items: center;
  margin-top: 9px;
  padding: 7px 8px;
  border: 1px solid rgba(255, 228, 92, 0.22);
  border-radius: 7px;
  background:
    repeating-linear-gradient(90deg, rgba(255, 228, 92, 0.04) 0 5px, transparent 5px 10px),
    rgba(0, 0, 0, 0.22);
}

.run-goal-strip.fire {
  border-color: rgba(248, 113, 22, 0.32);
}

.run-goal-strip.survival {
  border-color: rgba(117, 214, 75, 0.36);
}

.run-goal-strip.risk {
  border-color: rgba(251, 146, 60, 0.4);
}

.run-goal-strip.complete {
  border-color: rgba(117, 214, 75, 0.62);
  background: rgba(117, 214, 75, 0.09);
}

.run-goal-strip span {
  display: block;
  color: rgba(255, 228, 92, 0.74);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.06em;
  line-height: 1;
  text-transform: uppercase;
}

.run-goal-strip strong {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: #fff7cc;
  font-size: 11px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-goal-strip small {
  color: rgba(248, 250, 252, 0.7);
  font-size: 10px;
  font-weight: 900;
}

.run-goal-strip i {
  grid-column: 1 / -1;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}

.run-goal-strip b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #ef3340, #ffe45c);
}

.run-goal-strip.survival b {
  background: linear-gradient(90deg, #75d64b, #ffe45c);
}

.run-goal-strip.risk b {
  background: linear-gradient(90deg, #fb923c, #ef3340);
}

.run-goal-badge {
  display: grid;
  gap: 3px;
  margin-top: 7px;
  padding: 7px 9px;
  border: 1px solid rgba(117, 214, 75, 0.46);
  border-radius: 7px;
  background:
    repeating-linear-gradient(90deg, rgba(117, 214, 75, 0.07) 0 5px, transparent 5px 10px),
    rgba(0, 0, 0, 0.28);
  box-shadow: 0 0 18px rgba(117, 214, 75, 0.1);
}

.run-goal-badge.fire {
  border-color: rgba(248, 113, 22, 0.42);
  background:
    repeating-linear-gradient(90deg, rgba(248, 113, 22, 0.07) 0 5px, transparent 5px 10px),
    rgba(0, 0, 0, 0.28);
}

.run-goal-badge.risk {
  border-color: rgba(251, 146, 60, 0.46);
  background:
    repeating-linear-gradient(90deg, rgba(251, 146, 60, 0.08) 0 5px, transparent 5px 10px),
    rgba(0, 0, 0, 0.28);
}

.run-goal-badge span {
  color: rgba(117, 214, 75, 0.84);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.run-goal-badge.fire span {
  color: #fed7aa;
}

.run-goal-badge.risk span {
  color: #fdba74;
}

.run-goal-badge strong {
  color: rgba(248, 250, 252, 0.84);
  font-size: 10px;
  font-weight: 900;
  line-height: 1.3;
}

.minimap-panel {
  position: absolute;
  top: max(12px, env(safe-area-inset-top));
  right: max(12px, env(safe-area-inset-right));
  z-index: 26;
  width: min(238px, calc(100vw - 24px));
  padding: 10px;
  border: 1px solid rgba(255, 228, 92, 0.32);
  border-radius: 9px;
  background:
    radial-gradient(circle at 50% 46%, rgba(255, 228, 92, 0.12), transparent 58%),
    rgba(7, 8, 10, 0.7);
  box-shadow:
    0 0 0 3px rgba(0, 0, 0, 0.2),
    0 14px 38px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(8px);
}

.minimap-panel header,
.minimap-panel footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.minimap-panel header {
  margin-bottom: 7px;
}

.minimap-panel header span {
  color: rgba(255, 228, 92, 0.8);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.minimap-panel header strong {
  overflow: hidden;
  color: #fff7cc;
  font-size: 11px;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.minimap-svg {
  display: block;
  width: 100%;
  aspect-ratio: 1.22;
  overflow: visible;
}

.minimap-svg rect {
  fill: rgba(0, 0, 0, 0.46);
  stroke: rgba(255, 228, 92, 0.2);
  stroke-width: 1;
}

.minimap-range {
  fill: url("#minimapGlow");
  stroke: rgba(117, 214, 75, 0.18);
  stroke-width: 1;
  stroke-dasharray: 2 3;
}

.minimap-cross {
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 0.6;
}

.minimap-dot {
  vector-effect: non-scaling-stroke;
}

.minimap-dot.enemy {
  fill: #ef3340;
  opacity: 0.82;
}

.minimap-dot.enemy.metal {
  fill: #a1a1aa;
}

.minimap-dot.enemy.elite {
  stroke: #ffe45c;
  stroke-width: 0.8;
}

.minimap-dot.event {
  fill: #75d64b;
  stroke: #fff7cc;
  stroke-width: 0.9;
}

.minimap-dot.event.marketAmbush,
.minimap-dot.event.challengePledge {
  fill: #ef3340;
}

.minimap-dot.boss {
  fill: #ef3340;
  stroke: #ffe45c;
  stroke-width: 1.3;
  filter: drop-shadow(0 0 3px rgba(239, 51, 64, 0.8));
}

.minimap-player {
  fill: #ffe45c;
  stroke: #050505;
  stroke-width: 1.1;
  filter: drop-shadow(0 0 3px rgba(255, 228, 92, 0.72));
}

.minimap-panel footer {
  margin-top: 6px;
  justify-content: flex-start;
}

.minimap-panel footer span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: rgba(248, 250, 252, 0.66);
  font-size: 8px;
  font-weight: 900;
  line-height: 1;
}

.minimap-panel footer i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ef3340;
}

.minimap-panel footer .self {
  border-radius: 1px;
  background: #ffe45c;
}

.minimap-panel footer .boss {
  box-shadow: 0 0 0 1px #ffe45c;
}

.minimap-panel footer .event {
  background: #75d64b;
}

.landmark-badges {
  display: grid;
  gap: 5px;
  margin-top: 7px;
  padding: 7px 8px;
  border: 1px solid rgba(255, 228, 92, 0.22);
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.24);
}

.landmark-badges > span {
  color: rgba(255, 228, 92, 0.72);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.06em;
  line-height: 1;
  text-transform: uppercase;
}

.landmark-badges > div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.landmark-badges small {
  max-width: 100%;
  overflow: hidden;
  padding: 3px 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(248, 250, 252, 0.78);
  font-size: 9px;
  font-weight: 900;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.landmark-badges .magnet {
  border-color: rgba(56, 189, 248, 0.38);
  color: #7dd3fc;
}

.landmark-badges .survival {
  border-color: rgba(117, 214, 75, 0.4);
  color: #d9f99d;
}

.landmark-badges .temper {
  border-color: rgba(239, 51, 64, 0.42);
  color: #fecaca;
}

.landmark-badges .rare {
  border-color: rgba(250, 204, 21, 0.48);
  color: #fef08a;
}

.cast-popover {
  position: absolute;
  top: max(166px, calc(env(safe-area-inset-top) + 154px));
  left: 12px;
  z-index: 34;
  width: min(530px, calc(100vw - 24px));
  padding: 12px;
  border: 1px solid rgba(255, 228, 92, 0.28);
  border-radius: 8px;
  background: rgba(8, 8, 10, 0.84);
  box-shadow: 0 18px 56px rgba(0, 0, 0, 0.44);
  backdrop-filter: blur(10px);
}

.cast-popover-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.cast-popover h2 {
  margin: 0 0 4px;
  color: #fff7cc;
  font-size: 16px;
}

.cast-popover p {
  margin: 0;
  color: rgba(248, 250, 252, 0.64);
  font-size: 11px;
  line-height: 1.35;
}

.cast-popover-head button {
  padding: 5px 9px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(248, 250, 252, 0.78);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.cast-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.cast-card {
  min-width: 0;
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 5px 3px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.24);
}

.cast-card.active {
  border-color: rgba(255, 228, 92, 0.58);
  background: rgba(255, 228, 92, 0.08);
}

.cast-avatar {
  width: 32px;
  height: 32px;
  background-image: url('/assets/huaqiang-cast-pixel.svg');
  background-repeat: no-repeat;
  background-size: 160px 32px;
  background-position: calc(var(--portrait-index) * -32px) 0;
  image-rendering: pixelated;
}

.cast-card span {
  max-width: 100%;
  overflow: hidden;
  color: rgba(248, 250, 252, 0.74);
  font-size: 9px;
  line-height: 1.1;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cast-card small {
  max-width: 100%;
  overflow: hidden;
  color: rgba(255, 228, 92, 0.66);
  font-size: 8px;
  line-height: 1;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cast-card:not(.active) small {
  color: rgba(248, 250, 252, 0.42);
}

.meta-goals-panel {
  position: absolute;
  top: max(166px, calc(env(safe-area-inset-top) + 154px));
  right: 12px;
  z-index: 35;
  width: min(340px, calc(100vw - 24px));
  padding: 12px;
  border: 1px solid rgba(117, 214, 75, 0.32);
  border-radius: 8px;
  background:
    repeating-linear-gradient(90deg, rgba(117, 214, 75, 0.045) 0 6px, transparent 6px 12px),
    rgba(8, 8, 10, 0.86);
  box-shadow: 0 18px 56px rgba(0, 0, 0, 0.44);
  backdrop-filter: blur(10px);
}

.meta-goals-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.meta-goals-head strong {
  color: #ecfccb;
  font-size: 15px;
  font-weight: 900;
}

.meta-goals-head button {
  padding: 5px 9px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(248, 250, 252, 0.78);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.meta-goal-list {
  display: grid;
  gap: 8px;
}

.meta-goal {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 10px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.26);
}

.meta-goal.complete {
  border-color: rgba(117, 214, 75, 0.52);
  background: rgba(117, 214, 75, 0.08);
}

.meta-goal strong {
  display: block;
  color: #fff7cc;
  font-size: 12px;
  line-height: 1.1;
}

.meta-goal span {
  display: block;
  margin-top: 3px;
  color: rgba(248, 250, 252, 0.64);
  font-size: 10px;
  line-height: 1.3;
}

.meta-goal small {
  color: rgba(255, 228, 92, 0.78);
  font-size: 10px;
  font-weight: 900;
}

.meta-goal i {
  grid-column: 1 / -1;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}

.meta-goal b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #75d64b, #ffe45c);
}

.owned-upgrades {
  position: absolute;
  top: max(222px, calc(env(safe-area-inset-top) + 210px));
  right: max(12px, env(safe-area-inset-right));
  z-index: 21;
  width: min(238px, calc(100vw - 24px));
  padding: 10px;
  border: 1px solid rgba(255, 228, 92, 0.2);
  border-radius: 8px;
  background: rgba(7, 8, 10, 0.62);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(8px);
}

.owned-upgrades h2 {
  margin: 0 0 8px;
  color: rgba(255, 247, 204, 0.82);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.owned-upgrade-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}

.owned-upgrade {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 5px;
  background: var(--art-bg, rgba(255, 255, 255, 0.08));
  cursor: pointer;
  padding: 0;
}

.owned-upgrade:hover,
.owned-upgrade.selected {
  border-color: rgba(255, 228, 92, 0.68);
  box-shadow: 0 0 0 2px rgba(255, 228, 92, 0.12);
}

.owned-upgrade-icon {
  position: absolute;
  inset: 0;
}

.owned-upgrade-detail {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 9px;
  margin-top: 10px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background:
    var(--art-bg),
    rgba(0, 0, 0, 0.34);
}

.owned-upgrade-detail-art {
  position: relative;
  width: 46px;
  height: 46px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.28);
}

.owned-upgrade-detail-art .art-core {
  transform: translate(-50%, -50%) scale(0.55);
}

.owned-upgrade-detail-art .art-effect {
  transform: translate(-50%, -50%) rotate(45deg) scale(0.55);
}

.owned-upgrade-detail-art .art-mark {
  transform: translate(-50%, -50%) scale(0.55);
}

.owned-upgrade-detail span {
  display: block;
  margin-bottom: 2px;
  color: rgba(255, 228, 92, 0.7);
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.owned-upgrade-detail strong {
  display: block;
  color: #fff7cc;
  font-size: 12px;
  line-height: 1.1;
}

.owned-upgrade-detail p {
  margin: 4px 0 0;
  color: rgba(248, 250, 252, 0.68);
  font-size: 10px;
  line-height: 1.35;
}

.active-buffs {
  position: absolute;
  bottom: max(12px, env(safe-area-inset-bottom));
  left: 12px;
  z-index: 20;
  width: min(380px, calc(100vw - 24px));
  padding: 7px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 8px;
  background: rgba(7, 8, 10, 0.42);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.22);
  opacity: 0.82;
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.active-buffs h2 {
  margin: 0 0 5px;
  color: rgba(255, 247, 204, 0.78);
  font-size: 9px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.active-buff-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
}

.active-buff {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 5px;
  align-items: center;
  min-width: 0;
  padding: 4px 5px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.26);
}

.active-buff.fire {
  border-color: rgba(248, 113, 22, 0.28);
}

.active-buff.ice {
  border-color: rgba(125, 211, 252, 0.3);
}

.buff-pixel {
  width: 13px;
  height: 13px;
  background: #facc15;
  box-shadow:
    0 -5px 0 rgba(255, 255, 255, 0.2),
    -5px 5px 0 rgba(255, 255, 255, 0.12),
    5px 5px 0 rgba(0, 0, 0, 0.22);
}

.active-buff.fire .buff-pixel {
  background: #f97316;
  box-shadow:
    0 -6px 0 #facc15,
    -5px 6px 0 #ef4444,
    5px 4px 0 #fb923c;
}

.active-buff.ice .buff-pixel {
  background: #7dd3fc;
  box-shadow:
    0 -6px 0 #e0f2fe,
    -6px 0 0 #38bdf8,
    6px 0 0 #bae6fd;
}

.active-buff strong {
  display: block;
  overflow: hidden;
  color: rgba(248, 250, 252, 0.82);
  font-size: 9px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.active-buff small {
  display: block;
  margin-top: 2px;
  color: rgba(255, 228, 92, 0.72);
  font-size: 8px;
  line-height: 1;
}

.subtitle {
  pointer-events: none;
  position: absolute;
  left: 50%;
  top: max(122px, calc(env(safe-area-inset-top) + 110px));
  z-index: 38;
  width: fit-content;
  max-width: min(620px, calc(100vw - 28px));
  transform: translateX(-50%);
  padding: 7px 14px 8px;
  border: 1px solid rgba(255, 228, 92, 0.42);
  border-radius: 999px;
  background:
    repeating-linear-gradient(90deg, rgba(255, 228, 92, 0.08) 0 6px, transparent 6px 12px),
    rgba(8, 8, 10, 0.74);
  color: var(--yellow);
  font-size: clamp(17px, 2.4vw, 28px);
  font-weight: 900;
  line-height: 1.1;
  text-align: center;
  box-shadow:
    0 0 0 3px rgba(0, 0, 0, 0.2),
    0 12px 34px rgba(0, 0, 0, 0.3);
  text-shadow:
    2px 2px 0 #000,
    0 0 12px rgba(239, 51, 64, 0.42);
  -webkit-text-stroke: 1px #111;
  backdrop-filter: blur(6px);
}

.signature-moment {
  pointer-events: none;
  position: absolute;
  left: 50%;
  top: 31%;
  z-index: 49;
  display: grid;
  justify-items: center;
  width: min(560px, calc(100vw - 32px));
  transform: translateX(-50%);
  padding: 12px 16px;
  border: 2px solid rgba(255, 228, 92, 0.72);
  border-radius: 8px;
  background:
    repeating-linear-gradient(90deg, rgba(255, 228, 92, 0.1) 0 7px, transparent 7px 13px),
    rgba(8, 8, 10, 0.88);
  box-shadow:
    0 0 0 4px rgba(0, 0, 0, 0.34),
    0 0 58px rgba(255, 228, 92, 0.26);
  text-align: center;
}

.signature-moment.red {
  border-color: rgba(239, 51, 64, 0.78);
  background:
    repeating-linear-gradient(90deg, rgba(239, 51, 64, 0.14) 0 7px, transparent 7px 13px),
    rgba(28, 5, 7, 0.9);
}

.signature-moment.green {
  border-color: rgba(117, 214, 75, 0.74);
  box-shadow:
    0 0 0 4px rgba(0, 0, 0, 0.34),
    0 0 46px rgba(117, 214, 75, 0.24);
}

.signature-moment strong {
  color: #ffe45c;
  font-size: clamp(24px, 4.4vw, 48px);
  font-weight: 900;
  line-height: 1;
  text-shadow:
    3px 3px 0 #000,
    0 0 16px rgba(239, 51, 64, 0.44);
}

.signature-moment span {
  margin-top: 7px;
  color: rgba(248, 250, 252, 0.84);
  font-size: clamp(11px, 1.8vw, 15px);
  font-weight: 900;
}

.damage-flash {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 22;
  opacity: 0;
  background:
    radial-gradient(circle at center, transparent 44%, rgba(239, 51, 64, 0.22) 100%),
    linear-gradient(90deg, rgba(239, 51, 64, 0.16), transparent 18%, transparent 82%, rgba(239, 51, 64, 0.16));
  mix-blend-mode: screen;
  transition: opacity 160ms ease;
}

.damage-flash.visible {
  opacity: 1;
  animation: damage-flash 520ms ease-out both;
}

.damage-alert {
  pointer-events: none;
  position: absolute;
  top: max(118px, calc(env(safe-area-inset-top) + 108px));
  right: max(12px, env(safe-area-inset-right));
  z-index: 36;
  display: grid;
  gap: 4px;
  width: min(310px, calc(100vw - 28px));
  padding: 10px 12px;
  border: 2px solid rgba(239, 51, 64, 0.72);
  border-radius: 8px;
  background:
    repeating-linear-gradient(90deg, rgba(239, 51, 64, 0.08) 0 6px, transparent 6px 12px),
    rgba(12, 6, 7, 0.86);
  box-shadow:
    0 0 0 3px rgba(0, 0, 0, 0.28),
    0 18px 45px rgba(0, 0, 0, 0.42);
  animation: damage-alert-pop 240ms ease-out both;
}

.damage-alert strong {
  color: #ffe45c;
  font-size: 16px;
  font-weight: 900;
  line-height: 1;
  text-shadow: 2px 2px 0 #000;
}

.damage-alert span,
.damage-alert small {
  color: rgba(248, 250, 252, 0.86);
  font-size: 11px;
  font-weight: 900;
  line-height: 1.25;
}

.damage-alert small {
  color: rgba(254, 202, 202, 0.92);
}

.milestone-burst {
  pointer-events: none;
  position: absolute;
  left: 50%;
  top: 27%;
  z-index: 48;
  display: grid;
  justify-items: center;
  width: min(620px, calc(100vw - 32px));
  transform: translateX(-50%);
  padding: 14px 18px;
  border: 2px solid rgba(255, 228, 92, 0.52);
  border-radius: 8px;
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0 6px, transparent 6px 12px),
    rgba(8, 8, 10, 0.82);
  box-shadow:
    0 0 0 4px rgba(0, 0, 0, 0.3),
    0 22px 80px rgba(0, 0, 0, 0.54);
  text-align: center;
}

.milestone-burst.legend {
  border-color: rgba(255, 228, 92, 0.78);
  box-shadow:
    0 0 0 4px rgba(0, 0, 0, 0.34),
    0 0 38px rgba(255, 228, 92, 0.24);
}

.milestone-burst.final {
  border-color: rgba(239, 51, 64, 0.78);
  background:
    repeating-linear-gradient(90deg, rgba(239, 51, 64, 0.12) 0 8px, transparent 8px 14px),
    rgba(28, 5, 7, 0.88);
  box-shadow:
    0 0 0 4px rgba(0, 0, 0, 0.38),
    0 0 46px rgba(239, 51, 64, 0.36);
}

.milestone-burst strong {
  color: #ffe45c;
  font-size: clamp(24px, 5vw, 48px);
  font-weight: 900;
  line-height: 1;
  text-shadow: 3px 3px 0 #000;
}

.milestone-burst span {
  margin-top: 8px;
  color: rgba(248, 250, 252, 0.82);
  font-size: clamp(12px, 2vw, 16px);
  font-weight: 800;
}

.objective-chip {
  position: absolute;
  top: auto;
  bottom: max(54px, calc(env(safe-area-inset-bottom) + 42px));
  left: 50%;
  z-index: 23;
  width: min(330px, calc(100vw - 28px));
  transform: translateX(-50%);
  padding: 10px;
  border: 1px solid rgba(255, 228, 92, 0.26);
  border-radius: 8px;
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 5px, transparent 5px 10px),
    rgba(7, 8, 10, 0.68);
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(8px);
}

.objective-chip.fakeScale {
  border-color: rgba(255, 228, 92, 0.36);
}

.objective-chip.fairWeight {
  border-color: rgba(117, 214, 75, 0.36);
}

.objective-chip.marketAmbush {
  border-color: rgba(239, 51, 64, 0.42);
}

.objective-chip.challengePledge {
  border-color: rgba(251, 146, 60, 0.46);
}

.objective-chip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.objective-chip-head span,
.objective-chip-foot small {
  color: rgba(255, 228, 92, 0.72);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.objective-chip-head strong {
  overflow: hidden;
  color: #fff7cc;
  font-size: 12px;
  line-height: 1.1;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.objective-chip p {
  margin: 6px 0 7px;
  color: rgba(248, 250, 252, 0.7);
  font-size: 10px;
  line-height: 1.35;
}

.objective-risk-reward {
  display: grid;
  gap: 4px;
  margin: 0 0 7px;
}

.objective-risk-reward small {
  display: block;
  color: rgba(248, 250, 252, 0.62);
  font-size: 9px;
  font-weight: 800;
  line-height: 1.25;
}

.objective-risk-reward b {
  margin-right: 5px;
  color: rgba(255, 228, 92, 0.82);
  font-weight: 900;
}

.objective-chip-foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.objective-progress {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}

.objective-progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #75d64b, #ffe45c);
  transition: width 120ms linear;
}

.objective-chip.marketAmbush .objective-progress i {
  background: linear-gradient(90deg, #ef3340, #ffe45c);
}

.objective-chip.challengePledge .objective-progress i {
  background: linear-gradient(90deg, #fb923c, #ffe45c);
}

.boss-phase-chip {
  position: absolute;
  top: max(166px, calc(env(safe-area-inset-top) + 154px));
  left: 50%;
  z-index: 31;
  display: grid;
  justify-items: center;
  width: min(330px, calc(100vw - 28px));
  transform: translateX(-50%);
  padding: 8px 10px;
  border: 1px solid rgba(239, 51, 64, 0.34);
  border-radius: 8px;
  background:
    repeating-linear-gradient(90deg, rgba(239, 51, 64, 0.07) 0 6px, transparent 6px 12px),
    rgba(9, 6, 7, 0.66);
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.3);
  text-align: center;
  backdrop-filter: blur(8px);
}

.boss-gate-chip {
  pointer-events: none;
  position: absolute;
  top: max(166px, calc(env(safe-area-inset-top) + 154px));
  left: 50%;
  z-index: 33;
  display: grid;
  justify-items: center;
  width: min(390px, calc(100vw - 28px));
  transform: translateX(-50%);
  padding: 10px 12px;
  border: 2px solid rgba(239, 51, 64, 0.74);
  border-radius: 8px;
  background:
    repeating-linear-gradient(90deg, rgba(239, 51, 64, 0.12) 0 7px, transparent 7px 14px),
    rgba(18, 7, 8, 0.82);
  box-shadow:
    0 0 0 3px rgba(0, 0, 0, 0.3),
    0 0 34px rgba(239, 51, 64, 0.26);
  text-align: center;
  backdrop-filter: blur(8px);
}

.boss-phase-chip span,
.boss-gate-chip span,
.boss-phase-toast span {
  color: rgba(255, 228, 92, 0.78);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.boss-phase-chip strong,
.boss-gate-chip strong,
.boss-phase-toast strong {
  display: block;
  margin-top: 4px;
  color: #fff7cc;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.1;
  text-shadow: 2px 2px 0 #000;
}

.boss-phase-chip small,
.boss-gate-chip small,
.boss-phase-toast small {
  display: block;
  margin-top: 4px;
  color: rgba(248, 250, 252, 0.72);
  font-size: 10px;
  font-weight: 800;
  line-height: 1.3;
}

.boss-gate-chip strong {
  color: #ffe45c;
  font-size: 16px;
}

.boss-phase-toast {
  pointer-events: none;
  position: absolute;
  top: max(176px, calc(env(safe-area-inset-top) + 164px));
  right: max(12px, env(safe-area-inset-right));
  z-index: 47;
  width: min(340px, calc(100vw - 28px));
  padding: 11px 12px;
  border: 2px solid rgba(239, 51, 64, 0.68);
  border-radius: 8px;
  background:
    repeating-linear-gradient(90deg, rgba(239, 51, 64, 0.11) 0 7px, transparent 7px 14px),
    rgba(18, 7, 8, 0.9);
  box-shadow:
    0 0 0 3px rgba(0, 0, 0, 0.28),
    0 18px 52px rgba(0, 0, 0, 0.44);
}

.boss-phase-toast strong {
  color: #ffe45c;
  font-size: 18px;
}

.input-hint {
  pointer-events: none;
  position: absolute;
  left: 50%;
  right: auto;
  bottom: max(12px, env(safe-area-inset-bottom));
  z-index: 24;
  max-width: min(360px, calc(100vw - 32px));
  transform: translateX(-50%);
  padding: 6px 10px;
  border: 1px solid rgba(255, 228, 92, 0.16);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
  color: rgba(255, 247, 204, 0.58);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.01em;
  text-align: center;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(6px);
}

.input-hint.touch {
  display: none;
}

.joystick,
.throw-zone {
  position: absolute;
  z-index: 25;
  bottom: max(22px, env(safe-area-inset-bottom));
  user-select: none;
  -webkit-user-select: none;
}

.joystick {
  left: 22px;
  width: 132px;
  height: 132px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(8px);
}

.joystick-knob {
  position: absolute;
  left: 43px;
  top: 43px;
  width: 46px;
  height: 46px;
  border: 2px solid rgba(255, 228, 92, 0.85);
  border-radius: 50%;
  background: rgba(255, 228, 92, 0.22);
  box-shadow: 0 0 18px rgba(255, 228, 92, 0.35);
}

.throw-zone {
  right: 22px;
  display: grid;
  place-items: center;
  width: 138px;
  height: 138px;
  border: 1px solid rgba(239, 51, 64, 0.55);
  border-radius: 50%;
  background: rgba(239, 51, 64, 0.18);
  color: #fff7cc;
  font-weight: 800;
  box-shadow: inset 0 0 28px rgba(239, 51, 64, 0.22);
  backdrop-filter: blur(8px);
}

.modal-scrim {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(0, 0, 0, 0.74);
}

.modal {
  width: min(860px, 100%);
  padding: 20px;
  border: 1px solid rgba(255, 228, 92, 0.34);
  border-radius: 8px;
  background: rgba(18, 18, 18, 0.95);
  box-shadow: 0 24px 90px rgba(0, 0, 0, 0.6);
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.modal h2 {
  margin: 0;
  color: #fff7cc;
  font-size: 24px;
}

.modal h2 small {
  display: block;
  margin-top: 5px;
  color: rgba(255, 228, 92, 0.78);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.modal-head span {
  color: rgba(248, 250, 252, 0.72);
  font-size: 12px;
}

.run-goal-modal {
  width: min(920px, 100%);
}

.run-goal-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.run-goal-card {
  display: flex;
  min-height: 260px;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  padding: 15px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.035) 0 4px, transparent 4px 8px),
    rgba(24, 24, 27, 0.92);
  color: #f8fafc;
  text-align: left;
  cursor: pointer;
}

.run-goal-card.fire {
  border-color: rgba(248, 113, 22, 0.38);
  box-shadow: inset 0 0 32px rgba(239, 68, 68, 0.08);
}

.run-goal-card.risk {
  border-color: rgba(251, 146, 60, 0.42);
  box-shadow: inset 0 0 32px rgba(251, 146, 60, 0.09);
}

.run-goal-card.survival {
  border-color: rgba(117, 214, 75, 0.38);
  box-shadow: inset 0 0 32px rgba(117, 214, 75, 0.08);
}

.run-goal-card:hover {
  border-color: rgba(255, 228, 92, 0.76);
  background:
    repeating-linear-gradient(0deg, rgba(255, 228, 92, 0.055) 0 4px, transparent 4px 8px),
    rgba(39, 39, 42, 0.96);
}

.run-goal-card-head small,
.run-goal-reward span {
  color: rgba(255, 228, 92, 0.72);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.run-goal-card-head strong {
  display: block;
  margin-top: 8px;
  color: #bef264;
  font-size: 21px;
  line-height: 1.1;
}

.run-goal-card p {
  margin: 0;
  color: rgba(248, 250, 252, 0.78);
  font-size: 13px;
  line-height: 1.45;
}

.run-goal-reward {
  display: grid;
  gap: 6px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.24);
}

.run-goal-reward em {
  color: rgba(248, 250, 252, 0.82);
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
  line-height: 1.35;
}

.run-goal-card > b {
  display: inline-flex;
  width: fit-content;
  padding: 7px 10px;
  border: 1px solid rgba(117, 214, 75, 0.58);
  border-radius: 999px;
  background: rgba(117, 214, 75, 0.14);
  color: #ecfccb;
  font-size: 12px;
  font-weight: 900;
}

.upgrade-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.upgrade-grid.four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.upgrade-card {
  min-height: 244px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(39, 39, 42, 0.86);
  color: #f8fafc;
  text-align: left;
  cursor: pointer;
}

.upgrade-card.fire {
  border-color: rgba(248, 113, 22, 0.28);
}

.upgrade-card.ice {
  border-color: rgba(125, 211, 252, 0.3);
}

.upgrade-card.magnet {
  border-color: rgba(56, 189, 248, 0.28);
}

.upgrade-card.temper {
  border-color: rgba(239, 51, 64, 0.32);
}

.upgrade-card.survival {
  border-color: rgba(117, 214, 75, 0.3);
}

.upgrade-card.growth {
  border-color: rgba(255, 228, 92, 0.3);
}

.upgrade-card.risk {
  border-color: rgba(251, 146, 60, 0.4);
  box-shadow: inset 0 0 24px rgba(251, 146, 60, 0.08);
}

.upgrade-card.rare {
  border-color: rgba(250, 204, 21, 0.48);
  box-shadow: inset 0 0 24px rgba(250, 204, 21, 0.08);
}

.upgrade-card:hover {
  border-color: rgba(117, 214, 75, 0.72);
  background: rgba(55, 65, 81, 0.92);
}

.upgrade-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
}

.upgrade-card-meta small {
  padding: 4px 6px;
}

.upgrade-card strong {
  display: block;
  margin-bottom: 8px;
  color: #bef264;
  font-size: 18px;
}

.upgrade-card span {
  color: rgba(248, 250, 252, 0.76);
  font-size: 14px;
  line-height: 1.45;
}

.upgrade-art,
.owned-upgrade-icon {
  --art-bg: linear-gradient(180deg, rgba(255, 228, 92, 0.16), rgba(0, 0, 0, 0.12));
  --art-core: #ffe45c;
  --art-effect: #ef3340;
  --art-mark: #101010;
}

.upgrade-art {
  position: relative;
  height: 94px;
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background:
    var(--art-bg),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.06) 0 3px, transparent 3px 6px),
    #111113;
  image-rendering: pixelated;
}

.art-core,
.art-effect,
.art-mark {
  position: absolute;
  display: block;
  image-rendering: pixelated;
}

.art-core {
  left: 50%;
  top: 52%;
  width: 42px;
  height: 34px;
  transform: translate(-50%, -50%);
  background: var(--art-core);
  box-shadow:
    -8px 4px 0 var(--art-core),
    8px 4px 0 var(--art-core),
    0 -8px 0 rgba(255, 255, 255, 0.16),
    0 14px 0 rgba(0, 0, 0, 0.28);
}

.art-effect {
  left: 50%;
  top: 50%;
  width: 12px;
  height: 54px;
  transform: translate(-50%, -50%) rotate(45deg);
  background: var(--art-effect);
  box-shadow:
    -18px 18px 0 rgba(255, 255, 255, 0.14),
    18px -18px 0 rgba(255, 255, 255, 0.1);
}

.art-mark {
  left: 50%;
  top: 50%;
  width: 10px;
  height: 10px;
  transform: translate(-50%, -50%);
  background: var(--art-mark);
  box-shadow:
    -14px 0 0 var(--art-mark),
    14px 0 0 var(--art-mark),
    0 -14px 0 var(--art-mark),
    0 14px 0 var(--art-mark);
}

.owned-upgrade-icon .art-core {
  transform: translate(-50%, -50%) scale(0.45);
}

.owned-upgrade-icon .art-effect {
  transform: translate(-50%, -50%) rotate(45deg) scale(0.45);
}

.owned-upgrade-icon .art-mark {
  transform: translate(-50%, -50%) scale(0.45);
}

.upgrade-art--motorcycle-dash {
  --art-bg: linear-gradient(180deg, rgba(250, 204, 21, 0.14), rgba(15, 23, 42, 0.28));
  --art-core: #202020;
  --art-effect: #facc15;
  --art-mark: #ef3340;
}

.upgrade-art--motorcycle-dash .art-core {
  width: 54px;
  height: 18px;
  box-shadow:
    -24px 14px 0 #111,
    24px 14px 0 #111,
    -24px 18px 0 #facc15,
    24px 18px 0 #facc15;
}

.upgrade-art--magnet-detector {
  --art-bg: linear-gradient(180deg, rgba(56, 189, 248, 0.15), rgba(0, 0, 0, 0.32));
  --art-core: #27272a;
  --art-effect: #38bdf8;
  --art-mark: #facc15;
}

.upgrade-art--magnet-detector .art-core {
  width: 50px;
  height: 44px;
  border: 10px solid #38bdf8;
  background: transparent;
  box-shadow: none;
}

.upgrade-art--cleaver-mastery {
  --art-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(82, 82, 91, 0.26));
  --art-core: #d4d4d8;
  --art-effect: #ef3340;
  --art-mark: #111827;
}

.upgrade-art--cleaver-mastery .art-core {
  width: 16px;
  height: 66px;
  transform: translate(-50%, -50%) rotate(42deg);
}

.upgrade-art--market-fury {
  --art-bg: linear-gradient(180deg, rgba(239, 51, 64, 0.16), rgba(250, 204, 21, 0.1));
  --art-core: #ef3340;
  --art-effect: #ffe45c;
  --art-mark: #7f1d1d;
}

.upgrade-art--fire-roasted-melon,
.upgrade-art--rage-blade,
.upgrade-art--juice-combustion,
.upgrade-art--flame-debt {
  --art-bg: linear-gradient(180deg, rgba(239, 68, 68, 0.18), rgba(124, 45, 18, 0.34));
  --art-core: #ef3340;
  --art-effect: #f97316;
  --art-mark: #facc15;
}

.upgrade-art--fire-roasted-melon .art-effect,
.upgrade-art--juice-combustion .art-effect,
.upgrade-art--flame-debt .art-effect {
  width: 18px;
  height: 42px;
  transform: translate(-50%, -56%);
  box-shadow:
    -18px 12px 0 #ef4444,
    18px 10px 0 #fb923c,
    0 -18px 0 #facc15;
}

.upgrade-art--rage-blade .art-core {
  width: 14px;
  height: 66px;
  transform: translate(-50%, -50%) rotate(38deg);
}

.upgrade-art--rage-blade .art-effect {
  width: 28px;
  height: 18px;
  transform: translate(-50%, -50%);
  box-shadow:
    -20px 0 0 #f97316,
    20px 0 0 #f97316,
    0 -20px 0 #facc15;
}

.upgrade-art--juice-combustion .art-mark {
  width: 8px;
  height: 8px;
  box-shadow:
    -22px -8px 0 #facc15,
    -16px 18px 0 #fb923c,
    18px 16px 0 #ef4444,
    24px -10px 0 #facc15;
}

.upgrade-art--ice-chilled-melon,
.upgrade-art--frost-cleaver-back,
.upgrade-art--frozen-scale-effect,
.upgrade-art--shatter-crit {
  --art-bg: linear-gradient(180deg, rgba(125, 211, 252, 0.18), rgba(14, 116, 144, 0.32));
  --art-core: #9be7ff;
  --art-effect: #38bdf8;
  --art-mark: #e0f2fe;
}

.upgrade-art--ice-chilled-melon .art-effect,
.upgrade-art--frost-cleaver-back .art-effect,
.upgrade-art--shatter-crit .art-effect {
  width: 10px;
  height: 62px;
  transform: translate(-50%, -50%);
  box-shadow:
    -22px 0 0 #7dd3fc,
    22px 0 0 #7dd3fc,
    0 -22px 0 #e0f2fe,
    0 22px 0 #e0f2fe;
}

.upgrade-art--frost-cleaver-back .art-core {
  width: 14px;
  height: 66px;
  transform: translate(-50%, -50%) rotate(-42deg);
}

.upgrade-art--frozen-scale-effect .art-core {
  width: 58px;
  height: 44px;
  background: #52525b;
  box-shadow:
    0 -18px 0 #a1a1aa,
    -18px 10px 0 #38bdf8,
    18px 10px 0 #38bdf8;
}

.upgrade-art--shatter-crit .art-mark {
  width: 6px;
  height: 6px;
  box-shadow:
    -24px -16px 0 #e0f2fe,
    -12px 18px 0 #7dd3fc,
    14px -18px 0 #bae6fd,
    24px 14px 0 #e0f2fe,
    0 0 0 6px rgba(255, 255, 255, 0.16);
}

.upgrade-art--hard-bargain,
.upgrade-art--rind-armor,
.upgrade-art--debt-collection,
.upgrade-art--last-stand-temper {
  --art-bg: linear-gradient(180deg, rgba(117, 214, 75, 0.16), rgba(20, 83, 45, 0.26));
  --art-core: #75d64b;
  --art-effect: #ffe45c;
  --art-mark: #14532d;
}

.upgrade-art--rind-armor .art-core {
  width: 54px;
  height: 42px;
  border: 8px solid #75d64b;
  background: transparent;
  box-shadow:
    0 18px 0 rgba(0, 0, 0, 0.3),
    inset 0 0 0 8px rgba(255, 228, 92, 0.18);
}

.upgrade-art--debt-collection .art-effect {
  width: 34px;
  height: 14px;
  transform: translate(-50%, -50%);
  background: #ef3340;
  box-shadow:
    -18px 14px 0 #75d64b,
    18px -14px 0 #ffe45c;
}

.upgrade-art--last-stand-temper {
  --art-core: #ef3340;
  --art-effect: #75d64b;
  --art-mark: #ffe45c;
}

.upgrade-art--magnetic-rind,
.upgrade-art--weight-collision,
.upgrade-art--black-hole-ignition {
  --art-bg: linear-gradient(180deg, rgba(56, 189, 248, 0.18), rgba(15, 23, 42, 0.36));
  --art-core: #27272a;
  --art-effect: #38bdf8;
  --art-mark: #facc15;
}

.upgrade-art--magnetic-rind .art-core,
.upgrade-art--black-hole-ignition .art-core {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: #050505;
  box-shadow:
    0 0 0 8px #38bdf8,
    0 0 0 16px rgba(250, 204, 21, 0.22);
}

.upgrade-art--black-hole-ignition .art-effect {
  width: 18px;
  height: 48px;
  transform: translate(-50%, -50%);
  background: #f97316;
  box-shadow:
    -18px 10px 0 #ef3340,
    18px -10px 0 #facc15;
}

.upgrade-art--weight-collision .art-core {
  width: 58px;
  height: 36px;
  background: #52525b;
  box-shadow:
    -28px 8px 0 #9be7ff,
    28px -8px 0 #38bdf8,
    0 -18px 0 #a1a1aa;
}

.upgrade-art--street-smarts,
.upgrade-art--fair-scale,
.upgrade-art--combo-dealer {
  --art-bg: linear-gradient(180deg, rgba(255, 228, 92, 0.18), rgba(113, 63, 18, 0.3));
  --art-core: #ffe45c;
  --art-effect: #75d64b;
  --art-mark: #111827;
}

.upgrade-art--street-smarts .art-mark,
.upgrade-art--combo-dealer .art-mark {
  width: 8px;
  height: 8px;
  box-shadow:
    -26px -10px 0 #ffe45c,
    -13px 10px 0 #75d64b,
    0 -16px 0 #38bdf8,
    13px 10px 0 #ef3340,
    26px -10px 0 #9be7ff;
}

.upgrade-art--fair-scale .art-core {
  width: 62px;
  height: 28px;
  background: #52525b;
  box-shadow:
    0 -18px 0 #ffe45c,
    -20px 12px 0 #75d64b,
    20px 12px 0 #75d64b;
}

.upgrade-art--steam-burst {
  --art-bg: linear-gradient(180deg, rgba(251, 146, 60, 0.18), rgba(14, 165, 233, 0.24));
  --art-core: #9be7ff;
  --art-effect: #f97316;
  --art-mark: #e0f2fe;
}

.upgrade-art--steam-burst .art-effect {
  width: 16px;
  height: 58px;
  transform: translate(-50%, -50%);
  box-shadow:
    -22px 0 0 #f97316,
    22px 0 0 #38bdf8,
    0 -18px 0 #e0f2fe;
}

.upgrade-art--split-melon {
  --art-bg: linear-gradient(180deg, rgba(250, 204, 21, 0.2), rgba(127, 29, 29, 0.3));
  --art-core: #ef3340;
  --art-effect: #75d64b;
  --art-mark: #ffe45c;
}

.upgrade-art--split-melon .art-core {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  box-shadow:
    -34px 16px 0 #ef3340,
    34px 16px 0 #ef3340,
    0 -14px 0 rgba(255, 255, 255, 0.18);
}

.upgrade-art--loud-bargain,
.upgrade-art--ripe-or-bust,
.upgrade-art--melon-credit,
.upgrade-art--no-refunds {
  --art-bg: linear-gradient(180deg, rgba(251, 146, 60, 0.18), rgba(69, 26, 3, 0.34));
  --art-core: #fb923c;
  --art-effect: #ef3340;
  --art-mark: #ffe45c;
}

.upgrade-art--loud-bargain .art-core {
  width: 58px;
  height: 34px;
  background: #fb923c;
  box-shadow:
    -20px 16px 0 #ef3340,
    20px 16px 0 #ef3340,
    0 -18px 0 #ffe45c;
}

.upgrade-art--ripe-or-bust .art-core {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #ef3340;
  box-shadow:
    -26px 18px 0 #75d64b,
    26px 18px 0 #ef3340,
    0 -16px 0 rgba(255, 255, 255, 0.2);
}

.upgrade-art--melon-credit .art-effect {
  width: 46px;
  height: 28px;
  transform: translate(-50%, -50%);
  background: #ffe45c;
  box-shadow:
    -18px -16px 0 #75d64b,
    18px 16px 0 #ef3340,
    0 22px 0 rgba(0, 0, 0, 0.28);
}

.upgrade-art--no-refunds .art-core {
  width: 56px;
  height: 42px;
  border: 8px solid #ef3340;
  background: transparent;
  box-shadow:
    inset 0 0 0 8px rgba(255, 228, 92, 0.22),
    0 18px 0 rgba(0, 0, 0, 0.28);
}

.game-over {
  display: grid;
  justify-items: center;
  gap: 16px;
  max-width: 560px;
}

.death-review {
  display: grid;
  gap: 9px;
  width: min(500px, calc(100vw - 56px));
  padding: 12px;
  border: 1px solid rgba(255, 228, 92, 0.28);
  border-radius: 8px;
  background:
    repeating-linear-gradient(90deg, rgba(255, 228, 92, 0.04) 0 5px, transparent 5px 10px),
    rgba(0, 0, 0, 0.28);
}

.death-review > span {
  color: rgba(255, 228, 92, 0.78);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.death-stat-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}

.death-stat-grid small {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 7px 5px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.045);
  color: rgba(248, 250, 252, 0.58);
  font-size: 8px;
  font-weight: 900;
  line-height: 1.1;
  text-align: center;
}

.death-stat-grid b {
  overflow: hidden;
  color: #fff7cc;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.death-review p {
  margin: 0;
  color: rgba(248, 250, 252, 0.76);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.35;
}

.death-review p strong {
  color: #fff7cc;
}

.death-cause,
.death-log {
  display: grid;
  gap: 6px;
  width: min(360px, calc(100vw - 56px));
  padding: 10px;
  border: 1px solid rgba(239, 51, 64, 0.36);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.26);
}

.death-cause span,
.death-log span {
  color: rgba(255, 228, 92, 0.74);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.death-cause strong,
.death-log small {
  color: rgba(248, 250, 252, 0.88);
  font-size: 12px;
  font-weight: 900;
  line-height: 1.35;
}

.game-over button {
  padding: 10px 18px;
  border: 1px solid rgba(117, 214, 75, 0.7);
  border-radius: 8px;
  background: rgba(117, 214, 75, 0.18);
  color: #ecfccb;
  font-weight: 800;
  cursor: pointer;
}

@keyframes damage-flash {
  0% {
    opacity: 0;
  }

  16% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

@keyframes damage-alert-pop {
  0% {
    opacity: 0;
    transform: translate(18px, -8px) scale(0.92);
  }

  100% {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
}

@media (max-width: 980px) and (min-width: 721px) {
  .minimap-panel {
    width: 226px;
  }

  .objective-chip {
    top: auto;
    bottom: max(68px, calc(env(safe-area-inset-bottom) + 56px));
  }

  .game-shell.touch-controls .objective-chip {
    bottom: max(176px, calc(env(safe-area-inset-bottom) + 154px));
  }

  .boss-phase-chip {
    top: auto;
    bottom: max(132px, calc(env(safe-area-inset-bottom) + 118px));
  }

  .boss-gate-chip {
    top: auto;
    bottom: max(132px, calc(env(safe-area-inset-bottom) + 118px));
  }

  .game-shell.touch-controls .boss-phase-chip {
    bottom: max(252px, calc(env(safe-area-inset-bottom) + 230px));
  }

  .game-shell.touch-controls .boss-gate-chip {
    bottom: max(252px, calc(env(safe-area-inset-bottom) + 230px));
  }

  .upgrade-grid.four {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .run-goal-grid {
    grid-template-columns: 1fr;
  }

  .run-goal-card {
    min-height: 0;
  }

  .owned-upgrades {
    top: max(208px, calc(env(safe-area-inset-top) + 196px));
    right: auto;
    left: 12px;
    width: min(520px, calc(100vw - 274px));
  }

  .meta-goals-panel {
    top: max(188px, calc(env(safe-area-inset-top) + 176px));
    right: 12px;
    width: min(420px, calc(100vw - 24px));
  }

  .owned-upgrade-grid {
    grid-template-columns: repeat(12, 1fr);
  }

  .owned-upgrade-detail {
    grid-template-columns: 40px minmax(0, 1fr);
  }

  .owned-upgrade-detail-art {
    width: 40px;
    height: 40px;
  }

  .active-buffs {
    top: auto;
    bottom: max(12px, env(safe-area-inset-bottom));
    width: min(520px, calc(100vw - 24px));
  }

  .active-buff-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .damage-alert {
    top: max(158px, calc(env(safe-area-inset-top) + 146px));
    right: 12px;
  }

  .subtitle {
    top: max(134px, calc(env(safe-area-inset-top) + 122px));
    max-width: min(520px, calc(100vw - 24px));
    font-size: clamp(16px, 2.8vw, 24px);
  }
}

@media (max-width: 720px) {
  .minimap-panel {
    top: max(178px, calc(env(safe-area-inset-top) + 166px));
    right: 8px;
    width: 148px;
    padding: 7px;
  }

  .minimap-panel header {
    margin-bottom: 4px;
  }

  .minimap-panel header span {
    font-size: 8px;
  }

  .minimap-panel header strong {
    font-size: 9px;
  }

  .minimap-panel footer {
    display: none;
  }

  .objective-chip {
    top: auto;
    bottom: max(150px, calc(env(safe-area-inset-bottom) + 128px));
    left: 9px;
    width: calc(100vw - 18px);
    transform: none;
    padding: 8px;
  }

  .objective-chip p {
    margin: 4px 0 5px;
    font-size: 9px;
  }

  .objective-risk-reward {
    gap: 3px;
    margin-bottom: 5px;
  }

  .objective-risk-reward small {
    font-size: 8px;
  }

  .objective-chip-head strong {
    font-size: 11px;
  }

  .hud {
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 9px;
    left: 8px;
    width: calc(100vw - 16px);
    padding: 10px;
  }

  .portrait-frame {
    width: 76px;
    height: 92px;
  }

  .portrait-sprite {
    left: 6px;
    top: 5px;
    width: 64px;
    height: 64px;
    background-size: 64px 64px;
    background-position: 0 0;
  }

  .portrait-frame::after {
    inset: auto 6px 6px;
    height: 10px;
  }

  .hud-title h1 {
    font-size: 16px;
  }

  .hud-title {
    align-items: flex-start;
  }

  .hud-actions {
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }

  .portrait-caption {
    gap: 4px;
    font-size: 10px;
  }

  .locale-control span {
    display: none;
  }

  .locale-control select {
    min-width: 86px;
  }

  .cast-toggle {
    height: 26px;
    padding: 0 8px;
  }

  .meta-toggle {
    height: 26px;
    padding: 0 8px;
  }

  .meter-group {
    grid-template-columns: 1fr;
    gap: 7px;
  }

  .build-route {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
    margin-top: 8px;
    font-size: 10px;
  }

  .build-chip-row {
    justify-content: flex-start;
  }

  .archetype-track-list {
    grid-template-columns: 1fr;
    gap: 5px;
    margin-top: 6px;
  }

  .archetype-track {
    padding: 6px;
  }

  .archetype-track small {
    font-size: 8px;
  }

  .run-goal-strip {
    grid-template-columns: 1fr;
    gap: 5px;
    margin-top: 7px;
    padding: 6px 7px;
  }

  .run-goal-strip small {
    font-size: 9px;
  }

  .run-goal-badge {
    padding: 6px 7px;
  }

  .run-goal-badge strong {
    font-size: 9px;
  }

  .modal-scrim {
    align-items: start;
    overflow-y: auto;
    padding: max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom));
  }

  .modal {
    padding: 14px;
  }

  .modal-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .run-goal-grid {
    grid-template-columns: 1fr;
  }

  .run-goal-card {
    min-height: 0;
    padding: 12px;
  }

  .run-goal-card-head strong {
    font-size: 18px;
  }

  .run-goal-card p {
    font-size: 12px;
  }

  .run-goal-reward em {
    font-size: 11px;
  }

  .cast-popover {
    top: max(178px, calc(env(safe-area-inset-top) + 166px));
    left: 8px;
    width: calc(100vw - 16px);
    padding: 10px;
  }

  .meta-goals-panel {
    top: max(178px, calc(env(safe-area-inset-top) + 166px));
    right: 8px;
    left: 8px;
    width: auto;
    padding: 10px;
  }

  .meta-goal {
    padding: 7px;
  }

  .meta-goal span {
    font-size: 9px;
  }

  .cast-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .owned-upgrades {
    top: max(178px, calc(env(safe-area-inset-top) + 166px));
    left: 8px;
    right: auto;
    bottom: auto;
    width: calc(100vw - 174px);
    padding: 8px;
  }

  .owned-upgrade-grid {
    grid-template-columns: repeat(6, minmax(20px, 1fr));
    gap: 4px;
  }

  .owned-upgrade-detail {
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 7px;
    margin-top: 7px;
    padding: 7px;
  }

  .owned-upgrade-detail-art {
    width: 34px;
    height: 34px;
  }

  .owned-upgrade-detail p {
    font-size: 9px;
    line-height: 1.25;
  }

  .active-buffs {
    top: auto;
    left: 8px;
    right: 8px;
    bottom: max(222px, calc(env(safe-area-inset-bottom) + 200px));
    width: auto;
    padding: 7px;
  }

  .active-buff-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
  }

  .active-buff {
    grid-template-columns: 14px minmax(0, 1fr);
    gap: 5px;
    padding: 4px 5px;
  }

  .buff-pixel {
    width: 13px;
    height: 13px;
  }

  .active-buff strong {
    font-size: 9px;
  }

  .active-buff small {
    font-size: 8px;
  }

  .damage-alert {
    top: max(170px, calc(env(safe-area-inset-top) + 158px));
    right: 8px;
    left: 8px;
    width: auto;
    padding: 8px 10px;
  }

  .damage-alert strong {
    font-size: 14px;
  }

  .damage-alert span,
  .damage-alert small {
    font-size: 10px;
  }

  .boss-phase-chip {
    top: auto;
    bottom: max(188px, calc(env(safe-area-inset-bottom) + 166px));
    left: 9px;
    width: calc(100vw - 18px);
    transform: none;
    padding: 7px 8px;
  }

  .boss-gate-chip {
    top: auto;
    bottom: max(188px, calc(env(safe-area-inset-bottom) + 166px));
    left: 9px;
    width: calc(100vw - 18px);
    transform: none;
    padding: 8px 10px;
  }

  .boss-gate-chip strong {
    font-size: 14px;
  }

  .boss-phase-toast {
    top: max(170px, calc(env(safe-area-inset-top) + 158px));
    right: 8px;
    left: 8px;
    width: auto;
    padding: 9px 10px;
  }

  .boss-phase-toast strong {
    font-size: 15px;
  }

  .subtitle {
    top: max(118px, calc(env(safe-area-inset-top) + 106px));
    max-width: calc(100vw - 20px);
    padding: 5px 10px 6px;
    font-size: clamp(14px, 4.3vw, 18px);
    -webkit-text-stroke: 0.5px #111;
  }

  .signature-moment {
    top: 35%;
    padding: 10px 12px;
  }

  .input-hint {
    left: 50%;
    right: auto;
    bottom: max(8px, env(safe-area-inset-bottom));
    max-width: min(260px, calc(100vw - 18px));
    transform: translateX(-50%);
    opacity: 0.62;
  }

  .input-hint.touch {
    display: none;
  }

  .joystick {
    width: 116px;
    height: 116px;
  }

  .joystick-knob {
    left: 37px;
    top: 37px;
    width: 42px;
    height: 42px;
  }

  .throw-zone {
    width: 116px;
    height: 116px;
  }

  .upgrade-grid {
    grid-template-columns: 1fr;
  }

  .upgrade-grid.four {
    grid-template-columns: 1fr;
  }

  .death-review,
  .death-cause,
  .death-log {
    width: calc(100vw - 48px);
  }

  .death-stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
