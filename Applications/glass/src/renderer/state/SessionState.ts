const STORAGE_KEY = "glass:session";

export interface SessionData {
  sessionId: string;
  cameraOffset: { x: number; y: number };
}

const DEFAULT_SESSION: SessionData = {
  sessionId: "",
  cameraOffset: { x: 0, y: 0 },
};

export class SessionState {
  private data: SessionData;
  private storage: Storage;

  constructor(storage: Storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = this.load();
  }

  get(): SessionData {
    return { ...this.data };
  }

  update(partial: Partial<SessionData>): void {
    this.data = { ...this.data, ...partial };
    this.save();
  }

  private load(): SessionData {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SESSION };
      return { ...DEFAULT_SESSION, ...JSON.parse(raw) };
    } catch (err) {
      console.warn(
        `[glass] session load failed — resetting to default: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { ...DEFAULT_SESSION };
    }
  }

  private save(): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }
}
