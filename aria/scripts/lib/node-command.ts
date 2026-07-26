import { spawn, spawnSync, type StdioOptions } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

type PackageManifest = {
  bin?: string | Record<string, string>;
};

export type CommandResult = Readonly<{
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: Error;
}>;

export type CommandOptions = Readonly<{
  allowFailure?: boolean;
  cwd?: string;
  encoding?: BufferEncoding;
  env?: NodeJS.ProcessEnv;
  input?: string | Buffer;
  maxBuffer?: number;
  signal?: AbortSignal;
  stdio?: StdioOptions;
}>;

function commandEnvironment(overrides?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...process.env, ...overrides };
}

function packageManifestPath(packageName: string, cwd = process.cwd()): string {
  try {
    return require.resolve(`${packageName}/package.json`, { paths: [cwd] });
  } catch (cause) {
    throw new Error(
      `Unable to resolve ${packageName}. Run \`npm install\` in ${cwd} and try again.`,
      { cause },
    );
  }
}

export function resolvePackageBin(
  packageName: string,
  binName?: string,
  cwd = process.cwd(),
): string {
  const manifestPath = packageManifestPath(packageName, cwd);
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8"),
  ) as PackageManifest;
  const declaredBin = manifest.bin;
  const defaultBinName = packageName.split("/").at(-1);
  const relativeBin =
    typeof declaredBin === "string"
      ? declaredBin
      : declaredBin?.[binName ?? defaultBinName ?? packageName];

  if (!relativeBin) {
    throw new Error(
      `Package ${packageName} does not declare the ${binName ?? defaultBinName ?? packageName} binary.`,
    );
  }

  const resolvedBin = resolve(dirname(manifestPath), relativeBin);
  if (!existsSync(resolvedBin)) {
    throw new Error(
      `Package ${packageName} declares a missing binary at ${resolvedBin}. Run \`npm install\` and try again.`,
    );
  }
  return resolvedBin;
}

export function resolveNpmCli(env: NodeJS.ProcessEnv = process.env): string {
  const candidates = [
    env.npm_execpath,
    resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    resolve(
      dirname(process.execPath),
      "../lib/node_modules/npm/bin/npm-cli.js",
    ),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const npmCli = candidates.find((candidate) => existsSync(candidate));
  if (!npmCli) {
    throw new Error(
      "Unable to resolve npm's JavaScript CLI. Run this command through an npm script.",
    );
  }
  return npmCli;
}

function formatFailure(args: readonly string[]): string {
  return `Command failed: ${process.execPath} ${args.join(" ")}`;
}

export function runNodeArgsSync(
  args: readonly string[],
  options: CommandOptions = {},
): CommandResult {
  const encoding = options.encoding ?? "utf8";
  const result = spawnSync(process.execPath, [...args], {
    cwd: options.cwd ?? process.cwd(),
    encoding,
    env: commandEnvironment(options.env),
    input: options.input,
    maxBuffer: options.maxBuffer,
    stdio: options.stdio ?? "inherit",
    windowsHide: true,
  });
  const commandResult: CommandResult = {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };

  if (!options.allowFailure) {
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const detail = commandResult.stderr.trim();
      throw new Error(
        detail ? `${formatFailure(args)}\n${detail}` : formatFailure(args),
      );
    }
  }
  return commandResult;
}

export async function runNodeArgs(
  args: readonly string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  const stdio = options.stdio ?? "inherit";
  const child = spawn(process.execPath, [...args], {
    cwd: options.cwd ?? process.cwd(),
    env: commandEnvironment(options.env),
    signal: options.signal,
    stdio,
    windowsHide: true,
  });
  const maxBuffer = options.maxBuffer ?? 20 * 1024 * 1024;
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let outputBytes = 0;
  let overflowError: Error | undefined;

  const collect = (target: Buffer[], chunk: Buffer | string) => {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    outputBytes += value.byteLength;
    if (outputBytes > maxBuffer) {
      overflowError = new Error(
        `Command output exceeded ${maxBuffer} bytes: ${args[0] ?? process.execPath}`,
      );
      child.kill();
      return;
    }
    target.push(value);
  };
  child.stdout?.on("data", (chunk) => collect(stdoutChunks, chunk));
  child.stderr?.on("data", (chunk) => collect(stderrChunks, chunk));
  if (options.input !== undefined && child.stdin) {
    child.stdin.end(options.input);
  }

  const commandResult = await new Promise<CommandResult>((resolveResult) => {
    let spawnError: Error | undefined;
    child.on("error", (error) => {
      spawnError = error;
    });
    child.on("close", (status, signal) => {
      resolveResult({
        status,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString(
          options.encoding ?? "utf8",
        ),
        stderr: Buffer.concat(stderrChunks).toString(
          options.encoding ?? "utf8",
        ),
        error: overflowError ?? spawnError,
      });
    });
  });

  if (!options.allowFailure) {
    if (commandResult.error) throw commandResult.error;
    if (commandResult.status !== 0) {
      const detail = commandResult.stderr.trim();
      throw new Error(
        detail ? `${formatFailure(args)}\n${detail}` : formatFailure(args),
      );
    }
  }
  return commandResult;
}

export function runNodeFileSync(
  entrypoint: string,
  args: readonly string[] = [],
  options: CommandOptions = {},
): CommandResult {
  return runNodeArgsSync([entrypoint, ...args], options);
}

export function runNodeFile(
  entrypoint: string,
  args: readonly string[] = [],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return runNodeArgs([entrypoint, ...args], options);
}

export function runPackageBinSync(
  packageName: string,
  binName: string,
  args: readonly string[] = [],
  options: CommandOptions = {},
): CommandResult {
  return runNodeFileSync(
    resolvePackageBin(packageName, binName, options.cwd),
    args,
    options,
  );
}

export function runPackageBin(
  packageName: string,
  binName: string,
  args: readonly string[] = [],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return runNodeFile(
    resolvePackageBin(packageName, binName, options.cwd),
    args,
    options,
  );
}

export function runTypeScriptSync(
  script: string,
  args: readonly string[] = [],
  options: CommandOptions = {},
): CommandResult {
  resolvePackageBin("tsx", "tsx", options.cwd);
  return runNodeArgsSync(
    ["--import", "tsx", resolve(options.cwd ?? process.cwd(), script), ...args],
    options,
  );
}

export function runTypeScript(
  script: string,
  args: readonly string[] = [],
  options: CommandOptions = {},
): Promise<CommandResult> {
  resolvePackageBin("tsx", "tsx", options.cwd);
  return runNodeArgs(
    ["--import", "tsx", resolve(options.cwd ?? process.cwd(), script), ...args],
    options,
  );
}

export function runNpmCli(
  args: readonly string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return runNodeFile(
    resolveNpmCli(commandEnvironment(options.env)),
    args,
    options,
  );
}

function normalizedPath(pathname: string, platform: NodeJS.Platform): string {
  let normalized: string;
  try {
    normalized = realpathSync.native(pathname);
  } catch {
    normalized = resolve(pathname);
  }
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function isMainModule(
  moduleUrl: string,
  argvPath = process.argv[1],
  platform: NodeJS.Platform = process.platform,
): boolean {
  return Boolean(
    argvPath &&
    normalizedPath(argvPath, platform) ===
      normalizedPath(fileURLToPath(moduleUrl), platform),
  );
}
