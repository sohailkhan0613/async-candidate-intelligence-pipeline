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

function runCommandCapture(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim());
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

async function pingWithLocalRedisCli(host, port, password) {
  if (!(await commandExists("redis-cli", ["--version"]))) {
    return null;
  }

  const args = ["-h", host, "-p", String(port)];
  if (password) {
    args.push("-a", password);
  }
  args.push("ping");

  try {
    const response = await runCommandCapture("redis-cli", args);
    return response === "PONG";
  } catch {
    return false;
  }
}

async function pingWithDockerRedis() {
  const hasDockerCompose = await commandExists("docker", ["compose", "version"]);
  if (hasDockerCompose) {
    try {
      const response = await runCommandCapture("docker", ["compose", "exec", "-T", "redis", "redis-cli", "ping"]);
      return response === "PONG";
    } catch {
      return false;
    }
  }

  const hasDockerComposeLegacy = await commandExists("docker-compose", ["version"]);
  if (!hasDockerComposeLegacy) {
    return null;
  }

  try {
    const response = await runCommandCapture("docker-compose", ["exec", "-T", "redis", "redis-cli", "ping"]);
    return response === "PONG";
  } catch {
    return false;
  }
}

async function redisPing(host, port, password) {
  const localPing = await pingWithLocalRedisCli(host, port, password);
  if (localPing === true) {
    return { ok: true, method: "redis-cli" };
  }

  const dockerPing = await pingWithDockerRedis();
  if (dockerPing === true) {
    return { ok: true, method: "docker compose exec redis redis-cli ping" };
  }

  if (localPing === false || dockerPing === false) {
    return { ok: false, method: "redis-cli" };
  }

  const tcpOk = await canConnect(host, port);
  return { ok: tcpOk, method: "tcp" };
}

async function waitForRedis(host, port, password, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ping = await redisPing(host, port, password);
    if (ping.ok) {
      return ping;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`Redis ping failed at ${host}:${port} after ${timeoutMs / 1000}s`);
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

async function ensureRedis(host, port, password) {
  let ping = await redisPing(host, port, password);
  if (ping.ok) {
    log(`Redis already running (${ping.method}) → PONG`);
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

  log(`Waiting for redis-cli ping at ${host}:${port}...`);
  ping = await waitForRedis(host, port, password);
  log(`Redis is ready (${ping.method}) → PONG`);
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
  const redisPassword = process.env.REDIS_PASSWORD ?? fileEnv.REDIS_PASSWORD ?? "";
  const databasePath = process.env.DATABASE_PATH ?? fileEnv.DATABASE_PATH ?? "./data/pipeline.db";

  process.env.REDIS_HOST = redisHost;
  process.env.REDIS_PORT = String(redisPort);
  process.env.DATABASE_PATH = databasePath;
  if (redisPassword) {
    process.env.REDIS_PASSWORD = redisPassword;
  }

  ensureDataDirectory(databasePath);
  await ensureRedis(redisHost, redisPort, redisPassword);
  startDevServer();
}

main().catch((error) => {
  warn(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
