# Ace Combat 04 on PC + Linux (Bazzite / Steam) — plan

Researched 2026-10-23. Nothing below has been built or run yet. It's a starting
plan for when you're at your PC.

## TL;DR

- **Someone has already started this, and they're further along than a fresh
  start would get for months.** Two public projects recompile AC04 into native
  PC code. Neither one is a true "decompilation".
- **Best base: [PresidentRaptor/Ace-Combat-04-PC-Port](https://github.com/PresidentRaptor/Ace-Combat-04-PC-Port)**
  (Apache-2.0, beta v2.2.3, 64 commits, last commit 2026-10-21). Mission 01 has
  been played start to finish. Audio, save/load, widescreen, up to 8x internal
  resolution, controller rebinding, Lua and native mods all work. It's Windows only.
- **Chosen route: run its Windows build under Proton.** See "Chosen route" below
  and `ac4-proton-setup.py`, which installs it natively so you can skip the .NET installer.
- **(Shelved) Its code is already mostly portable.** It uses SDL3 + Vulkan + GCC + CMake, and
  almost every `#ifdef _WIN32` already has a POSIX `#else`. A native Linux build
  looks like **days of work, not months** (see the gap list below). Running the
  Windows build through Proton is a possible quick start, but nobody has tested it.
- **A matching decompilation** (rebuilding the C source byte for byte) would take
  years. Treat it as an optional long-term layer on top of the recomp, not step one.

## Chosen route: the Windows build under Proton (Bazzite / SteamOS)

Decision (2026-10-23): use the compatibility layers already in Bazzite and
SteamOS rather than writing a native Linux port. Here is what I found when I
checked the upstream build against Wine/Proton:

| Piece | Under Proton | Notes |
|---|---|---|
| `runtime/ac4.exe` (the game) | **Likely fine** | Plain Win64 C built with MinGW GCC, with no CPU tuning flags (`-O2` only), so it runs on a Steam Deck's Zen 2 CPU. Uses SDL3, which works well under Wine, and **Vulkan 1.3, which Proton passes straight to the Linux driver** (no DXVK translation). The waitable timer it uses for 59.94 Hz has a `nanosleep` fallback in case Wine lacks the high-resolution flag. |
| `Setup.exe` (installer) | **Fragile** | .NET Framework 4.8 WinForms, plus a COM `WScript.Shell` call for the desktop shortcut. Wine-Mono might cope, or it might not. → **Bypassed by `ac4-proton-setup.py`** (below). |
| `Ace Combat 04.exe` (launcher) | Probably OK, not needed | .NET WinForms. All it does is start `runtime\ac4.exe` with fixed arguments and send the output to `last-play.log`. → The Steam shortcut can start `ac4.exe` directly with the same arguments. |
| Steam overlay | **Known crash risk** | Upstream lists the Steam overlay among the things that crash the Vulkan startup. Turn it off for this shortcut if launch fails. |
| Controller | Should work | Steam Input presents a virtual Xbox pad, which SDL inside Wine reads. The game maps buttons by position (bottom = Cross). |
| Mods (`.dll`) and Lua mods | Should work | They're Windows DLLs inside Wine, so `LoadLibrary` just works. |
| HD texture script (`MAKE_HD_TEXTURES.bat`) | Skip, or run natively | It needs Windows Python + Real-ESRGAN. The Linux builds of both work just as well, run directly against the game folder. |

### `ac4-proton-setup.py`: a native replacement for Setup.exe

This file is in this folder. Bazzite and SteamOS already have Python 3, and the
script needs nothing else installed. It does exactly what `InstallerCore.cs`
does:

1. Checks that the release `Setup.exe` matches `SHA256SUMS.txt` (optional).
2. Pulls the game payload (a zip stored as a .NET resource) out of `Setup.exe`.
3. Checks your ISO is the US disc and that `SLUS_201.52` matches the upstream
   SHA256, then rebuilds `runtime/ps2_image.bin` from it.
4. Symlinks the ISO in as `game.iso` (or copies it with `--copy-iso`) and creates `saves/`.
5. Prints the Steam shortcut settings: target `ac4.exe`, launch options with
   `Z:\` paths and `PS2_SHADER_DIR`/`PS2_SAVE_DIR`, and which Proton to force.

```bash
python3 ac4-proton-setup.py --setup Ace-Combat-04-PC-Port-2.2.3-beta-Setup.exe \
    --sums SHA256SUMS.txt --iso ~/Games/ac04-usa.iso --dest ~/Games/AC04
```

So far it has only been tested on synthetic data (a fake ISO and a fake
Setup.exe with an embedded zip): it installs correctly, and it rejects a
wrong-hash executable and a non-empty folder. **It has not been run against the
real release or the real disc yet.** That's the first job at the PC.

### Proton test checklist (at the PC)
- [ ] Rip the US disc to an uncompressed ISO and run the setup script.
- [ ] Add the Steam shortcut and force Proton Experimental. Boot → title → Mission 01.
- [ ] If it fails, try in this order: overlay off → `PROTON_LOG=1` → GE-Proton →
      run upstream `Setup.exe` under Proton as a comparison.
- [ ] Game Mode (gamescope): fullscreen, frame pacing at 60 Hz. On a 90 Hz Deck
      OLED, set the refresh rate to 60.
- [ ] Save in-game, quit, relaunch, load.
- [ ] Report anything Proton-specific upstream (a "works on Proton" note in their
      README helps everyone).

## What exists (prior art)

| Project | What it is | Status | Platform |
|---|---|---|---|
| [PresidentRaptor/Ace-Combat-04-PC-Port](https://github.com/PresidentRaptor/Ace-Combat-04-PC-Port) | Static recomp of SLUS-20152 (US) | Beta. Mission 01 verified. Installer + releases | Windows, Vulkan 1.3 |
| [SatyaSujitPasupuleti/Ace-Combat-04-Static-Recompilation](https://github.com/SatyaSujitPasupuleti/Ace-Combat-04-Static-Recompilation) | Same idea, separate fork | Proof of concept. Tested through Mission 2. Frame-time spikes. 6 commits, no releases | Windows (.cmd/PowerShell) |
| [sal063/Ace-Combat-5-Static-recompilation](https://github.com/sal063/Ace-Combat-5-Static-recompilation) | Shared upstream: recompiler + runtime for AC5 | Calls itself "fully playable". 102★ | Windows |
| [ran-j/PS2Recomp](https://github.com/ran-j/PS2Recomp) | General PS2 static recompiler (GPL-3.0, inspired by N64Recomp) | Experimental. Mainly tested on MSVC | Windows-first |
| sal063/AC6_recomp + QaidVoid/ac6recomp | AC6 (Xbox 360) recomp. The QaidVoid fork **adds Linux** | Boots on Linux, with audio/input issues | Useful as a reference for porting this family of projects to Linux |

I found no AC04 *matching decomp* project (splat/decomp.me style) anywhere.

### Recomp vs. decomp

- **Static recomp:** the game's MIPS machine code is translated into C automatically,
  then compiled for x86-64. A runtime emulates or replaces the PS2 hardware: GS
  graphics on Vulkan, VU1, SPU2 audio, IPU movies, IOP, memory cards and pads.
  You get a native, moddable executable quickly. The generated C is unreadable,
  though, and is tied to one exact executable (US `SLUS_201.52`).
- **Matching decomp:** people hand-write C until it compiles to the identical
  binary. You get real, readable source, but it takes years of community effort.
  Tools: splat, [decomp-kit](https://github.com/kira-502/decomp-kit), Ghidra plus
  the Emotion Engine plugin, decomp.me, and the matching EE GCC/SN compiler.
- **Hybrid (recommended if you want "real" source eventually):** keep the recomp
  running the game and replace recompiled functions with hand-written C one at a
  time, testing each against the original. The recomp's override/hook system
  already supports this.

## (Shelved) Native Linux port: gaps found in PresidentRaptor's code

Kept for reference in case Proton turns out to have problems that can't be fixed.

I cloned commit `322ad0e` and read through it. These are the only Windows-only
pieces I found:

| File | Windows-only bit | Linux replacement |
|---|---|---|
| `runtime/src/ps2_hook.c:56` | x86-64 hook thunk written for the **Win64 calling convention** (rcx/rdx, 32-byte shadow space). On Linux, hooks are compiled out (`HOOK_SUPPORTED 0`) | Write a System V version (rdi/rsi, no shadow space, keep 16-byte stack alignment) |
| `runtime/src/ps2_mod.c:686-733` | Native mods use `LoadLibraryExA`. Other platforms just log "Windows only" | `dlopen`/`dlsym`, `.so` mods |
| `runtime/src/ps2_main.c:305` | Crash handler uses SEH plus `RtlCaptureStackBackTrace` | `sigaction(SIGSEGV…)` plus `backtrace()`/`dladdr` |
| `runtime/src/ps2_main.c:212` | CPU-time report via `GetProcessTimes` | `getrusage` (diagnostic only) |
| `runtime/src/ps2_kernel.c:1185,1226` | 59.94 Hz vblank uses a high-resolution waitable timer, with a `nanosleep` fallback that already works | `clock_nanosleep(CLOCK_MONOTONIC, TIMER_ABSTIME)` for steadier frame pacing |
| `runtime/src/ps2_ui.cpp:654-658` | Paths shown in the UI use `\` | Display text only |
| `tools/build_ac4.sh` | Hardcodes `C:/msys64/ucrt64` | Add a Linux branch, or use plain `cmake -G Ninja` |
| `CMakeLists.txt:150` | `.rc` icon resource behind `if(WIN32)` | Already guarded. Add a `.desktop` file + icon instead |

The memory card, VFS, texture pack, capture and statecap code already have POSIX
branches.

**Toolchain:** the build needs **GCC 15 or newer** because it uses
`[[gnu::musttail]]` for guaranteed tail calls. Without it, deep guest loops can
overflow the stack. Fedora 42+ and Arch ship GCC 15. Ubuntu 24.04 ships 13, which
is too old. Clang has `musttail` too, but it isn't tested here.

## Bazzite specifics

Bazzite is an immutable Fedora Atomic system, so don't install build tools on the
host. Use **Distrobox**, which comes with Bazzite:

```bash
distrobox create -n ac4dev -i registry.fedoraproject.org/fedora:latest
distrobox enter ac4dev
sudo dnf install gcc gcc-c++ cmake ninja-build python3 pkgconf \
     SDL3-devel vulkan-headers vulkan-loader-devel glslc git
gcc --version   # must be >= 15
```

To put it in Steam: wrap the binary in a small launcher script and add it as a
**non-Steam game**. Use Steam Input for the controller (the runtime already reads
pads through SDL). Later, package it as an AppImage or Flatpak so it runs in Game
Mode without the distrobox.

Upstream notes say the **Steam overlay can crash the Vulkan startup** (along
with RTSS, ReShade and OBS). If it crashes at launch, turn the overlay off for
that shortcut.

## Phased plan

### Phase 0 — First evening at the PC (about 1 hour)
- [ ] Check which disc you have. **Only the US release (SLUS-20152) works**, because
      the configs are keyed to its addresses. PAL/JP discs won't work without new
      config work.
- [ ] Rip the disc to ISO. Check that `SLUS_201.52` is **3,248,756 bytes** and
      matches the SHA256 in the upstream README.
- [ ] Set up a baseline: PCSX2 (Flatpak/Discover on Bazzite) runs the game, so
      you have something to compare against.
- [ ] Quick test: run the upstream v2.2.3-beta Windows build on Bazzite through
      Proton (non-Steam game → force Proton). Write down what works.
      Vulkan games usually don't need DXVK.

### Phase 1 — Native Linux build (a weekend or two)
- [ ] Fork PresidentRaptor's repo and set up the `ac4dev` distrobox.
- [ ] Get the recompiler (`tools/ps2recomp`, Python) generating C from your ISO,
      then `cmake -G Ninja`, then build `ac4` on Linux.
- [ ] Fix the gap table above, in this order: build script → crash handler →
      timer → hook thunk → `dlopen` mods.
- [ ] Get the upstream test suites (synthetic, no ISO needed) running on Linux.
      Add a Linux CI job.
- [ ] Watch for **case-sensitive paths**: the `mods/`, `textures/` and `saves/`
      folders and anything users drop in.
- [ ] Offer the changes upstream as a PR. The maintainer is active, and one shared
      tree is better than another fork.

### Phase 2 — Steam/Bazzite polish
- [ ] AppImage (or Flatpak) with a launcher that asks for the ISO on first run.
- [ ] `.desktop` file and icon, Steam artwork, and a recommended Steam Input layout.
- [ ] Gamescope/Game Mode testing: fullscreen, 16:9 and 16:10 (Deck), frame pacing.

### Phase 3 — Help finish the game
- [ ] Play through the campaign past Mission 01 and report or fix issues. Upstream
      only has Mission 01 confirmed. The open issues are stutter, anisotropic
      filtering artifacts, and a window that vanishes into the background.
- [ ] Performance: VU recompilation captures, shader cache warm-up (the AC04 fork
      shows a 66 ms stall from shader compilation).

### Phase 4 (optional, long-term) — Real source
- [ ] Check whether `SLUS_201.52` has any symbols or debug info left (`readelf -S`,
      or Ghidra with the EE plugin). Leftover symbols speed up decomp a lot.
- [ ] If you get serious: work out the original compiler, set up splat/decomp-kit,
      then hand-replace recompiled functions one at a time (hybrid approach).

## Legal / hygiene
- Use your own disc only. **Never commit or share the ISO, `generated/`
  (recompiled game code), extracted assets, saves, or VU captures.** The upstream
  `.gitignore` already excludes them, and their issue templates ask the same.
- The code is Apache-2.0. Keep the NOTICE/CREDITS when you fork. Not affiliated
  with Bandai Namco.

## Open questions for you
1. Is your disc US, PAL, or JP? This decides whether Phase 0 works out of the box.
2. Goal: "play it nicely on Bazzite" (Phases 0–2), or "real source code" (Phase 4)?
3. Contribute upstream, or keep your own fork?
