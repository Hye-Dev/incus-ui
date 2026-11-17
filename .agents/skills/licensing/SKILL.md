---
name: licensing
description: Read when adding or updating attribution, downloading license texts, or incorporating code under a different compatible license.
---
All differential contribution parts are to be indicated through the [REUSE Specification](references/reuse-spec-3.3.md). Every commit must be self-contained: licensing must be correctly indicated as of that commit alone.

Always obtain license texts with `reuse download`; leave them unmodified rather than filling in license templates with copyright notices. Record attribution as described by REUSE, using `REUSE.toml` where source comments are unsuitable; do not add `.license` sidecar files.
