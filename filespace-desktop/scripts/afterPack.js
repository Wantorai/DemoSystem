"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

module.exports = async function waitForWindowsExecutable(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const executablePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`,
  );

  // Newly extracted Electron executables can be held briefly by Windows
  // Defender or the search indexer. Wait until the file can be opened for
  // writing before electron-builder applies the icon, metadata and signature.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let handle;
    try {
      handle = await fs.open(executablePath, "r+");
      await handle.close();
      await delay(1_000);
      return;
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => {});
      }
      if (error.code !== "EBUSY" && error.code !== "EPERM") {
        throw error;
      }
      await delay(1_000);
    }
  }

  throw new Error(`Windows did not release the executable: ${executablePath}`);
};
