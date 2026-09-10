'use client'

import { ApiKeysModal } from './ApiKeysModal'
import { AgentsModal } from './AgentsModal'
import { ModelsModal } from './ModelsModal'
import { RolesModal } from './RolesModal'
import { DocumentsModal } from './DocumentsModal'

export function ModalHost() {
  return (
    <>
      <ApiKeysModal />
      <AgentsModal />
      <ModelsModal />
      <RolesModal />
      <DocumentsModal />
    </>
  )
}