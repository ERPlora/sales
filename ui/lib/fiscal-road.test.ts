// hub#1935 — reading the core's answer about the road to the tax authority.
import { describe, expect, it } from 'vitest';
import { certificateExpiryDays, fiscalRoadKey, isFiscalRoadRefusal, readFiscalRoad } from './fiscal-road';

describe('readFiscalRoad', () => {
  it('takes the blocking code and the fix route of the core row', () => {
    expect(readFiscalRoad([{ filing_blocked: 'fiscal.no_representation_grant', filing_fix_route: '/m/verifactu/config' }]))
      .toEqual({ blocked: 'fiscal.no_representation_grant', fixRoute: '/m/verifactu/config', expiresAt: '' });
  });

  it('hub#1940 — takes when the own certificate that signs expires', () => {
    expect(readFiscalRoad([{ filing_blocked: '', filing_fix_route: '/m/verifactu/config', own_certificate_expires_at: '2026-10-01T10:00:00Z' }]))
      .toEqual({ blocked: '', fixRoute: '/m/verifactu/config', expiresAt: '2026-10-01T10:00:00Z' });
  });

  it('keeps the fix route even when nothing blocks: a later refusal needs it', () => {
    expect(readFiscalRoad([{ filing_blocked: '', filing_fix_route: '/m/verifactu/config' }]))
      .toEqual({ blocked: '', fixRoute: '/m/verifactu/config', expiresAt: '' });
  });

  it('an empty, missing or malformed answer is «no block» — the dispatcher stays the authority', () => {
    for (const answer of [[], undefined, null, 'x', [{}], [{ filing_blocked: 42 }]]) {
      expect(readFiscalRoad(answer), JSON.stringify(answer)).toEqual({ blocked: '', fixRoute: '', expiresAt: '' });
    }
  });
});

describe('fiscalRoadKey / isFiscalRoadRefusal', () => {
  it('each published cause has its own sentence', () => {
    expect(fiscalRoadKey('fiscal.no_representation_grant')).toBe('ui.fiscalRoadNoGrant');
    expect(fiscalRoadKey('fiscal.gateway_not_enrolled')).toBe('ui.fiscalRoadNoConnection');
    expect(fiscalRoadKey('fiscal.own_certificate_expired')).toBe('ui.fiscalRoadOwnCertificateExpired');
  });

  it('a cause this version does not know still blocks, generically', () => {
    expect(fiscalRoadKey('fiscal.some_future_cause')).toBe('ui.fiscalRoadBlocked');
  });

  it('only the road codes are road refusals', () => {
    expect(isFiscalRoadRefusal('fiscal.no_representation_grant')).toBe(true);
    expect(isFiscalRoadRefusal('fiscal.gateway_not_enrolled')).toBe(true);
    expect(isFiscalRoadRefusal('fiscal.own_certificate_expired')).toBe(true);
    expect(isFiscalRoadRefusal('sales.no_tax_rule')).toBe(false);
    expect(isFiscalRoadRefusal('')).toBe(false);
  });
});

// hub#1940 — the till warns BEFORE the own certificate runs out, not the morning it stops charging.
describe('certificateExpiryDays', () => {
  const NOW = new Date('2026-09-22T12:00:00Z');
  const road = (expiresAt: string, blocked = '') => ({ blocked, fixRoute: '', expiresAt });

  it('within the warning window → whole days left', () => {
    expect(certificateExpiryDays(road('2026-09-27T12:00:00Z'), NOW)).toBe(5);
    expect(certificateExpiryDays(road('2026-09-27T12:00:01Z'), NOW)).toBe(5);
    expect(certificateExpiryDays(road('2026-10-22T12:00:00Z'), NOW)).toBe(30);
  });

  it('the last day still warns, as «less than a day» (0)', () => {
    expect(certificateExpiryDays(road('2026-09-23T11:59:59Z'), NOW)).toBe(0);
    expect(certificateExpiryDays(road('2026-09-22T12:00:00Z'), NOW)).toBe(0);
    expect(certificateExpiryDays(road('2026-09-23T12:00:00Z'), NOW)).toBe(1);
  });

  it('further away than the window → no warning', () => {
    expect(certificateExpiryDays(road('2026-10-22T12:00:01Z'), NOW)).toBeNull();
  });

  it('already expired, blocked, unknown or unreadable → no warning (the block speaks instead)', () => {
    expect(certificateExpiryDays(road('2026-09-21T12:00:00Z'), NOW)).toBeNull();
    expect(certificateExpiryDays(road('2026-09-25T12:00:00Z', 'fiscal.own_certificate_expired'), NOW)).toBeNull();
    expect(certificateExpiryDays(road(''), NOW)).toBeNull();
    expect(certificateExpiryDays(road('garbage'), NOW)).toBeNull();
  });
});
