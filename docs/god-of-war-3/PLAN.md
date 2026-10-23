# God of War III Remastered (PS4) on Bazzite / SteamOS — plan

Researched 2026-10-23 from the SpartanPort README (commit `d0d3a14`, 2026-10-23).
Nothing has been run yet.

## TL;DR

- **[SpartanPort](https://github.com/FelipePrado0/SpartanPort)** (formerly `gow3_pc`,
  GPL-2.0) is an unofficial PC port of the **PS4 Remastered** version, and it's
  reported as playable from start to finish.
- It ships a **native Linux AppImage**, labelled experimental, so **no Proton is
  needed**. It even has a built-in **"Add to Steam"** button.
- **How it works:** the PS4 is an x86-64 machine, so the game's own code runs
  directly on your CPU. A custom runtime stands in for the PS4's system
  libraries, and the [shadPS4](https://github.com/shadps4-emu/shadPS4) emulator's
  graphics code converts its rendering to Vulkan.
- **The main hurdle is the game dump.** You need the game folder (`eboot.bin`,
  `sce_module`, `sce_sys`) from **your own PS4 copy**, and dumping it yourself
  takes a PS4 that can be modified to dump games.

## Requirements

| Item | Requirement |
|---|---|
| Game | CUSA01623 or CUSA01715, version 01.00 or 01.02 (the 01.02 update can be a separate folder: **Game → Update folder**) |
| OS | x86-64 Linux, glibc ≥ 2.39. Bazzite (Fedora-based) and current SteamOS are fine. The README lists Fedora 42 as checked |
| CPU | AVX required. The Steam Deck has it |
| GPU | Vulkan 1.3 + a current driver. Tested by the dev on an RX 7800 XT with RADV, on Wayland |

## Setup on Bazzite / SteamOS

1. Download `spartanport-x86_64.AppImage` from
   [Releases](https://github.com/FelipePrado0/SpartanPort/releases/latest). Put it
   in a **writable** folder, e.g. `~/Games/SpartanPort/`, because it updates itself in place.
2. Run `chmod +x spartanport-x86_64.AppImage && ./spartanport-x86_64.AppImage`
   (Gear Lever, which Bazzite ships, also works).
3. In the launcher, choose the game folder (and the update folder if it's separate),
   then **Save** → **PLAY** to test in Desktop Mode.
4. **Close Steam**, then use **Advanced → Add to Steam**. It creates the non-Steam
   shortcut and its artwork.
5. In the shortcut's **Properties → Compatibility**, choose **Steam Linux Runtime**,
   *not* Proton. If that won't launch, choose **Default** so it uses the host libraries.
6. Optional: **Advanced → Linux** turns on GameMode/MangoHud and lets you pick
   Wayland or X11.

Files live in `~/.local/share/spartanport` (saves, settings, shader cache, log)
and `~/.config/spartanport-launcher`. Back up the first folder.

## Known issues to watch for

- **Steam Deck / RADV rendering corruption** in the published 2.2.0 AppImage. A
  "RADV sparse-queue fix" has since been merged into `main`. Check whether the
  current release includes it before testing on a Deck.
- Yellow, orange or white textures or wrong lighting in some areas. Turning off
  deferred GPU readbacks may help, at some cost to smoothness.
- Reports of crashes and progress blockers on some setups, and GPU-specific
  rendering/audio bugs.
- FSR, TAA and DLSS are disabled. RCAS sharpening is available.
- In-game language only applies on first launch.
- **Saves from the PS3 version / RPCS3 don't work.** shadPS4 saves for the same
  CUSA ID can be copied over (README "Saves" section).

## Checklist at the PC
- [ ] Confirm your copy's ID and version (CUSA01623/01715, 01.00 or 01.02).
- [ ] Get the dump in place (`eboot.bin` + `sce_module` + `sce_sys`).
- [ ] Desktop Mode test: launcher → PLAY → first boss.
- [ ] Add to Steam → Steam Linux Runtime → Game Mode test (frame pacing, controller icons, suspend/resume).
- [ ] If you see corruption on AMD/RADV, update the AppImage first, then report it with the log from `~/.local/share/spartanport`.
