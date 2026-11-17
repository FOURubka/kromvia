# Packages

`packaging/generate.py [version]` downloads the release's .deb and setup .exe, and writes:

- `aur/PKGBUILD` — `kromvia-bin` for the AUR. Publish: clone `ssh://aur@aur.archlinux.org/kromvia-bin.git`, copy `PKGBUILD`, run `makepkg --printsrcinfo > .SRCINFO`, commit, push.
- `winget/<version>/` — manifests for `microsoft/winget-pkgs` under `manifests/k/Kromvia/Kromvia/<version>/`. Check with `winget validate`, open a PR.
- `flatpak/com.kromvia.launcher.yml` — build with `flatpak-builder --user --install build packaging/flatpak/com.kromvia.launcher.yml`. For Flathub, open a PR to `flathub/flathub` with the manifest and the metainfo file.

AUR and Flatpak builds contain `lib/Kromvia/package-managed`, which turns off the built-in updater: the package manager updates the launcher instead.
