import { createContext, useContext, useState, useCallback, useEffect } from 'react'

// Lightweight i18n. Strings are keyed by their English source text, so a missing
// translation falls back to readable English rather than a blank key. The active
// language is persisted to localStorage and defaults to English, with an EN/ID
// switch in the top-bar settings menu.
//
// The Indonesian below is written to read naturally to a native speaker (not a
// word-for-word gloss): "host" stays "host", "approval" becomes
// "persetujuan", "waitlist" becomes "daftar tunggu", etc. Use {token} for
// interpolation: t('{n} on waitlist', { n: 3 }).

const ID = {
  // ---- Navigation / chrome ----
  Browse: 'Jelajah',
  Sessions: 'Sesi',
  Messages: 'Pesan',
  'Private Messages': 'Pesan Pribadi',
  Profile: 'Profil',
  'Host a Session': 'Buat Sesi',
  Settings: 'Pengaturan',
  Language: 'Bahasa',
  Theme: 'Tema',
  Light: 'Terang',
  Dark: 'Gelap',
  'Sign Out': 'Keluar',

  // ---- Auth (Login / Signup) ----
  'Host & join board game meetups in your area.': 'Buat & ikuti meetup board game di areamu.',
  'Welcome Back': 'Selamat Datang Kembali',
  'Create Your Account': 'Buat Akunmu',
  Email: 'Email',
  Password: 'Kata Sandi',
  'Sign In': 'Masuk',
  'Signing in…': 'Masuk…',
  'Sign Up': 'Daftar',
  'Creating account…': 'Membuat akun…',
  or: 'atau',
  'Continue with Google': 'Lanjutkan dengan Google',
  'New here?': 'Baru di sini?',
  'Create an Account': 'Buat Akun',
  'Already have an account?': 'Sudah punya akun?',

  // ---- Guest / visitor mode ----
  'Welcome to BG Session': 'Selamat Datang di BG Session',
  'Sign up to host and join board game meetups — or keep looking around as a guest.':
    'Daftar untuk membuat & ikut meetup board game — atau lihat-lihat dulu sebagai tamu.',
  'Continue as Guest': 'Lanjutkan sebagai Tamu',
  'Your Profile': 'Profil Kamu',
  'Sign up or sign in to host sessions, join games, and message other players.':
    'Daftar atau masuk untuk membuat sesi, ikut bermain, dan mengirim pesan ke pemain lain.',
  'Sign In to Join': 'Masuk untuk Gabung',
  'Sign in or create an account to join this session and message the host.':
    'Masuk atau buat akun untuk gabung ke sesi ini dan mengirim pesan ke host.',
  "Who's Coming": 'Yang Akan Datang',
  'Recent Sessions': 'Sesi Terbaru',
  'The latest board game meetups that have wrapped up.':
    'Meetup board game terbaru yang sudah selesai.',
  'No finished sessions yet.': 'Belum ada sesi yang selesai.',
  'Session not found.': 'Sesi tidak ditemukan.',
  Player: 'Pemain',
  'Display Name': 'Nama Tampilan',
  'Check your inbox to confirm your email, then sign in.':
    'Cek inbox-mu untuk konfirmasi email, lalu masuk.',
  'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.':
    'Kata sandi minimal 8 karakter dan mengandung huruf besar, huruf kecil, dan angka.',
  '(min 8 chars, with uppercase, lowercase & a number)':
    '(min 8 karakter, dengan huruf besar, huruf kecil & angka)',
  'Please complete the verification below.': 'Selesaikan verifikasi di bawah dulu.',
  'e.g. Andi': 'mis. Andi',
  // Forgot / reset password
  'Forgot your password? We can email you a link to set a new one.':
    'Lupa kata sandi? Kami bisa mengirim tautan ke email untuk membuat yang baru.',
  'Reset Password': 'Atur Ulang Kata Sandi',
  'Sending…': 'Mengirim…',
  'Enter your email above, then request a reset link.':
    'Masukkan email kamu di atas, lalu minta tautan reset.',
  'If an account exists for {email}, a reset link is on its way. Check your inbox.':
    'Jika ada akun untuk {email}, tautan reset sedang dikirim. Cek inbox-mu.',
  'Reset Your Password': 'Atur Ulang Kata Sandi',
  'Choose a new password for your account.': 'Pilih kata sandi baru untuk akunmu.',
  'New Password': 'Kata Sandi Baru',
  'Confirm Password': 'Konfirmasi Kata Sandi',
  'Update Password': 'Perbarui Kata Sandi',
  'Updating…': 'Memperbarui…',
  'Passwords don’t match.': 'Kata sandi tidak cocok.',
  'Your password has been updated. You’re all set.':
    'Kata sandimu sudah diperbarui. Semua beres.',
  Continue: 'Lanjut',
  'This reset link is invalid or has expired.':
    'Tautan reset ini tidak valid atau sudah kedaluwarsa.',
  'Request a new link from the sign-in page.':
    'Minta tautan baru dari halaman masuk.',
  '← Back to Sign In': '← Kembali ke Halaman Masuk',

  // ---- Browse ----
  'Upcoming Sessions': 'Sesi Mendatang',
  'Find a board game meetup near you.': 'Temukan meetup board game di dekatmu.',
  '+ Host a Session': '+ Buat Sesi',
  'All regions': 'Semua wilayah',
  'All areas': 'Semua area',
  'All games': 'Semua game',
  'Filter by region': 'Saring per wilayah',
  'Filter by area': 'Saring per area',
  'Filter by board game': 'Saring per board game',
  'No upcoming sessions yet.': 'Belum ada sesi mendatang.',
  'Be the First to Host': 'Jadi yang Pertama Buat Sesi',
  'Rate Your Finished Session': 'Beri Rating Sesimu yang Sudah Selesai',
  'Rate Your Finished Sessions': 'Beri Rating Sesi-Sesimu yang Sudah Selesai',
  Rate: 'Beri Rating',
  '+{n} more awaiting your rating': '+{n} lagi menunggu ratingmu',
  'Load More': 'Muat Lebih Banyak',
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
  'Hosted by {name}': 'Host {name}',
  '{n} players': '{n} pemain',
  full: 'penuh',
  TBD: 'Menyusul',

  // ---- Create chooser ----
  'One-Time Session': 'Sesi Sekali Jalan',
  'A single meetup on a specific date and time.': 'Satu meetup pada tanggal dan jam tertentu.',
  'Weekly Session': 'Sesi Mingguan',
  'Repeats every week on the day you pick. Everything resets except your co-hosts.':
    'Berulang tiap minggu di hari yang kamu pilih. Semua di-reset kecuali co-host.',

  // ---- My sessions ----
  'My Sessions': 'Sesi Saya',
  "Sessions you host and sessions you've joined.": 'Sesi yang kamu buat dan sesi yang kamu ikuti.',
  'Hosting ({n})': 'Jadi Host ({n})',
  'Joined / Requested ({n})': 'Diikuti / Diminta ({n})',
  "You're not hosting anything yet.": 'Kamu belum membuat sesi apa pun.',
  "You haven't requested to join any sessions yet.": 'Kamu belum meminta gabung ke sesi mana pun.',
  'Browse Sessions': 'Jelajahi Sesi',

  // ---- Messages / conversation ----
  'No conversations yet.': 'Belum ada percakapan.',
  'Open someone’s profile and tap “Message” to start chatting.':
    'Buka profil seseorang lalu ketuk “Kirim pesan” untuk mulai mengobrol.',
  'You: ': 'Kamu: ',
  Report: 'Laporkan',
  Block: 'Blokir',
  Unblock: 'Buka Blokir',
  'Type a message…': 'Tulis pesan…',
  Send: 'Kirim',
  'Say Hello 👋': 'Sapa Dulu 👋',
  'You can no longer message this user.': 'Kamu tidak bisa lagi mengirim pesan ke pengguna ini.',
  'You’re sending messages too quickly. Wait a moment and try again.':
    'Kamu mengirim pesan terlalu cepat. Tunggu sebentar lalu coba lagi.',
  'You blocked {name}.': 'Kamu memblokir {name}.',
  'Unblock to Message': 'Buka Blokir untuk Mengirim Pesan',
  'Block {name}? They won’t be able to message you.':
    'Blokir {name}? Mereka tidak akan bisa mengirimimu pesan.',
  'Block {name}? They won’t be able to message you, and your existing chat is hidden from your inbox.':
    'Blokir {name}? Mereka tidak akan bisa mengirimimu pesan, dan obrolan kalian disembunyikan dari kotak masukmu.',

  // ---- Share ----
  'Share': 'Bagikan',
  'Share with a Friend': 'Bagikan ke Teman',
  'Share Score': 'Bagikan Skor',
  'Share a Game Result': 'Bagikan Hasil Permainan',
  'Copy this link:': 'Salin tautan ini:',
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
  Confirm: 'Konfirmasi',
  'Send Report': 'Kirim Laporan',
  'Report Sent': 'Laporan Terkirim',
  'Thanks — our team will review your report about {name}. Reports are kept confidential.':
    'Terima kasih — tim kami akan meninjau laporanmu tentang {name}. Laporan dijaga kerahasiaannya.',
  // ---- Account suspension (ban) banner ----
  'Your account is suspended': 'Akunmu sedang ditangguhkan',
  "Your account is suspended until {date}. Until then you can't host or join sessions.":
    'Akunmu ditangguhkan sampai {date}. Sampai saat itu kamu tidak bisa membuat atau ikut sesi.',
  'Reason: {reason}': 'Alasan: {reason}',
  'Please choose a reason.': 'Silakan pilih alasan.',
  '🚩 Report': '🚩 Laporkan',
  '🚫 Block': '🚫 Blokir',
  'You blocked {name}. They can’t message you.':
    'Kamu memblokir {name}. Mereka tidak bisa mengirimimu pesan.',

  // ---- Bring list (games I'll bring) ----
  'Bring a Board Game': 'Bawa Board Game',
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
  'Invite a Member': 'Undang Anggota',
  'Invite someone to this session. They still join through the normal flow, so the host stays in control.':
    'Undang seseorang ke sesi ini. Mereka tetap bergabung lewat alur biasa, jadi host tetap memegang kendali.',
  'Search a member by name…': 'Cari anggota berdasarkan nama…',
  'Searching…': 'Mencari…',
  'No members match “{term}”.': 'Tidak ada anggota yang cocok dengan “{term}”.',
  Invite: 'Undang',
  Invited: 'Diundang',
  Joined: 'Bergabung',
  'this member': 'anggota ini',
  '{name} has already been invited.': '{name} sudah diundang.',
  'Invited {name}.': '{name} diundang.',
  'Rescind Invite': 'Tarik Undangan',
  'A member': 'Seorang anggota',
  'invited you to this session.': 'mengundangmu ke sesi ini.',
  '(It’s full — you’ll join the waitlist.)': '(Penuh — kamu akan masuk daftar tunggu.)',
  'Accept & Join': 'Terima & Gabung',
  'Accept & Join Waitlist': 'Terima & Gabung Daftar Tunggu',

  // ---- Notification preferences ----
  'Email Notifications': 'Notifikasi Email',
  'Save': 'Simpan',
  'Saved.': 'Tersimpan.',
  'Choose which emails we send you. You’ll always see everything in the in-app bell.':
    'Pilih email mana yang kami kirim. Kamu tetap melihat semuanya di lonceng notifikasi aplikasi.',
  'Join Updates': 'Update Gabung',
  'When a host approves, confirms, or declines your request to join.':
    'Saat host menyetujui, mengonfirmasi, atau menolak permintaan gabungmu.',
  'Session Reminders': 'Pengingat Sesi',
  'A reminder before a session you’re in, and the after-session follow-up.':
    'Pengingat sebelum sesi yang kamu ikuti, dan tindak lanjut setelah sesi.',
  'Session Changes': 'Perubahan Sesi',
  'When a session you joined is cancelled by the host.':
    'Saat sesi yang kamu ikuti dibatalkan oleh host.',

  // ---- Waitlist (session detail) ----
  'Session full — join the waitlist?': 'Sesi penuh — gabung daftar tunggu?',
  "We'll confirm you automatically the moment a spot opens.":
    'Kami akan otomatis mengonfirmasimu begitu ada tempat kosong.',
  'The host can approve you from the waitlist when a spot opens.':
    'Host bisa menyetujuimu dari daftar tunggu saat ada tempat kosong.',
  'Join Waitlist': 'Gabung Daftar Tunggu',
  'Leave Waitlist': 'Keluar dari Daftar Tunggu',
  "We'll confirm you automatically the moment a spot opens — you'll get a notification.":
    'Kami akan otomatis mengonfirmasimu begitu ada tempat kosong — kamu akan dapat notifikasi.',
  'The host can approve you from the waitlist once a spot opens.':
    'Host bisa menyetujuimu dari daftar tunggu begitu ada tempat kosong.',
  "You're on the": 'Kamu ada di',

  // ---- Session detail ----
  '← Back to Browse': '← Kembali ke Jelajah',
  'Hosted by': 'Host',
  When: 'Waktu',
  Duration: 'Durasi',
  Region: 'Wilayah',
  Area: 'Area',
  Players: 'Pemain',
  'Board Games': 'Board Game',
  'To be decided': 'Menyusul',
  'No games were recorded.': 'Tidak ada game yang tercatat.',
  Address: 'Alamat',
  '🗺️ Open in Google Maps': '🗺️ Buka di Google Maps',
  '🔒 The full address is revealed once the host confirms your spot.':
    '🔒 Alamat lengkap muncul setelah host mengonfirmasi tempatmu.',
  '· full': '· penuh',
  '· min {n}': '· min {n}',
  'Ratings & Reviews': 'Rating & Ulasan',
  Reviews: 'Ulasan',
  'No ratings yet — be the first.': 'Belum ada rating — jadi yang pertama.',
  '· {n} ratings': '· {n} rating',
  'Your Rating': 'Ratingmu',
  'Rate This Session': 'Beri Rating Sesi Ini',
  '— required for participants, and can’t be changed once sent':
    '— wajib bagi peserta, dan tidak bisa diubah setelah dikirim',
  'Submit Rating': 'Kirim Rating',
  'Submit': 'Kirim',
  'Pick a star rating first': 'Pilih rating bintang dulu',
  'Add a review (optional)…': 'Tambahkan ulasan (opsional)…',
  'Send Review': 'Kirim Ulasan',
  'You can add a written review after you submit your rating.':
    'Kamu bisa menambahkan ulasan tertulis setelah mengirim rating.',
  'Please pick a star rating from 1 to 10.': 'Silakan pilih rating bintang dari 1 sampai 10.',
  'Want to join?': 'Mau ikut?',
  'Message to Host': 'Pesan untuk Host',
  'Say hi, mention your experience level…': 'Sapa dulu, sebutkan tingkat pengalamanmu…',
  'Join Session': 'Gabung Sesi',
  'Request to Join': 'Minta Gabung',
  'You already have a session at this day and time. Leave that one first, or pick a session at a different time.':
    'Kamu sudah punya sesi di hari dan jam ini. Tinggalkan dulu sesi itu, atau pilih sesi di waktu yang berbeda.',
  'Your request is': 'Permintaanmu',
  Withdraw: 'Tarik Kembali',
  "You'll be notified when the host responds.": 'Kamu akan diberi tahu saat host merespons.',
  "You're confirmed": 'Kamu sudah dikonfirmasi',
  'Cancel My Spot': 'Batalkan Tempatku',
  'Your request was': 'Permintaanmu',
  'Requests to Join': 'Permintaan Gabung',
  'Requests to Join · {n} on Waitlist': 'Permintaan Gabung · {n} di Daftar Tunggu',
  'No pending requests right now.': 'Belum ada permintaan saat ini.',
  Approve: 'Setujui',
  Decline: 'Tolak',
  'Session is full': 'Sesi penuh',
  'Session is full — increase max players to approve more.':
    'Sesi penuh — naikkan maks pemain untuk menyetujui lebih banyak.',
  'Manage Session': 'Kelola Sesi',
  'Edit Details': 'Ubah Detail',
  'Cancel Session': 'Batalkan Sesi',
  'End Session': 'Akhiri Sesi',
  'Keep Session': 'Pertahankan Sesi',
  'End Weekly Session': 'Akhiri Sesi Mingguan',
  'Transfer Host': 'Pindahkan Host',
  'Hand this weekly session over to a confirmed participant. They become the host; you stay on as a regular participant.':
    'Serahkan sesi mingguan ini ke peserta yang sudah konfirmasi. Mereka jadi host; kamu tetap ikut sebagai peserta biasa.',
  'Choose a participant…': 'Pilih peserta…',
  Transfer: 'Pindahkan',
  'this participant': 'peserta ini',
  'Transfer hosting to {name}? They become the host of this weekly session and you stay on as a regular participant.':
    'Pindahkan host ke {name}? Mereka jadi host sesi mingguan ini dan kamu tetap ikut sebagai peserta biasa.',
  'Co-host': 'Co-host',
  "You're a co-host of this weekly session.": 'Kamu co-host sesi mingguan ini.',
  ' The host hasn’t given you edit permissions.': ' Host belum memberimu izin mengubah.',
  'Step Down': 'Mundur',
  Host: 'Host',
  Player: 'Pemain',
  Participants: 'Peserta',
  you: 'kamu',
  Guest: 'Tamu',
  'This session is full.': 'Sesi ini penuh.',
  'End this weekly session?': 'Akhiri sesi mingguan ini?',
  'Cancel this session?': 'Batalkan sesi ini?',
  'Step down as co-host? You will be removed from this and every upcoming week.':
    'Mundur sebagai co-host? Kamu akan dikeluarkan dari sesi ini dan semua minggu mendatang.',

  // ---- Game scores ----
  Scores: 'Skor',
  Score: 'Skor',
  'Game Scores': 'Skor Permainan',
  'Record Scores': 'Catat Skor',
  'Record a Result': 'Catat Hasil',
  'No results recorded yet.': 'Belum ada hasil yang dicatat.',
  'No games have been scored yet.': 'Belum ada permainan yang diberi skor.',
  'See scores you can still edit': 'Lihat skor yang masih bisa diedit',
  'Played {n}×': 'Dimainkan {n}×',
  'Play {n} of {total}': 'Main ke-{n} dari {total}',
  'Game {n}': 'Permainan ke-{n}',
  'Scoring is open': 'Pencatatan skor dibuka',
  'Scoring closes {time}': 'Pencatatan ditutup {time}',
  'Scoring opens once the session starts.': 'Pencatatan skor dibuka setelah sesi dimulai.',
  'Scoring for this session has closed.': 'Pencatatan skor untuk sesi ini sudah ditutup.',
  'Being recorded by {name}': 'Sedang dicatat oleh {name}',
  'Being recorded right now': 'Sedang dicatat sekarang',
  'Recording…': 'Mencatat…',
  'Scoring Type': 'Tipe Skor',
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
  'Add Team': '+ Tambah Tim',
  'Save Result': 'Simpan Hasil',
  'Save Changes': 'Simpan Perubahan',
  'Saving…': 'Menyimpan…',
  Edit: 'Ubah',
  Discard: 'Buang',
  'Cancel This Result': 'Batalkan Hasil Ini',
  'Remove this game from the session record? This can’t be undone.':
    'Hapus permainan ini dari catatan sesi? Tindakan ini tidak bisa dibatalkan.',
  'You can cancel within 30 minutes of recording.':
    'Kamu bisa membatalkan dalam 30 menit setelah mencatat.',
  'This result is final.': 'Hasil ini final.',
  'Recorded by {name}': 'Dicatat oleh {name}',
  '← Back to Session': '← Kembali ke Sesi',
  'This game result could not be found.': 'Hasil permainan ini tidak ditemukan.',
  'Score a Game': 'Beri Skor Permainan',
  'No games on this session’s list yet.': 'Belum ada game di daftar sesi ini.',
  'Score (optional)': 'Skor (opsional)',
  'Team Score (optional)': 'Skor Tim (opsional)',
  // Score-mode labels & hints (mirror SCORE_MODES in lib/format.js)
  'Individual Scores': 'Skor Individu',
  'Everyone keeps their own score; the highest wins.':
    'Tiap pemain punya skor sendiri; yang tertinggi menang.',
  'Team Scores': 'Skor Tim',
  'Split players into teams. Enter individual scores (a team’s total is the sum) or score each team directly.':
    'Bagi pemain ke dalam tim. Isi skor individu (skor tim = jumlahnya) atau beri skor tiap tim langsung.',
  'Win / Loss': 'Menang / Kalah',
  'Pick the one winner. Scores are optional.':
    'Pilih satu pemenang. Skor opsional.',
  'Team Win / Loss': 'Menang / Kalah Tim',
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
