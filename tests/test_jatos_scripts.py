import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPOSITORY_ROOT / "scripts"))

from jatos_deploy import parse_jzip_identity  # noqa: E402


class JatosArchiveTests(unittest.TestCase):
    def write_archive(self, payload):
        directory = tempfile.TemporaryDirectory()
        path = Path(directory.name) / "study.jzip"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("study.jas", json.dumps(payload))
        self.addCleanup(directory.cleanup)
        return path

    def test_parses_current_jatos_wrapped_properties(self):
        path = self.write_archive(
            {
                "version": "3",
                "data": {"title": "CLT-VWM Mouse", "uuid": "study-uuid"},
            }
        )
        self.assertEqual(parse_jzip_identity(path), ("CLT-VWM Mouse", "study-uuid"))

    def test_parses_legacy_flat_properties(self):
        path = self.write_archive({"title": "Legacy", "uuid": "legacy-uuid"})
        self.assertEqual(parse_jzip_identity(path), ("Legacy", "legacy-uuid"))


if __name__ == "__main__":
    unittest.main()
