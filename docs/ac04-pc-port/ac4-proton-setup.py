#!/usr/bin/env python3
"""Install the Ace Combat 04 PC Port on Linux (Bazzite / SteamOS) for Proton.

The upstream Setup.exe is a .NET Framework installer, which is the fragile part
under Wine. This script does the same install natively, then prints the Steam
"non-Steam game" settings that run runtime/ac4.exe directly under Proton
(skipping the .NET launcher too).

    python3 ac4-proton-setup.py --setup Ace-Combat-04-PC-Port-2.2.3-beta-Setup.exe \
        --iso ~/Games/ac04-usa.iso --dest ~/Games/AC04

Mirrors packaging/ac4/installer/InstallerCore.cs in
https://github.com/PresidentRaptor/Ace-Combat-04-PC-Port (v2.2.3-beta).
Standard library only.
"""
import argparse
import hashlib
import io
import os
import shlex
import struct
import sys
import zipfile
from pathlib import Path

ELF_NAME = "SLUS_201.52"
ELF_HASH = "38ECEBD6965C2F74EC8973F538781506BF3A2CFAD86F908DEB6C5D585D528301"
ELF_SIZE = 3248756
IMAGE_BASE = 0x100000
IMAGE_SIZE = 0x3CC74C
SECTOR = 2048


def die(msg):
    sys.exit("error: " + msg)


def u32(b, p):
    return struct.unpack_from("<I", b, p)[0]


def u16(b, p):
    return struct.unpack_from("<H", b, p)[0]


def read(f, offset, length):
    f.seek(offset)
    b = f.read(length)
    if len(b) != length:
        die("the ISO is truncated or has an invalid file extent")
    return b


