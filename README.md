# Webiny v5 to v6 Migration Tool

## Usage

### Full Migration (Default)

```bash
npx github:webiny/v5-to-v6 \
  --segments=4 \
  --sourcePrimaryTable=webiny-v5-table \
  --targetPrimaryTable=webiny-v6-table \
  --sourceFmBucket=webiny-v5-files \
  --targetFmBucket=webiny-v6-files \
  --models=./path/to/models/directory
```

### Custom Preset Migration

You can use the `--preset` flag to specify a custom migration preset:

```bash
# Using a built-in preset
npx github:webiny/v5-to-v6 \
  --preset=full \
  --sourcePrimaryTable=webiny-v5-table \
  --targetPrimaryTable=webiny-v6-table \
  --sourceFmBucket=webiny-v5-files \
  --targetFmBucket=webiny-v6-files

# Using a custom preset file
npx github:webiny/v5-to-v6 \
  --preset=./my-custom-preset.ts \
  --sourcePrimaryTable=webiny-v5-table \
  --targetPrimaryTable=webiny-v6-table \
  --sourceFmBucket=webiny-v5-files \
  --targetFmBucket=webiny-v6-files
```

### Migration Presets

**Built-in Presets:**
- `full` (default) - Migrates all Webiny v5 data to v6 format

**Example Presets:** (see `examples/`)
- `cms-only` - Only CMS models and entries

### Creating Custom Presets

Custom presets use **pre-configured pipelines** that handle all core transformations automatically. You only need to add custom filters or transformers for your specific use case:

```typescript
import { MigrationPreset } from "@/src/presets/types";
import { CmsModelPipeline, CmsEntryPipeline } from "@/src/pipelines";

export const publishedOnlyPreset: MigrationPreset = {
  name: "published-only",
  description: "Migrate only published CMS entries",
  configure(runner, config, database) {
    runner
      .register(new CmsModelPipeline().build())
      .register(
        new CmsEntryPipeline()
          .filter(record => record.status === "published")
          .build()
      );
  }
};
```

**Available Pre-configured Pipelines:**
- `CmsModelPipeline`, `CmsEntryPipeline` - CMS data (entries exclude File Manager files)
- `FmSettingsPipeline`, `FmFilePipeline`, `FolderPipeline` - File Manager data
- `SecurityGroupPipeline`, `SecurityTeamPipeline` - Security data
- `MailerSettingsPipeline` - Mailer settings

Each pipeline includes all necessary filters and transformers in the correct order.

## Transformations

### Global (All Records)

- Wrap non-reserved attributes in `data` envelope
- Add `GSI_TENANT` attribute
- Remove locale codes from PK/SK/GSI keys
- Remove `webinyVersion` and `tenant` attributes

### Security Groups → Roles

- Transform `security.group` → `security.role`
- Transform `GROUP` → `ROLE` in keys
- Transform `GROUPS` → `ROLES` in GSI keys
- Remove `content.i18n` permission
- Flatten `cms.contentModel` models from locale object to array
- Transform `cms.contentModelGroup` groups from IDs to slugs
- Skip full-access and anonymous roles

### Security Teams

- Wrap in data envelope
- Add `GSI_TENANT` attribute

### CMS Entries

- Remove duplicate `#CME#CME#` → `#CME#`
- Update modelIds:
  - fmFile -> `wbyFmFile`
  - acoFolder -> `wbyAcoFolder`
  - acoFilter -> `wbyAcoFilter`
  - webinyTask -> `wbyTask`
  - webinyTaskLog -> `wbyTaskLog`
  - wby_recordLocking -> `wbyRecordLock`
- Remove `#0001` from entry `data.location.folderId`
- Transform rich-text fields to Lexical format with gzip compression
- Update GSI keys to remove locale
- Fix incorrect storageIds in entries (use model definition as the source of truth)

### File Manager Files

- Update S3 paths: remove revision from path
- Create file metadata KeyValue records
- Copy files to new S3 location
- Update file entry `text@key` values

### File Manager Settings

- Migrate to KeyValue format (`KV#root:FileManager/General`)

### Folders

- Remove `#0001` from `data.id` and `data.parentId`

### Mailer Settings

- Migrate to KeyValue format (`KV#root:Mailer/Settings/Transport`)
