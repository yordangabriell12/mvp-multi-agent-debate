// Tests for the browser search layer's relevance guard.
//
// The failure this pins: a page that answers 200 and contains only navigation is a
// page but not a source. Treating it as one is how an agent ends up citing a menu,
// which is worse than saying it found nothing. This was not hypothetical: a wrong URL
// on pajak.go.id returned 2119 characters of navigation with no mention of PPh 21.
//
// Only the pure function is tested here. Launching a browser in a unit test would
// make the suite depend on Chrome being installed, and the extraction selectors are
// already exercised against the real engines.

import { describe, it, expect } from 'vitest'
import { pageLooksRelevant } from '@/lib/browserSearch'

const NAVIGATION_ONLY = `Lompat ke isi utama
Navigasi kedua
Profil
Overview
Visi, Misi, Tujuan, dan MaklumPelayanan
Tugas dan Fungsi
Logo DJP
Kode Etik dan Kode Perilaku
Struktur Organisasi
Daftar Pejabat
Unit Kerja
Hasil Survei
Peraturan
Kurs
Tarif Bunga
Unduh
Aplikasi Perpajakan
Formulir Perpajakan
Informasi Publik`

describe('pageLooksRelevant', () => {
  it('accepts a page that actually answers the question', () => {
    const page =
      'Pajak Penghasilan Pasal 21 adalah pajak atas penghasilan berupa gaji, upah, ' +
      'honorarium, tunjangan, dan pembayaran lain sehubungan dengan pekerjaan. ' +
      'Pemotongan dilakukan oleh pemberi kerja sejak Januari 2024 dengan tarif efektif.'
    expect(pageLooksRelevant(page, 'dasar hukum PPh 21 terbaru')).toBe(true)
  })

  it('rejects a page that is only navigation', () => {
    expect(pageLooksRelevant(NAVIGATION_ONLY, 'dasar hukum PPh 21')).toBe(false)
  })

  it('rejects a page that is too short to contain anything', () => {
    expect(pageLooksRelevant('PPh 21 terbaru', 'PPh 21 terbaru')).toBe(false)
    expect(pageLooksRelevant('', 'apa saja')).toBe(false)
  })

  it('rejects a page whose only shared words are common short ones', () => {
    // "dan" and "di" are on every Indonesian page, so a query built from them must
    // not accept an unrelated page. Conjunctions are not acronyms.
    const unrelated =
      'Artikel ini membahas tentang kegiatan sehari-hari di kota besar dan bagaimana ' +
      'penduduknya menjalani rutinitas pagi hingga malam dengan berbagai kebiasaan ' +
      'yang berulang setiap pekan tanpa perubahan berarti bagi siapa pun di sana.'
    expect(pageLooksRelevant(unrelated, 'dan di ke')).toBe(false)
  })

  it('does not accept a page linked only by a word too broad to mean anything', () => {
    // The real case: the query "dasar hukum PPh 21 terbaru" matched a Wikipedia
    // article about judges, on the word "hukum" alone. An article on law in general
    // is not an answer to a question about one specific tax regulation, and passing it
    // through gives the agent something plausible and wrong to cite.
    const aboutJudges =
      'Hakim adalah pejabat umum yang diberikan wewenang untuk dapat mengadili, ' +
      'memutuskan perkara-perkara yang tidak bertanggung dan memimpin perkara hukum ' +
      'yang diajukan ke Pengadilan dan Mahkamah. Dalam kasus juri, hakim seorang ' +
      'pejabat yang melakukan kekuasaan kehakiman dan memimpin persidangan.'
    expect(pageLooksRelevant(aboutJudges, 'dasar hukum PPh 21 terbaru')).toBe(false)
  })

  it('accepts a page that shares a specific term from the query', () => {
    // Same shape as the rejected page, but this one names the thing being asked about,
    // so the match is specific rather than incidental.
    const aboutPph =
      'Pemotongan PPh Pasal 21 memakai tarif efektif rata-rata sejak Januari 2024 ' +
      'sesuai ketentuan yang mengatur petunjuk pelaksanaan pemotongan atas penghasilan ' +
      'sehubungan dengan pekerjaan, jasa, dan kegiatan orang pribadi.'
    expect(pageLooksRelevant(aboutPph, 'dasar hukum PPh 21 terbaru')).toBe(true)
  })

  it('treats a short acronym as a real term, and finds it whatever its case', () => {
    // The case that exposed the old rule: "PPh 21" is what names the regulation, and
    // a length filter discarded it, so a page entirely about it was rejected.
    const page =
      'Pajak Penghasilan Pasal 21 adalah pajak atas penghasilan berupa gaji, upah, ' +
      'honorarium, dan pembayaran lain sehubungan dengan pekerjaan. Pemotongan ' +
      'dilakukan pemberi kerja sejak Januari 2024 memakai tarif efektif bulanan.'
    expect(pageLooksRelevant(page, 'PPh 21')).toBe(true)
    expect(pageLooksRelevant(page, 'dasar hukum PPh 21 terbaru')).toBe(true)
  })

  it('falls back to length alone when the query has no word at all', () => {
    const long = 'x'.repeat(500)
    expect(pageLooksRelevant(long, '???')).toBe(true)
    expect(pageLooksRelevant('pendek', '???')).toBe(false)
  })
})
