/**
 * Verifies that every combination in versions.json has a real wheel
 * on GitHub releases. Checks both flash-attn and PyTorch wheel availability.
 *
 * Usage: npx tsx scripts/verify-wheels.ts
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, "../src/data/versions.json");

const data = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
const { pythonVersions, cudaVersions, pytorchVersions } = data;

const headers: Record<string, string> = {
  "User-Agent": "flash-attn-wheel-verifier",
};
if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

// Rate limiting
const CONCURRENCY = 10;
const DELAY_MS = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CheckResult {
  python: string;
  cuda: string;
  pytorch: string;
  flash: string;
  wheelUrl: string;
  status: "ok" | "missing" | "error";
  httpStatus?: number;
}

function buildFlashWheelUrl(
  flashVersion: string,
  _cudaVersion: string,
  pytorchVersion: string,
  pythonVersion: string
): string {
  const cp = `cp${pythonVersion.replace(".", "")}`;
  const torchMinor = pytorchVersion.split(".").slice(0, 2).join(".");
  // Use the cudaTag from versions.json for this pytorch version
  const pt = data.pytorchVersions.find((p: any) => p.value === pytorchVersion);
  const cudaTag = pt?.cudaTag || "cu12";
  return `https://github.com/Dao-AILab/flash-attention/releases/download/v${flashVersion}/flash_attn-${flashVersion}%2B${cudaTag}torch${torchMinor}cxx11abiTRUE-${cp}-${cp}-linux_x86_64.whl`;
}

async function checkUrl(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: "HEAD", headers, redirect: "follow" });
    return res.status;
  } catch {
    return 0;
  }
}

// ── Build all valid combinations ──

function getAllCombinations(): {
  python: string;
  cuda: string;
  pytorch: string;
  flash: string;
}[] {
  const combos: { python: string; cuda: string; pytorch: string; flash: string }[] = [];

  for (const py of pythonVersions) {
    const pyTorchMinors: string[] | undefined = py.torch;

    for (const cuda of cudaVersions) {
      // Skip if CUDA not compatible with Python
      if (!py.cuda.includes(cuda.value)) continue;

      for (const torchVer of cuda.torch) {
        // Skip if PyTorch not compatible with Python
        if (pyTorchMinors) {
          const minor = torchVer.split(".").slice(0, 2).join(".");
          if (!pyTorchMinors.includes(minor)) continue;
        }

        // Find flash version for this pytorch
        const pt = pytorchVersions.find((p: any) => p.value === torchVer);
        if (!pt) continue;

        combos.push({
          python: py.value,
          cuda: cuda.value,
          pytorch: torchVer,
          flash: pt.flash,
        });
      }
    }
  }

  return combos;
}

async function main() {
  const combos = getAllCombinations();
  console.log(`Checking ${combos.length} combinations...\n`);

  const results: CheckResult[] = [];
  let checked = 0;
  let ok = 0;
  let missing = 0;
  let errors = 0;

  // Deduplicate URLs (same wheel can be reached by different CUDA minor versions)
  const urlMap = new Map<string, typeof combos[0]>();
  for (const combo of combos) {
    const url = buildFlashWheelUrl(combo.flash, combo.cuda, combo.pytorch, combo.python);
    if (!urlMap.has(url)) {
      urlMap.set(url, combo);
    }
  }

  console.log(`${urlMap.size} unique wheel URLs to check (deduplicated from ${combos.length} combos)\n`);

  const entries = [...urlMap.entries()];

  // Process in batches
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async ([url, combo]) => {
        const httpStatus = await checkUrl(url);
        const status = httpStatus === 200 || httpStatus === 302 ? "ok" : httpStatus === 0 ? "error" : "missing";
        return { ...combo, wheelUrl: url, status, httpStatus } as CheckResult;
      })
    );

    for (const r of batchResults) {
      results.push(r);
      checked++;
      if (r.status === "ok") ok++;
      else if (r.status === "missing") missing++;
      else errors++;
    }

    // Progress
    process.stdout.write(`\r  Checked ${checked}/${urlMap.size} — ${ok} ok, ${missing} missing, ${errors} errors`);
    await sleep(DELAY_MS);
  }

  console.log("\n");

  // ── Report ──
  if (missing > 0) {
    console.log(`\n⚠ MISSING WHEELS (${missing}):\n`);
    const missingResults = results.filter((r) => r.status === "missing");

    // Group by flash+torch combo
    const grouped = new Map<string, CheckResult[]>();
    for (const r of missingResults) {
      const key = `flash=${r.flash} torch=${r.pytorch}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r);
    }

    for (const [key, items] of grouped) {
      const pythons = [...new Set(items.map((i) => `cp${i.python.replace(".", "")}`))].join(", ");
      console.log(`  ${key} — missing for: ${pythons}`);
      console.log(`    ${items[0].wheelUrl}`);
      console.log(`    HTTP ${items[0].httpStatus}`);
      console.log();
    }
  }

  if (errors > 0) {
    console.log(`\n✗ ERRORS (${errors}):\n`);
    for (const r of results.filter((r) => r.status === "error")) {
      console.log(`  ${r.python} + ${r.cuda} + ${r.pytorch} → ${r.flash}`);
    }
  }

  // Summary
  console.log("─".repeat(60));
  console.log(`SUMMARY: ${ok} ok / ${missing} missing / ${errors} errors (${urlMap.size} unique URLs)`);

  if (missing > 0) {
    console.log("\nSome wheel URLs don't exist. These combos should be removed from versions.json");
    console.log("or the install command should fall back to building from source.");
    process.exit(1);
  } else {
    console.log("\nAll wheel URLs verified successfully!");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
