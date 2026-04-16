# Custom CMS Models

Place CMS model JSON files here to override or supplement models loaded from the source database.

Each file must be a valid JSON object with at least a `modelId` property. Files in this directory take precedence over models loaded from DynamoDB — useful when the source database has missing or outdated model definitions.

Example (`article.json`):

```json
{
  "modelId": "article",
  "name": "Article",
  "fields": [
    {
      "fieldId": "title",
      "type": "text",
      "storageId": "text@title"
    },
    {
      "fieldId": "body",
      "type": "rich-text",
      "storageId": "rich-text@body"
    }
  ]
}
```

To enable, set `modelsDir` in your config:

```typescript
pipeline: {
    preset: "v5-to-v6",
    segments: 4,
    modelsDir: "./projects/example/models"
}
```
