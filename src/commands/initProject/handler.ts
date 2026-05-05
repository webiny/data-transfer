import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Container } from "@webiny/di";
import { LoggerFeature } from "~/tools/Logger/index.ts";
import { DirectoryTool, DirectoryToolFeature } from "~/tools/DirectoryTool/index.ts";
import { FileTool, FileToolFeature } from "~/tools/FileTool/index.ts";

export async function handler(projectName: string): Promise<void> {
    const container = new Container();
    LoggerFeature.register(container, { logLevel: "debug", json: false });
    DirectoryToolFeature.register(container);
    FileToolFeature.register(container);

    const dirTool = container.resolve(DirectoryTool);
    const fileTool = container.resolve(FileTool);

    const targetDir = resolve(process.cwd(), "projects", projectName);

    if (dirTool.exists(targetDir)) {
        throw new Error(`Project "projects/${projectName}" already exists.`);
    }

    const templatesDir = resolve(
        fileURLToPath(import.meta.url),
        "..",
        "..",
        "..",
        "..",
        "templates",
        "internal-project"
    );

    if (!dirTool.exists(templatesDir)) {
        throw new Error(`Internal project templates not found at ${templatesDir}`);
    }

    dirTool.copyOrThrow(templatesDir, targetDir);

    for (const filename of [".env.example", "README.md"]) {
        const filePath = join(targetDir, filename);
        const content = fileTool.readFileOrThrow(filePath);
        fileTool.writeFileOrThrow(filePath, content.replace(/\{\{PROJECT_NAME\}\}/g, projectName));
    }

    console.log(`\nCreated "projects/${projectName}" with the following structure:\n`);
    console.log(`  projects/${projectName}/`);
    console.log(`  ├── README.md`);
    console.log(`  ├── ddb.transfer.config.ts`);
    console.log(`  ├── os.transfer.config.ts`);
    console.log(`  ├── .env.example`);
    console.log(`  ├── models/`);
    console.log(`  └── presets/\n`);
    console.log(`Note: projects/${projectName}/ is gitignored — credentials stay local.\n`);
    console.log(`Next steps:\n`);
    console.log(`  cp projects/${projectName}/.env.example projects/${projectName}/.env`);
    console.log(`  # Edit projects/${projectName}/.env with your AWS credentials`);
    console.log(`  yarn dev --config=./projects/${projectName}/ddb.transfer.config.ts\n`);
}
