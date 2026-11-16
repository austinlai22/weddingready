import { DemoBanner, HydrationGate, LoadErrorNotice, Toast, TopNav } from '@/components/AppShell';
import { RestTimer } from '@/components/train/RestTimer';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <HydrationGate>
      <main className="app-main">
        <TopNav />
        <div className="stack">
          <DemoBanner />
          <LoadErrorNotice />
          {children}
        </div>
        <RestTimer />
        <Toast />
      </main>
    </HydrationGate>
  );
}
