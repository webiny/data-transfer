# Documentation agent guidelines

This directory documents user-facing configuration points — abstractions users can override via `config.register` to customize transfer behavior.

## Adding a new configuration

1. Create `configurations/<AbstractionName>/README.md`.
2. Follow the structure used in `configurations/IndexConfigurationProvider/README.md`:
   - **Title** — abstraction name.
   - **When it runs** — where in the transfer lifecycle the abstraction is called and by whom.
   - **Default behavior** — what the built-in implementation does.
   - **Override example** — complete, copy-pasteable code showing a custom implementation class, `createImplementation`, and the `register` hook in config.
   - **Per-X configuration** — if the method receives a discriminator (index name, table name, etc.), show a branching example.
   - **API** — interface and type signatures.
   - **Source** — path to the feature directory.
3. Add a row to the table in `documentation/README.md`.

## Rules

- Examples must compile against the current public API (`src/index.ts`). If an export is missing, add it to the public API first.
- Show `createImplementation` with the correct abstraction — users register Implementation classes, not raw classes.
- Keep examples minimal — enough to demonstrate the override, not a production-ready solution.
- Do not duplicate AGENTS.md content from the project root. This file covers documentation conventions only.
