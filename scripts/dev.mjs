import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
const args = process.argv.slice(2),
  port = args.indexOf("--port");
const chosenPort = port >= 0 ? args[port + 1] : process.env.PORT || "3000";
console.log(`\n  Seu computador: http://localhost:${chosenPort}`);
const displayed = new Set();
for (const [name, addresses] of Object.entries(networkInterfaces())) {
  for (const address of addresses ?? []) {
    if (address.family !== "IPv4" || address.internal || displayed.has(address.address)) continue;
    displayed.add(address.address);
    console.log(`  Rede (${name}): http://${address.address}:${chosenPort}`);
  }
}
console.log("  Acesso pela rede exige que os computadores consigam se comunicar.\n");
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "0.0.0.0",
    "--port",
    chosenPort,
  ],
  { stdio: "inherit", env: { ...process.env, EST_DEV_PORT: chosenPort } },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
