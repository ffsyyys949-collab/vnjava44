/**
 * DOKUMENTASI INTERNAL FITUR VNJAVA (SINGLE SOURCE OF TRUTH UNTUK ASSISTANT)
 *
 * File ini adalah referensi resmi arsitektur, menu, submenu, tombol, alur kerja,
 * dan status fitur VNJAVA berdasarkan implementasi kode nyata.
 */

export type ZeioFeatureStatus = 'AKTIF' | 'SOON' | 'BELUM_TERSEDIA';

export interface ZeioFeatureDocItem {
  id: string;
  name: string;
  aliases: string[];
  status: ZeioFeatureStatus;
  location: string;
  summary: string;
  howToUse: string[];
  accessRequirement: string;
}

export const ZEIO_DOCS_LAST_UPDATED = '2026-11-20';

export const ZEIO_FEATURE_CATALOG: ZeioFeatureDocItem[] = [
  {
    id: 'beranda-updates',
    name: 'Beranda (Tab Updates)',
    aliases: ['beranda', 'home', 'updates', 'halaman utama'],
    status: 'AKTIF',
    location: 'Tab navigasi bawah paling kiri "Updates" (rute "/" atau "/updates")',
    summary:
      'Halaman utama VNJAVA dengan latar belakang dinamis, header akses cepat (Search, Notifikasi, Key Store, dan Owner Panel khusus Owner/Admin), banner video & lirik musik realtime, barisan Story, serta kartu menu FEATURES.',
    howToUse: [
      'Buka aplikasi VNJAVA atau tekan tab "Updates" di navigasi bawah.',
      'Gunakan ikon Search di kanan atas untuk mencari pengguna lewat @username atau ID.',
      'Gunakan ikon Lonceng di kanan atas untuk melihat notifikasi panggilan, pengumuman global, status Key Store, dan permintaan pertemanan.',
      'Gulir ke bagian FEATURES untuk memilih fitur aktif VNJAVA.'
    ],
    accessRequirement: 'Semua pengguna yang sudah login.'
  },
  {
    id: 'stories',
    name: 'Story (Foto, Video & Teks)',
    aliases: ['story', 'stories', 'cerita', 'status foto', 'status video', 'status teks'],
    status: 'AKTIF',
    location: 'Bagian Story di Beranda & Halaman Buat Story Khusus',
    summary:
      'Fitur berbagi Story foto, video, atau teks dengan latar warna seperti WhatsApp, dilengkapi riwayat siapa saja yang telah melihat serta reaksi Like antar pengguna, tersimpan permanen hingga dihapus manual.',
    howToUse: [
      'Tekan "+ Buat Story" untuk membuka halaman khusus Buat Story (mode Foto/Video atau Teks).',
      'Ketuk story teman untuk menonton layar penuh. Ketuk kanan 1x untuk skip ke story berikutnya atau tahan untuk menjeda.',
      'Pembuat story dapat membuka daftar penonton untuk melihat siapa saja yang sudah menonton serta total Like.'
    ],
    accessRequirement: 'Semua pengguna yang sudah login.'
  },
  {
    id: 'tiktok-no-wm',
    name: 'TikTok No WM (TikTok Downloader)',
    aliases: ['tiktok', 'tiktok no wm', 'tiktok downloader', 'download tiktok', 'unduh tiktok', 'tanpa watermark', 'vt'],
    status: 'AKTIF',
    location: 'Beranda (Updates) > bagian FEATURES > kartu "TikTok No WM"',
    summary:
      'Pengunduh video MP4 dan audio MP3 dari link TikTok bersih tanpa watermark, lengkap dengan opsi putar langsung sebagai musik latar VNJAVA.',
    howToUse: [
      'Buka kartu "TikTok No WM" di Beranda.',
      'Tempel tautan video TikTok lalu proses untuk unduh MP4/MP3 atau putar di background player VNJAVA.'
    ],
    accessRequirement: 'Semua pengguna yang sudah login.'
  },
  {
    id: 'settings',
    name: 'Settings (Pengaturan Aplikasi, UI Beranda & FPS Lock)',
    aliases: ['settings', 'pengaturan', 'setelan', 'fps', 'fps lock', '120 fps', '90 fps', '60 fps', 'tema', 'theme', 'privasi', 'penyimpanan'],
    status: 'AKTIF',
    location: 'Beranda (Updates) > bagian FEATURES > kartu "Settings"',
    summary:
      'Pusat pengaturan VNJAVA yang mencakup Akun, Privasi, Daftar, Chat, Notifikasi, Penyimpanan dan Data, Bahasa Aplikasi, UI Tampilan Beranda (termasuk live preview & tema video di bagian bawah), Bantuan, dan Pengaturan FPS (60 / 90 / 120 FPS).',
    howToUse: [
      'Di Beranda, ketuk menu garis tiga atau kartu "Settings".',
      'Buka "UI Tampilan Beranda" untuk mengatur tata letak, ketebalan bayangan dengan live preview, serta Tema Aplikasi di bagian bawah.'
    ],
    accessRequirement: 'Semua pengguna yang sudah login.'
  },
  {
    id: 'ze-ai',
    name: 'Assistant AI Chat',
    aliases: ['ze ai', 'ai', 'chatbot', 'asisten ai'],
    status: 'AKTIF',
    location: 'Beranda (Updates) > bagian FEATURES > kartu "Assistant" (rute "/ai")',
    summary:
      'Asisten percakapan cerdas di VNJAVA yang mendukung obrolan teks, kiriman foto & video, serta perintah khusus pemegang Key (/rw dan /bug).',
    howToUse: [
      'Buka kartu Assistant di Beranda lalu ketik pertanyaan atau kirim media.',
      'Untuk modul khusus pemegang Key, ketik "/rw" atau "/bug" lalu masukkan kode Key aktif.'
    ],
    accessRequirement: 'Semua pengguna untuk chat; wajib Key aktif untuk perintah "/rw" dan "/bug".'
  },
  {
    id: 'community',
    name: 'Community (Komunitas)',
    aliases: ['community', 'communitie', 'komunitas', 'forum'],
    status: 'AKTIF',
    location: 'Beranda > kartu "Community" ATAU tab navigasi bawah "Communities" (rute "/comm")',
    summary:
      'Wadah komunitas yang dibuat langsung oleh pengguna VNJAVA, mendukung teks, media, voice note, dan panggilan.',
    howToUse: [
      'Tekan tab "Communities" di bawah atau kartu "Community" di Beranda.',
      'Buat komunitas baru atau bergabung ke komunitas yang tersedia.'
    ],
    accessRequirement: 'Semua pengguna yang sudah login.'
  },
  {
    id: 'group-chat',
    name: 'Group Chat',
    aliases: ['group chat', 'chat group', 'grup', 'grup chat', 'obrolan grup', 'buat group', 'buat grup'],
    status: 'AKTIF',
    location: 'Beranda (Updates) > bagian FEATURES > kartu "Group Chat" (rute "/group-chat")',
    summary:
      'Fitur obrolan grup realtime dengan pesan teks, media, voice note, dan panggilan suara/video grup.',
    howToUse: [
      'Buka kartu "Group Chat" di Beranda.',
      'Tekan "+ Buat Group" untuk membuat grup baru bersama teman, lalu kirim teks, foto, voice note, atau mulai panggilan.'
    ],
    accessRequirement: 'Semua pengguna yang sudah login.'
  },
  {
    id: 'zhd-ai',
    name: 'ZHD Photo & Video Enhancer',
    aliases: ['zhd', 'zhd ai', 'wink hd', 'hd photo', 'hd video', 'penjernih foto', 'upscale', 'hd ai'],
    status: 'AKTIF',
    location: 'Beranda (Updates) > bagian FEATURES > kartu "ZHD HD" (rute "/wink-hd")',
    summary:
      'Fitur peningkat ketajaman dan resolusi foto maupun video menjadi HD 2x atau 4x dengan slider Before/After.',
    howToUse: [
      'Buka kartu ZHD di Beranda, unggah foto/video, lalu pilih 2x/4x upscale dan unduh hasilnya.'
    ],
    accessRequirement: 'Semua pengguna yang sudah login.'
  },
  {
    id: 'chess',
    name: 'Catur (2 Player Offline)',
    aliases: ['catur', 'chess', 'main catur', 'game catur', 'catur 2 player'],
    status: 'AKTIF',
    location: 'Beranda (Updates) > bagian FEATURES > kartu "Catur" atau Sidebar > "Catur"',
    summary:
      'Game Catur klasik 2 Player dalam 1 HP secara offline penuh (tanpa lawan AI), mendukung seluruh aturan resmi catur termasuk rokade, en passant, promosi pion, skak, skakmat, undo, dan reset papan.',
    howToUse: [
      'Buka menu "Catur" dari Beranda atau Sidebar.',
      'Pemain Putih dan Hitam bergantian melangkah di 1 perangkat.'
    ],
    accessRequirement: 'Semua pengguna yang sudah login.'
  },
  {
    id: 'music-lab',
    name: 'Music Lab & Background Music Player',
    aliases: ['music', 'music lab', 'musik', 'bg music', 'lagu', 'youtube music', 'mini player', 'tautan jadi musik'],
    status: 'AKTIF',
    location: 'Tab navigasi bawah "Music" (rute "/music")',
    summary:
      'Pemutar musik latar dari link TikTok, YouTube, atau audio web dengan kontrol Play/Pause, Shuffle, Loop, dan Riwayat Lagu.',
    howToUse: [
      'Buka tab "Music" di navigasi bawah, masukkan tautan lagu/video lalu tekan putar.'
    ],
    accessRequirement: 'Semua pengguna yang sudah login.'
  },
  {
    id: 'chats-private-notes',
    name: 'Chats (Private, Voice Note, Pin/Arsip/Hapus & Video Call Real)',
    aliases: ['chats', 'chat pribadi', 'dm', 'voice note', 'vn', 'pin chat', 'arsip', 'video call', 'voice call', 'telepon', 'tambah teman'],
    status: 'AKTIF',
    location: 'Tab navigasi bawah "Chats" (rute "/chats")',
    summary:
      'Pusat komunikasi VNJAVA dengan chat pribadi, pesan suara (Voice Note), panggilan suara dan video call WebRTC real antar perangkat, pengelolaan chat tekan lama (Sematkan, Arsipkan, Hapus Chat/Kontak), Notes 24 jam, serta Global Chat.',
    howToUse: [
      'Tekan lama pada chat di daftar Beranda/Chats untuk menyematkan, mengarsipkan, atau menghapus chat.',
      'Di dalam chat pribadi/grup/komunitas/global, tekan ikon mikrofon untuk mengirim Voice Note atau ikon Telepon/Video untuk memulai panggilan real-time.'
    ],
    accessRequirement: 'Semua pengguna yang sudah login.'
  },
  {
    id: 'global-chat',
    name: 'VNJAVA Global Chat',
    aliases: ['global chat', 'chat global', 'obrolan global', 'room global'],
    status: 'AKTIF',
    location: 'Tab bawah "Chats" > tekan tombol "Global" di bagian atas (rute "/global")',
    summary:
      'Ruang obrolan publik realtime lintas perangkat dengan pesan teks, emoji, stiker, Voice Note, dan panggilan grup.',
    howToUse: [
      'Buka tab "Chats" lalu tekan tombol "Global".'
    ],
    accessRequirement: 'Semua pengguna yang sudah login.'
  },
  {
    id: 'profile-you',
    name: 'Profil Pengguna (Tab You) & Like Postingan',
    aliases: ['you', 'profil', 'profile', 'edit profil', 'foto profil', 'crop', 'like', 'logout', 'keluar'],
    status: 'AKTIF',
    location: 'Tab navigasi bawah paling kanan "You" (rute "/you")',
    summary:
      'Halaman profil dengan fitur upload & crop foto profil bulat (atur zoom dan posisi), posting foto/video yang bisa disukai antar akun (Like), serta total Like di profil.',
    howToUse: [
      'Tekan tab "You" untuk mengedit foto dengan cropper, mengatur nama/bio, dan melihat total Like postingan.'
    ],
    accessRequirement: 'Semua pengguna yang sudah login.'
  },
  {
    id: 'key-store',
    name: 'Key Store (QRIS, Top Up Diamond+ & Verifikasi Owner)',
    aliases: ['key store', 'keystore', 'beli key', 'harga key', 'qris', 'bukti transfer', 'key', 'top up'],
    status: 'AKTIF',
    location: 'Header kanan atas Beranda > ikon Keranjang atau Top Up Diamond+',
    summary:
      'Pembelian Key & VIP Pass menggunakan Saldo Diamond+ atau QRIS dan verifikasi Owner.',
    howToUse: [
      'Tekan ikon Keranjang di Beranda, pilih paket Key (1 Hari Rp5.000, 1 Minggu Rp30.000, 1 Bulan Rp60.000, Permanen Rp88.000) atau VIP, bayar dengan Saldo atau unggah bukti QRIS.'
    ],
    accessRequirement: 'Semua pengguna yang sudah login.'
  },
  {
    id: 'owner-control-panel',
    name: 'Owner Control Panel (Dashboard Owner & Admin)',
    aliases: ['owner', 'owner panel', 'dashboard owner', 'verifikasi pembayaran', 'admin panel', 'give admin'],
    status: 'AKTIF',
    location: 'Header kanan atas Beranda > ikon Mahkota',
    summary:
      'Panel kendali khusus Owner dan Admin untuk memantau statistik, menyetujui/menolak pembayaran, mengangkat/mencabut Admin, mengatur VIP, suspend akun, dan membuat/mencabut Key.',
    howToUse: [
      'Masuk dengan akun Owner atau Admin lalu tekan ikon Mahkota di kanan atas Beranda.'
    ],
    accessRequirement: 'Hanya dapat diakses oleh akun OWNER atau ADMIN.'
  }
];

