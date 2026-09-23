# SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
# SPDX-License-Identifier: Apache-2.0

import json
import os
import subprocess
import re

artifact_dir = os.path.join(os.environ["RUNNER_TEMP"], "reuse-artifact")
pr_source = os.environ["PR_SOURCE"]

with open(os.path.join(artifact_dir, "reuse-lint.json")) as f:
    report = json.load(f)

nc = report["non_compliant"]
# Never infer a differential license or suggest Apache headers.
differential_paths = {
    file['path'] for file in report['files']
    if any(
        expression['is_valid'] and any(
            token not in {'Apache-2.0', 'AND', 'OR', 'WITH'}
            for token in re.findall(r'[^\s()]+', expression['value'])
        ) for expression in file['spdx_expressions']
    )
}
missing_copyright_only = set(nc['missing_copyright_info']) & differential_paths

def annotate(files, extra_flags):
    if not files:
        return
    subprocess.run(
        [
            "reuse", "--root", pr_source, "annotate",
            "--copyright", "@@REUSE_SUGGEST_IDENTITY@@",
            "--exclude-year",
            # REUSE spec 3.3 explicitly permits adding '(C)', '(c)'
            # or '©' after the SPDX-FileCopyrightText prefix — the
            # symbol alone, not the redundant "Copyright" word too.
            "--copyright-prefix", "spdx-symbol",
            "--fallback-dot-license",
            *extra_flags,
            *(os.path.join(pr_source, file) for file in sorted(files)),
        ],
        check=False,
    )

# Preserve the declared license; only add missing copyright information.
annotate(missing_copyright_only, [])