def find(directory, name, iso_len):
    p = 0
    while p < len(directory):
        n = directory[p]
        if n == 0:
            p = (p // SECTOR + 1) * SECTOR
            continue
        if n < 34 or p + n > len(directory) or p % SECTOR + n > SECTOR:
            die("the ISO directory is damaged")
        chars = directory[p + 32]
        found = directory[p + 33:p + 33 + chars].decode("ascii", "replace").split(";")[0]
        if found.upper() == name.upper():
            if directory[p + 25] & (2 | 128):
                die("unsupported ISO file layout for " + name)
            offset = (u32(directory, p + 2) + directory[p + 1]) * SECTOR
            length = u32(directory, p + 10)
            if offset + length > iso_len:
                die("invalid ISO file extent")
            return offset, length
        p += n
    die("not the supported Ace Combat 04 USA ISO: missing " + name)


def build_image(iso_path):
    """Validate the USA ISO and rebuild runtime/ps2_image.bin from its ELF."""
    iso_len = os.path.getsize(iso_path)
    with open(iso_path, "rb") as f:
        if iso_len < 17 * SECTOR or iso_len % SECTOR:
            die("select an uncompressed ISO with 2048-byte sectors (not CHD/CSO/BIN+CUE)")
        pvd = read(f, 16 * SECTOR, SECTOR)
        if (pvd[0] != 1 or pvd[1:6] != b"CD001" or pvd[6] != 1
                or u16(pvd, 128) != SECTOR or u32(pvd, 80) * SECTOR > iso_len):
            die("the file is not a complete ISO9660 game disc")
        root_size = u32(pvd, 166)
        if not 34 <= root_size <= 4 * 1024 * 1024:
            die("invalid ISO root directory")
        root = read(f, (u32(pvd, 158) + pvd[157]) * SECTOR, root_size)
        off, length = find(root, "SYSTEM.CNF", iso_len)
        if length > 65536 or ELF_NAME.encode() not in read(f, off, length).upper():
            die("this region or revision is unsupported; use the USA disc (SLUS-20152)")
        off, length = find(root, ELF_NAME, iso_len)
        if length != ELF_SIZE:
            die("the game executable has an unsupported size; use an unmodified USA ISO")
        elf = read(f, off, length)
    if hashlib.sha256(elf).hexdigest().upper() != ELF_HASH:
        die("the game executable does not match SLUS-20152 (modified or different revision)")

    if len(elf) < 52 or elf[:4] != b"\x7fELF" or elf[4] != 1 or elf[5] != 1 or u16(elf, 18) != 8:
        die("invalid game ELF")
    phoff, stride, count = u32(elf, 28), u16(elf, 42), u16(elf, 44)
    if stride < 32 or count == 0 or phoff + stride * count > len(elf):
        die("invalid ELF program headers")
    image = bytearray(IMAGE_SIZE)
    lowest, highest = 0xFFFFFFFF, 0
    for i in range(count):
        p = phoff + stride * i
        if u32(elf, p) != 1 or u32(elf, p + 20) == 0:
            continue
        offset, address = u32(elf, p + 4), u32(elf, p + 8)
        size, memory = u32(elf, p + 16), u32(elf, p + 20)
        if (size > memory or address < IMAGE_BASE
                or address + memory > IMAGE_BASE + IMAGE_SIZE or offset + size > len(elf)):
            die("the ELF load layout is unsupported")
        image[address - IMAGE_BASE:address - IMAGE_BASE + size] = elf[offset:offset + size]
        lowest, highest = min(lowest, address), max(highest, address + memory)
    if lowest != IMAGE_BASE or highest != IMAGE_BASE + IMAGE_SIZE:
        die("the game's memory layout does not match this runtime")
    return bytes(image)


def extract_payload(setup_path):
    """Find payload.zip, which Setup.exe embeds as a .NET manifest resource.

    The zip sits inside the PE, not at its end, so locate each end-of-central-
    directory record and work back to where that archive starts.
    """
    data = Path(setup_path).read_bytes()
    pos = data.rfind(b"PK\x05\x06")
    while pos >= 0:
        cd_size, cd_offset = u32(data, pos + 12), u32(data, pos + 16)
        comment = u16(data, pos + 20)
        start = pos - cd_size - cd_offset
        if start >= 0 and data[start:start + 4] == b"PK\x03\x04":
            blob = data[start:pos + 22 + comment]
            try:
                z = zipfile.ZipFile(io.BytesIO(blob))
                if any(n.startswith("runtime/") for n in z.namelist()):
                    return z
            except zipfile.BadZipFile:
                pass
        pos = data.rfind(b"PK\x05\x06", 0, pos)
    die("could not find the game payload inside " + str(setup_path))


def check_setup_hash(setup_path, sums_path):
    digest = hashlib.sha256(Path(setup_path).read_bytes()).hexdigest().lower()
    for line in Path(sums_path).read_text().splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[-1].lstrip("*") == Path(setup_path).name:
            if parts[0].lower() != digest:
                die("Setup.exe does not match SHA256SUMS.txt")
            print("Setup.exe matches SHA256SUMS.txt")
            return
    die(Path(setup_path).name + " is not listed in " + str(sums_path))


def winpath(p):
    """Proton maps the Linux root to drive Z:."""
    return "Z:" + str(p).replace("/", "\\")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--setup", required=True, help="upstream ...-Setup.exe release asset")
    ap.add_argument("--iso", required=True, help="your uncompressed USA ISO (SLUS-20152)")
    ap.add_argument("--dest", required=True, help="empty folder to install into")
    ap.add_argument("--sums", help="SHA256SUMS.txt from the same release (recommended)")
    ap.add_argument("--copy-iso", action="store_true",
                    help="copy the ISO (about 4 GB) instead of symlinking it")
    args = ap.parse_args()

    iso = Path(args.iso).expanduser().resolve()
    dest = Path(args.dest).expanduser().resolve()
    if dest.exists() and any(dest.iterdir()):
        die("choose an empty folder; existing games and saves are not overwritten")
    if args.sums:
        check_setup_hash(args.setup, args.sums)

    print("Checking the USA game disc...")
    image = build_image(iso)
    payload = extract_payload(args.setup)

    print("Installing the runtime and shaders...")
    dest.mkdir(parents=True, exist_ok=True)
    for info in payload.infolist():
        target = (dest / info.filename).resolve()
        if dest not in target.parents and target != dest:
            die("the installer contains an invalid payload path: " + info.filename)
        if info.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with payload.open(info) as src, open(target, "xb") as out:
            out.write(src.read())
    (dest / "runtime" / "ps2_image.bin").write_bytes(image)
    (dest / "saves").mkdir(exist_ok=True)

    game_iso = dest / "game.iso"
    if args.copy_iso:
        print("Copying your ISO...")
        with open(iso, "rb") as src, open(game_iso, "xb") as out:
            while chunk := src.read(1 << 20):
                out.write(chunk)
    else:
        game_iso.symlink_to(iso)

    runtime = dest / "runtime"
    launch = (f"PS2_SHADER_DIR={shlex.quote(winpath(runtime / 'shaders'))} "
              f"PS2_SAVE_DIR={shlex.quote(winpath(dest / 'saves'))} "
              f"%command% --data {shlex.quote(winpath(runtime))} "
              f"--disc {shlex.quote(winpath(game_iso))} --vblanks 0 --watchdog 0")
    print(f"""
Installed to {dest}

Add it to Steam (Desktop Mode): Games > Add a Non-Steam Game > Browse,
pick {runtime / 'ac4.exe'}, then open its Properties:
  Target:          "{runtime / 'ac4.exe'}"
  Start In:        "{runtime}"
  Launch Options:  {launch}
  Compatibility:   force "Proton Experimental" (or the newest Proton / GE-Proton)

If it crashes at startup, turn off the Steam overlay for this shortcut first.
For a log, put PROTON_LOG=1 at the front of the launch options; the game's
output then lands in ~/steam-<appid>.log.
""")


if __name__ == "__main__":
    main()
