let nextGameId = 1;

export function allocateGameId() {
  return nextGameId++;
}
