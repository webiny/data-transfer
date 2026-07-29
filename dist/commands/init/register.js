import { handler } from "./handler.js";
export function registerInitCommand(yargs) {
  return yargs.command(
    "init <project-name>",
    "Scaffold a new data transfer project",
    yargs => {
      return yargs
        .positional("project-name", {
          type: "string",
          demandOption: true,
          description: "Name of the project directory to create"
        })
        .option("preset", {
          type: "string",
          description: "Preset to use (skip interactive prompt)"
        })
        .option("pm", {
          type: "string",
          choices: ["yarn", "npm", "pnpm"],
          description: "Package manager (skip interactive prompt)"
        });
    },
    async argv => {
      await handler({
        projectName: argv["project-name"],
        preset: argv.preset,
        pm: argv.pm
      });
    }
  );
}
//# sourceMappingURL=register.js.map
