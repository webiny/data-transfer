export function transformImports(content: string): string {
    return content
        .replaceAll(`"~/index.ts"`, `"@webiny/data-transfer"`)
        .replaceAll(`'~/index.ts'`, `'@webiny/data-transfer'`);
}
