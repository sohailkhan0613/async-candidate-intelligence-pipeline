import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(rootDir, ".env");
const envExamplePath = resolve(rootDir, ".env.example");

function log(message) {
  process.stdout.write(`${message}\n`);
}

function warn(message) {
  process.stderr.write(`${message}\n`);
}

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }
  const values = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    values[key] = value;
  }
  return values;
}

function ensureEnvFile() {
  if (!existsSync(envPath)) {
    if (!existsSync(envExamplePath)) {
      throw new Error("Missing .env.example. Cannot bootstrap environment.");
    }
    copyFileSync(envExamplePath, envPath);
    log("Created .env from .env.example");
  } else {
    log("Using existing .env");
  }
}

function ensureDataDirectory(databasePath) {
  if (databasePath === ":memory:") {
    return;
  }
  mkdirSync(dirname(resolve(rootDir, databasePath)), { recursive: true });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: options.stdio ?? "inherit",
      shell: false,
      env: { ...process.env, ...options.env }
    });

    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function commandExists(command, args) {
  try {
    await runCommand(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function canConnect(host, port) {
  return new Promise((resolvePromise) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.end();
      resolvePromise(true);
    });
    socket.on("error", () => resolvePromise(false));
    socket.setTimeout(1_000, () => {
      socket.destroy();
      resolvePromise(false);
    });
  });
}

async function waitForRedis(host, port, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canConnect(host, port)) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`Redis not reachable at ${host}:${port} after ${timeoutMs / 1000}s`);
}

async function startRedisWithDocker() {
  const hasDockerCompose = await commandExists("docker", ["compose", "version"]);
  const hasDockerComposeLegacy = hasDockerCompose ? false : await commandExists("docker-compose", ["version"]);

  if (!hasDockerCompose && !hasDockerComposeLegacy) {
    return false;
  }

  log("Starting Redis with Docker Compose...");
  if (hasDockerCompose) {
    await runCommand("docker", ["compose", "up", "-d", "redis"]);
  } else {
    await runCommand("docker-compose", ["up", "-d", "redis"]);
  }
  return true;
}

async function ensureRedis(host, port) {
  if (await canConnect(host, port)) {
    log(`Redis already running at ${host}:${port}`);
    return;
  }

  const startedWithDocker = await startRedisWithDocker();
  if (!startedWithDocker) {
    warn(
      [
        "Docker is not available and Redis is not running.",
        "Install Docker Desktop, or start Redis manually, then run npm run dev again.",
        "  brew install redis && brew services start redis",
        "  redis-cli ping  # should return PONG"
      ].join("\n")
    );
    process.exit(1);
  }

  log(`Waiting for Redis at ${host}:${port}...`);
  await waitForRedis(host, port);
  log("Redis is ready");
}

function startDevServer() {
  log("Starting API and workers...");
  const child = spawn("npx", ["tsx", "watch", "src/server.ts"], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env
  });

  const shutdown = () => {
    child.kill("SIGTERM");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function main() {
  process.chdir(rootDir);
  ensureEnvFile();

  const fileEnv = loadEnvFile(envPath);
  const redisHost = process.env.REDIS_HOST ?? fileEnv.REDIS_HOST ?? "127.0.0.1";
  const redisPort = Number(process.env.REDIS_PORT ?? fileEnv.REDIS_PORT ?? "6379");
  const databasePath = process.env.DATABASE_PATH ?? fileEnv.DATABASE_PATH ?? "./data/pipeline.db";

  process.env.REDIS_HOST = redisHost;
  process.env.REDIS_PORT = String(redisPort);
  process.env.DATABASE_PATH = databasePath;

  ensureDataDirectory(databasePath);
  await ensureRedis(redisHost, redisPort);
  startDevServer();
}

main().catch((error) => {
  warn(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
