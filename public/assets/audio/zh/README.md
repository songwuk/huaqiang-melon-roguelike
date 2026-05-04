# Chinese Original Voice Assets

Place legally licensed Chinese voice clips in this folder, then map them in `manifest.json`.

Recommended filenames:

| Trigger | File | Subtitle |
| --- | --- | --- |
| `spawn` | `spawn.mp3` | 哥们儿，这瓜多少钱一斤？ |
| `critical_hit` | `critical_hit.mp3` | 这瓜保熟吗？ |
| `boss_kill` | `boss_kill.mp3` | 给你机会你不中用啊！ |
| `ultimate_ready` | `ultimate_ready.mp3` | 你是存心找茬是不是？ |
| `zhengfu_theme` | `zhengfu_theme.mp3` | 征服 |

Example `manifest.json`:

```json
{
  "spawn": { "src": "/assets/audio/zh/spawn.mp3", "volume": 0.95 },
  "critical_hit": { "src": "/assets/audio/zh/critical_hit.mp3", "volume": 0.95 },
  "boss_kill": { "src": "/assets/audio/zh/boss_kill.mp3", "volume": 0.95 },
  "ultimate_ready": { "src": "/assets/audio/zh/ultimate_ready.mp3", "volume": 0.95 },
  "zhengfu_theme": { "src": "/assets/audio/zh/zhengfu_theme.mp3", "volume": 0.8 }
}
```

If a trigger is missing from the manifest or the file cannot be played, the game falls back to the existing Web Audio and browser speech synthesis path. English and French always keep the existing fallback behavior.
