# Silent Bomber (PS1, 1999) on PC + Bazzite / SteamOS — investigation

Researched 2026-10-23. Nothing has been built or run yet.

## TL;DR

- Silent Bomber is a **PS1** game (CyberConnect / Bandai), not PS2. That matters
  because PS1 recompilation tooling in 2026 is much further along than PS2's.
- **A recompilation already exists, with a native Linux build:**
  [alexbeavs-ps1-ports/silent-bomber-recomp](https://github.com/alexbeavs-ps1-ports/silent-bomber-recomp),
  release **v0.1.1**. It has Windows x64, **Linux x64** and macOS downloads, built on
  [PSXRecomp](https://github.com/mstan/psxrecomp). No Proton needed.
- **Caveats:**
  - It's a release *candidate*. Its own manifest says `windows_package`,
    `linux_gameplay` and `macos_gameplay` are all **`not_run`**. Nobody has
    confirmed the game is playable through it yet.
  - It's one of about 80 ports in an AI-assisted batch catalog, all at a similar
    early stage.
  - It requires the **Europe disc (SLES-02792)** and a **Europe BIOS (SCPH-5502/5552)**.
- **No decompilation** of Silent Bomber exists anywhere I could find.
- **The dependable way to play today is DuckStation**, which is in Bazzite's
  software centre (Flatpak), and in EmuDeck and RetroDECK on SteamOS. That's the
  "translation layer already in the distro" option. Use it as your baseline, and
  treat the recomp as something to try alongside.

## Option A — the recomp (native Linux binary)

What the package expects (from the repo README and `game.toml`):

| Input | Requirement |
|---|---|
| Disc | Redump "Silent Bomber (Europe)" as CUE+BIN, 1 track, 383,601,792 bytes, MD5 `1fefcbc8612457930fa9e6f421bd8a43` |
| BIOS | SCPH-5502/5552, 524,288 bytes, SHA-256 `1faaa18f…352c09` (dump it from your own console) |
| Build tools (Linux) | CMake, Ninja, Python 3, a C/C++ compiler. The setup wizard **compiles the game on your machine** from your disc |
| Renderer | OpenGL, 4:3, digital pad by default |

On Bazzite, the base system is read-only, so put the build tools in a Distrobox:
```bash
distrobox create -n psxrecomp -i registry.fedoraproject.org/fedora:latest
distrobox enter psxrecomp
sudo dnf install cmake ninja-build python3 gcc gcc-c++ \
     SDL2-devel mesa-libGL-devel   # check the wizard's error output for the exact list
# unzip silent-bomber-0.1.1-linux-x64.zip into a writable folder, then run
./Silent_Bomber_Recompiled   # pick the CUE + BIOS, then "Generate & rebuild"
```
Then add the produced binary to Steam as a non-Steam game, **without forcing
Proton**. If it only runs from inside the distrobox (because of missing host
libraries), use `distrobox-export --bin` or a wrapper script.

Fallback: run the Windows zip under Proton. On Windows its wizard can download
portable build tools itself, but that's a heavier and less tested path under Wine.

## Option B — DuckStation (recommended baseline)

- Install DuckStation from Bazzite's software centre. On SteamOS, use EmuDeck or
  RetroDECK, which add it to Steam automatically.
- It accepts any region: US, EU or JP disc. It needs a BIOS for best compatibility.
- Worth trying: higher internal resolution, PGXP (fixes the PS1's wobbly
  geometry), and widescreen hack (game-dependent; I couldn't confirm Silent
  Bomber's result, so test it). Save states work.
- I couldn't find Silent Bomber's specific entry in the compatibility list.
  Check it in DuckStation's built-in game list / compatibility info when you're at the PC.

## Checklist at the PC
- [ ] Which disc do you have? **Only EU (SLES-02792) works with the recomp.**
      DuckStation runs any region.
- [ ] Rip to CUE+BIN and check it against the Redump hash above.
- [ ] Dump a BIOS from your own PS1/PS2 (the recomp specifically wants SCPH-5502/5552).
- [ ] Set up the DuckStation baseline and play the first stage.
- [ ] Try the recomp on Linux. Note boot, audio, controls, save/load and any
      crashes, and compare against DuckStation.
- [ ] Report results upstream. Their gameplay checks are all `not_run`, so a real
      playtest report is genuinely useful to them.

## Sources
- Recomp repo: https://github.com/alexbeavs-ps1-ports/silent-bomber-recomp (last commit 2026-09-30)
- Port catalog: https://github.com/alexbeavs-ps1-ports/psxrecomp-ports
- Framework: https://github.com/mstan/psxrecomp
