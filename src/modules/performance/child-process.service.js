import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Run a fixed, trusted script in a separate process.
// Do not accept arbitrary commands from an HTTP request.
export const runReportProcess = () => {
  return new Promise((resolve, reject) => {
    // Use the same Node.js executable as the current process.
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../workers/report-process.js", import.meta.url),
        ),
      ],
      {
        // Do not execute commands through a shell.
        shell: false,

        // Connect to the child's standard output and error streams.
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let output = "";
    let errorOutput = "";
    let failure = null;

    // Limit how much output we retain in memory.
    const MAX_OUTPUT = 100_000;

    // stdout contains normal logs from the child.
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();

      if (output.length > MAX_OUTPUT) {
        failure = new Error("Child output limit exceeded");
        child.kill();
      }
    });

    // stderr contains error messages.
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();

      if (errorOutput.length > MAX_OUTPUT) {
        failure = new Error("Child error output limit exceeded");
        child.kill();
      }
    });

    // Handle errors when starting the process.
    child.on("error", (error) => {
      failure = error;
    });

    // close fires after the process and its stdio streams close.
    child.on("close", (code) => {
      if (failure) {
        return reject(failure);
      }

      if (code !== 0) {
        return reject(
          new Error(`Child failed: ${errorOutput || `exit ${code}`}`),
        );
      }

      resolve({
        processId: child.pid,
        output: output.trim(),
        exitCode: code,
      });
    });
  });
};
