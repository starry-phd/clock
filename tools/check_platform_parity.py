#!/usr/bin/env python3
"""Feature changes must touch Expo and web together (not merely one client)."""
import os, subprocess, sys
from pathlib import Path
if os.getenv("GITHUB_EVENT_NAME") != "pull_request":
    print("Platform parity: PR gate skipped outside pull_request.")
    sys.exit(0)
base = os.getenv("GITHUB_BASE_REF", "main")
try:
    files = subprocess.check_output(
        ["git", "diff", "--name-only", f"origin/{base}...HEAD"],
        text=True,
    ).splitlines()
except subprocess.CalledProcessError as exc:
    print("Unable to compare PR to base branch:", exc, file=sys.stderr)
    sys.exit(1)
native = any(
    f.startswith("apps/clock/app/") and f.endswith(".tsx")
    or f.startswith("apps/clock/src/auth/") and f.endswith(".tsx")
    for f in files
)
web = "web-preview/index.html" in files
backend_pricing = any(
    f in ("services/clock-api/src/pricing.mjs", "services/clock-api/src/index.mjs")
    for f in files
)
if native != web or backend_pricing and not (native and web):
    exception = "docs/platform-parity-exceptions.md" in files
    if exception:
        p = Path("docs/platform-parity-exceptions.md")
        exception = p.exists() and "EXCEPTION:" in p.read_text()
    if not exception:
        print(
            "BLOCK: product behavior changed on only one platform. "
            "Change BOTH Expo app/src and web-preview/index.html in this PR, "
            "or document a genuine platform-specific EXCEPTION in "
            "docs/platform-parity-exceptions.md.",
            file=sys.stderr,
        )
        print("Native:", native, "Web:", web, "Pricing backend:", backend_pricing)
        sys.exit(1)
print("PASS feature parity:", "native" if native else "no native feature",
      "web" if web else "no web feature", "pricing" if backend_pricing else "")
