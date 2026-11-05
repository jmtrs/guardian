"""Read-only tests for the production firmware security gate."""

from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


REPOSITORY = Path(__file__).resolve().parents[1]
CHECKER = REPOSITORY / "firmware/production/check-security-config.sh"
TEMPLATE = REPOSITORY / "firmware/production/sdkconfig.security.defaults"


class TestSecurityConfig(unittest.TestCase):
    def run_gate(self, config: Path, mode: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(CHECKER), str(config), mode, str(REPOSITORY)],
            check=False,
            capture_output=True,
            text=True,
        )

    def release_config(self, directory: Path, key: Path) -> Path:
        config = directory / "sdkconfig"
        config.write_text(
            TEMPLATE.read_text(encoding="utf-8").replace(
                "__OUTSIDE_REPOSITORY__/guardian-secure-boot.pem", str(key)
            ),
            encoding="utf-8",
        )
        return config

    def test_template_gate_is_read_only_and_complete(self) -> None:
        result = self.run_gate(TEMPLATE, "template")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_release_requires_valid_external_rsa_3072_key(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            key = directory / "secure-boot.pem"
            subprocess.run(
                [
                    "openssl",
                    "genpkey",
                    "-quiet",
                    "-algorithm",
                    "RSA",
                    "-pkeyopt",
                    "rsa_keygen_bits:3072",
                    "-out",
                    str(key),
                ],
                check=True,
            )
            result = self.run_gate(self.release_config(directory, key), "release")
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_release_rejects_key_inside_repository(self) -> None:
        with tempfile.TemporaryDirectory() as external, tempfile.TemporaryDirectory(
            dir=REPOSITORY
        ) as internal:
            external_key = Path(external) / "secure-boot.pem"
            subprocess.run(
                [
                    "openssl",
                    "genpkey",
                    "-quiet",
                    "-algorithm",
                    "RSA",
                    "-pkeyopt",
                    "rsa_keygen_bits:3072",
                    "-out",
                    str(external_key),
                ],
                check=True,
            )
            internal_key = Path(internal) / "secure-boot.pem"
            shutil.copyfile(external_key, internal_key)
            config = self.release_config(Path(external), internal_key)
            result = self.run_gate(config, "release")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("outside the repository", result.stderr)


if __name__ == "__main__":
    unittest.main()
