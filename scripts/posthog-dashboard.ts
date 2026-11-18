// Creates the SPEC §1 metrics dashboard in PostHog as HogQL tables.
//
// Needs a PostHog *personal* API key with insight and dashboard write access
// (not the public project key the app uses):
//   POSTHOG_PERSONAL_API_KEY=phx_... POSTHOG_PROJECT_ID=12345 \
//   POSTHOG_HOST=https://us.posthog.com npm run posthog:dashboard
//
// Re-running creates a new dashboard; delete the old one in PostHog first.

const host = (process.env.POSTHOG_HOST || 'https://us.posthog.com').replace(/\/$/, '');
const key = process.env.POSTHOG_PERSONAL_API_KEY;
const project = process.env.POSTHOG_PROJECT_ID;

const ACTIONS = `('set_logged', 'session_finished', 'meal_logged')`;
const SETUP = `(SELECT distinct_id, min(timestamp) AS t0 FROM events WHERE event = 'setup_completed' GROUP BY distinct_id)`;

const INSIGHTS: { name: string; description: string; query: string }[] = [
  {
    name: 'Activation',
    description: '% of people who start setup and finish it (last 90 days).',
    query: `SELECT count(DISTINCT if(event = 'setup_started', distinct_id, NULL)) AS started,
       count(DISTINCT if(event = 'setup_completed', distinct_id, NULL)) AS activated,
       round(100 * activated / nullIf(started, 0), 1) AS activation_pct
FROM events
WHERE event IN ('setup_started', 'setup_completed') AND timestamp > now() - INTERVAL 90 DAY`,
  },
  {
    name: 'Day-1 action',
    description: '% of activated people who log a set, session or meal within 24 hours of setup.',
    query: `SELECT count() AS activated,
       countIf(b.t1 >= a.t0 AND b.t1 <= a.t0 + INTERVAL 1 DAY) AS acted_day1,
       round(100 * acted_day1 / nullIf(activated, 0), 1) AS day1_pct
FROM ${SETUP} AS a
LEFT JOIN (SELECT distinct_id, min(timestamp) AS t1 FROM events WHERE event IN ${ACTIONS} GROUP BY distinct_id) AS b
  ON a.distinct_id = b.distinct_id`,
  },
  {
    name: 'Weekly active use',
    description: 'People with 2+ finished sessions in a week, by week since setup, as a share of everyone activated.',
    query: `SELECT week_since_setup,
       count() AS weekly_active,
       round(100 * weekly_active / nullIf((SELECT count(DISTINCT distinct_id) FROM events WHERE event = 'setup_completed'), 0), 1) AS pct_of_activated
FROM (
  SELECT e.distinct_id AS id, intDiv(dateDiff('day', a.t0, e.timestamp), 7) AS week_since_setup, count() AS sessions
  FROM events AS e
  JOIN ${SETUP} AS a ON e.distinct_id = a.distinct_id
  WHERE e.event = 'session_finished' AND e.timestamp >= a.t0
  GROUP BY id, week_since_setup
  HAVING sessions >= 2
)
GROUP BY week_since_setup
ORDER BY week_since_setup`,
  },
  {
    name: 'Meal logging',
    description: 'Average meals logged per active day (a day with any logged set, session or meal), last 30 days.',
    query: `SELECT countIf(event = 'meal_logged') AS meals,
       count(DISTINCT if(event IN ${ACTIONS}, concat(distinct_id, '|', toString(toDate(timestamp))), NULL)) AS active_days,
       round(meals / nullIf(active_days, 0), 2) AS meals_per_active_day
FROM events
WHERE event IN ${ACTIONS} AND timestamp > now() - INTERVAL 30 DAY`,
  },
  {
    name: 'Meals by method',
    description: 'Template picks vs food list vs AI vs manual numbers, last 30 days.',
    query: `SELECT properties.method AS method, count() AS meals
FROM events WHERE event = 'meal_logged' AND timestamp > now() - INTERVAL 30 DAY
GROUP BY method ORDER BY meals DESC`,
  },
  {
    name: 'AI usage and errors',
    description: 'AI meal estimates and schedule edits by result, with calls per user, last 30 days.',
    query: `SELECT event, properties.status AS status, count() AS calls, count(DISTINCT distinct_id) AS users,
       round(calls / nullIf(users, 0), 2) AS calls_per_user
FROM events
WHERE event IN ('ai_estimate', 'ai_schedule') AND timestamp > now() - INTERVAL 30 DAY
GROUP BY event, status ORDER BY event, calls DESC`,
  },
  {
    name: 'Plan edits',
    description: '% of activated people who changed their schedule, and how.',
    query: `SELECT count(DISTINCT if(event = 'setup_completed', distinct_id, NULL)) AS activated,
       count(DISTINCT if(event = 'schedule_edited', distinct_id, NULL)) AS customized,
       round(100 * customized / nullIf(activated, 0), 1) AS customized_pct,
       countIf(event = 'schedule_edited' AND properties.method = 'drag') AS manual_edits,
       countIf(event = 'schedule_edited' AND properties.method = 'ai') AS ai_edits
FROM events WHERE event IN ('setup_completed', 'schedule_edited')`,
  },
  {
    name: 'Where visitors come from',
    description: 'First-touch source and medium (UTM tags, or the referring site, or direct), visitors and setups, last 90 days.',
    query: `SELECT properties.source AS source, properties.medium AS medium,
       count(DISTINCT if(event = 'landing_viewed', distinct_id, NULL)) AS visitors,
       count(DISTINCT if(event = 'setup_completed', distinct_id, NULL)) AS set_up,
       round(100 * set_up / nullIf(visitors, 0), 1) AS setup_pct
FROM events
WHERE event IN ('landing_viewed', 'setup_completed') AND timestamp > now() - INTERVAL 90 DAY
GROUP BY source, medium
ORDER BY visitors DESC`,
  },
  {
    name: 'Funnel by source',
    description: 'Visit → start setup → finish setup → first workout → back in week 2 (days 7–13 after setup), by first-touch source.',
    query: `SELECT coalesce(nullIf(s.source, ''), 'unknown') AS source,
       count() AS people,
       countIf(s.visited) AS visited,
       countIf(s.started) AS started_setup,
       countIf(s.finished = 1) AS finished_setup,
       countIf(w.did = 1) AS did_a_workout,
       countIf(r.week2 = 1) AS back_in_week_2
FROM (
  SELECT distinct_id,
         argMin(properties.source, timestamp) AS source,
         max(event = 'landing_viewed') AS visited,
         max(event = 'setup_started') AS started,
         max(event = 'setup_completed') AS finished
  FROM events WHERE event IN ('landing_viewed', 'setup_started', 'setup_completed')
  GROUP BY distinct_id
) AS s
LEFT JOIN (SELECT distinct_id, 1 AS did FROM events WHERE event = 'session_finished' GROUP BY distinct_id) AS w ON s.distinct_id = w.distinct_id
LEFT JOIN (
  SELECT e.distinct_id AS distinct_id, max(dateDiff('day', a2.t0, e.timestamp) BETWEEN 7 AND 13) AS week2
  FROM events AS e JOIN ${SETUP} AS a2 ON e.distinct_id = a2.distinct_id
  WHERE e.event = 'app_opened'
  GROUP BY e.distinct_id
) AS r ON s.distinct_id = r.distinct_id
GROUP BY source
ORDER BY people DESC`,
  },
  {
    name: 'Back in week 2',
    description: 'The product-market-fit signal for a free app: % of people who finished setup 14+ days ago and opened the app again on days 7–13.',
    query: `SELECT count() AS set_up_14_days_ago,
       countIf(r.week2 = 1) AS came_back,
       round(100 * came_back / nullIf(set_up_14_days_ago, 0), 1) AS week2_return_pct
FROM ${SETUP} AS a
LEFT JOIN (
  SELECT e.distinct_id AS distinct_id, max(dateDiff('day', a2.t0, e.timestamp) BETWEEN 7 AND 13) AS week2
  FROM events AS e JOIN ${SETUP} AS a2 ON e.distinct_id = a2.distinct_id
  WHERE e.event = 'app_opened'
  GROUP BY e.distinct_id
) AS r ON a.distinct_id = r.distinct_id
WHERE a.t0 < now() - INTERVAL 14 DAY`,
  },
  {
    name: 'How people heard about it',
    description: 'Answers to the optional question at the end of setup, newest first.',
    query: `SELECT timestamp, properties.heard_about AS answer, properties.source AS first_touch_source
FROM events
WHERE event = 'setup_completed' AND coalesce(properties.heard_about, '') != ''
ORDER BY timestamp DESC
LIMIT 200`,
  },
];

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${host}/api/projects/${project}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function main() {
  if (!key || !project) {
    console.error('Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID (and POSTHOG_HOST for EU: https://eu.posthog.com).');
    process.exit(1);
  }
  const dashboard = await api<{ id: number }>('/dashboards/', {
    name: 'WeddingReady · portfolio metrics',
    description: 'SPEC §1 metrics. Anonymous events only.',
  });
  for (const i of INSIGHTS) {
    await api('/insights/', {
      name: i.name,
      description: i.description,
      query: { kind: 'DataTableNode', source: { kind: 'HogQLQuery', query: i.query } },
      dashboards: [dashboard.id],
    });
    console.log(`Added ${i.name}`);
  }
  console.log(`Dashboard: ${host}/project/${project}/dashboard/${dashboard.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
