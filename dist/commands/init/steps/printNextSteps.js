export function printNextSteps(options) {
  const run = formatRunCommand(options.packageManager);
  console.log(`\nProject created at ./${options.projectName}\n`);
  console.log(`Next steps:\n`);
  console.log(`  cd ${options.projectName}`);
  console.log(`  cp .env.example .env    # fill in your AWS config`);
  console.log(`  ${run} transfer           # run the migration\n`);
}
function formatRunCommand(pm) {
  switch (pm) {
    case "yarn":
      return "yarn";
    case "pnpm":
      return "pnpm";
    default:
      return "npm run";
  }
}
//# sourceMappingURL=printNextSteps.js.map
