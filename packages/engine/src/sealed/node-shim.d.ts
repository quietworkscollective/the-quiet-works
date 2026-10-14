/**
 * The engine is browser code and compiles without Node typings. Two places run under Node and need
 * a few of its APIs: the sealing-script test and the sealed-plaintext hook in content.check.test.ts.
 * This declares only what they call, so the engine stays free of a Node type dependency.
 */
declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function mkdtempSync(prefix: string): string;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function statSync(path: string): { isDirectory(): boolean };
  export function writeFileSync(path: string, data: string, options?: { mode?: number }): void;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  export function join(...segments: string[]): string;
  export function resolve(...segments: string[]): string;
  export function dirname(path: string): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}

declare module 'node:child_process' {
  export interface SpawnSyncResult {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
  }
  export function spawnSync(
    command: string,
    args: readonly string[],
    options: { cwd?: string; env?: Record<string, string | undefined>; encoding: 'utf8' },
  ): SpawnSyncResult;
}

declare const process: {
  readonly env: Record<string, string | undefined>;
  readonly execPath: string;
};

interface ImportMeta {
  readonly url: string;
}
