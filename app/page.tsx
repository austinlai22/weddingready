'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { HydrationGate } from '@/components/AppShell';

function Redirect() {
  const router = useRouter();
  useEffect(() => router.replace('/train'), [router]);
  return null;
}

export default function Home() {
  return (
    <HydrationGate>
      <div className="app-main">
        <Redirect />
      </div>
    </HydrationGate>
  );
}
