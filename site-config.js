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
};
