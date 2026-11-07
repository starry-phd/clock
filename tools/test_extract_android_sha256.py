import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).with_name("extract_android_sha256.py")
spec = importlib.util.spec_from_file_location("clock_android_sha256", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FingerprintTests(unittest.TestCase):
    def test_extracts_single_real_format_signature(self):
        raw = "ab" * 32
        output = "Signer #1 certificate SHA-256 digest: " + raw
        expected = ":".join(["AB"] * 32)
        self.assertEqual(module.fingerprint_from_output(output), expected)

    def test_never_makes_up_signature_for_invalid_apk(self):
        with self.assertRaises(ValueError):
            module.fingerprint_from_output("APK is unsigned")
        with self.assertRaises(ValueError):
            module.fingerprint_from_output("Signer #1 certificate SHA-256 digest: abcd")

    def test_refuses_multiple_different_signers(self):
        output = ("Signer #1 certificate SHA-256 digest: " + "ab" * 32 + "\n"
                  "Signer #2 certificate SHA-256 digest: " + "cd" * 32)
        with self.assertRaises(ValueError):
            module.fingerprint_from_output(output)

    def test_only_reads_completed_preview_android_builds(self):
        old = {"id": "first", "platform": "ANDROID", "status": "FINISHED",
               "buildProfile": "preview", "createdAt": "2026-11-06T00:00:00Z",
               "appIdentifier": "phd.starry.clock",
               "artifacts": {"buildUrl": "https://example.com/first.apk"}}
        new = {**old, "id": "latest", "createdAt": "2026-11-07T00:00:00Z",
               "artifacts": {"buildUrl": "https://example.com/latest.apk"}}
        wrong = {**old, "id": "other-app", "appIdentifier": "phd.starry.other"}
        self.assertEqual(
            module.select_preview_build([old, wrong, new]),
            ("https://example.com/latest.apk", "latest"),
        )

    def test_no_suitable_build_means_no_fingerprint(self):
        with self.assertRaises(ValueError):
            module.select_preview_build([
                {"id": "missing", "platform": "ANDROID", "status": "FINISHED",
                 "buildProfile": "production",
                 "artifacts": {"buildUrl": "https://example.com/app.aab"}}
            ])


if __name__ == "__main__":
    unittest.main()
