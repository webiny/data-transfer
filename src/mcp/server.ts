import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverDocs, buildCatalog, type Doc } from "./discoverDocs.ts";

const thisDir = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_DOCS_DIR =
    [
        join(thisDir, "../docs/mcp"), // production (dist/mcp/ → dist/docs/mcp)
        join(thisDir, "../../docs/mcp") // dev (src/mcp/ → docs/mcp)
    ].find(existsSync) ?? join(thisDir, "../docs/mcp");

export async function startMcpServer(docsDirs?: string[]): Promise<void> {
    const dirs = docsDirs ?? [DEFAULT_DOCS_DIR];
    let docsCache: Map<string, Doc> | null = null;

    function getDocs(): Map<string, Doc> {
        if (!docsCache) {
            docsCache = discoverDocs(dirs);
        }
        return docsCache;
    }

    const server = new McpServer({ name: "webiny-data-transfer", version: "1.0.0" });

    server.registerTool(
        "list_topics",
        {
            title: "List Data Transfer Topics",
            description:
                "Returns a catalog of all available @webiny/data-transfer documentation topics. " +
                "Call this first to discover what topics are available, then use get_topic to read the full documentation for a specific topic. " +
                "Topics cover: presets, transformers, processors, scanners, filters, config, pipeline runtime, and how to write custom components.",
            inputSchema: {},
            annotations: { readOnlyHint: true }
        },
        async () => ({
            content: [{ type: "text" as const, text: buildCatalog(getDocs()) }]
        })
    );

    server.registerTool(
        "get_topic",
        {
            title: "Get Data Transfer Topic",
            description:
                "Returns the full documentation for a specific @webiny/data-transfer topic. " +
                "Use exact topic names from list_topics.",
            inputSchema: {
                topic: z.string().describe("Topic name — use exact names from list_topics")
            },
            annotations: { readOnlyHint: true }
        },
        async ({ topic }) => {
            const docs = getDocs();
            const doc = docs.get(topic);

            if (!doc) {
                const available = [...docs.keys()].sort().join(", ");
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Topic "${topic}" not found. Available topics: ${available}`
                        }
                    ]
                };
            }

            return {
                content: [{ type: "text" as const, text: doc.body }]
            };
        }
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
}
