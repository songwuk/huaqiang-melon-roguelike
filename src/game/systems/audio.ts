import { AUDIO_TRIGGERS, CHINESE_ORIGINAL_AUDIO_MANIFEST_URL } from '../constants';
import { AUDIO_SUBTITLES } from '../i18n';
import type { AudioManifestEntry, AudioTrigger, LocaleCode, OriginalAudioManifest, OriginalAudioManifestEntry, RawOriginalAudioManifest } from '../types';
import { clamp } from '../utils/math';

function speechLang(locale: LocaleCode) {
  if (locale === 'en') {
    return 'en-US';
  }
  if (locale === 'fr') {
    return 'fr-FR';
  }
  return 'zh-CN';
}

function createAudioContext() {
  const AudioCtor =
    window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioCtor ? new AudioCtor() : null;
}

export class AudioManifestManager {
  private context: AudioContext | null = null;
  private readonly lastPlayed = new Map<AudioTrigger, number>();
  private readonly lastEffectPlayed = new Map<AudioTrigger, number>();
  private readonly originalAudio = new Map<AudioTrigger, HTMLAudioElement>();
  private readonly unavailableOriginalAudio = new Set<AudioTrigger>();
  private readonly originalManifestReady: Promise<void>;
  private originalAudioManifest: OriginalAudioManifest = {};
  private readonly minIntervalMs: Record<AudioTrigger, number> = {
    spawn: 620,
    critical_hit: 260,
    boss_kill: 720,
    ultimate_ready: 620,
    zhengfu_theme: 1200,
    enemy_launch: 160,
    burn_tick: 220,
    enemy_dash: 180,
    enemy_explode: 260,
    trap_tick: 240,
  };
  private voices: SpeechSynthesisVoice[] = [];
  private pendingSpeech: { text: string; locale: LocaleCode } | null = null;
  private speechTimer = 0;
  private speechResumeTimer = 0;
  private speechWatchdogTimer = 0;
  private speaking = false;
  private lastSpeechStarted = 0;
  private audioPrimed = false;
  private readonly speechMinIntervalMs = 520;
  private readonly motifLengths: Record<AudioTrigger, number> = {
    spawn: 8,
    critical_hit: 5,
    boss_kill: 11,
    ultimate_ready: 9,
    zhengfu_theme: 7,
    enemy_launch: 3,
    burn_tick: 3,
    enemy_dash: 3,
    enemy_explode: 4,
    trap_tick: 3,
  };
  private readonly voicesChangedHandler = () => {
    this.refreshVoices();
  };

  readonly manifest: Record<AudioTrigger, AudioManifestEntry> = {
    spawn: { subtitle: AUDIO_SUBTITLES.spawn, frequency: 240, duration: 0.42, wave: 'square' },
    critical_hit: { subtitle: AUDIO_SUBTITLES.critical_hit, frequency: 420, duration: 0.26, wave: 'sawtooth' },
    boss_kill: { subtitle: AUDIO_SUBTITLES.boss_kill, frequency: 190, duration: 0.72, wave: 'triangle' },
    ultimate_ready: { subtitle: AUDIO_SUBTITLES.ultimate_ready, frequency: 520, duration: 0.52, wave: 'square' },
    zhengfu_theme: { subtitle: AUDIO_SUBTITLES.zhengfu_theme, frequency: 120, duration: 1.4, wave: 'sawtooth' },
    enemy_launch: { subtitle: AUDIO_SUBTITLES.enemy_launch, frequency: 310, duration: 0.18, wave: 'square', volume: 0.1 },
    burn_tick: { subtitle: AUDIO_SUBTITLES.burn_tick, frequency: 95, duration: 0.16, wave: 'sawtooth', volume: 0.075 },
    enemy_dash: { subtitle: AUDIO_SUBTITLES.enemy_dash, frequency: 580, duration: 0.14, wave: 'triangle', volume: 0.12 },
    enemy_explode: { subtitle: AUDIO_SUBTITLES.enemy_explode, frequency: 130, duration: 0.34, wave: 'sawtooth', volume: 0.16 },
    trap_tick: { subtitle: AUDIO_SUBTITLES.trap_tick, frequency: 260, duration: 0.11, wave: 'square', volume: 0.065 },
  };

  constructor(
    private readonly showSubtitle: (text: string) => void,
    private readonly getLocale: () => LocaleCode,
  ) {
    this.originalManifestReady = this.loadOriginalAudioManifest();
    this.refreshVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', this.voicesChangedHandler);
  }

