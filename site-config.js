// =====================================================================
//  SITE CONFIG: the one file you edit to swap photos and links.
// =====================================================================
window.SITE = {
  // Headshot: drop a new image into /assets and change this path.
  // Any size works. A transparent PNG (e.g. from Photoroom) looks best.
  headshot: "assets/headshot.png",

  // Résumé: a PDF stored on this site. "Résumé" buttons open a preview
  // with a Download button; ethanxu.dev/resume shows the same preview.
  // To swap in a new version, run ./update-resume.sh (grabs the newest
  // Ethan_Xu_Resume*.pdf from Downloads) or just replace assets/resume.pdf.
  resumeFile: "assets/resume.pdf",
  resumeDownloadName: "Ethan_Xu_Resume.pdf",   // filename when they click Download

  // Interests ("Side quests") photos: drop images into assets/interests/
  // and point each one here. Any size works; they're cropped to 4:3.
  interestPhotos: {
    hiking: "assets/interests/hiking.svg",
    racket: "assets/interests/racket.svg",
    soccer: "assets/interests/soccer.svg",
    swim: "assets/interests/swim.svg",
    food: "assets/interests/food.svg",
  },

  email: "ethan_xu@berkeley.edu",
  github: "https://github.com/EthanXu07",
  linkedin: "https://www.linkedin.com/in/EthanXu07/",
};
