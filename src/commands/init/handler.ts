import { cp, readFile, writeFile, access, mkdir } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

export async function handler(folderName: string): Promise<void> {
    const targetDir = resolve(process.cwd(), folderName);

    if (await exists(targetDir)) {
        throw new Error(`Directory "${folderName}" already exists.`);
    }

    const templatesDir = resolve(
        fileURLToPath(import.meta.url),
        "..",
        "..",
        "..",
        "..",
        "templates"
    );

    if (!(await exists(templatesDir))) {
        throw new Error(`Templates directory not found at ${templatesDir}`);
    }

    await mkdir(targetDir, { recursive: true });

    await cp(templatesDir, targetDir, { recursive: true });

    const tplPath = join(targetDir, "package.json.tpl");
    const tplContent = await readFile(tplPath, "utf-8");
    const packageJson = tplContent.replace("{{PROJECT_NAME}}", basename(folderName));
    await writeFile(join(targetDir, "package.json"), packageJson, "utf-8");

    // Remove the template file after processing
    const { unlink } = await import("node:fs/promises");
    await unlink(tplPath);

    console.log(`\nCreated "${folderName}" with the following structure:\n`);
    console.log(`  ${folderName}/`);
    console.log(`  ├── package.json`);
    console.log(`  ├── README.md`);
    console.log(`  ├── .gitignore`);
    console.log(`  ├── .env.example`);
    console.log(`  ├── projects/`);
    console.log(`  │   └── example/`);
    console.log(`  │       ├── ddb.transfer.config.ts`);
    console.log(`  │       ├── os.transfer.config.ts`);
    console.log(`  │       ├── models/          # custom CMS model JSON overrides`);
    console.log(`  │       └── .env.example`);
    console.log(`  ├── transformers/`);
    console.log(`  ├── presets/`);
    console.log(`  └── features/\n`);
    console.log(`Next steps:\n`);
    console.log(`  cd ${folderName}`);
    console.log(`  yarn install          # or npm install`);
    console.log(`  cp projects/example/.env.example projects/example/.env`);
    console.log(`  # Edit projects/example/.env with your AWS credentials`);
    console.log(`  yarn transfer --config=./projects/example/ddb.transfer.config.ts\n`);
}

async function exists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}
