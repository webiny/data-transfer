export function transformImports(content) {
  return content
    .replaceAll(`"../../../index.js"`, `"@webiny/data-transfer"`)
    .replaceAll(`'../../../index.js'`, `'@webiny/data-transfer'`)
    .replaceAll(`"../../../index.ts"`, `"@webiny/data-transfer"`)
    .replaceAll(`'../../../index.ts'`, `'@webiny/data-transfer'`);
}
//# sourceMappingURL=transformImports.js.map
