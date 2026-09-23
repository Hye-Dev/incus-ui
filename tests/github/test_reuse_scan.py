import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[2] / '.github' / 'scripts'


class ScanTests(unittest.TestCase):
    def test_only_differential_files_are_annotated(self):
        with tempfile.TemporaryDirectory(prefix='incus-scan-test-') as tmp:
            artifact = Path(tmp) / 'reuse-artifact'
            artifact.mkdir()
            files = [
                {'path': name, 'spdx_expressions': [{'value': license_id, 'is_valid': True}]}
                for name, license_id in [('apache.txt', 'Apache-2.0'), ('mit.txt', 'MIT')]
            ]
            files.append({'path': 'undeclared.txt', 'spdx_expressions': []})
            (artifact / 'reuse-lint.json').write_text(json.dumps({
                'files': files,
                'non_compliant': {'missing_copyright_info': ['apache.txt', 'mit.txt', 'undeclared.txt']},
            }), encoding='utf-8')
            with patch.dict(os.environ, {'RUNNER_TEMP': tmp, 'PR_SOURCE': tmp}), patch('subprocess.run') as run:
                runpy.run_path(str(SCRIPTS / 'reuse/draft-suggestions.py'))
            run.assert_called_once()
            args = run.call_args.args[0]
            self.assertEqual(args[-1], str(Path(tmp) / 'mit.txt'))
            self.assertNotIn('--license', args)
            self.assertNotIn(str(Path(tmp) / 'apache.txt'), args)
            self.assertNotIn(str(Path(tmp) / 'undeclared.txt'), args)

    def test_normalization_rejects_paths_outside_checkout(self):
        with tempfile.TemporaryDirectory(prefix='incus-scan-test-') as tmp:
            artifact = Path(tmp) / 'reuse-artifact'
            artifact.mkdir()
            (artifact / 'reuse-lint.json').write_text(json.dumps({
                'files': [{'path': '../outside.txt'}], 'non_compliant': {},
            }), encoding='utf-8')
            with patch.dict(os.environ, {'RUNNER_TEMP': tmp, 'PR_SOURCE': tmp}):
                with self.assertRaises(ValueError):
                    runpy.run_path(str(SCRIPTS / 'reuse/normalize.py'))


if __name__ == '__main__':
    unittest.main()
