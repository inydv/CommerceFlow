import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// We invoke only the known Node.js executable.
// No user-controlled shell command.
//
// WHY: exec(`some-command ${userInput}`) can expose
// shell-injection vulnerabilities if input is untrusted.
const executable = process.execPath;

// Arguments are explicitly separated.
// No shell interpretation needed.
const args = ["--version"];

try {
  const result = await execFileAsync(executable, args, {
    // Timeout bounds execution.
    // WITHOUT THIS: Hung child process can hold resources.
    timeout: 3000,

    // Bound stdout/stderr memory.
    maxBuffer: 64 * 1024,

    // Explicitly disable shell execution.
    shell: false,
  });

  console.log({
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  });
} catch (error) {
  console.error({
    message: error.message,
    code: error.code,
  });

  process.exitCode = 1;
}
