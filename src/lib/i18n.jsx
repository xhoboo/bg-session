import { createContext, useContext, useState, useCallback, useEffect } from 'react'

// Lightweight i18n. Strings are keyed by their English source text, so a missing
// translation falls back to readable English rather than a blank key. The active
// language is persisted to localStorage and defaults to English, with an EN/ID
// switch in the top-bar settings menu.
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
  'Private Messages': 'Pesan Pribadi',
  Profile: 'Profil',
  'Host a Session': 'Buat sesi',
  Settings: 'Pengaturan',
  Language: 'Bahasa',
  Theme: 'Tema',
  Light: 'Terang',
  Dark: 'Gelap',
  'Sign Out': 'Keluar',

  // ---- Auth (Login / Signup) ----
  'Host & join board game meetups in your area.': 'Buat & ikuti meetup board game di areamu.',
  'Welcome Back': 'Selamat datang kembali',
  'Create Your Account': 'Buat akunmu',
  Email: 'Email',
  Password: 'Kata sandi',
  'Sign In': 'Masuk',
  'Signing in…': 'Masuk…',
  'Sign Up': 'Daftar',
  'Creating account…': 'Membuat akun…',
  or: 'atau',
  'Continue with Google': 'Lanjutkan dengan Google',
  'New here?': 'Baru di sini?',
  'Create an Account': 'Buat akun',
  'Already have an account?': 'Sudah punya akun?',
  'Display Name': 'Nama tampilan',
  'Check your inbox to confirm your email, then sign in.':
    'Cek inbox-mu untuk konfirmasi email, lalu masuk.',
  'Password must be at least 6 characters.': 'Kata sandi minimal 6 karakter.',
  '(min 6 characters)': '(min 6 karakter)',
  'Please complete the verification below.': 'Selesaikan verifikasi di bawah dulu.',
  'e.g. Andi': 'mis. Andi',
  // Forgot / reset password
  'Forgot your password? We can email you a link to set a new one.':
    'Lupa kata sandi? Kami bisa mengirim tautan ke email untuk membuat yang baru.',
  'Email Me a Reset Link': 'Kirimi saya tautan reset',
  'Sending…': 'Mengirim…',
  'Enter your email above, then request a reset link.':
    'Masukkan email kamu di atas, lalu minta tautan reset.',
  'If an account exists for {email}, a reset link is on its way. Check your inbox.':
    'Jika ada akun untuk {email}, tautan reset sedang dikirim. Cek inbox-mu.',
  'Reset Your Password': 'Atur ulang kata sandi',
  'Choose a new password for your account.': 'Pilih kata sandi baru untuk akunmu.',
  'New Password': 'Kata sandi baru',
  'Confirm Password': 'Konfirmasi kata sandi',
  'Update Password': 'Perbarui kata sandi',
  'Updating…': 'Memperbarui…',
  'Passwords don’t match.': 'Kata sandi tidak cocok.',
  'Your password has been updated. You’re all set.':
    'Kata sandimu sudah diperbarui. Semua beres.',
  Continue: 'Lanjut',
  'This reset link is invalid or has expired.':
    'Tautan reset ini tidak valid atau sudah kedaluwarsa.',
  'Request a new link from the sign-in page.':
    'Minta tautan baru dari halaman masuk.',
  '← Back to Sign In': '← Kembali ke halaman masuk',

  // ---- Browse ----
  'Upcoming Sessions': 'Sesi mendatang',
  'Find a board game meetup near you.': 'Temukan meetup board game di dekatmu.',
  '+ Host a Session': '+ Buat sesi',
  'All regions': 'Semua wilayah',
  'All areas': 'Semua area',
  'All games': 'Semua game',
  'Filter by region': 'Saring per wilayah',
  'Filter by area': 'Saring per area',
  'Filter by board game': 'Saring per board game',
  'No upcoming sessions yet.': 'Belum ada sesi mendatang.',
  'Be the First to Host': 'Jadi yang pertama buat sesi',
  'Rate Your Finished Session': 'Beri rating sesimu yang sudah selesai',
  'Rate Your Finished Sessions': 'Beri rating sesi-sesimu yang sudah selesai',
  Rate: 'Beri rating',
  '+{n} more awaiting your rating': '+{n} lagi menunggu ratingmu',
  'Load More': 'Muat lebih banyak',
  'Loading…': 'Memuat…',

  // ---- Session card / shared badges ----
  Weekly: 'Mingguan',
  'Week {n}': 'Minggu ke-{n}',
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
  'One-Time Session': 'Sesi sekali jalan',
  'A single meetup on a specific date and time.': 'Satu meetup pada tanggal dan jam tertentu.',
  'Weekly Session': 'Sesi mingguan',
  'Repeats every week on the day you pick. Everything resets except your co-hosts.':
    'Berulang tiap minggu di hari yang kamu pilih. Semua di-reset kecuali co-host.',

  // ---- My sessions ----
  'My Sessions': 'Sesi saya',
  "Sessions you host and sessions you've joined.": 'Sesi yang kamu buat dan sesi yang kamu ikuti.',
  'Hosting ({n})': 'Jadi tuan rumah ({n})',
  'Joined / Requested ({n})': 'Diikuti / diminta ({n})',
  "You're not hosting anything yet.": 'Kamu belum membuat sesi apa pun.',
  "You haven't requested to join any sessions yet.": 'Kamu belum meminta gabung ke sesi mana pun.',
  'Browse Sessions': 'Jelajahi sesi',

  // ---- Messages / conversation ----
  'No conversations yet.': 'Belum ada percakapan.',
  'Open someone’s profile and tap “Message” to start chatting.':
    'Buka profil seseorang lalu ketuk “Kirim pesan” untuk mulai mengobrol.',
  'You: ': 'Kamu: ',
  Report: 'Laporkan',
  Block: 'Blokir',
  Unblock: 'Buka blokir',
  'Type a message…': 'Tulis pesan…',
  Send: 'Kirim',
  'Say Hello 👋': 'Sapa dulu 👋',
  'You can no longer message this user.': 'Kamu tidak bisa lagi mengirim pesan ke pengguna ini.',
  'You’re sending messages too quickly. Wait a moment and try again.':
    'Kamu mengirim pesan terlalu cepat. Tunggu sebentar lalu coba lagi.',
  'You blocked {name}.': 'Kamu memblokir {name}.',
  'Unblock to Message': 'Buka blokir untuk mengirim pesan',
  'Block {name}? They won’t be able to message you.':
    'Blokir {name}? Mereka tidak akan bisa mengirimimu pesan.',
  'Block {name}? They won’t be able to message you, and your existing chat is hidden from your inbox.':
    'Blokir {name}? Mereka tidak akan bisa mengirimimu pesan, dan obrolan kalian disembunyikan dari kotak masukmu.',

  // ---- Share ----
  'Share': 'Bagikan',
  'Share with a Friend': 'Bagikan ke teman',
  'Share Score': 'Bagikan skor',
  'Share a Game Result': 'Bagikan hasil permainan',
  'Pick a game to share its scores.': 'Pilih permainan untuk membagikan skornya.',
  'Copy this game’s result:': 'Salin hasil permainan ini:',
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
  'Send Report': 'Kirim laporan',
  'Report Sent': 'Laporan terkirim',
  'Thanks — our team will review your report about {name}. Reports are kept confidential.':
    'Terima kasih — tim kami akan meninjau laporanmu tentang {name}. Laporan dijaga kerahasiaannya.',
  'Please choose a reason.': 'Silakan pilih alasan.',
  '🚩 Report': '🚩 Laporkan',
  '🚫 Block': '🚫 Blokir',
  'You blocked {name}. They can’t message you.':
    'Kamu memblokir {name}. Mereka tidak bisa mengirimimu pesan.',

  // ---- Bring list (games I'll bring) ----
  'Bring a Board Game': 'Bawa board game',
  'Brought by {name}': 'Dibawa oleh {name}',
  'Add what you can bring and it shows in the board games list above, so nobody doubles up.':
    'Tambahkan yang bisa kamu bawa dan akan muncul di daftar board game di atas, supaya tidak dobel.',
  'That game is already on the session list.': 'Game itu sudah ada di daftar sesi.',
  'This session already has the maximum of 50 board games.':
    'Sesi ini sudah mencapai maksimal 50 board game.',
  'Quick add from your collection': 'Tambah cepat dari koleksimu',
  "Add a game you'll bring…": 'Tambah game yang akan kamu bawa…',
  '+ Add': '+ Tambah',

  // ---- Invite a member ----
  'Invite a Member': 'Undang anggota',
  'Invite someone to this session. They still join through the normal flow, so the host stays in control.':
    'Undang seseorang ke sesi ini. Mereka tetap bergabung lewat alur biasa, jadi tuan rumah tetap memegang kendali.',
  'Search a member by name…': 'Cari anggota berdasarkan nama…',
  'Searching…': 'Mencari…',
  'No members match “{term}”.': 'Tidak ada anggota yang cocok dengan “{term}”.',
  Invite: 'Undang',
  Invited: 'Diundang',
  Joined: 'Bergabung',
  'this member': 'anggota ini',
  '{name} has already been invited.': '{name} sudah diundang.',
  'Invited {name}.': '{name} diundang.',
  'Rescind Invite': 'Tarik undangan',
  'A member': 'Seorang anggota',
  'invited you to this session.': 'mengundangmu ke sesi ini.',
  '(It’s full — you’ll join the waitlist.)': '(Penuh — kamu akan masuk daftar tunggu.)',
  'Accept & Join': 'Terima & gabung',
  'Accept & Join Waitlist': 'Terima & gabung daftar tunggu',

  // ---- Notification preferences ----
  '← Back to Profile': '← Kembali ke profil',
  'Email Notifications': 'Notifikasi email',
  'Choose which emails we send you. You’ll always see everything in the in-app bell.':
    'Pilih email mana yang kami kirim. Kamu tetap melihat semuanya di lonceng notifikasi aplikasi.',
  'Join Updates': 'Update gabung',
  'When a host approves, confirms, or declines your request to join.':
    'Saat tuan rumah menyetujui, mengonfirmasi, atau menolak permintaan gabungmu.',
  'Session Reminders': 'Pengingat sesi',
  'A reminder before a session you’re in, and the after-session follow-up.':
    'Pengingat sebelum sesi yang kamu ikuti, dan tindak lanjut setelah sesi.',
  'Session Changes': 'Perubahan sesi',
  'When a session you joined is cancelled by the host.':
    'Saat sesi yang kamu ikuti dibatalkan oleh tuan rumah.',

  // ---- Waitlist (session detail) ----
  'Session full — join the waitlist?': 'Sesi penuh — gabung daftar tunggu?',
  "We'll confirm you automatically the moment a spot opens.":
    'Kami akan otomatis mengonfirmasimu begitu ada tempat kosong.',
  'The host can approve you from the waitlist when a spot opens.':
    'Tuan rumah bisa menyetujuimu dari daftar tunggu saat ada tempat kosong.',
  'Join Waitlist': 'Gabung daftar tunggu',
  'Leave Waitlist': 'Keluar dari daftar tunggu',
  "We'll confirm you automatically the moment a spot opens — you'll get a notification.":
    'Kami akan otomatis mengonfirmasimu begitu ada tempat kosong — kamu akan dapat notifikasi.',
  'The host can approve you from the waitlist once a spot opens.':
    'Tuan rumah bisa menyetujuimu dari daftar tunggu begitu ada tempat kosong.',
  "You're on the": 'Kamu ada di',

  // ---- Session detail ----
  '← Back to Browse': '← Kembali ke jelajah',
  'Hosted by': 'Tuan rumah',
  When: 'Waktu',
  Duration: 'Durasi',
  Region: 'Wilayah',
  Area: 'Area',
  Players: 'Pemain',
  'Board Games': 'Board game',
  'To be decided': 'Menyusul',
  Address: 'Alamat',
  '🗺️ Open in Google Maps': '🗺️ Buka di Google Maps',
  '🔒 The full address is revealed once the host confirms your spot.':
    '🔒 Alamat lengkap muncul setelah tuan rumah mengonfirmasi tempatmu.',
  '· full': '· penuh',
  '· min {n}': '· min {n}',
  'Ratings & Reviews': 'Rating & ulasan',
  'No ratings yet — be the first.': 'Belum ada rating — jadi yang pertama.',
  '· {n} ratings': '· {n} rating',
  'Your Rating': 'Ratingmu',
  'Rate This Session': 'Beri rating sesi ini',
  '— required for participants, and can’t be changed once sent':
    '— wajib bagi peserta, dan tidak bisa diubah setelah dikirim',
  'Submit Rating': 'Kirim rating',
  'Pick a star rating first': 'Pilih rating bintang dulu',
  'Add a review (optional)…': 'Tambahkan ulasan (opsional)…',
  'Send Review': 'Kirim ulasan',
  'You can add a written review after you submit your rating.':
    'Kamu bisa menambahkan ulasan tertulis setelah mengirim rating.',
  'Please pick a star rating from 1 to 10.': 'Silakan pilih rating bintang dari 1 sampai 10.',
  'Want to join?': 'Mau ikut?',
  'Message to Host': 'Pesan untuk tuan rumah',
  'Say hi, mention your experience level…': 'Sapa dulu, sebutkan tingkat pengalamanmu…',
  'Join Session': 'Gabung sesi',
  'Request to Join': 'Minta gabung',
  'You already have a session at this day and time. Leave that one first, or pick a session at a different time.':
    'Kamu sudah punya sesi di hari dan jam ini. Tinggalkan dulu sesi itu, atau pilih sesi di waktu yang berbeda.',
  'Your request is': 'Permintaanmu',
  Withdraw: 'Tarik kembali',
  "You'll be notified when the host responds.": 'Kamu akan diberi tahu saat tuan rumah merespons.',
  "You're confirmed": 'Kamu sudah dikonfirmasi',
  'Cancel My Spot': 'Batalkan tempatku',
  'Your request was': 'Permintaanmu',
  'Requests to Join': 'Permintaan gabung',
  'Requests to Join · {n} on Waitlist': 'Permintaan gabung · {n} di daftar tunggu',
  'No pending requests right now.': 'Belum ada permintaan saat ini.',
  Approve: 'Setujui',
  Decline: 'Tolak',
  'Session is full': 'Sesi penuh',
  'Session is full — increase max players to approve more.':
    'Sesi penuh — naikkan maks pemain untuk menyetujui lebih banyak.',
  'Manage Session': 'Kelola sesi',
  'Edit Details': 'Ubah detail',
  'Cancel Session': 'Batalkan sesi',
  'End Weekly Session': 'Akhiri sesi mingguan',
  'Transfer Host': 'Pindahkan tuan rumah',
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
  'Step Down': 'Mundur',
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

  // ---- Game scores ----
  Scores: 'Skor',
  Score: 'Skor',
  'Game Results': 'Hasil permainan',
  'Record Scores': 'Catat skor',
  'Record a Result': 'Catat hasil',
  'No results recorded yet.': 'Belum ada hasil yang dicatat.',
  'No games have been scored yet.': 'Belum ada permainan yang diberi skor.',
  'Played {n}×': 'Dimainkan {n}×',
  'Play {n} of {total}': 'Main ke-{n} dari {total}',
  'Game {n}': 'Permainan ke-{n}',
  'Scoring is open': 'Pencatatan skor dibuka',
  'Scoring closes {time}': 'Pencatatan ditutup {time}',
  'Scoring opens once the session starts.': 'Pencatatan skor dibuka setelah sesi dimulai.',
  'Scoring for this session has closed.': 'Pencatatan skor untuk sesi ini sudah ditutup.',
  'Add the result of a game played from this session’s line-up. Anyone here can record a game.':
    'Catat hasil permainan dari daftar game sesi ini. Siapa saja di sini bisa mencatat permainan.',
  'Choose a Game': 'Pilih permainan',
  'Being recorded by {name}': 'Sedang dicatat oleh {name}',
  'Being recorded right now': 'Sedang dicatat sekarang',
  'Recording…': 'Mencatat…',
  'How were the scores kept?': 'Bagaimana skor dihitung?',
  'Who played?': 'Siapa yang bermain?',
  'Pick at least two players.': 'Pilih minimal dua pemain.',
  'Pick at least one player.': 'Pilih minimal satu pemain.',
  'Lowest score wins': 'Skor terendah menang',
  'Mark the winner': 'Tandai pemenang',
  'Mark the winning team': 'Tandai tim pemenang',
  'Did the table win?': 'Apakah meja menang?',
  Won: 'Menang',
  Lost: 'Kalah',
  Winner: 'Pemenang',
  'Team {letter}': 'Tim {letter}',
  Team: 'Tim',
  'Add Team': '+ Tambah tim',
  'Save Result': 'Simpan hasil',
  'Saving…': 'Menyimpan…',
  Discard: 'Buang',
  'Cancel This Result': 'Batalkan hasil ini',
  'Remove this game from the session record? This can’t be undone.':
    'Hapus permainan ini dari catatan sesi? Tindakan ini tidak bisa dibatalkan.',
  'You can cancel within 30 minutes of recording.':
    'Kamu bisa membatalkan dalam 30 menit setelah mencatat.',
  'This result is final.': 'Hasil ini final.',
  'Recorded by {name}': 'Dicatat oleh {name}',
  '← Back to Session': '← Kembali ke sesi',
  'Score a Game': 'Beri skor permainan',
  'Tap a player to add them, then enter how it went.':
    'Ketuk pemain untuk menambahkan, lalu isi hasilnya.',
  'No games on this session’s list yet.': 'Belum ada game di daftar sesi ini.',
  'Score (optional)': 'Skor (opsional)',
  'Team Score (optional)': 'Skor tim (opsional)',
  // Score-mode labels & hints (mirror SCORE_MODES in lib/format.js)
  'Individual Scores': 'Skor individu',
  'Everyone keeps their own score; the highest wins.':
    'Tiap pemain punya skor sendiri; yang tertinggi menang.',
  'Team Scores': 'Skor tim',
  'Split players into teams. Enter individual scores (a team’s total is the sum) or score each team directly.':
    'Bagi pemain ke dalam tim. Isi skor individu (skor tim = jumlahnya) atau beri skor tiap tim langsung.',
  'Win / Loss': 'Menang / kalah',
  'Pick the one winner. Scores are optional.':
    'Pilih satu pemenang. Skor opsional.',
  'Team Win / Loss': 'Menang / kalah tim',
  'Pick the winning team. Team scores are optional.':
    'Pilih tim pemenang. Skor tim opsional.',
  'Co-op (vs. the game)': 'Kooperatif (lawan game)',
  'Everyone wins or loses together. Scores are optional.':
    'Semua menang atau kalah bersama. Skor opsional.',
}

const translations = { id: ID }

const LangContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('bg-lang') || 'en'
    } catch {
      return 'en'
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
