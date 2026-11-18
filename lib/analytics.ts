'use client';

import type { PostHog } from 'posthog-js';

// Anonymous analytics (SPEC §12). PostHog with no cookies or local storage of
// its own (memory persistence); the app's random deviceId is the distinct ID.
// Events carry buckets and enums only: never names, dates, weights or food text.
// No-op without NEXT_PUBLIC_POSTHOG_KEY, and when the user opts out.

export type AnalyticsEvent =
  | 'setup_started'
  | 'setup_step_completed'
  | 'setup_completed'
  | 'plan_viewed'
  | 'set_logged'
  | 'session_finished'
  | 'meal_logged'
  | 'ai_estimate'
  | 'schedule_edited'
  | 'ai_schedule'
  | 'pwa_installed'
  | 'settings_changed'
  | 'calendar_exported'
  | 'plan_code_copied'
  | 'coach'
  | 'setup_describe';

type Props = Record<string, string | number | boolean | string[]>;

let client: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;
let deviceId = '';
let optedOut = false;
const queue: [AnalyticsEvent, Props | undefined][] = [];

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

export function configureAnalytics(id: string, optOut: boolean) {
  deviceId = id;
  optedOut = optOut;
  if (optOut) {
    queue.length = 0;
    client?.opt_out_capturing();
    return;
  }
  client?.opt_in_capturing();
  if (KEY && id && !loading) {
    loading = import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(KEY, {
          api_host: HOST,
          persistence: 'memory',
          bootstrap: { distinctID: id, isIdentifiedID: false },
          person_profiles: 'identified_only',
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          disable_surveys: true,
          disable_external_dependency_loading: true,
          save_referrer: false,
          property_denylist: ['$ip', '$current_url', '$pathname', '$referrer', '$referring_domain', '$initial_referrer', '$initial_referring_domain'],
        });
        client = posthog;
        for (const [e, p] of queue.splice(0)) posthog.capture(e, p);
        return posthog;
      })
      .catch(() => null);
  }
}

export function track(event: AnalyticsEvent, props?: Props) {
  if (optedOut || !KEY) return;
  if (client) client.capture(event, props);
  else if (queue.length < 50) queue.push([event, props]);
}

export function analyticsDeviceId() {
  return deviceId;
}
