import { afterEach, describe, expect, it } from 'vitest';
import { getConfig, resetConfigForTests } from '../lib/config.js';

const originalWorkerSetting = process.env.AI_WORKER_ENABLED;

afterEach(() => {
  if (originalWorkerSetting === undefined) delete process.env.AI_WORKER_ENABLED;
  else process.env.AI_WORKER_ENABLED = originalWorkerSetting;
  resetConfigForTests();
});

describe('AI worker configuration', () => {
  it('enables the worker when explicitly configured', () => {
    process.env.AI_WORKER_ENABLED = 'true';
    resetConfigForTests();

    expect(getConfig().AI_WORKER_ENABLED).toBe(true);
  });

  it('keeps the worker disabled by default', () => {
    delete process.env.AI_WORKER_ENABLED;
    resetConfigForTests();

    expect(getConfig().AI_WORKER_ENABLED).toBe(false);
  });
});
