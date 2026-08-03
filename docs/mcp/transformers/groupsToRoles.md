---
name: groupsToRoles
description: Renames security "group" records and their GROUP/GROUPS key segments to the v6 "role" terminology.
category: Transformers
---

# groupsToRoles

**Import:** `import { groupsToRoles } from "@webiny/data-transfer";`

**Category:** security

**What it does:** For records with `TYPE === "security.group"`, sets `TYPE` to `security.role`, updates `_et` from `SecurityGroup` to `SecurityRole` if set, and rewrites `GROUPS`→`ROLES` and `GROUP`→`ROLE` segments (in that order, to avoid partial matches) across `PK`, `SK`, `GSI1_PK/SK`, `GSI2_PK/SK`.

**Record types it targets:** Security group records (`TYPE === "security.group"`).

**Context type required:** `BaseTransformContext`