export function buildZeioSystemKnowledgePrompt(): string {
  const activeLines = ZEIO_FEATURE_CATALOG.filter((f) => f.status === 'AKTIF')
    .map(
      (f, idx) =>
        `${idx + 1}. [${f.status}] ${f.name}\n` +
        `   - Lokasi UI: ${f.location}\n` +
        `   - Fungsi: ${f.summary}\n` +
        `   - Cara Pakai: ${f.howToUse.join(' ')}\n` +
        `   - Akses: ${f.accessRequirement}`
    )
    .join('\n');

  return `
=== DOKUMENTASI INTERNAL RESMI EKOSISTEM VNJAVA (VERSI ${ZEIO_DOCS_LAST_UPDATED}) ===
Gunakan dokumentasi kode asli di bawah ini sebagai sumber kebenaran saat menjawab pertanyaan tentang aplikasi VNJAVA:

A. DAFTAR FITUR AKTIF DI VNJAVA:
${activeLines}

B. ATURAN:
1. Jelaskan fungsi, lokasi menu/tombol, syarat akses, dan langkah penggunaan berdasarkan daftar resmi di atas.
2. Jangan pernah menyebut nama brand lama; brand resmi saat ini adalah VNJAVA.
3. Jika ditanya fitur yang belum tersedia di VNJAVA, jawab jujur bahwa fitur tersebut belum tersedia.
================================================================================
`.trim();
}

