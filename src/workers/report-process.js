// This script will execute in a separate Node.js process.

// Simulate five report processing steps.
for (let step = 1; step <= 5; step++) {
  // Wait asynchronously for 500 milliseconds.
  await new Promise((resolve) => setTimeout(resolve, 500));

  // stdout sends normal output to the parent process.
  console.log(`Report step ${step}/5 completed`);
}

// End the script successfully.
console.log("Report generation finished");
