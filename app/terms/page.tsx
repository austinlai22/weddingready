import type { Metadata } from 'next';
import { DocPage } from '@/components/DocPage';

export const metadata: Metadata = { title: 'Terms' };

export default function TermsPage() {
  return (
    <DocPage title="Terms">
      <p>WeddingReady is a free portfolio project. By using it you agree to the following.</p>
      <h2>General guidance, not medical advice</h2>
      <p>The plan is general fitness and nutrition guidance. It is not medical advice, and it has not yet been reviewed by a registered dietitian or certified trainer. Talk to your doctor before starting, especially if you are pregnant or postpartum, have a medical condition, or have a history of an eating disorder.</p>
      <h2>Listen to your body</h2>
      <p>Stop any exercise that causes pain. Calorie and protein numbers are estimates and can be off by 10% or more. Restaurant and AI estimates can be off by much more.</p>
      <h2>18 and over</h2>
      <p>WeddingReady is for adults aged 18 and over.</p>
      <h2>No warranty</h2>
      <p>The app is provided as is, without warranty of any kind. Your data lives on your device, so keep an export if it matters to you.</p>
    </DocPage>
  );
}