export function matchZeioFeatureFallback(rawMessage: string): string | null {
  const q = (rawMessage || '').trim().toLowerCase();
  if (!q) return null;

  if (q.includes('catur') || q.includes('chess')) {
    return 'Menu **Catur** aktif di Beranda **VNJAVA** (bagian Features) maupun Sidebar bro! Game ini mendukung **2 Player Offline dalam 1 HP** lengkap dengan aturan resmi (rokade, en passant, promosi pion, skak/skakmat, undo, dan reset).';
  }

  if (
    (q.includes('fitur') || q.includes('menu')) &&
    (q.includes('apa aja') || q.includes('apa saja') || q.includes('semua') || q.includes('daftar') || q.includes('vnjava') || q.includes('jelaskan'))
  ) {
    return (
      'Ini daftar fitur aktif di **VNJAVA**:\n' +
      '- **Catur**: Game catur 2 Player offline dalam 1 HP.\n' +
      '- **Stories & Buat Story**: Story foto, video, dan teks + daftar penonton & reaksi Like.\n' +
      '- **Chats**: Chat pribadi, Grup, Komunitas, Global Chat dengan Voice Note (VN) + Telepon/Video Call WebRTC real antar perangkat.\n' +
      '- **TikTok No WM & Music Lab**: Unduh video/audio TikTok tanpa watermark & pemutar musik latar.\n' +
      '- **ZHD Enhancer, Key Store, Owner Panel & Settings** lengkap.'
    );
  }

  if (q.includes('key store') || q.includes('keystore') || q.includes('beli key') || q.includes('harga key') || q.includes('qris')) {
    return 'Untuk beli Key di **Key Store VNJAVA**, tekan ikon Keranjang di Beranda, pilih paket (1 Hari Rp5.000, 1 Minggu Rp30.000, 1 Bulan Rp60.000, Permanen Rp88.000), lalu bayar pakai Saldo Diamond+ atau unggah bukti QRIS untuk diverifikasi Owner.';
  }

  if (q.includes('/rw') || q.includes('game booster') || q.includes('vpn')) {
    return 'Fitur **RW Game Booster & VPN** bisa dibuka dari chat Assistant dengan mengetik `/rw` lalu memasukkan Key aktif VNJAVA.';
  }

  if (q.includes('/bug') || q.includes('/panel') || q.includes('lutvoid')) {
    return 'Konsol **Lutvoid Bug System** dibuka lewat chat Assistant dengan mengetik `/bug` atau `/panel` lalu memasukkan Key aktif VNJAVA.';
  }

  return null;
}
