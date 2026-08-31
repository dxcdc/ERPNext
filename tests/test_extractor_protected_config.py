import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "extractor"))

from common import Common  # noqa: E402


class ExtractorProtectedConfigTests(unittest.TestCase):
    def test_protected_env_takes_precedence_over_legacy_json(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "configs.json").write_text(
                json.dumps({
                    "ONGSYS_URL_BASE": "https://legacy.invalid/api",
                    "ONGSYS_USERNAME": "legacy-user",
                    "ONGSYS_PASSWORD": "legacy-password",
                }),
                encoding="utf-8",
            )
            protected = root / "extractor.env"
            protected.write_text(
                "ONGSYS_URL_BASE=https://ongsys.example/api\n"
                "ONGSYS_USERNAME=protected-user\n"
                "ONGSYS_PASSWORD=protected-password\n",
                encoding="utf-8",
            )
            with patch.dict(
                os.environ,
                {
                    "CDC_NEXTERP_EXTRACTOR_ENV": str(protected),
                    "CDC_ONGSYS_ENV": f"{directory}/missing-ongsys.env",
                },
                clear=True,
            ):
                previous = os.getcwd()
                os.chdir(directory)
                try:
                    common = Common()
                finally:
                    os.chdir(previous)

            self.assertEqual("protected-user", common.ONGSYS_USER)
            self.assertEqual("protected-password", common.ONGSYS_PASS)

    def test_incomplete_ongsys_secret_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(
                os.environ,
                {
                    "CDC_NEXTERP_EXTRACTOR_ENV": f"{directory}/missing.env",
                    "CDC_ONGSYS_ENV": f"{directory}/missing-ongsys.env",
                },
                clear=True,
            ):
                previous = os.getcwd()
                os.chdir(directory)
                try:
                    with self.assertRaisesRegex(RuntimeError, "incompleta"):
                        Common()
                finally:
                    os.chdir(previous)


if __name__ == "__main__":
    unittest.main()
