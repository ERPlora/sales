// hub#1935 — reading the core's answer about the road to the tax authority.
import { describe, expect, it } from 'vitest';
import { fiscalRoadKey, isFiscalRoadRefusal, readFiscalRoad } from './fiscal-road';

describe('readFiscalRoad', () => {
  it('takes the blocking code and the fix route of the core row', () => {
    expect(readFiscalRoad([{ filing_blocked: 'fiscal.no_representation_grant', filing_fix_route: '/m/verifactu/config' }]))
      .toEqual({ blocked: 'fiscal.no_representation_grant', fixRoute: '/m/verifactu/config' });
  });

  it('keeps the fix route even when nothing blocks: a later refusal needs it', () => {
    expect(readFiscalRoad([{ filing_blocked: '', filing_fix_route: '/m/verifactu/config' }]))
      .toEqual({ blocked: '', fixRoute: '/m/verifactu/config' });
  });

  it('an empty, missing or malformed answer is «no block» — the dispatcher stays the authority', () => {
    for (const answer of [[], undefined, null, 'x', [{}], [{ filing_blocked: 42 }]]) {
      expect(readFiscalRoad(answer), JSON.stringify(answer)).toEqual({ blocked: '', fixRoute: '' });
    }
  });
});

describe('fiscalRoadKey / isFiscalRoadRefusal', () => {
  it('each published cause has its own sentence', () => {
    expect(fiscalRoadKey('fiscal.no_representation_grant')).toBe('ui.fiscalRoadNoGrant');
    expect(fiscalRoadKey('fiscal.gateway_not_enrolled')).toBe('ui.fiscalRoadNoConnection');
  });

  it('a cause this version does not know still blocks, generically', () => {
    expect(fiscalRoadKey('fiscal.some_future_cause')).toBe('ui.fiscalRoadBlocked');
  });

  it('only the road codes are road refusals', () => {
    expect(isFiscalRoadRefusal('fiscal.no_representation_grant')).toBe(true);
    expect(isFiscalRoadRefusal('fiscal.gateway_not_enrolled')).toBe(true);
    expect(isFiscalRoadRefusal('sales.no_tax_rule')).toBe(false);
    expect(isFiscalRoadRefusal('')).toBe(false);
  });
});
