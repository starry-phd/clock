#!/usr/bin/env python3
"""Read the REAL Android signing certificate from a signed Expo preview APK.

No private keys are opened, uploaded, printed, or stored.
Play Store installs have a DIFFERENT Google Play app-signing certificate.
"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.request import Request, urlopen
import zipfile

APP_ID = "phd.starry.clock"
SHA256_LINE = re.compile(r"Signer\s+#\d+\s+certificate\s+SHA-256\s+digest:\s*([0-9a-fA-F:]+)", re.I)


def fingerprint_from_output(output: str) -> str:
    matches = {re.sub(r"[^0-9A-F]", "", x.upper()) for x in SHA256_LINE.findall(output)}
    if len(matches) != 1:
        raise ValueError("APK must contain exactly one verifiable signing certificate")
    raw = matches.pop()
    if not re.fullmatch(r"[0-9A-F]{64}", raw):
        raise ValueError("Invalid SHA-256 certificate fingerprint")
    return ":".join(raw[i:i+2] for i in range(0, 64, 2))


def find_apksigner() -> str:
    direct = shutil.which("apksigner")
    if direct:
        return direct
    sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if sdk:
        binaries = sorted(Path(sdk).glob("build-tools/*/apksigner"), reverse=True)
        if binaries:
            return str(binaries[0])
    raise RuntimeError("Android SDK build-tools apksigner is not installed")


def select_preview_build(data: object) -> tuple[str, str]:
    if not isinstance(data, list):
        raise ValueError("Unexpected EAS build:list JSON")
    candidates = []
    for b in data:
        if not isinstance(b, dict):
            continue
        if b.get("platform") != "ANDROID" or b.get("status") != "FINISHED":
            continue
        if b.get("buildProfile") not in (None, "preview"):
            continue
        identifier = b.get("appIdentifier")
        if identifier is not None and identifier != APP_ID:
            continue
        url = (b.get("artifacts") or {}).get("buildUrl")
        if not isinstance(url, str) or not url.startswith("https://"):
            continue
        if not isinstance(b.get("id"), str):
            continue
        candidates.append(b)
    if not candidates:
        raise ValueError("No completed signed Expo Android preview APK found")
    candidates.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    chosen = candidates[0]
    return chosen["artifacts"]["buildUrl"], chosen["id"]


def download_apk(url: str, target: Path) -> None:
    # Signed download URLs must never be printed in CI logs.
    request = Request(url, headers={"User-Agent": "Clock-Certificate-Fingerprint/1.0"})
    max_bytes = 300 * 1024 * 1024
    with urlopen(request, timeout=90) as response, target.open("wb") as output:
        if not response.geturl().startswith("https://"):
            raise ValueError("Build download redirected to an insecure address")
        downloaded = 0
        while chunk := response.read(1024 * 1024):
            downloaded += len(chunk)
            if downloaded > max_bytes:
                raise ValueError("APK exceeds permitted size")
            output.write(chunk)
    if not zipfile.is_zipfile(target):
        raise ValueError("Expo build artifact is not a valid APK archive")


def inspect(apk: Path) -> str:
    if not apk.is_file() or not zipfile.is_zipfile(apk):
        raise ValueError("Provide an existing signed .apk file")
    result = subprocess.run(
        [find_apksigner(), "verify", "--print-certs", str(apk)],
        check=True, capture_output=True, text=True,
    )
    return fingerprint_from_output(result.stdout + "\n" + result.stderr)


def main() -> None:
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--apk", type=Path)
    source.add_argument("--apk-url", help="HTTPS download URL of an already signed APK")
    source.add_argument("--eas-builds", type=Path, help="Saved eas build:list --json output")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    build_id = None
    with tempfile.TemporaryDirectory(prefix="clock-signing-cert-") as temp:
        apk = args.apk
        if args.eas_builds or args.apk_url:
            url = args.apk_url
            if args.eas_builds:
                url, build_id = select_preview_build(json.loads(args.eas_builds.read_text()))
            apk = Path(temp) / "clock-preview.apk"
            download_apk(url, apk)
        fp = inspect(apk)
    lines = [
        "APP_ID=" + APP_ID,
        "CERTIFICATE_KIND=Expo EAS preview APK signing certificate",
        "SHA256=" + fp,
        "NOTE=This is NOT necessarily the Google Play app-signing certificate.",
    ]
    if build_id:
        lines.append("EAS_BUILD_ID=" + build_id)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    print("Google Play installed App SHA-256 must be copied from Play Console > App integrity.")


if __name__ == "__main__":
    main()
