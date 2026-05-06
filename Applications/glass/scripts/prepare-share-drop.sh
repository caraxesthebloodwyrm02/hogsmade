#!/usr/bin/env bash
set -euo pipefail

appimage="release/Glass-0.1.0.AppImage"
deb="release/glass_0.1.0_amd64.deb"
manifest="release/SHA256SUMS"

if [[ ! -f "$appimage" || ! -f "$deb" ]]; then
  echo "Release artifacts are missing. Run: npm run package:linux" >&2
  exit 1
fi

sha256sum "$appimage" "$deb" > "$manifest"

echo "Share drop prepared:"
echo "- $appimage"
echo "- $deb"
echo "- $manifest"
echo
echo "Verify with: sha256sum -c $manifest"
echo "AppImage run: chmod +x $appimage && ./$appimage"
echo "Deb install: sudo apt install ./$deb"
