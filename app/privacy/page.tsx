import type { Metadata } from 'next';
import Link from 'next/link';
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
        <li><strong>AI meal estimates</strong>: when you use “Describe it”, the food, amount and details you type are sent to our server and on to an AI service to estimate the nutrition: Anthropic’s Claude API, or Google’s Gemini API free tier. Nothing else about you is included.</li>
        <li><strong>The coach</strong>: when you ask your coach, your message, your training plan (dates, goals, strength days, equipment and activities), this week’s sessions and what you’ve ticked off, and today’s food targets and totals (only as you’ve chosen to see them) are sent to our server and on to Google’s Gemini API free tier. Your weight, height, age and health answers are never sent. Nothing is stored on our server.</li>
        <li><strong>About Google’s free tier</strong>: Google may use what’s sent through its free Gemini tier to improve its products, so don’t type anything personal into the meal estimate or the coach.</li>
        <li><strong>Plan codes and calendar links</strong>: a plan code (on the Plan tab, or from an AI assistant) holds your training plan only, never body or health details. A link that opens setup carries it after the “#”, which your browser doesn’t send to our server. A calendar link from an assistant includes it in the address so our server can build the calendar file; nothing is stored. The app’s own “Download calendar file” is made on your device.</li>
        <li><strong>AI assistants</strong>: if you use WeddingReady through an assistant such as Claude (see <Link href="/agents">For AI assistants</Link>), the details the assistant sends, such as your dates, schedule or weight, are used to answer that one request and aren’t stored. Only an anonymous count of how often each tool is used is kept.</li>
        <li><strong>Usage stats</strong>: anonymous events such as “a set was logged” or “setup finished”, tied to a random ID made on this device. They never include names, dates, weights, health answers or food text. You can turn them off in Settings.</li>
        <li><strong>Rate limits</strong>: to prevent abuse, our server counts AI requests per day using one-way hashes of your random device ID and your network address. The counts expire after a day.</li>
      </ul>
      <h2>Retention</h2>
      <p>We don’t keep the text of AI requests. Our server keeps daily request counts for a day and anonymous usage totals for up to 90 days. Anthropic and Google handle API requests under their own data policies. Anonymous usage events are kept by our analytics provider, PostHog, under its retention settings.</p>
      <h2>Delete your data</h2>
      <p>Go to Settings → Delete everything. This clears your plan and logs from this device and makes a new random ID. You can export a copy first.</p>
      <h2>Health data</h2>
      <p>Some US states, such as Washington, have laws about consumer health data. Because your health details stay on your device and are never sent to us, we don’t collect them. This page is not legal advice.</p>
    </DocPage>
  );
}
