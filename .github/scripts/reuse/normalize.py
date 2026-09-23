# SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
# SPDX-License-Identifier: Apache-2.0

import json
import os
from pathlib import Path

artifact_path = Path(os.environ["RUNNER_TEMP"]) / "reuse-artifact" / "reuse-lint.json"
project_root = Path(os.path.abspath(os.environ["PR_SOURCE"]))

with artifact_path.open() as f:
    report = json.load(f)

def project_relative(value):
    candidate = Path(value)
    if candidate.is_absolute():
        candidate = candidate.relative_to(project_root)
    else:
        candidate = Path(os.path.normpath(candidate))
    if candidate.is_absolute() or candidate.parts[:1] == ("..",):
        raise ValueError(f"REUSE reported a path outside the project: {value!r}")
    return candidate.as_posix()

for file_report in report["files"]:
    file_report["path"] = project_relative(file_report["path"])
for key in ("missing_copyright_info", "missing_licensing_info", "read_errors"):
    report["non_compliant"][key] = [
        project_relative(value) for value in report["non_compliant"][key]
    ]

with artifact_path.open("w") as f:
    json.dump(report, f)
