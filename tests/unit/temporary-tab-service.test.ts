import { describe, expect, it, vi } from "vitest";

import { TemporaryTabService } from "../../src/background/temporary-tab-service";

function createService() {
  const stored: Record<string, unknown> = {};
  const executeScript = vi.fn(() => Promise.resolve());
  const service = new TemporaryTabService({
    storage: {
      get: vi.fn(() => Promise.resolve(stored)),
      set: vi.fn((values: Record<string, unknown>) => {
        Object.assign(stored, values);
        return Promise.resolve();
      }),
    },
    executeScript,
  });
  return { executeScript, service, stored };
}

describe("TemporaryTabService", () => {
  it("reinjects after same-origin navigation and stops at another origin", async () => {
    const { executeScript, service } = createService();
    await service.activate(7, "https://example.com/first");

    await expect(
      service.reinject(7, "https://example.com/second"),
    ).resolves.toBe(true);
    expect(executeScript).toHaveBeenCalledWith(7);

    await expect(service.reinject(7, "https://other.example/")).resolves.toBe(
      false,
    );
    await expect(
      service.reinject(7, "https://example.com/third"),
    ).resolves.toBe(false);
    expect(executeScript).toHaveBeenCalledTimes(1);
  });

  it("does not reinject after explicit deactivation", async () => {
    const { executeScript, service } = createService();
    await service.activate(7, "https://example.com/");
    await service.deactivate(7);

    await expect(service.reinject(7, "https://example.com/next")).resolves.toBe(
      false,
    );
    expect(executeScript).not.toHaveBeenCalled();
  });
});
