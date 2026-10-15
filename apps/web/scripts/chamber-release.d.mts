import type { ChamberEntry } from '@tqw/engine';

export const REPO_ROOT: string;
export function chambersForBuild(root?: string, development?: boolean): ChamberEntry[];
export function sourceConstant(root: string, relativePath: string, name: string): unknown;
