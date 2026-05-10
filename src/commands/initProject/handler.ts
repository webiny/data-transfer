import { resolve } from "node:path";
import { scaffoldProject } from "./scaffoldProject.ts";

export async function handler(projectName: string): Promise<void> {
    await scaffoldProject({ name: projectName, cwd: resolve(process.cwd()) });

    console.log(`\nCreated "projects/${projectName}" with the following structure:\n`);
    console.log(`  projects/${projectName}/`);
    console.log(`  ├── README.md`);
    console.log(`  ├── ddb.transfer.config.ts`);
    console.log(`  ├── os.transfer.config.ts`);
    console.log(`  ├── .env.example`);
    console.log(`  ├── models/`);
    console.log(`  └── presets/\n`);
    console.log(`Note: projects/${projectName}/ is gitignored — credentials stay local.\n`);
    console.log(`Next steps (guided setup — recommended):\n`);
    console.log(`  1. Place one of these pairs in projects/${projectName}/:`);
    console.log(`       source.webiny.json + target.webiny.json`);
    console.log(`         (from: yarn webiny output core --json  in each Webiny project)`);
    console.log(`       source.pulumi.json + target.pulumi.json`);
    console.log(`         (from: .pulumi/apps/core/.pulumi/stacks/core/<env>.json)`);
    console.log(`     Mixed formats (e.g. source.webiny.json + target.pulumi.json) are allowed.\n`);
    console.log(`  2. Run the wizard — it validates the JSON files and writes .env:`);
    console.log(`       yarn dev\n`);
    console.log(`  3. Review projects/${projectName}/.env, then run again:`);
    console.log(`       yarn dev\n`);
    console.log(`To set up manually instead:`);
    console.log(`  cp projects/${projectName}/.env.example projects/${projectName}/.env`);
    console.log(`  # Edit .env — fill in region, table names, and AWS credentials`);
    console.log(`  yarn dev --config=./projects/${projectName}/ddb.transfer.config.ts\n`);
}
