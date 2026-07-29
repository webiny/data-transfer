import type { InitOptions } from "../types.ts";

export function printNextSteps(options: InitOptions): void {
    console.log(`\nProject created at ./${options.projectName}\n`);
    console.log(`Next steps:\n`);
    console.log(`  cd ${options.projectName}`);
    console.log(`  cp .env.example .env    # fill in your AWS config`);
    console.log(`  yarn transfer           # run the migration\n`);
}
