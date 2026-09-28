#!/bin/zsh
# Publish the newest résumé from ~/Downloads to ethanxu.dev.
# Picks the most recently modified, non-empty Ethan_Xu_Resume*.pdf
# (e.g. Ethan_Xu_Resume-6.pdf, Ethan_Xu_Resume_7.pdf), or pass a path.
set -e
cd "$(dirname "$0")"

if [[ -n "$1" ]]; then
  src="$1"
else
  src=$(find ~/Downloads -maxdepth 1 -name 'Ethan_Xu_Resume*.pdf' -size +0 -print0 \
        | xargs -0 ls -t 2>/dev/null | head -1)
fi
[[ -f "$src" ]] || { echo "No résumé PDF found."; exit 1; }

echo "Publishing: $src"
cp "$src" assets/resume.pdf
# Version the URL so browsers fetch the new file instead of a cached copy
v=$(md5 -q assets/resume.pdf | cut -c1-8)
sed -i '' -E "s|(resumeFile: \"/assets/resume\.pdf)(\?v=[^\"]*)?\"|\1?v=$v\"|" site-config.js
git add assets/resume.pdf site-config.js
if git diff --cached --quiet; then echo "Already up to date."; exit 0; fi
git commit -m "Update résumé ($(basename "$src"))"
git push
echo "Done. Live at https://ethanxu.dev/resume in about a minute."
