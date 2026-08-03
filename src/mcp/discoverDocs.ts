import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import fm from "front-matter";

interface Doc {
    name: string;
    description: string;
    category: string;
    filePath: string;
    body: string;
}

function findMarkdownFiles(dir: string): string[] {
    const results: string[] = [];

    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);

        if (stat.isDirectory()) {
            results.push(...findMarkdownFiles(full));
        } else if (entry.endsWith(".md")) {
            results.push(full);
        }
    }

    return results;
}

function parseDoc(filePath: string): Doc | null {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = fm<{ name?: string; description?: string; category?: string }>(raw);

    if (!parsed.attributes.name || !parsed.attributes.description) {
        return null;
    }

    return {
        name: parsed.attributes.name,
        description: parsed.attributes.description,
        category: parsed.attributes.category ?? "general",
        filePath,
        body: parsed.body
    };
}

export function discoverDocs(dirs: string[]): Map<string, Doc> {
    const docs = new Map<string, Doc>();

    for (const dir of dirs) {
        for (const file of findMarkdownFiles(dir)) {
            const doc = parseDoc(file);
            if (doc && !docs.has(doc.name)) {
                docs.set(doc.name, doc);
            }
        }
    }

    return docs;
}

export function buildCatalog(docs: Map<string, Doc>): string {
    const byCategory = new Map<string, Doc[]>();

    for (const doc of docs.values()) {
        const list = byCategory.get(doc.category) ?? [];
        list.push(doc);
        byCategory.set(doc.category, list);
    }

    const lines: string[] = ["# Available Topics\n"];

    for (const [category, categoryDocs] of [...byCategory.entries()].sort((a, b) =>
        a[0].localeCompare(b[0])
    )) {
        lines.push(`## ${category}\n`);
        lines.push("| Topic | Description |");
        lines.push("|-------|-------------|");

        for (const doc of categoryDocs.sort((a, b) => a.name.localeCompare(b.name))) {
            lines.push(`| ${doc.name} | ${doc.description} |`);
        }

        lines.push("");
    }

    return lines.join("\n");
}

export type { Doc };
