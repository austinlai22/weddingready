import type { Metadata } from 'next';
import { DocPage } from '@/components/DocPage';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <DocPage title="Privacy">
      <p>WeddingReady has no accounts. Your plan stays on your device.</p>
      <h2>What’s stored, and where</h2>
      <p>Everything you enter (your dates, body details, goals, health answers, workouts, weights and meals) is saved only in this browser’s local storage on this device. It is never uploaded to our servers. Clearing your browser data, or using Delete everything in Settings, removes it.</p>
      <h2>What’s sent</h2>
      <ul>
        <li><strong>AI meal estimates</strong>: when you use “Describe it”, the food, amount and details you type are sent to our server and on to Anthropic’s Claude API to estimate the nutrition. Nothing else about you is included.</li>
        <li><strong>AI schedule edits</strong>: when you use “Ask AI”, your request and your weekly schedule (session names and days) are sent the same way.</li>
        <li><strong>Usage stats</strong>: anonymous events such as “a set was logged” or “setup finished”, tied to a random ID made on this device. They never include names, dates, weights, health answers or food text. You can turn them off in Settings.</li>
        <li><strong>Rate limits</strong>: to prevent abuse, our server counts AI requests per day using one-way hashes of your random device ID and your network address. The counts expire after a day.</li>
      </ul>
      <h2>Retention</h2>
      <p>We don’t keep the text of AI requests. Our server keeps daily request counts for a day and anonymous usage totals for up to 90 days. Anthropic handles API requests under its own data policies. Anonymous usage events are kept by our analytics provider, PostHog, under its retention settings.</p>
      <h2>Delete your data</h2>
      <p>Go to Settings → Delete everything. This clears your plan and logs from this device and makes a new random ID. You can export a copy first.</p>
      <h2>Health data</h2>
      <p>Some US states, such as Washington, have laws about consumer health data. Because your health details stay on your device and are never sent to us, we don’t collect them. This page is not legal advice.</p>
    </DocPage>
  );
}
