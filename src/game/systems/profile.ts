import { DAMAGE_SOURCE_IDS, DEFAULT_META_PROFILE, PROFILE_STORAGE_KEY } from '../constants';
import type { DamageSourceId, LocaleCode, MetaProfile } from '../types';

export function parseLocale(value: string | null | undefined): LocaleCode {
  return value === 'zh' || value === 'en' || value === 'fr' ? value : 'zh';
}

function readNumberRecordValue(source: unknown, key: keyof MetaProfile, fallback: number) {
  if (!source || typeof source !== 'object') {
    return fallback;
  }
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export function loadMetaProfile(): MetaProfile {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_META_PROFILE };
  }
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      bestLevel: Math.max(1, readNumberRecordValue(parsed, 'bestLevel', DEFAULT_META_PROFILE.bestLevel)),
      victories: readNumberRecordValue(parsed, 'victories', DEFAULT_META_PROFILE.victories),
      perfectChallenges: readNumberRecordValue(parsed, 'perfectChallenges', DEFAULT_META_PROFILE.perfectChallenges),
      eventsCompleted: readNumberRecordValue(parsed, 'eventsCompleted', DEFAULT_META_PROFILE.eventsCompleted),
      ripeHits: readNumberRecordValue(parsed, 'ripeHits', DEFAULT_META_PROFILE.ripeHits),
      maxRipeChain: readNumberRecordValue(parsed, 'maxRipeChain', DEFAULT_META_PROFILE.maxRipeChain),
    };
  } catch {
    return { ...DEFAULT_META_PROFILE };
  }
}

export function saveMetaProfile(profile: MetaProfile) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function createDamageSummary(): Record<DamageSourceId, number> {
  return DAMAGE_SOURCE_IDS.reduce(
    (summary, id) => {
      summary[id] = 0;
      return summary;
    },
    {} as Record<DamageSourceId, number>,
  );
}
