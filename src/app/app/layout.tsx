import { SidebarLeft } from '@/components/layout/SidebarLeft'
import { StorageWarning } from '@/components/layout/StorageWarning'
import { ConfigSync } from '@/components/layout/ConfigSync'
import { ModalHost } from '@/components/modals/ModalHost'
import { OnboardingTour } from '@/components/onboarding/OnboardingTour'

// One sidebar, on the left. A second panel on the right used to hold the room and the
// mode and took a fixed 288px of the window. Its two tabs now live in the left column,
// so the chat gets the width instead of whatever is left between two panels.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <ConfigSync />
      <SidebarLeft />
      <main className="flex-1 flex flex-col min-w-0">
        <StorageWarning />
        {children}
      </main>
      <ModalHost />
      <OnboardingTour />
    </div>
  )
}