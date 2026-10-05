const STORAGE_KEY = "temporaryTabOrigins";

interface TemporaryTabStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

interface TemporaryTabDependencies {
  storage: TemporaryTabStorage;
  executeScript(tabId: number): Promise<unknown>;
}

function pageOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export class TemporaryTabService {
  private queue = Promise.resolve();

  constructor(private readonly dependencies: TemporaryTabDependencies) {}

  activate(tabId: number, url: string): Promise<void> {
    const origin = pageOrigin(url);
    if (origin === null) {
      return Promise.reject(new Error("Temporary tab URL is unsupported"));
    }
    return this.update((origins) => {
      origins[String(tabId)] = origin;
    });
  }

  deactivate(tabId: number): Promise<void> {
    return this.update((origins) => {
      delete origins[String(tabId)];
    });
  }

  reinject(tabId: number, url: string): Promise<boolean> {
    return this.serialized(async () => {
      const origins = await this.load();
      const expectedOrigin = origins[String(tabId)];
      const currentOrigin = pageOrigin(url);
      if (expectedOrigin === undefined) {
        return false;
      }
      if (currentOrigin !== expectedOrigin) {
        delete origins[String(tabId)];
        await this.dependencies.storage.set({ [STORAGE_KEY]: origins });
        return false;
      }
      await this.dependencies.executeScript(tabId);
      return true;
    });
  }

  private update(change: (origins: Record<string, string>) => void) {
    return this.serialized(async () => {
      const origins = await this.load();
      change(origins);
      await this.dependencies.storage.set({ [STORAGE_KEY]: origins });
    });
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async load(): Promise<Record<string, string>> {
    const stored = await this.dependencies.storage.get(STORAGE_KEY);
    const value = stored[STORAGE_KEY];
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] =>
          /^\d+$/.test(entry[0]) && typeof entry[1] === "string",
      ),
    );
  }
}