  async unlock() {
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context = createAudioContext();
      }
      if (this.context?.state === 'suspended') {
        await this.context.resume();
      }
      if (this.context?.state === 'running' && !this.audioPrimed) {
        this.audioPrimed = true;
        this.primeOutput();
      }
    } catch {
      // The browser may still block Web Audio until a direct user gesture.
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
      this.refreshVoices();
    }
  }

  async play(trigger: AudioTrigger, force = false) {
    const now = performance.now();
    const previous = this.lastPlayed.get(trigger) ?? 0;
    const minInterval = this.minIntervalMs[trigger] ?? 720;
    if (!force && now - previous < minInterval) {
      return;
    }
    this.lastPlayed.set(trigger, now);

    const entry = this.manifest[trigger];
    const locale = this.getLocale();
    const subtitle = entry.subtitle[locale];
    await this.unlock();

    this.showSubtitle(subtitle);
    if (locale === 'zh' && (await this.playOriginalVoice(trigger))) {
      return;
    }

    this.playCue(entry, trigger);
    this.playVoiceMotif(trigger, subtitle, locale);
    this.speak(subtitle, locale, force);
  }

  async playEffect(trigger: AudioTrigger, minIntervalMs = 90) {
    const now = performance.now();
    const previous = this.lastEffectPlayed.get(trigger) ?? 0;
    if (now - previous < minIntervalMs) {
      return;
    }
    this.lastEffectPlayed.set(trigger, now);

    await this.unlock();
    this.playCue(this.manifest[trigger], trigger);
  }

  private async loadOriginalAudioManifest() {
    try {
      const response = await fetch(CHINESE_ORIGINAL_AUDIO_MANIFEST_URL, { cache: 'no-store' });
      if (!response.ok) {
        return;
      }

      const raw = (await response.json()) as RawOriginalAudioManifest;
      const manifest: OriginalAudioManifest = {};
      for (const trigger of AUDIO_TRIGGERS) {
        const entry = raw[trigger];
        if (typeof entry === 'string' && entry.trim()) {
          manifest[trigger] = { src: entry.trim() };
          continue;
        }
        if (!entry || typeof entry !== 'object' || typeof entry.src !== 'string' || !entry.src.trim()) {
          continue;
        }
        manifest[trigger] = {
          src: entry.src.trim(),
          volume: typeof entry.volume === 'number' ? clamp(entry.volume, 0, 1) : undefined,
        };
      }
      this.originalAudioManifest = manifest;
      this.preloadOriginalAudio();
    } catch {
      // Missing or malformed optional asset manifests should never break gameplay audio.
    }
  }

  private preloadOriginalAudio() {
    for (const trigger of AUDIO_TRIGGERS) {
      const entry = this.originalAudioManifest[trigger];
      if (!entry) {
        continue;
      }
      this.ensureOriginalAudio(trigger, entry);
    }
  }

  private ensureOriginalAudio(trigger: AudioTrigger, entry: OriginalAudioManifestEntry) {
    const existing = this.originalAudio.get(trigger);
    if (existing) {
      return existing;
    }

    const audio = new Audio(entry.src);
    audio.preload = 'auto';
    audio.volume = entry.volume ?? 0.95;
    audio.addEventListener('error', () => {
      this.unavailableOriginalAudio.add(trigger);
    });
    this.originalAudio.set(trigger, audio);
    audio.load();
    return audio;
  }

  private async playOriginalVoice(trigger: AudioTrigger) {
    await this.originalManifestReady;
    if (this.unavailableOriginalAudio.has(trigger)) {
      return false;
    }

    const entry = this.originalAudioManifest[trigger];
    if (!entry) {
      return false;
    }

    const audio = this.ensureOriginalAudio(trigger, entry);
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = entry.volume ?? 0.95;
      await audio.play();
      return true;
    } catch {
      if (audio.error) {
        this.unavailableOriginalAudio.add(trigger);
      }
      return false;
    }
  }

  private primeOutput() {
    const context = this.context;
    if (!context || context.state !== 'running') {
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(80, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.03);
  }

  private playCue(entry: AudioManifestEntry, trigger: AudioTrigger) {
    const context = this.context;
    if (!context || context.state !== 'running') {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = entry.wave;
    oscillator.frequency.setValueAtTime(entry.frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(50, entry.frequency * 0.55), context.currentTime + entry.duration);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(entry.volume ?? (trigger === 'zhengfu_theme' ? 0.12 : 0.18), context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + entry.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + entry.duration + 0.03);
  }

  private playVoiceMotif(trigger: AudioTrigger, text: string, locale: LocaleCode) {
    const context = this.context;
    if (!context || context.state !== 'running') {
      return;
    }

    const chars = Array.from(text).filter((char) => char.trim().length > 0);
    const noteCount = Math.min(this.motifLengths[trigger], Math.max(3, chars.length));
    const baseFrequency = locale === 'zh' ? 210 : locale === 'fr' ? 185 : 170;
    const now = context.currentTime + 0.045;
    const noteDuration = trigger === 'boss_kill' ? 0.105 : 0.082;
    const output = context.createGain();
    const filter = context.createBiquadFilter();
    output.gain.setValueAtTime(trigger === 'zhengfu_theme' ? 0.085 : 0.072, now);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(locale === 'zh' ? 920 : 760, now);
    filter.Q.setValueAtTime(7.5, now);
    output.connect(filter).connect(context.destination);

    for (let i = 0; i < noteCount; i += 1) {
      const charCode = chars[i % chars.length]?.charCodeAt(0) ?? 48;
      const start = now + i * noteDuration;
      const end = start + noteDuration * 0.78;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const vowelBend = (charCode % 7) * 22;
      const stress = i % 3 === 0 ? 1.34 : i % 2 === 0 ? 1.12 : 0.92;
      oscillator.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
      oscillator.frequency.setValueAtTime(baseFrequency * stress + vowelBend, start);
      oscillator.frequency.linearRampToValueAtTime(baseFrequency * 0.72 + vowelBend * 0.4, end);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.42, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain).connect(output);
      oscillator.start(start);
      oscillator.stop(end + 0.018);
    }

    window.setTimeout(() => {
      output.disconnect();
      filter.disconnect();
    }, (noteCount * noteDuration + 0.35) * 1000);
  }

  private refreshVoices() {
    if (!('speechSynthesis' in window)) {
      return;
    }
    this.voices = window.speechSynthesis.getVoices();
  }

  private selectVoice(locale: LocaleCode) {
    const lang = speechLang(locale).toLowerCase();
    const prefix = lang.split('-')[0];
    return (
      this.voices.find((voice) => voice.lang.toLowerCase() === lang) ??
      this.voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix)) ??
      null
    );
  }

  private speak(text: string, locale: LocaleCode, force = false) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      return;
    }

    this.refreshVoices();

    if (force && this.speaking) {
      window.speechSynthesis.cancel();
      this.speaking = false;
      this.pendingSpeech = null;
    } else if (this.speaking) {
      this.pendingSpeech = { text, locale };
      return;
    }

    const elapsed = performance.now() - this.lastSpeechStarted;
    if (!force && elapsed < this.speechMinIntervalMs) {
      this.pendingSpeech = { text, locale };
      this.schedulePendingSpeech(this.speechMinIntervalMs - elapsed);
      return;
    }

    this.startSpeech(text, locale);
  }

  private schedulePendingSpeech(delayMs: number) {
    if (this.speechTimer) {
      window.clearTimeout(this.speechTimer);
    }
    this.speechTimer = window.setTimeout(() => {
      this.speechTimer = 0;
      if (this.speaking || !this.pendingSpeech) {
        return;
      }
      const next = this.pendingSpeech;
      this.pendingSpeech = null;
      this.startSpeech(next.text, next.locale);
    }, Math.max(80, delayMs));
  }

  private startSpeech(text: string, locale: LocaleCode) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLang(locale);
    const voice = this.selectVoice(locale);
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = locale === 'zh' ? 1.02 : 1;
    utterance.pitch = 0.85;
    utterance.volume = 0.8;
    utterance.onend = () => {
      this.finishSpeech();
    };
    utterance.onerror = () => {
      this.finishSpeech();
    };
    this.speaking = true;
    this.lastSpeechStarted = performance.now();
    this.startSpeechWatchdogs(text);
    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
    } catch {
      this.finishSpeech();
    }
  }

  private startSpeechWatchdogs(text: string) {
    this.clearSpeechWatchdogs();
    this.speechResumeTimer = window.setInterval(() => {
      if (window.speechSynthesis?.paused) {
        window.speechSynthesis.resume();
      }
    }, 250);
    this.speechWatchdogTimer = window.setTimeout(
      () => {
        this.finishSpeech();
      },
      clamp(text.length * 120 + 1500, 2200, 6800),
    );
  }

  private clearSpeechWatchdogs() {
    if (this.speechResumeTimer) {
      window.clearInterval(this.speechResumeTimer);
      this.speechResumeTimer = 0;
    }
    if (this.speechWatchdogTimer) {
      window.clearTimeout(this.speechWatchdogTimer);
      this.speechWatchdogTimer = 0;
    }
  }

  private finishSpeech() {
    this.clearSpeechWatchdogs();
    this.speaking = false;
    if (!this.pendingSpeech) {
      return;
    }
    this.schedulePendingSpeech(90);
  }

  async destroy() {
    if (this.speechTimer) {
      window.clearTimeout(this.speechTimer);
      this.speechTimer = 0;
    }
    this.clearSpeechWatchdogs();
    window.speechSynthesis?.removeEventListener('voiceschanged', this.voicesChangedHandler);
    window.speechSynthesis?.cancel();
    if (this.context && this.context.state !== 'closed') {
      await this.context.close();
    }
    this.context = null;
    this.lastPlayed.clear();
    this.lastEffectPlayed.clear();
    for (const audio of this.originalAudio.values()) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    this.originalAudio.clear();
    this.unavailableOriginalAudio.clear();
  }
}
