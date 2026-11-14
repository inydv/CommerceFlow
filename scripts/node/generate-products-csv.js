import { mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { performance } from "node:perf_hooks";

const FILE_PATH = new URL("../../data/products-report.csv", import.meta.url);

const TOTAL_PRODUCTS = 100_000;

// Generate one row at a time instead of storing all rows in an array.
// Ek limitation: Humare dummy data mein commas ya quotes wali product names nahi hain.
// Real CSV export mein fields ko properly escape karna zaruri hoga;
// uske liye hum dedicated CSV serializer use karenge.
// async function* asynchronous generator define karta hai.
async function* generateProducts() {
  yield "id,name,category,price,stock\n";

  for (let id = 1; id <= TOTAL_PRODUCTS; id++) {
    const row = `${id},Product ${id},Electronics,${1000 + (id % 10000)},${id % 100}\n`;

    yield row;
  }
}

const main = async () => {
  const start = performance.now();

  // Make sure the data directory exists.
  await mkdir(new URL("../../data/", import.meta.url), {
    recursive: true,
  });

  // Convert generated rows into a Readable Stream.
  const source = Readable.from(generateProducts());

  // Write rows to a CSV file.
  const destination = createWriteStream(FILE_PATH);

  // Readable se Writable tak data transfer karta hai, flow control aur stream errors handle karta hai.
  await pipeline(source, destination);

  const info = await stat(FILE_PATH);

  console.log("CSV generated successfully");
  console.log("Rows:", TOTAL_PRODUCTS);
  console.log("Size MB:", (info.size / 1024 / 1024).toFixed(2));
  console.log("Time ms:", Math.round(performance.now() - start));
};

main().catch((error) => {
  console.error("CSV generation failed:", error);
  process.exitCode = 1;
});
