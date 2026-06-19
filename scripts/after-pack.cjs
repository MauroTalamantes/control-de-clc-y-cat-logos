const path = require("node:path");

/**
 * electron-builder's normal Windows resource editor also initializes signing
 * tools that require symbolic-link privileges during local builds. Edit the
 * packaged executable directly so its icon and Windows metadata are present
 * without requiring Developer Mode or an elevated terminal.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const { rcedit } = await import("rcedit");
  const appInfo = context.packager.appInfo;
  const executablePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, "build", "icon.ico");
  const versionStrings = {
    FileDescription: appInfo.description,
    ProductName: appInfo.productName,
    InternalName: appInfo.productFilename,
    OriginalFilename: `${appInfo.productFilename}.exe`
  };

  if (appInfo.companyName) versionStrings.CompanyName = appInfo.companyName;
  if (appInfo.copyright) versionStrings.LegalCopyright = appInfo.copyright;

  await rcedit(executablePath, {
    icon: iconPath,
    "version-string": versionStrings,
    "file-version": appInfo.shortVersion || appInfo.buildVersion,
    "product-version": appInfo.shortVersionWindows || appInfo.version
  });
};
