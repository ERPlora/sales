import { beforeEach, describe, expect, it, vi } from 'vitest';

let releaseProducts: ((rows: unknown[]) => void) | undefined;
const fetchMediaBlob = vi.fn(async () => new Blob(['webp'], { type: 'image/webp' }));

beforeEach(() => {
  document.body.innerHTML = '';
  releaseProducts = undefined;
  fetchMediaBlob.mockClear();
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:catalogue');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryAll: async (name: string) => {
      if (name === 'inventory.products.list') {
        return await new Promise<unknown[]>((resolve) => { releaseProducts = resolve; });
      }
      return [];
    },
    queryOptional: async () => undefined,
    command: async () => ({}),
    fetchMediaBlob,
    currency: 'EUR',
    formatMoney: (cents: number) => `${cents}`,
    formatAmount: (units: number) => `${units}`,
    t: (_catalog: unknown, key: string) => key,
    loadSlot: async () => [],
    notify: () => undefined,
  };
});

describe('catalogue photo lifecycle', () => {
  it('does not restart media downloads when the initial query resolves after unmount', async () => {
    await import('./erp-pos-touch');
    const element = document.createElement('erp-pos-touch') as HTMLElement & { updateComplete: Promise<unknown> };
    document.body.appendChild(element);
    await Promise.resolve();
    expect(releaseProducts).toBeTypeOf('function');

    element.remove();
    releaseProducts?.([{
      id: 'p-1', name: 'Café', price: 150, is_active: 1,
      tax_category_key: 'product.generic', image: '/api/media/raw?path=hospitality%2Fcafe.webp',
    }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await element.updateComplete;

    expect(fetchMediaBlob).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
