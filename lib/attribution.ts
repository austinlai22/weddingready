// Where visitors come from, for the analytics funnel. First touch only: the
// UTM tags on the link someone first arrived by (e.g. ?utm_source=linkedin),
// or the domain of the site that sent them, or "direct". Kept in this
// browser's storage, sent only with analytics events (so never when
// analytics are off or opted out), and never a full URL or anything personal.

export const VISITOR_KEY = 'weddingready-visitor';
export const ATTRIBUTION_KEY = 'weddingready-attribution';

export interface Attribution {
  source: string;
  medium: string;
  campaign: string;
  /** The first page they saw. */
  landing: string;
}

const PAGES = ['/', '/how-it-works', '/agents', '/setup', '/train', '/eat', '/plan', '/settings', '/privacy', '/terms'];

/** Lowercase letters, digits, dots, dashes and underscores only; 40 characters. */
export function cleanTag(v: string | null | undefined): string {
  return (v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/** Works out first-touch attribution from a page address and referrer. Pure, so it's tested directly. */
export function attributionFrom(href: string, referrer: string): Attribution {
  const url = new URL(href);
  const landing = PAGES.includes(url.pathname) ? url.pathname : 'other';
  const q = url.searchParams;
  const source = cleanTag(q.get('utm_source'));
  if (source) return { source, medium: cleanTag(q.get('utm_medium')) || 'none', campaign: cleanTag(q.get('utm_campaign')), landing };
  let host = '';
  try {
    host = referrer ? new URL(referrer).hostname.replace(/^www\./, '') : '';
  } catch {
    host = '';
  }
  if (host && host !== url.hostname.replace(/^www\./, '')) return { source: cleanTag(host), medium: 'referral', campaign: '', landing };
  return { source: 'direct', medium: 'none', campaign: '', landing };
}

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: analytics simply go without it */
  }
}

/** Records first-touch attribution the first time it's called in this browser, and returns it. */
export function rememberAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null;
  const known = read<Attribution>(ATTRIBUTION_KEY);
  if (known) return known;
  const a = attributionFrom(window.location.href, document.referrer);
  write(ATTRIBUTION_KEY, a);
  return a;
}

export function attributionProps(): Record<string, string> {
  const a = typeof window === 'undefined' ? null : read<Attribution>(ATTRIBUTION_KEY);
  return a ? { source: a.source, medium: a.medium, ...(a.campaign ? { campaign: a.campaign } : {}), landing: a.landing } : {};
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `d-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * A random ID for a visitor who hasn't set up a plan yet, so a visit to the
 * home page and a later setup count as the same person in the funnel. The app
 * adopts it as its device ID.
 */
export function visitorId(): string {
  const known = read<string>(VISITOR_KEY);
  if (known) return known;
  const id = randomId();
  write(VISITOR_KEY, id);
  return id;
}

/** The visitor ID if one exists, without making one. */
export function existingVisitorId(): string | null {
  return typeof window === 'undefined' ? null : read<string>(VISITOR_KEY);
}

/**
 * An answer to "How did you hear about WeddingReady?", made safe to send with
 * anonymous analytics: emails, links and long numbers removed, 120 characters.
 */
export function cleanVerbatim(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/https?:\/\/[^\s,)]+/gi, '[link]')
    .replace(/\+?\d[\d\s().-]{5,}\d/g, '[number]')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
