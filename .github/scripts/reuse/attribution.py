# SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
# SPDX-License-Identifier: Apache-2.0

"""Check differential attribution without the project's blanket copyright."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys

import tomlkit


DEFAULT_ATTRIBUTION_KEY = "incus-ui-default-attribution"


def notice_identity(notice):
    # Contact information is optional; it does not change the holder's identity.
    return " ".join(re.sub(r"<[^>]*>", "", notice).casefold().split())


def default_notices(config):
    notices = []
    for annotation in config.get("annotations", []):
        if annotation.get(DEFAULT_ATTRIBUTION_KEY) is True:
            values = annotation.get("SPDX-FileCopyrightText", [])
            notices.extend([values] if isinstance(values, str) else values)
    return {notice_identity(notice) for notice in notices if notice_identity(notice)}


def is_default_annotation(annotation):
    if annotation.get(DEFAULT_ATTRIBUTION_KEY) is True:
        return True
    paths = annotation.get("path", [])
    if isinstance(paths, str):
        paths = [paths]
    licenses = annotation.get("SPDX-License-Identifier", [])
    if isinstance(licenses, str):
        licenses = [licenses]
    # Recognize unmarked copies of the Apache fallback, including nested ones.
    # A targeted declaration or an explicit differential license is attribution
    # in its own right, even when it names the same project contributors.
    return any(path in {"**", "**/*"} for path in paths) and licenses == ["Apache-2.0"]


def check_attribution(project_root, artifact_path, trusted_config=None):
    # Read policy from the trusted script checkout, never from PR input alone.
    trusted_config = trusted_config or Path(__file__).resolve().parents[3] / "REUSE.toml"
    generic_notices = default_notices(tomlkit.parse(Path(trusted_config).read_text(encoding="utf-8")))
    if not generic_notices:
        raise ValueError("Trusted REUSE.toml must mark a nonempty default copyright with incus-ui-default-attribution = true")
    project_root = Path(project_root).resolve()
    artifact_path = Path(artifact_path).resolve()
    report = json.loads(artifact_path.read_text(encoding="utf-8"))
    configs = []
    for directory, subdirectories, filenames in os.walk(project_root, followlinks=False):
        subdirectories[:] = [name for name in subdirectories if name != ".git"]
        if "REUSE.toml" not in filenames:
            continue
        config_path = Path(directory) / "REUSE.toml"
        # Never edit through PR-controlled symlinks or directory junctions.
        if config_path.is_symlink() or not config_path.resolve().is_relative_to(project_root):
            raise ValueError("The attribution check requires regular REUSE.toml files inside the project")
        original = config_path.read_bytes()
        config = tomlkit.parse(original.decode("utf-8"))
        # A PR can rename its declared default. Treat that new value as generic
        # too, while retaining the trusted defaults for unmarked copies.
        generic_notices.update(default_notices(config))
        configs.append((config_path, original, config))

    modified_configs = []
    for config_path, original, config in configs:
        changed = False
        for annotation in config.get("annotations", []):
            if not is_default_annotation(annotation):
                continue
            notices = annotation.get("SPDX-FileCopyrightText", [])
            if isinstance(notices, str):
                notices = [notices]
            # Exclude inherited default attribution, not the holder's identity.
            # Explicit declarations elsewhere remain eligible during the scan.
            holders = [notice for notice in notices if notice_identity(notice) not in generic_notices]
            if len(holders) != len(notices):
                if holders:
                    annotation["SPDX-FileCopyrightText"] = holders
                else:
                    del annotation["SPDX-FileCopyrightText"]
                changed = True
        if changed:
            modified_configs.append((config_path, original, tomlkit.dumps(config)))
    configs = modified_configs
    if not configs:
        return

    def relative(value):
        candidate = Path(value)
        if candidate.is_absolute():
            candidate = candidate.relative_to(project_root)
        if ".." in candidate.parts:
            raise ValueError(f"REUSE reported a path outside the project: {value!r}")
        return candidate.as_posix()

    differential = {
        relative(file["path"]) for file in report["files"]
        if any(
            expression["is_valid"] and any(
                token not in {"Apache-2.0", "AND", "OR", "WITH"}
                for token in re.findall(r"[^\s()]+", expression["value"])
            ) for expression in file["spdx_expressions"]
        )
    }
    if not differential:
        return
    try:
        for config_path, _, modified in configs:
            config_path.write_text(modified, encoding="utf-8")
        result = subprocess.run(
            [sys.executable, "-I", "-m", "reuse", "--root", str(project_root), "lint", "--json"],
            cwd=artifact_path.parent, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            check=False,
        )
        if result.returncode not in (0, 1):
            raise RuntimeError("The differential attribution scan could not complete")
        attribution = json.loads(result.stdout)
    finally:
        # Restore exact bytes before generating suggestions or capturing diffs.
        for config_path, original, _ in configs:
            config_path.write_bytes(original)

    missing = {
        relative(value) for value in attribution["non_compliant"]["missing_copyright_info"]
    } & differential
    existing = {
        relative(value) for value in report["non_compliant"]["missing_copyright_info"]
    }
    report["non_compliant"]["missing_copyright_info"] = sorted(existing | missing)
    artifact_path.write_text(json.dumps(report), encoding="utf-8")


if __name__ == "__main__":
    check_attribution(
        os.environ["PR_SOURCE"],
        Path(os.environ["RUNNER_TEMP"]) / "reuse-artifact" / "reuse-lint.json",
    )
