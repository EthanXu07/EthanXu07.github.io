#!/bin/zsh
# Publish the newest résumé from ~/Downloads to ethanxu.dev.
# Picks the most recently modified, non-empty Ethan_Xu_Resume*.pdf
# (e.g. Ethan_Xu_Resume-6.pdf, Ethan_Xu_Resume_7.pdf), or pass a path.
#
#   ./update-resume.sh                     main site (ethanxu.dev)
#   ./update-resume.sh --home [path]       the copy at ethanxu.dev/home     (newest *Resume*.pdf)
#   ./update-resume.sh --freshman [path]   the copy at ethanxu.dev/freshman (newest *Resume*.pdf)
set -e
cd "$(dirname "$0")"

if [[ "$1" == --home || "$1" == --freshman ]]; then
  copy=${1#--}; shift
  pattern='*Resume*.pdf'; dest=assets/resume-$copy.pdf; url=https://ethanxu.dev/$copy/resume
else
  pattern='Ethan_Xu_Resume*.pdf'; dest=assets/resume.pdf; url=https://ethanxu.dev/resume
fi

if [[ -n "$1" ]]; then
  src="$1"
else
  src=$(find ~/Downloads -maxdepth 1 -name "$pattern" -size +0 -print0 \
        | xargs -0 ls -t 2>/dev/null | head -1)
fi
[[ -f "$src" ]] || { echo "No résumé PDF found."; exit 1; }

echo "Publishing: $src"
cp "$src" "$dest"
# Version the URL so browsers fetch the new file instead of a cached copy
v=$(md5 -q "$dest" | cut -c1-8)
f=${dest#assets/}
if [[ "$dest" == assets/resume.pdf ]]; then
  sed -i '' -E "s|(resumeFile: \"/assets/resume\.pdf)(\?v=[^\"]*)?\"|\1?v=$v\"|" site-config.js
else
  sed -i '' -E "s|(resumeFile: '/assets/${f//./\\.})(\?v=[^']*)?'|\1?v=$v'|" tools/build.mjs
fi
# Rebuild so every page links the new file (and site-config.js's new ?v= hash)
node tools/build.mjs > /dev/null
git add "$dest" site-config.js tools/build.mjs home freshman $(git ls-files -m -- '*.html')
if git diff --cached --quiet; then echo "Already up to date."; exit 0; fi
git commit -m "Update résumé ($(basename "$src") → $f)"
git push
echo "Done. Live at $url in about a minute."
