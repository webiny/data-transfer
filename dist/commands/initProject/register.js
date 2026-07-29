import { handler } from "./handler.js";
export function registerInitProjectCommand(yargs) {
  return yargs.command(
    "init-project <name>",
    "Scaffold a new project in the projects/ directory",
    yargs => {
      return yargs.positional("name", {
        type: "string",
        demandOption: true,
        description: "Name of the project folder to create under projects/"
      });
    },
    async argv => {
      await handler(argv.name);
    }
  );
}
//# sourceMappingURL=register.js.map
