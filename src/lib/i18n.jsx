import { createContext, useContext, useState, useCallback, useEffect } from 'react'

// Lightweight i18n. Strings are keyed by their English source text, so a missing
// translation falls back to readable English rather than a blank key. The active
// language is persisted to localStorage and defaults to Indonesian — this is an
// Indonesia-first app — with an EN/ID toggle in the top bar.
//
// The Indonesian below is written to read naturally to a native speaker (not a
// word-for-word gloss): "host" becomes "tuan rumah", "approval" becomes
// "persetujuan", "waitlist" becomes "daftar tunggu", etc. Use {token} for
// interpolation: t('{n} on waitlist', { n: 3 }).

const ID = {
  // ---- Navigation / chrome ----
  Browse: 'Jelajah',
  Sessions: 'Sesi',
  Messages: 'Pesan',
  Profile: 'Profil',
  'Host a session': 'Buat sesi',
  'Switch language': 'Ganti bahasa',
  'Switch to dark theme': 'Beralih ke tema gelap',
  'Switch to light theme': 'Beralih ke tema terang',

  // ---- Auth (Login / Signup) ----
  'Host & join board game meetups in your area.': 'Buat & ikuti meetup board game di areamu.',
  'Welcome back': 'Selamat datang kembali',
  'Create your account': 'Buat akunmu',
  Email: 'Email',
  Password: 'Kata sandi',
  'Sign in': 'Masuk',
  'Signing in…': 'Masuk…',
  'Sign up': 'Daftar',
  'Creating account…': 'Membuat akun…',
  or: 'atau',
  'Continue with Google': 'Lanjutkan dengan Google',
  'New here?': 'Baru di sini?',
  'Create an account': 'Buat akun',
  'Already have an account?': 'Sudah punya akun?',
  'Display name': 'Nama tampilan',
  'Check your inbox to confirm your email, then sign in.':
    'Cek inbox-mu untuk konfirmasi email, lalu masuk.',
  'Password must be at least 6 characters.': 'Kata sandi minimal 6 karakter.',
  '(min 6 characters)': '(min 6 karakter)',
  'e.g. Andi': 'mis. Andi',

  // ---- Browse ----
  'Upcoming sessions': 'Sesi mendatang',
  'Find a board game meetup near you.': 'Temukan meetup board game di dekatmu.',
  '+ Host a session': '+ Buat sesi',
  'All regions': 'Semua wilayah',
  'All areas': 'Semua area',
  'All games': 'Semua game',
  'Filter by region': 'Saring per wilayah',
  'Filter by area': 'Saring per area',
  'Filter by board game': 'Saring per board game',
  List: 'Daftar',
  Map: 'Peta',
  'Tap a marker to see sessions in that area.': 'Ketuk penanda untuk melihat sesi di area itu.',
  'Show all': 'Tampilkan semua',
  'No upcoming sessions yet.': 'Belum ada sesi mendatang.',
  'Be the first to host': 'Jadi yang pertama buat sesi',
  'Rate your finished session': 'Beri rating sesimu yang sudah selesai',
  'Rate your finished sessions': 'Beri rating sesi-sesimu yang sudah selesai',
  Rate: 'Beri rating',
  '+{n} more awaiting your rating': '+{n} lagi menunggu ratingmu',

  // ---- Session card / shared badges ----
  Weekly: 'Mingguan',
  'One-time': 'Sekali',
  Open: 'Terbuka',
  Approval: 'Persetujuan',
  Done: 'Selesai',
  Pending: 'Menunggu',
  Approved: 'Disetujui',
  Declined: 'Ditolak',
  Waitlist: 'Daftar tunggu',
  'Hosted by {name}': 'Tuan rumah {name}',
  '{n} players': '{n} pemain',
  full: 'penuh',
  TBD: 'Menyusul',

  // ---- Create chooser ----
  'Choose how you want to host.': 'Pilih cara kamu jadi tuan rumah.',
  'One-time session': 'Sesi sekali jalan',
  'A single meetup on a specific date and time.': 'Satu meetup pada tanggal dan jam tertentu.',
  'Weekly session': 'Sesi mingguan',
  'Repeats every week on the day you pick. You keep your co-hosts; players and board games reset each week and roll forward to the next date automatically.':
    'Berulang tiap minggu di hari yang kamu pilih. Co-host tetap; pemain dan board game di-reset tiap minggu dan otomatis maju ke tanggal berikutnya.',

  // ---- My sessions ----
  'My sessions': 'Sesi saya',
  "Sessions you host and sessions you've joined.": 'Sesi yang kamu buat dan sesi yang kamu ikuti.',
  'Hosting ({n})': 'Jadi tuan rumah ({n})',
  'Joined / requested ({n})': 'Diikuti / diminta ({n})',
  "You're not hosting anything yet.": 'Kamu belum membuat sesi apa pun.',
  "You haven't requested to join any sessions yet.": 'Kamu belum meminta gabung ke sesi mana pun.',
  'Browse sessions': 'Jelajahi sesi',

  // ---- Messages / conversation ----
  'Your private chats with other players.': 'Obrolan pribadimu dengan pemain lain.',
  'No conversations yet.': 'Belum ada percakapan.',
  'Open someone’s profile and tap “Message” to start chatting.':
    'Buka profil seseorang lalu ketuk “Kirim pesan” untuk mulai mengobrol.',
  'You: ': 'Kamu: ',
  Report: 'Laporkan',
  Block: 'Blokir',
  Unblock: 'Buka blokir',
  'Type a message…': 'Tulis pesan…',
  Send: 'Kirim',
  'Say hello 👋': 'Sapa dulu 👋',
  'You can no longer message this user.': 'Kamu tidak bisa lagi mengirim pesan ke pengguna ini.',
  'You blocked {name}.': 'Kamu memblokir {name}.',
  'Unblock to message': 'Buka blokir untuk mengirim pesan',
  'Block {name}? They won’t be able to message you.':
    'Blokir {name}? Mereka tidak akan bisa mengirimimu pesan.',
  'Block {name}? They won’t be able to message you, and your existing chat is hidden from your inbox.':
    'Blokir {name}? Mereka tidak akan bisa mengirimimu pesan, dan obrolan kalian disembunyikan dari kotak masukmu.',

  // ---- Share ----
  '🔗 Share': '🔗 Bagikan',
  '📤 Share with a friend': '📤 Bagikan ke teman',
  '✓ Copied': '✓ Tersalin',

  // ---- Report dialog ----
  'Report {name}': 'Laporkan {name}',
  "Reports are confidential and {name} won't be notified.":
    'Laporan bersifat rahasia dan {name} tidak akan diberi tahu.',
  Reason: 'Alasan',
  'Harassment or abuse': 'Pelecehan atau kekerasan',
  'Spam or scam': 'Spam atau penipuan',
  'Inappropriate messages': 'Pesan tidak pantas',
  'Fake or impersonating profile': 'Profil palsu atau menyamar',
  'No-show / unreliable': 'Tidak datang / tidak bisa diandalkan',
  Other: 'Lainnya',
  Details: 'Detail',
  '(optional)': '(opsional)',
  'Add anything that helps us understand what happened…':
    'Tambahkan apa pun yang membantu kami memahami kejadiannya…',
  Cancel: 'Batal',
  'Send report': 'Kirim laporan',
  'Report sent': 'Laporan terkirim',
  'Thanks — our team will review your report about {name}. Reports are kept confidential.':
    'Terima kasih — tim kami akan meninjau laporanmu tentang {name}. Laporan dijaga kerahasiaannya.',
  'Please choose a reason.': 'Silakan pilih alasan.',
  '🚩 Report': '🚩 Laporkan',
  '🚫 Block': '🚫 Blokir',
  'You blocked {name}. They can’t message you.':
    'Kamu memblokir {name}. Mereka tidak bisa mengirimimu pesan.',

  // ---- Map ----
  "Couldn't load the map. Check your connection and try again.":
    'Gagal memuat peta. Periksa koneksimu lalu coba lagi.',
  '{region} · {n} sessions': '{region} · {n} sesi',

  // ---- Bring list (games I'll bring) ----
  'Games being brought': 'Game yang dibawa',
  'Nothing pledged yet.': 'Belum ada yang menyanggupi membawa.',
  ' Add what you can bring so nobody doubles up.':
    ' Tambahkan yang bisa kamu bawa supaya tidak dobel.',
  'Quick add from your collection': 'Tambah cepat dari koleksimu',
  "Add a game you'll bring…": 'Tambah game yang akan kamu bawa…',
  '+ Add': '+ Tambah',

  // ---- Waitlist (session detail) ----
  'Session full — join the waitlist?': 'Sesi penuh — gabung daftar tunggu?',
  "We'll confirm you automatically the moment a spot opens.":
    'Kami akan otomatis mengonfirmasimu begitu ada tempat kosong.',
  'The host can approve you from the waitlist when a spot opens.':
    'Tuan rumah bisa menyetujuimu dari daftar tunggu saat ada tempat kosong.',
  'Join waitlist': 'Gabung daftar tunggu',
  'Leave waitlist': 'Keluar dari daftar tunggu',
  "We'll confirm you automatically the moment a spot opens — you'll get a notification.":
    'Kami akan otomatis mengonfirmasimu begitu ada tempat kosong — kamu akan dapat notifikasi.',
  'The host can approve you from the waitlist once a spot opens.':
    'Tuan rumah bisa menyetujuimu dari daftar tunggu begitu ada tempat kosong.',
  "You're on the": 'Kamu ada di',

  // ---- Session detail ----
  '← Back to browse': '← Kembali ke jelajah',
  'Hosted by': 'Tuan rumah',
  When: 'Waktu',
  Duration: 'Durasi',
  Region: 'Wilayah',
  Area: 'Area',
  Players: 'Pemain',
  'Board games': 'Board game',
  'To be decided': 'Menyusul',
  Address: 'Alamat',
  '🗺️ Open in Google Maps': '🗺️ Buka di Google Maps',
  '🔒 The full address is revealed once the host confirms your spot.':
    '🔒 Alamat lengkap muncul setelah tuan rumah mengonfirmasi tempatmu.',
  '· full': '· penuh',
  '· min {n}': '· min {n}',
  'Ratings & reviews': 'Rating & ulasan',
  'No ratings yet — be the first.': 'Belum ada rating — jadi yang pertama.',
  '· {n} ratings': '· {n} rating',
  'Your rating': 'Ratingmu',
  'Rate this session': 'Beri rating sesi ini',
  '— required for participants, and can’t be changed once sent':
    '— wajib bagi peserta, dan tidak bisa diubah setelah dikirim',
  'Submit rating': 'Kirim rating',
  'Pick a star rating first': 'Pilih rating bintang dulu',
  'Add a review (optional)…': 'Tambahkan ulasan (opsional)…',
  'Send review': 'Kirim ulasan',
  'You can add a written review after you submit your rating.':
    'Kamu bisa menambahkan ulasan tertulis setelah mengirim rating.',
  'Please pick a star rating from 1 to 10.': 'Silakan pilih rating bintang dari 1 sampai 10.',
  'Want to join?': 'Mau ikut?',
  'Message to host': 'Pesan untuk tuan rumah',
  'Say hi, mention your experience level…': 'Sapa dulu, sebutkan tingkat pengalamanmu…',
  'Join session': 'Gabung sesi',
  'Request to join': 'Minta gabung',
  'Your request is': 'Permintaanmu',
  Withdraw: 'Tarik kembali',
  "You'll be notified when the host responds.": 'Kamu akan diberi tahu saat tuan rumah merespons.',
  "You're confirmed": 'Kamu sudah dikonfirmasi',
  'Cancel my spot': 'Batalkan tempatku',
  'Your request was': 'Permintaanmu',
  'Requests to join': 'Permintaan gabung',
  'Requests to join · {n} on waitlist': 'Permintaan gabung · {n} di daftar tunggu',
  'No pending requests right now.': 'Belum ada permintaan saat ini.',
  Approve: 'Setujui',
  Decline: 'Tolak',
  'Session is full': 'Sesi penuh',
  'Session is full — increase max players to approve more.':
    'Sesi penuh — naikkan maks pemain untuk menyetujui lebih banyak.',
  'Manage session': 'Kelola sesi',
  'Edit details': 'Ubah detail',
  'Cancel session': 'Batalkan sesi',
  'End weekly session': 'Akhiri sesi mingguan',
  'Transfer host': 'Pindahkan tuan rumah',
  'Hand this weekly session over to a confirmed participant. They become the host; you stay on as a regular participant.':
    'Serahkan sesi mingguan ini ke peserta yang sudah konfirmasi. Mereka jadi tuan rumah; kamu tetap ikut sebagai peserta biasa.',
  'Choose a participant…': 'Pilih peserta…',
  Transfer: 'Pindahkan',
  'this participant': 'peserta ini',
  'Transfer hosting to {name}? They become the host of this weekly session and you stay on as a regular participant.':
    'Pindahkan tuan rumah ke {name}? Mereka jadi tuan rumah sesi mingguan ini dan kamu tetap ikut sebagai peserta biasa.',
  'Co-host': 'Co-host',
  "You're a co-host of this weekly session.": 'Kamu co-host sesi mingguan ini.',
  ' The host hasn’t given you edit permissions.': ' Tuan rumah belum memberimu izin mengubah.',
  'Step down': 'Mundur',
  Host: 'Tuan rumah',
  Player: 'Pemain',
  Guest: 'Tamu',
  'This session is full.': 'Sesi ini penuh.',
  "End this weekly session? This removes the upcoming session, stops it repeating, and notifies the confirmed guests. Past weeks stay in everyone's history.":
    'Akhiri sesi mingguan ini? Sesi mendatang dihapus, perulangan dihentikan, dan tamu yang sudah konfirmasi diberi tahu. Minggu-minggu sebelumnya tetap ada di riwayat semua orang.',
  'Cancel this session? This removes it for everyone and notifies the confirmed guests. This cannot be undone.':
    'Batalkan sesi ini? Sesi dihapus untuk semua orang dan tamu yang sudah konfirmasi diberi tahu. Tindakan ini tidak bisa dibatalkan.',
  'Step down as co-host? You will be removed from this and every upcoming week.':
    'Mundur sebagai co-host? Kamu akan dikeluarkan dari sesi ini dan semua minggu mendatang.',
}

const translations = { id: ID }

const LangContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('bg-lang') || 'id'
    } catch {
      return 'id'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('bg-lang', lang)
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute('lang', lang)
  }, [lang])

  const t = useCallback(
    (str, vars) => {
      let out = lang !== 'en' && translations[lang]?.[str] != null ? translations[lang][str] : str
      if (vars) {
        for (const k of Object.keys(vars)) out = out.split(`{${k}}`).join(String(vars[k]))
      }
      return out
    },
    [lang],
  )

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within a LanguageProvider')
  return ctx
}
