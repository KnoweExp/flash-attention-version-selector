/**
 * Scrapes GitHub releases for flash-attention and PyTorch wheel indexes
 * to build an up-to-date compatibility matrix.
 *
 * Usage: npx tsx scripts/update-versions.ts
 * Env:   GITHUB_TOKEN (optional, raises rate limit to 5000 req/h)
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, "../src/data/versions.json");

const FLASH_ATTN_REPO = "Dao-AILab/flash-attention";

// Known CUDA pip indexes for PyTorch
const CUDA_INDEXES = ["cu118", "cu121", "cu124", "cu126", "cu128"];

const headers: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "User-Agent": "flash-attn-version-scraper",
};
if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseCudaIndex(idx: string): string {
  // "cu118" -> "11.8", "cu121" -> "12.1", "cu128" -> "12.8"
  const major = idx.slice(2, -1);
  const minor = idx.slice(-1);
  return `${major}.${minor}`;
}

interface WheelInfo {
  flashVersion: string;
  cuda: string; // "cu12", "cu11" etc.
  torch: string; // "2.5", "2.6" etc (major.minor)
  python: string; // "3.11", "3.12" etc
}

function parseWheelFilename(filename: string): WheelInfo | null {
  // flash_attn-2.8.3+cu12torch2.5cxx11abiFALSE-cp311-cp311-linux_x86_64.whl
  const match = filename.match(
    /flash_attn-([^+]+)\+cu(\d+)torch([\d.]+)cxx11abi(?:TRUE|FALSE)-cp(\d+)-/
  );
  if (!match) return null;
  const [, flashVersion, cudaMajor, torchVersion, cpython] = match;
  const pyMajor = cpython.slice(0, 1);
  const pyMinor = cpython.slice(1);
  return {
    flashVersion,
    cuda: `cu${cudaMajor}`,
    torch: torchVersion,
    python: `${pyMajor}.${pyMinor}`,
  };
}

// ── GitHub API ───────────────────────────────────────────────────────

async function fetchAllReleases(): Promise<any[]> {
  const allReleases: any[] = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/repos/${FLASH_ATTN_REPO}/releases?per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.length === 0) break;
    allReleases.push(...data);
    page++;
  }
  return allReleases;
}

// ── PyTorch CUDA scraping ────────────────────────────────────────────

async function fetchPyTorchVersionsForCuda(
  cudaIndex: string
): Promise<string[]> {
  // Fetch the pip simple index for torch at a specific CUDA variant
  const url = `https://download.pytorch.org/whl/${cudaIndex}/torch/`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "flash-attn-version-scraper" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    // Parse wheel filenames: torch-2.5.0+cu124-cp311-cp311-linux_x86_64.whl
    const torchVersions = new Set<string>();
    const regex = /torch-([\d.]+)\+/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
      torchVersions.add(m[1]);
    }
    return [...torchVersions].sort((a, b) => compareVersions(a, b));
  } catch {
    console.warn(`Failed to fetch PyTorch index for ${cudaIndex}`);
    return [];
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching flash-attention releases...");
  const releases = await fetchAllReleases();

  // Only stable v2.x releases with wheel assets
  const stableReleases = releases.filter(
    (r: any) =>
      r.tag_name.startsWith("v2.") &&
      !r.prerelease &&
      r.assets?.length > 0
  );

  console.log(`Found ${stableReleases.length} stable v2.x releases with assets`);

  // Parse all wheels from all releases
  const allWheels: WheelInfo[] = [];
  const flashVersionsSet = new Set<string>();

  for (const release of stableReleases) {
    for (const asset of release.assets) {
      if (!asset.name.endsWith(".whl")) continue;
      const info = parseWheelFilename(asset.name);
      if (info) {
        allWheels.push(info);
        flashVersionsSet.add(info.flashVersion);
      }
    }
  }

  console.log(`Parsed ${allWheels.length} wheels across ${flashVersionsSet.size} flash-attn versions`);

  // Build flash-attn -> {pythons, torches} mapping
  const flashData = new Map<
    string,
    { pythons: Set<string>; torches: Set<string> }
  >();
  for (const w of allWheels) {
    if (!flashData.has(w.flashVersion)) {
      flashData.set(w.flashVersion, {
        pythons: new Set(),
        torches: new Set(),
      });
    }
    const d = flashData.get(w.flashVersion)!;
    d.pythons.add(w.python);
    d.torches.add(w.torch);
  }

  // Get unique python versions from wheels (filter >= 3.9)
  const allPythons = [...new Set(allWheels.map((w) => w.python))]
    .filter((v) => compareVersions(v, "3.9") >= 0)
    .sort(compareVersions);
  // Get unique torch major.minor from wheels (filter >= 2.0)
  const allTorchMinors = [
    ...new Set(allWheels.map((w) => w.torch)),
  ]
    .filter((v) => compareVersions(v, "2.0") >= 0)
    .sort(compareVersions);

  // Build python -> torch minor mapping from flash-attn wheels
  const pythonTorchMap = new Map<string, Set<string>>();
  for (const w of allWheels) {
    if (compareVersions(w.python, "3.9") < 0) continue;
    if (compareVersions(w.torch, "2.0") < 0) continue;
    if (!pythonTorchMap.has(w.python)) {
      pythonTorchMap.set(w.python, new Set());
    }
    pythonTorchMap.get(w.python)!.add(w.torch);
  }

  console.log(`Python versions from wheels: ${allPythons.join(", ")}`);
  console.log(`PyTorch versions from wheels: ${allTorchMinors.join(", ")}`);

  // ── Fetch PyTorch CUDA compatibility ──
  console.log("Fetching PyTorch CUDA indexes...");
  const cudaTorchMap = new Map<string, string[]>(); // cudaIndex -> torch versions

  const cudaResults = await Promise.all(
    CUDA_INDEXES.map(async (idx) => {
      const versions = await fetchPyTorchVersionsForCuda(idx);
      return { idx, versions };
    })
  );

  for (const { idx, versions } of cudaResults) {
    // Filter to only versions >= 2.0.0
    const filtered = versions.filter((v) => compareVersions(v, "2.0.0") >= 0);
    if (filtered.length > 0) {
      cudaTorchMap.set(idx, filtered);
      console.log(`  ${idx}: ${filtered.length} PyTorch versions (${filtered[0]} - ${filtered[filtered.length - 1]})`);
    }
  }

  // ── Build Python -> CUDA compatibility ──
  // A Python version is compatible with a CUDA version if there exists
  // at least one PyTorch wheel for that (python, cuda) combo.
  // We approximate: if flash-attn has wheels for that python,
  // and PyTorch has wheels for that cuda, they're compatible.
  // Python 3.12+ dropped some older CUDA support, 3.13 needs newer.
  const pythonCudaMap = new Map<string, string[]>();
  for (const py of allPythons) {
    const compatCuda: string[] = [];
    for (const cudaIdx of CUDA_INDEXES) {
      const torchVersions = cudaTorchMap.get(cudaIdx) || [];
      // Check if any torch version for this CUDA has a flash-attn wheel with this python
      const hasCompat = torchVersions.some((tv) => {
        // Match torch version (torch index has full version, wheels have major.minor)
        const tvMinor = tv.split(".").slice(0, 2).join(".");
        return allWheels.some(
          (w) => w.python === py && w.torch === tvMinor
        );
      });
      if (hasCompat) {
        compatCuda.push(parseCudaIndex(cudaIdx));
      }
    }
    pythonCudaMap.set(py, compatCuda);
  }

  // ── Build CUDA -> PyTorch version list ──
  const cudaVersionsData = CUDA_INDEXES.filter((idx) =>
    cudaTorchMap.has(idx)
  ).map((idx) => {
    const torchVersions = cudaTorchMap.get(idx)!;
    // Only keep torch versions that have flash-attn wheels
    const relevantTorch = torchVersions.filter((tv) => {
      const tvMinor = tv.split(".").slice(0, 2).join(".");
      return allTorchMinors.includes(tvMinor);
    });
    return {
      value: parseCudaIndex(idx),
      label: `CUDA ${parseCudaIndex(idx)}`,
      torch: relevantTorch,
    };
  });

  // ── Build PyTorch -> flash-attn mapping ──
  // For each torch version, find the latest compatible flash-attn
  const sortedFlash = [...flashVersionsSet].sort(compareVersions);
  const allTorchVersions = [
    ...new Set(cudaVersionsData.flatMap((c) => c.torch)),
  ].sort(compareVersions);

  const pytorchData = allTorchVersions.map((tv) => {
    const tvMinor = tv.split(".").slice(0, 2).join(".");
    // Find the latest flash-attn that has wheels for this torch
    const compatFlash = sortedFlash.filter((fv) => {
      const d = flashData.get(fv);
      return d && d.torches.has(tvMinor);
    });
    const bestFlash =
      compatFlash.length > 0 ? compatFlash[compatFlash.length - 1] : sortedFlash[sortedFlash.length - 1];
    return {
      value: tv,
      label: `PyTorch ${tv}`,
      flash: bestFlash,
    };
  });

  // ── Build Python versions data ──
  const pythonData = allPythons.map((py) => {
    // Get compatible torch minors from flash-attn wheels for this python
    const torchMinors = pythonTorchMap.get(py) || new Set();
    return {
      value: py,
      label: `Python ${py}`,
      cuda: pythonCudaMap.get(py) || [],
      torch: [...torchMinors].sort(compareVersions),
    };
  });

  // ── Build flash versions list ──
  // Only keep flash versions that are actually referenced by a pytorch mapping
  const referencedFlash = new Set(pytorchData.map((p) => p.flash));
  const flashData2 = sortedFlash
    .filter((fv) => referencedFlash.has(fv))
    .map((fv) => ({
      value: fv,
      label: `flash-attn ${fv}`,
    }));

  // ── Determine sensible defaults ──
  const defaultPython = allPythons.includes("3.11")
    ? "3.11"
    : allPythons[allPythons.length - 2] || allPythons[0];
  const defaultCudaOptions = pythonCudaMap.get(defaultPython) || [];
  const defaultCuda =
    defaultCudaOptions[defaultCudaOptions.length - 2] ||
    defaultCudaOptions[defaultCudaOptions.length - 1] ||
    cudaVersionsData[cudaVersionsData.length - 1]?.value;
  const defaultCudaData = cudaVersionsData.find(
    (c) => c.value === defaultCuda
  );
  const defaultTorch = defaultCudaData
    ? defaultCudaData.torch[defaultCudaData.torch.length - 2] ||
      defaultCudaData.torch[defaultCudaData.torch.length - 1]
    : allTorchVersions[allTorchVersions.length - 1];
  const defaultPt = pytorchData.find((p) => p.value === defaultTorch);
  const defaultFlash = defaultPt
    ? defaultPt.flash
    : sortedFlash[sortedFlash.length - 1];

  // ── Output ──
  const output = {
    _generatedAt: new Date().toISOString(),
    _source: `https://github.com/${FLASH_ATTN_REPO}/releases`,
    defaults: {
      python: defaultPython,
      cuda: defaultCuda,
      pytorch: defaultTorch,
      flash: defaultFlash,
    },
    pythonVersions: pythonData,
    cudaVersions: cudaVersionsData,
    pytorchVersions: pytorchData,
    flashVersions: flashData2,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`\nWritten to ${OUTPUT_PATH}`);
  console.log(`  Python: ${pythonData.map((p) => p.value).join(", ")}`);
  console.log(`  CUDA: ${cudaVersionsData.map((c) => c.value).join(", ")}`);
  console.log(`  PyTorch: ${pytorchData.length} versions`);
  console.log(`  Flash-attn: ${flashData2.map((f) => f.value).join(", ")}`);
  console.log(`  Defaults: Python ${defaultPython} | CUDA ${defaultCuda} | PyTorch ${defaultTorch} | Flash ${defaultFlash}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
