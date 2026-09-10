import { SidebarLeft } from '@/components/layout/SidebarLeft'
import { SidebarRight } from '@/components/layout/SidebarRight'
import { StorageWarning } from '@/components/layout/StorageWarning'
import { ConfigSync } from '@/components/layout/ConfigSync'
import { ModalHost } from '@/components/modals/ModalHost'

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
      <SidebarRight />
      <ModalHost />
    </div>
  )
}