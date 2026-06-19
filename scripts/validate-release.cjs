const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function fail(message) {
  console.error(`Release validation failed: ${message}`);
  process.exitCode = 1;
}

if (!versionPattern.test(packageJson.version)) {
  fail(`package.json contains an invalid release version: ${packageJson.version}`);
}

if (packageLock.version !== packageJson.version || packageLock.packages?.[""]?.version !== packageJson.version) {
  fail("package-lock.json version does not match package.json. Run npm install after changing the version.");
}

const tagIndex = process.argv.indexOf("--tag");
const rawTag = tagIndex >= 0 ? process.argv[tagIndex + 1] : process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "";
if (rawTag) {
  const tagVersion = rawTag.replace(/^v/, "");
  if (tagVersion !== packageJson.version) {
    fail(`tag ${rawTag} does not match package.json version ${packageJson.version}.`);
  }
}

if (process.argv.includes("--require-head-tag")) {
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
  if (status) fail("the worktree is not clean. Commit the exact source before publishing.");

  const expectedTag = `v${packageJson.version}`;
  const headTags = execFileSync("git", ["tag", "--points-at", "HEAD"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
  if (!headTags.includes(expectedTag)) {
    fail(`HEAD is not tagged ${expectedTag}. Create the version tag on the exact release commit.`);
  }
}

if (process.argv.includes("--artifacts")) {
  const releaseDir = path.join(root, "release");
  const expectedFiles = [
    `Control-de-CLC-y-Catalogos-Setup-${packageJson.version}.exe`,
    `Control-de-CLC-y-Catalogos-Setup-${packageJson.version}.exe.blockmap`,
    `Control-de-CLC-y-Catalogos-Portable-${packageJson.version}.exe`,
    "latest.yml"
  ];
  for (const fileName of expectedFiles) {
    if (!fs.existsSync(path.join(releaseDir, fileName))) fail(`missing release artifact: ${fileName}`);
  }

  const latestYml = fs.readFileSync(path.join(releaseDir, "latest.yml"), "utf8");
  if (!latestYml.includes(`version: ${packageJson.version}`)) {
    fail("latest.yml does not advertise the package.json version.");
  }
  if (!latestYml.includes(`Control-de-CLC-y-Catalogos-Setup-${packageJson.version}.exe`)) {
    fail("latest.yml does not reference the expected NSIS installer.");
  }
}

if (!process.exitCode) {
  console.log(`Release validation passed for version ${packageJson.version}${rawTag ? ` (${rawTag})` : ""}.`);
}
