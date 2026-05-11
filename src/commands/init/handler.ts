import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Container } from "@webiny/di";
import { LoggerFeature } from "~/tools/Logger/index.ts";
import { DirectoryTool, DirectoryToolFeature } from "~/tools/DirectoryTool/index.ts";
import { FileTool, FileToolFeature } from "~/tools/FileTool/index.ts";

export async function handler(folderName: string): Promise<void> {
    const container = new Container();
    LoggerFeature.register(container, {
        logLevel: "debug",
        json: false
    });
    DirectoryToolFeature.register(container);
    FileToolFeature.register(container);

    const dirTool = container.resolve(DirectoryTool);
    const fileTool = container.resolve(FileTool);

    const targetDir = resolve(process.cwd(), folderName);

    if (dirTool.exists(targetDir)) {
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

    if (!dirTool.exists(templatesDir)) {
        throw new Error(`Templates directory not found at ${templatesDir}`);
    }

    dirTool.copyOrThrow(templatesDir, targetDir);

    const tplPath = join(targetDir, "package.json.tpl");
    const tplContent = fileTool.readFileOrThrow(tplPath);
    const packageJson = tplContent.replace("{{PROJECT_NAME}}", basename(folderName));
    fileTool.writeFileOrThrow(join(targetDir, "package.json"), packageJson);
    fileTool.remove(tplPath);

    console.log(`\nCreated "${folderName}" with the following structure:\n`);
    console.log(`  ${folderName}/`);
    console.log(`  ├── package.json`);
    console.log(
        `  ├── tsconfig.json        # TypeScript config for your transformers / presets / configs`
    );
    console.log(`  ├── README.md`);
    console.log(`  ├── AGENTS.md            # project guide for you + any AI agents`);
    console.log(`  ├── CLAUDE.md            # pointer at AGENTS.md`);
    console.log(`  ├── .claude/skills/      # Claude skills for writing configs + presets`);
    console.log(`  ├── .gitignore`);
    console.log(`  ├── .env.example`);
    console.log(`  ├── projects/`);
    console.log(`  │   └── example/`);
    console.log(`  │       ├── config.ts`);
    console.log(`  │       ├── setup.ts            # optional custom DI wiring`);
    console.log(`  │       ├── models/             # custom CMS model JSON overrides`);
    console.log(`  │       └── .env.example`);
    console.log(`  ├── transformers/`);
    console.log(`  ├── presets/`);
    console.log(`  └── features/\n`);
    console.log(`Next steps:\n`);
    console.log(`  cd ${folderName}`);
    console.log(`  yarn install          # or npm install`);
    console.log(`  cp projects/example/.env.example projects/example/.env`);
    console.log(`  # Edit projects/example/.env with your AWS credentials`);
    console.log(`  yarn transfer --config=./projects/example/config.ts\n`);
}
