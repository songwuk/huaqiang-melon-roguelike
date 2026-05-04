interface PoolableEntity {
  active: boolean;
  vx: number;
  vy: number;
  setActive(active: boolean): void;
}

export class ObjectPool<T extends PoolableEntity> {
  private readonly free: T[] = [];
  private readonly created: T[] = [];

  constructor(
    private readonly factory: () => T,
    warmCount: number,
  ) {
    for (let i = 0; i < warmCount; i += 1) {
      const item = this.factory();
      item.setActive(false);
      this.free.push(item);
      this.created.push(item);
    }
  }

  acquire() {
    const item = this.free.pop();
    if (item) {
      return item;
    }
    const created = this.factory();
    created.setActive(false);
    this.created.push(created);
    return created;
  }

  release(item: T) {
    if (!item.active) {
      return;
    }
    item.setActive(false);
    item.vx = 0;
    item.vy = 0;
    this.free.push(item);
  }

  releaseAll(items: T[]) {
    for (let i = 0; i < items.length; i += 1) {
      this.release(items[i]);
    }
    items.length = 0;
  }

  allCreated() {
    return this.created;
  }
}
