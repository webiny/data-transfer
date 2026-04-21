import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import dynalite from "dynalite";

export interface DynaliteOptions {
    /** Time (ms) tables stay in CREATING state. Default: 0 (active immediately). */
    createTableMs?: number;
    /** Time (ms) tables stay in DELETING state. Default: 0. */
    deleteTableMs?: number;
}

export interface DynaliteInstance {
    endpoint: string;
    port: number;
    stop(): Promise<void>;
}

/**
 * Start an in-memory dynalite HTTP server on a free port.
 *
 * Intended use: per-suite (beforeAll → startDynalite; afterAll → stop).
 * In-memory dynalite boots in milliseconds, so spinning one per suite is
 * cheap and avoids cross-test state leak. Tables created inside the server
 * live until stop() — if two tests in the same suite want clean slates,
 * use distinct table names rather than restarting the server.
 *
 * Returns the absolute endpoint, the bound port, and a stop() hook.
 */
export async function startDynalite(options: DynaliteOptions = {}): Promise<DynaliteInstance> {
    const port = await pickFreePort();
    const server = dynalite({
        createTableMs: options.createTableMs ?? 0,
        deleteTableMs: options.deleteTableMs ?? 0
    });

    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, () => {
            server.off("error", reject);
            resolve();
        });
    });

    return {
        endpoint: `http://127.0.0.1:${port}`,
        port,
        stop: () =>
            new Promise<void>((resolve, reject) => {
                server.close(err => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                });
            })
    };
}

async function pickFreePort(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        const probe = createServer();
        probe.once("error", reject);
        probe.listen(0, () => {
            const address = probe.address() as AddressInfo | null;
            if (!address) {
                probe.close();
                reject(new Error("pickFreePort: failed to acquire port"));
                return;
            }
            const port = address.port;
            probe.close(err => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(port);
            });
        });
    });
}
