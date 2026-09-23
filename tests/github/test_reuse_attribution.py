# REUSE-IgnoreStart
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import tomlkit

ROOT = Path(__file__).resolve().parents[2]
CHECK = runpy.run_path(str(ROOT / '.github/scripts/reuse/attribution.py'))['check_attribution']

# Use the actual policy, so edits to repository defaults affect these tests.
REPOSITORY_CONFIG = tomlkit.parse((ROOT / 'REUSE.toml').read_text(encoding='utf-8')).unwrap()
DEFAULTS = tomlkit.dumps({
    'version': 1,
    'annotations': [a for a in REPOSITORY_CONFIG['annotations'] if a.get('incus-ui-default-attribution')],
})


class AttributionTests(unittest.TestCase):
    def fixture(self, config=DEFAULTS):
        temp = tempfile.TemporaryDirectory(prefix='incus-attribution-test-')
        self.addCleanup(temp.cleanup)
        project = Path(temp.name) / 'project'
        project.mkdir()
        subprocess.run(['git', 'init', '-q', str(project)], check=True)
        (project / 'REUSE.toml').write_text(config, encoding='utf-8')
        (project / 'LICENSES').mkdir()
        (project / 'LICENSES/Apache-2.0.txt').write_bytes((ROOT / 'LICENSES/Apache-2.0.txt').read_bytes())
        # A local fixture license avoids any network access in the tests.
        (project / 'LICENSES/LicenseRef-Test.txt').write_text('Fixture license text.\n', encoding='utf-8')
        artifact = Path(temp.name) / 'reuse-lint.json'
        return project, artifact

    def lint(self, project, artifact):
        result = subprocess.run(
            [sys.executable, '-I', '-m', 'reuse', '--root', str(project), 'lint', '--json'],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
        )
        self.assertIn(result.returncode, (0, 1), result.stderr.decode())
        report = json.loads(result.stdout)
        artifact.write_bytes(result.stdout)
        return report

    def test_default_hides_attribution_but_second_scan_flags_only_differential_files(self):
        project, artifact = self.fixture()
        (project / 'apache.py').write_text('value = 1\n', encoding='utf-8')
        (project / 'mit.py').write_text('# SPDX-License-Identifier: MIT\n', encoding='utf-8')
        (project / 'custom.py').write_text('# SPDX-License-Identifier: LicenseRef-Test\n', encoding='utf-8')
        original = (project / 'REUSE.toml').read_bytes()
        before = self.lint(project, artifact)
        self.assertEqual(before['non_compliant']['missing_copyright_info'], [])
        self.assertIn('MIT', before['non_compliant']['missing_licenses'])
        CHECK(project, artifact)
        after = json.loads(artifact.read_text(encoding='utf-8'))
        self.assertEqual(after['non_compliant']['missing_copyright_info'], ['custom.py', 'mit.py'])
        self.assertEqual((project / 'REUSE.toml').read_bytes(), original)
        self.assertEqual(after['non_compliant']['missing_licenses'], before['non_compliant']['missing_licenses'])

    def test_real_scan_can_generate_differential_suggestions_with_defaults_restored(self):
        project, artifact = self.fixture()
        (project / 'apache.py').write_text('value = 1\n', encoding='utf-8')
        (project / 'custom.py').write_text('# SPDX-License-Identifier: LicenseRef-Test\n', encoding='utf-8')
        self.lint(project, artifact)
        CHECK(project, artifact)
        artifact_dir = artifact.parent / 'reuse-artifact'
        artifact_dir.mkdir()
        (artifact_dir / 'reuse-lint.json').write_bytes(artifact.read_bytes())
        with patch.dict(os.environ, {'RUNNER_TEMP': str(artifact.parent), 'PR_SOURCE': str(project)}):
            runpy.run_path(str(ROOT / '.github/scripts/reuse/draft-suggestions.py'))
        self.assertIn('@@REUSE_SUGGEST_IDENTITY@@', (project / 'custom.py').read_text(encoding='utf-8'))
        self.assertEqual((project / 'apache.py').read_text(encoding='utf-8'), 'value = 1\n')

    def test_explicit_headers_sidecars_and_targeted_annotations_are_respected(self):
        config = DEFAULTS + '''
[[annotations]]
path = "targeted.py"
SPDX-FileCopyrightText = "2026 Third Party"
SPDX-License-Identifier = "LicenseRef-Test"
'''
        project, artifact = self.fixture(config)
        metadata = '# SPDX-License-Identifier: LicenseRef-Test\n# SPDX-FileCopyrightText: 2026 Third Party\n'
        (project / 'header.py').write_text(metadata, encoding='utf-8')
        (project / 'sidecar.py').write_text('value = 1\n', encoding='utf-8')
        (project / 'sidecar.py.license').write_text(metadata, encoding='utf-8')
        (project / 'targeted.py').write_text('value = 1\n', encoding='utf-8')
        self.lint(project, artifact)
        CHECK(project, artifact)
        report = json.loads(artifact.read_text(encoding='utf-8'))
        self.assertEqual(report['non_compliant']['missing_copyright_info'], [])

    def test_config_is_restored_when_the_second_scan_fails(self):
        project, artifact = self.fixture()
        (project / 'custom.py').write_text('# SPDX-License-Identifier: LicenseRef-Test\n', encoding='utf-8')
        self.lint(project, artifact)
        original = (project / 'REUSE.toml').read_bytes()
        with patch('subprocess.run', side_effect=RuntimeError('scanner failed')):
            with self.assertRaises(RuntimeError):
                CHECK(project, artifact)
        self.assertEqual((project / 'REUSE.toml').read_bytes(), original)

    def test_explicit_project_holder_is_accepted_for_differential_files(self):
        notice = tomlkit.parse(DEFAULTS)['annotations'][0]['SPDX-FileCopyrightText']
        for source in ['header', 'sidecar', 'targeted', 'root-differential', 'nested-differential']:
            with self.subTest(source=source):
                project, artifact = self.fixture()
                (project / 'vendor').mkdir()
                file = project / 'vendor/lib.py'
                file.write_text('# SPDX-License-Identifier: LicenseRef-Test\n', encoding='utf-8')
                if source == 'header':
                    file.write_text(file.read_text() + f'# SPDX-FileCopyrightText: {notice}\n', encoding='utf-8')
                elif source == 'sidecar':
                    (project / 'vendor/lib.py.license').write_text(
                        f'SPDX-License-Identifier: LicenseRef-Test\nSPDX-FileCopyrightText: {notice}\n', encoding='utf-8')
                else:
                    config = project / 'REUSE.toml'
                    path = 'vendor/lib.py'
                    license_id = 'Apache-2.0'
                    if source.endswith('differential'):
                        path = '**'
                        license_id = 'LicenseRef-Test'
                        file.write_text('value = 1\n', encoding='utf-8')
                    if source == 'nested-differential':
                        config = project / 'vendor/REUSE.toml'
                        config.write_text('version = 1\n', encoding='utf-8')
                    document = tomlkit.parse(config.read_text(encoding='utf-8'))
                    document.setdefault('annotations', []).append({
                        'path': path,
                        'SPDX-License-Identifier': license_id,
                        'SPDX-FileCopyrightText': notice,
                    })
                    config.write_text(tomlkit.dumps(document), encoding='utf-8')
                originals = {p: p.read_bytes() for p in project.rglob('REUSE.toml')}
                self.lint(project, artifact)
                CHECK(project, artifact)
                report = json.loads(artifact.read_text(encoding='utf-8'))
                self.assertEqual(report['non_compliant']['missing_copyright_info'], [])
                self.assertTrue(any(
                    expression['value'] == 'LicenseRef-Test'
                    for entry in report['files'] if entry['path'] == 'vendor/lib.py'
                    for expression in entry['spdx_expressions']
                ))
                for config, original in originals.items():
                    self.assertEqual(config.read_bytes(), original)

    def test_unmarked_copies_of_the_blanket_default_do_not_supply_attribution(self):
        for location in ['root', 'nested']:
            with self.subTest(location=location):
                project, artifact = self.fixture()
                (project / 'vendor').mkdir()
                (project / 'vendor/lib.py').write_text('# SPDX-License-Identifier: LicenseRef-Test\n', encoding='utf-8')
                config = tomlkit.parse(DEFAULTS)
                del config['annotations'][0]['incus-ui-default-attribution']
                config['annotations'][0]['path'] = '**/*'
                destination = project / ('REUSE.toml' if location == 'root' else 'vendor/REUSE.toml')
                destination.write_text(tomlkit.dumps(config), encoding='utf-8')
                self.lint(project, artifact)
                CHECK(project, artifact)
                report = json.loads(artifact.read_text(encoding='utf-8'))
                self.assertIn('vendor/lib.py', report['non_compliant']['missing_copyright_info'])

    def test_generic_attribution_is_removed_regardless_of_glob_or_config_location(self):
        for location in ['root-alternate-glob', 'nested', 'nested-only', 'targeted']:
            with self.subTest(location=location):
                project, artifact = self.fixture()
                vendor = project / 'vendor'
                vendor.mkdir()
                (vendor / 'lib.py').write_text('# SPDX-License-Identifier: LicenseRef-Test\n', encoding='utf-8')
                if location == 'root-alternate-glob':
                    (project / 'REUSE.toml').write_text(DEFAULTS.replace('"**"', '"**/*"'), encoding='utf-8')
                elif location == 'targeted':
                    (project / 'REUSE.toml').write_text(DEFAULTS.replace('"**"', '"vendor/lib.py"'), encoding='utf-8')
                else:
                    (vendor / 'REUSE.toml').write_text(DEFAULTS, encoding='utf-8')
                    if location == 'nested-only':
                        (project / 'REUSE.toml').unlink()
                originals = {p: p.read_bytes() for p in project.rglob('REUSE.toml')}
                self.lint(project, artifact)
                CHECK(project, artifact)
                report = json.loads(artifact.read_text(encoding='utf-8'))
                self.assertIn('vendor/lib.py', report['non_compliant']['missing_copyright_info'])
                for config, original in originals.items():
                    self.assertEqual(config.read_bytes(), original)

    def test_nested_annotation_retains_a_real_holder_in_a_mixed_list(self):
        project, artifact = self.fixture()
        vendor = project / 'vendor'
        vendor.mkdir()
        (vendor / 'lib.py').write_text('# SPDX-License-Identifier: LicenseRef-Test\n', encoding='utf-8')
        config = tomlkit.parse(DEFAULTS)
        annotation = config['annotations'][0]
        annotation['SPDX-FileCopyrightText'] = [annotation['SPDX-FileCopyrightText'], '2026 Third Party']
        # Named vendor attribution is not itself a declaration of defaults.
        del annotation['incus-ui-default-attribution']
        (vendor / 'REUSE.toml').write_text(tomlkit.dumps(config), encoding='utf-8')
        self.lint(project, artifact)
        CHECK(project, artifact)
        report = json.loads(artifact.read_text(encoding='utf-8'))
        self.assertEqual(report['non_compliant']['missing_copyright_info'], [])

    def test_all_configs_are_restored_when_the_second_scan_fails(self):
        project, artifact = self.fixture()
        vendor = project / 'vendor'
        vendor.mkdir()
        (vendor / 'lib.py').write_text('# SPDX-License-Identifier: LicenseRef-Test\n', encoding='utf-8')
        (vendor / 'REUSE.toml').write_text(DEFAULTS, encoding='utf-8')
        self.lint(project, artifact)
        originals = {p: p.read_bytes() for p in project.rglob('REUSE.toml')}
        with patch('subprocess.run', side_effect=RuntimeError('scanner failed')):
            with self.assertRaises(RuntimeError):
                CHECK(project, artifact)
        for config, original in originals.items():
            self.assertEqual(config.read_bytes(), original)

    def test_changed_default_wording_is_read_from_trusted_configuration(self):
        config = tomlkit.parse(DEFAULTS)
        config['annotations'][0]['SPDX-FileCopyrightText'] = 'Project-wide attribution with different wording'
        config = tomlkit.dumps(config)
        project, artifact = self.fixture(config)
        trusted = artifact.parent / 'trusted-REUSE.toml'
        trusted.write_text(config, encoding='utf-8')
        (project / 'custom.py').write_text('# SPDX-License-Identifier: LicenseRef-Test\n', encoding='utf-8')
        self.lint(project, artifact)
        CHECK(project, artifact, trusted_config=trusted)
        report = json.loads(artifact.read_text(encoding='utf-8'))
        self.assertIn('custom.py', report['non_compliant']['missing_copyright_info'])

    def test_missing_trusted_default_marker_is_an_error(self):
        project, artifact = self.fixture()
        trusted = artifact.parent / 'trusted-REUSE.toml'
        trusted.write_text('version = 1\n', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'must mark a nonempty default copyright'):
            CHECK(project, artifact, trusted_config=trusted)


if __name__ == '__main__':
    unittest.main()
# REUSE-IgnoreEnd
