---
"@webiny/data-transfer": patch
---

Fix preset discovery listing `.d.ts` declaration files as duplicate entries. Preset names and descriptions are now read from the module export instead of derived from filenames. Warns when a preset file fails to import.
