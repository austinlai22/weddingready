import { describe, expect, it } from 'vitest';
import { attributionFrom, cleanTag, cleanVerbatim } from './attribution';
import { openBucket } from '../components/AppShell';

describe('where visitors come from', () => {
  it('uses the campaign tags on the link first', () => {
    expect(attributionFrom('https://weddingready.vercel.app/?utm_source=LinkedIn&utm_medium=social&utm_campaign=Launch Post', 'https://www.google.com/')).toEqual({ source: 'linkedin', medium: 'social', campaign: 'launch_post', landing: '/' });
  });
  it('otherwise the referring site’s name only, then direct', () => {
    expect(attributionFrom('https://weddingready.vercel.app/how-it-works?x=1', 'https://www.linkedin.com/feed/update/urn:li:activity:123')).toEqual({ source: 'linkedin.com', medium: 'referral', campaign: '', landing: '/how-it-works' });
    expect(attributionFrom('https://weddingready.vercel.app/', 'https://weddingready.vercel.app/agents').source).toBe('direct');
    expect(attributionFrom('https://weddingready.vercel.app/plan/secret', '').landing).toBe('other');
  });
  it('keeps tags short and plain', () => {
    expect(cleanTag('<script>alert(1)</script>')).toBe('script_alert_1_script');
    expect(cleanTag('x'.repeat(80))).toHaveLength(40);
  });
});

describe('“How did you hear about us?”', () => {
  it('removes emails, links and phone numbers', () => {
    expect(cleanVerbatim('  My friend Sam (sam@example.com) sent https://t.co/abc, call 415-555-0199 ')).toBe('My friend Sam ([email]) sent [link], call [number]');
    expect(cleanVerbatim('LinkedIn post').length).toBeLessThanOrEqual(120);
    expect(cleanVerbatim('a'.repeat(300))).toHaveLength(120);
  });
});

describe('return visits', () => {
  it('buckets days since the plan started, with week 2 on its own', () => {
    expect([-3, 0, 3, 7, 13, 14, 40].map(openBucket)).toEqual(['before_start', 'day_0', 'days_1_6', 'days_7_13', 'days_7_13', 'days_14_27', 'days_28_plus']);
  });
});
