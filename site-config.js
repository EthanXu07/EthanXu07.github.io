// =====================================================================
//  SITE CONFIG: headshot, résumé and contact links.
//  (Interest pages + their photos live in src/interests.json → run node tools/build.mjs)
// =====================================================================
window.SITE = {
  // Headshot: drop a new image into /assets and change this path.
  // Any size works. A transparent PNG (e.g. from Photoroom) looks best.
  headshot: "/assets/headshot.png",

  // Résumé: a PDF stored on this site. "Résumé" buttons open a preview
  // with a Download button; ethanxu.dev/resume shows the same preview.
  // To swap in a new version, run ./update-resume.sh (grabs the newest
  // Ethan_Xu_Resume*.pdf from Downloads and bumps ?v= below). If you replace
  // assets/resume.pdf by hand, change ?v= too so browsers don't show a cached copy.
  resumeFile: "/assets/resume.pdf?v=03d92342",
  resumeDownloadName: "Ethan_Xu_Resume.pdf",   // filename when they click Download

  email: "ethan_xu@berkeley.edu",
  phone: "409-867-3067",                    // shown on the campfire card (/card/)
  github: "https://github.com/EthanXu07",
  linkedin: "https://www.linkedin.com/in/EthanXu07/",
  // Instagram profile URL, e.g. "https://www.instagram.com/yourhandle/" (the button hides while empty)
  instagram: "https://www.instagram.com/ethan_xu__/",

  // Supabase project behind the game leaderboard (tools/leaderboard.sql) and the
  // library's guest wall (tools/guest-wall.sql). The anon key is public by design:
  // table rules only let visitors read, add scores and place pixels.
  // Leave empty and the leaderboard stays in each visitor's browser, the guest wall hides.
  supabase: {
    url: "https://hhwhzcclwqiwmqhowhha.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhod2h6Y2Nsd3Fpd21xaG93aGhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NTM4MzksImV4cCI6MjEwODEyOTgzOX0.JzO_PceesCi688UiED0mHoXD3Cmx3KPs6szPeXcZDy8",
  },
};
