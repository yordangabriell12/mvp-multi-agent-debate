'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/modals/Modal'
import { useOnboardingStore } from '@/store/onboardingStore'
import { useUiStore } from '@/store/uiStore'

// The walkthrough shown the first time an account opens the app.
//
// It describes what is on screen rather than the product in general, because the
// useful thing to tell a new account holder is what each part of this workspace
// does. Steps are plain data so the list can grow without touching the layout.

interface Step {
  title: string
  body: string
}

const BASE_STEPS: Step[] = [
  {
    title: 'Selamat datang di VMA',
    body:
      'Ini ruang debat multi-agen. Kamu menulis satu topik, lalu beberapa agen berperan ' +
      'sebagai orang berbeda dan saling berdebat untuk mempertajam jawaban.',
  },
  {
    title: 'Mulai dari satu sesi',
    body:
      'Setiap sesi punya agen dan riwayatnya sendiri. Buat sesi baru di sidebar kiri, ' +
      'lalu pilih mode diskusi di panel kanan: Boardroom untuk debat ketat, Supportive ' +
      'untuk kerja sama, Learning untuk belajar, War Room untuk kecepatan.',
  },
  {
    title: 'Atur agen',
    body:
      'Buka "Manage Agents" untuk menambah, menghapus, atau mengganti peran tiap agen. ' +
      'Tiap agen punya nama, peran, dan model sendiri, jadi kamu bisa mencampur beberapa ' +
      'model dalam satu debat.',
  },
  {
    title: 'Pilih model',
    body:
      'Buka "AI Models" untuk memilih model tiap agen. Kalau daftarnya kosong, berarti ' +
      'belum ada kunci API yang diisi. Hubungi super admin untuk mengisinya.',
  },
  {
    title: 'Biarkan berjalan',
    body:
      'Kirim topikmu, lalu tekan play. Agen akan bergiliran menjawab. Kamu bisa menjeda, ' +
      'menghentikan, atau mengubah batas ronde kapan saja. Kamu juga bisa menyela dengan ' +
      'menyebut nama agen, misalnya "@Finance Advisor, jelaskan angkanya".',
  },
]

const ADMIN_STEP: Step = {
  title: 'Kamu super admin',
  body:
    'Di "Kelola Akun" kamu bisa membuat akun untuk orang lain beserta passwordnya, ' +
    'mengatur ulang password, dan menghapus akun. Kunci API yang kamu simpan di ' +
    '"API Keys" dipakai semua akun, jadi mereka tidak perlu punya kunci sendiri dan ' +
    'tidak bisa melihat kuncimu.',
}

export function OnboardingTour() {
  const open = useOnboardingStore((s) => s.open)
  const ready = useOnboardingStore((s) => s.ready)
  const finish = useOnboardingStore((s) => s.finish)
  const isAdmin = useUiStore((s) => s.isAdmin)
  const [index, setIndex] = useState(0)

  // Starting again from the sidebar should begin at the first step, not wherever
  // the last run stopped.
  useEffect(() => {
    if (open) setIndex(0)
  }, [open])

  if (!open || !ready) return null

  const steps = isAdmin ? [...BASE_STEPS, ADMIN_STEP] : BASE_STEPS
  const step = steps[Math.min(index, steps.length - 1)]
  const isLast = index >= steps.length - 1

  return (
    <Modal
      open
      onClose={finish}
      title={step.title}
      description={step.body}
      maxWidth="max-w-md"
    >
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5" aria-hidden="true">
          {steps.map((_, i) => (
            <span
              key={i}
              className={
                'h-1.5 rounded-full transition-colors ' +
                (i === index ? 'w-4 bg-sand-700' : 'w-1.5 bg-sand-300')
              }
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={finish}
            className="px-3 py-1.5 text-xs text-ink-muted hover:text-ink transition-colors"
          >
            Lewati
          </button>
          {!isLast ? (
            <button
              onClick={() => setIndex((i) => i + 1)}
              className="px-4 py-1.5 text-xs font-medium text-white bg-sand-800 rounded-md hover:bg-sand-900 transition-colors"
            >
              Lanjut
            </button>
          ) : (
            <button
              onClick={finish}
              className="px-4 py-1.5 text-xs font-medium text-white bg-sand-800 rounded-md hover:bg-sand-900 transition-colors"
            >
              Mulai
            </button>
          )}
        </div>
      </div>

      <p className="mt-4 text-[11px] text-ink-muted">
        Langkah {index + 1} dari {steps.length}
      </p>
    </Modal>
  )
}
