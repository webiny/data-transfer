---
name: fixCmePk
description: Removes a duplicated #CME#CME# segment from a record's PK.
category: Transformers
---

# fixCmePk

**Import:** `import { fixCmePk } from "@webiny/data-transfer";`

**Category:** cms

**What it does:** Fixes a known PK corruption where `#CME#` appears twice in a row (e.g. `T#root#L#en-US#CMS#CME#CME#<id>` → `T#root#CMS#CME#<id>`) by replacing the first occurrence of `#CME#CME#` with `#CME#`. No-op if the pattern isn't present.

**Record types it targets:** Any record whose `PK` contains `#CME#CME#` (CMS entry records).

**Context type required:** `BaseTransformContext`
