# Webiny v5 to v6 Migration Tool

## Usage

```bash
npx github:webiny/v5-to-v6 \
  --segments=4 \
  --sourcePrimaryTable=webiny-v5-table \
  --targetPrimaryTable=webiny-v6-table \
  --sourceFmBucket=webiny-v5-files \
  --targetFmBucket=webiny-v6-files \
  --models=./path/to/models/directory
```

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
