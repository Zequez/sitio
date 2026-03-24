import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import * as path from "node:path";

const MENU_LABEL = "Open with Sitio";

export async function installSitioContextMenu() {
  switch (process.platform) {
    case "win32":
      await installWindowsContextMenu();
      return;
    case "linux":
      installLinuxContextMenu();
      return;
    case "darwin":
      await installMacContextMenu();
      return;
    default:
      throw new Error(
        `Unsupported platform for Sitio context menu installation: ${process.platform}`,
      );
  }
}

export async function uninstallSitioContextMenu() {
  switch (process.platform) {
    case "win32":
      await uninstallWindowsContextMenu();
      return;
    case "linux":
      uninstallLinuxContextMenu();
      return;
    case "darwin":
      uninstallMacContextMenu();
      return;
    default:
      throw new Error(
        `Unsupported platform for Sitio context menu removal: ${process.platform}`,
      );
  }
}

async function installWindowsContextMenu() {
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local");
  const supportDir = path.join(localAppData, "Sitio");
  const launcherPath = path.join(supportDir, "open-sitio.cmd");

  mkdirSync(supportDir, { recursive: true });
  writeFileSync(launcherPath, createWindowsLauncher(), "utf8");

  await addWindowsContextMenuEntry(
    "HKCU\\Software\\Classes\\Directory\\shell\\Sitio",
    `"${launcherPath}" "%1"`,
  );
  await addWindowsContextMenuEntry(
    "HKCU\\Software\\Classes\\Directory\\Background\\shell\\Sitio",
    `"${launcherPath}" "%V"`,
  );
}

async function uninstallWindowsContextMenu() {
  const localAppData =
    process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local");
  const supportDir = path.join(localAppData, "Sitio");

  await deleteWindowsRegistryTree("HKCU\\Software\\Classes\\Directory\\shell\\Sitio");
  await deleteWindowsRegistryTree(
    "HKCU\\Software\\Classes\\Directory\\Background\\shell\\Sitio",
  );
  rmSync(supportDir, { recursive: true, force: true });
}

async function addWindowsContextMenuEntry(
  registryKey: string,
  command: string,
) {
  await runCommand("reg.exe", [
    "add",
    registryKey,
    "/ve",
    "/d",
    MENU_LABEL,
    "/f",
  ]);
  await runCommand("reg.exe", [
    "add",
    registryKey,
    "/v",
    "Icon",
    "/d",
    "cmd.exe",
    "/f",
  ]);
  await runCommand("reg.exe", [
    "add",
    `${registryKey}\\command`,
    "/ve",
    "/d",
    command,
    "/f",
  ]);
}

async function deleteWindowsRegistryTree(registryKey: string) {
  try {
    await runCommand("reg.exe", ["delete", registryKey, "/f"]);
  } catch {
    // Ignore missing keys so uninstall stays idempotent.
  }
}

function createWindowsLauncher() {
  return [
    "@echo off",
    "setlocal",
    'set "TARGET=%~1"',
    'if "%TARGET%"=="" set "TARGET=%CD%"',
    'if not exist "%TARGET%" set "TARGET=%CD%"',
    'if not exist "%TARGET%\\*" set "TARGET=%~dp1"',
    'cd /d "%TARGET%"',
    'echo Running Sitio in "%CD%"',
    "sitio",
    "echo.",
    "pause",
    "",
  ].join("\r\n");
}

function installLinuxContextMenu() {
  const xdgDataHome =
    process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local", "share");
  const supportDir = path.join(xdgDataHome, "sitio");
  const launcherPath = path.join(supportDir, "open-sitio");
  const nautilusScriptPath = path.join(
    xdgDataHome,
    "nautilus",
    "scripts",
    MENU_LABEL,
  );
  const nemoScriptPath = path.join(xdgDataHome, "nemo", "scripts", MENU_LABEL);
  const dolphinServicePath = path.join(
    xdgDataHome,
    "kio",
    "servicemenus",
    "sitio.desktop",
  );

  mkdirSync(supportDir, { recursive: true });
  writeExecutableFile(launcherPath, createLinuxLauncher());

  mkdirSync(path.dirname(nautilusScriptPath), { recursive: true });
  writeExecutableFile(nautilusScriptPath, createLinuxScriptWrapper(launcherPath));

  mkdirSync(path.dirname(nemoScriptPath), { recursive: true });
  writeExecutableFile(nemoScriptPath, createLinuxScriptWrapper(launcherPath));

  mkdirSync(path.dirname(dolphinServicePath), { recursive: true });
  writeFileSync(
    dolphinServicePath,
    createDolphinServiceMenu(launcherPath),
    "utf8",
  );
}

function uninstallLinuxContextMenu() {
  const xdgDataHome =
    process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local", "share");
  const supportDir = path.join(xdgDataHome, "sitio");

  rmSync(path.join(xdgDataHome, "nautilus", "scripts", MENU_LABEL), {
    force: true,
  });
  rmSync(path.join(xdgDataHome, "nemo", "scripts", MENU_LABEL), {
    force: true,
  });
  rmSync(path.join(xdgDataHome, "kio", "servicemenus", "sitio.desktop"), {
    force: true,
  });
  rmSync(supportDir, { recursive: true, force: true });
}

function createLinuxLauncher() {
  return [
    "#!/bin/sh",
    'target="$1"',
    'if [ -z "$target" ] && [ -n "$NAUTILUS_SCRIPT_SELECTED_FILE_PATHS" ]; then',
    '  target=$(printf "%s\\n" "$NAUTILUS_SCRIPT_SELECTED_FILE_PATHS" | sed -n "1p")',
    "fi",
    'if [ -z "$target" ] && [ -n "$NEMO_SCRIPT_SELECTED_FILE_PATHS" ]; then',
    '  target=$(printf "%s\\n" "$NEMO_SCRIPT_SELECTED_FILE_PATHS" | sed -n "1p")',
    "fi",
    'if [ -z "$target" ]; then',
    '  target="$PWD"',
    "fi",
    'if [ ! -d "$target" ]; then',
    '  target=$(dirname "$target")',
    "fi",
    'export SITIO_TARGET="$target"',
    "run_sitio='cd \"$SITIO_TARGET\" && sitio; printf \"\\nPress Enter to close... \"; read _'",
    'if command -v x-terminal-emulator >/dev/null 2>&1; then exec x-terminal-emulator -e sh -lc "$run_sitio"; fi',
    'if command -v gnome-terminal >/dev/null 2>&1; then exec gnome-terminal -- sh -lc "$run_sitio"; fi',
    'if command -v konsole >/dev/null 2>&1; then exec konsole -e sh -lc "$run_sitio"; fi',
    'if command -v xfce4-terminal >/dev/null 2>&1; then exec xfce4-terminal -e "sh -lc \\\"$run_sitio\\\""; fi',
    'if command -v kitty >/dev/null 2>&1; then exec kitty sh -lc "$run_sitio"; fi',
    'if command -v wezterm >/dev/null 2>&1; then exec wezterm start -- sh -lc "$run_sitio"; fi',
    'if command -v xterm >/dev/null 2>&1; then exec xterm -e sh -lc "$run_sitio"; fi',
    'printf "No supported terminal emulator was found.\\n" >&2',
    "exit 1",
    "",
  ].join("\n");
}

function createLinuxScriptWrapper(launcherPath: string) {
  return `#!/bin/sh\nexec ${shellQuote(launcherPath)} "$@"\n`;
}

function createDolphinServiceMenu(launcherPath: string) {
  const quotedLauncherPath = shellQuote(launcherPath);

  return [
    "[Desktop Entry]",
    "Type=Service",
    "MimeType=inode/directory;",
    "Actions=SitioOpen;",
    "X-KDE-Priority=TopLevel",
    "",
    "[Desktop Action SitioOpen]",
    `Name=${MENU_LABEL}`,
    "Icon=utilities-terminal",
    `Exec=sh -lc '"$1" "$2"' sh ${quotedLauncherPath} %f`,
    "",
  ].join("\n");
}

async function installMacContextMenu() {
  const homeDir = homedir();
  const supportDir = path.join(
    homeDir,
    "Library",
    "Application Support",
    "Sitio",
  );
  const servicesDir = path.join(homeDir, "Library", "Services");
  const appPath = path.join(supportDir, "Open with Sitio.app");
  const workflowPath = path.join(servicesDir, "Open with Sitio.workflow");
  const workflowContentsDir = path.join(workflowPath, "Contents");
  const appleScriptPath = path.join(tmpdir(), "sitio-open-with.applescript");

  mkdirSync(supportDir, { recursive: true });
  mkdirSync(servicesDir, { recursive: true });
  rmSync(appPath, { recursive: true, force: true });
  writeFileSync(appleScriptPath, createMacAppleScript(), "utf8");

  try {
    await runCommand("osacompile", ["-o", appPath, appleScriptPath]);
  } finally {
    rmSync(appleScriptPath, { force: true });
  }

  mkdirSync(workflowContentsDir, { recursive: true });
  writeFileSync(
    path.join(workflowContentsDir, "Info.plist"),
    createMacWorkflowInfoPlist(),
    "utf8",
  );
  writeFileSync(
    path.join(workflowContentsDir, "document.wflow"),
    createMacWorkflowDocument(appPath),
    "utf8",
  );
}

function uninstallMacContextMenu() {
  const homeDir = homedir();

  rmSync(path.join(homeDir, "Library", "Services", "Open with Sitio.workflow"), {
    recursive: true,
    force: true,
  });
  rmSync(
    path.join(
      homeDir,
      "Library",
      "Application Support",
      "Sitio",
      "Open with Sitio.app",
    ),
    {
      recursive: true,
      force: true,
    },
  );
}

function createMacAppleScript() {
  return [
    "on open inputItems",
    "  if (count of inputItems) is 0 then return",
    "  set targetPath to POSIX path of (item 1 of inputItems)",
    '  tell application "Terminal"',
    "    activate",
    '    do script "cd " & quoted form of targetPath & " && sitio"',
    "  end tell",
    "end open",
    "",
    "on run",
    '  tell application "Terminal"',
    "    activate",
    '    do script "sitio"',
    "  end tell",
    "end run",
    "",
  ].join("\n");
}

function createMacWorkflowInfoPlist() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "\t<key>NSServices</key>",
    "\t<array>",
    "\t\t<dict>",
    "\t\t\t<key>NSBackgroundColorName</key>",
    "\t\t\t<string>background</string>",
    "\t\t\t<key>NSIconName</key>",
    "\t\t\t<string>NSActionTemplate</string>",
    "\t\t\t<key>NSMenuItem</key>",
    "\t\t\t<dict>",
    "\t\t\t\t<key>default</key>",
    `\t\t\t\t<string>${escapeXml(MENU_LABEL)}</string>`,
    "\t\t\t</dict>",
    "\t\t\t<key>NSMessage</key>",
    "\t\t\t<string>runWorkflowAsService</string>",
    "\t\t\t<key>NSRequiredContext</key>",
    "\t\t\t<dict>",
    "\t\t\t\t<key>NSApplicationIdentifier</key>",
    "\t\t\t\t<string>com.apple.finder</string>",
    "\t\t\t</dict>",
    "\t\t\t<key>NSSendFileTypes</key>",
    "\t\t\t<array>",
    "\t\t\t\t<string>public.folder</string>",
    "\t\t\t</array>",
    "\t\t</dict>",
    "\t</array>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

function createMacWorkflowDocument(appPath: string) {
  const actionUuid = crypto.randomUUID().toUpperCase();
  const inputUuid = crypto.randomUUID().toUpperCase();
  const outputUuid = crypto.randomUUID().toUpperCase();

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "\t<key>AMApplicationBuild</key>",
    "\t<string>512.1</string>",
    "\t<key>AMApplicationVersion</key>",
    "\t<string>2.10</string>",
    "\t<key>AMDocumentVersion</key>",
    "\t<string>2</string>",
    "\t<key>actions</key>",
    "\t<array>",
    "\t\t<dict>",
    "\t\t\t<key>action</key>",
    "\t\t\t<dict>",
    "\t\t\t\t<key>AMAccepts</key>",
    "\t\t\t\t<dict>",
    "\t\t\t\t\t<key>Container</key>",
    "\t\t\t\t\t<string>List</string>",
    "\t\t\t\t\t<key>Optional</key>",
    "\t\t\t\t\t<false/>",
    "\t\t\t\t\t<key>Types</key>",
    "\t\t\t\t\t<array>",
    "\t\t\t\t\t\t<string>com.apple.cocoa.path</string>",
    "\t\t\t\t\t</array>",
    "\t\t\t\t</dict>",
    "\t\t\t\t<key>AMActionVersion</key>",
    "\t\t\t\t<string>1.1.1</string>",
    "\t\t\t\t<key>AMApplication</key>",
    "\t\t\t\t<array>",
    "\t\t\t\t\t<string>Finder</string>",
    "\t\t\t\t</array>",
    "\t\t\t\t<key>AMParameterProperties</key>",
    "\t\t\t\t<dict>",
    "\t\t\t\t\t<key>appPath</key>",
    "\t\t\t\t\t<dict>",
    "\t\t\t\t\t\t<key>isPathPopUp</key>",
    "\t\t\t\t\t\t<true/>",
    "\t\t\t\t\t\t<key>variableUUIDsInMenu</key>",
    "\t\t\t\t\t\t<array/>",
    "\t\t\t\t\t</dict>",
    "\t\t\t\t</dict>",
    "\t\t\t\t<key>AMProvides</key>",
    "\t\t\t\t<dict>",
    "\t\t\t\t\t<key>Container</key>",
    "\t\t\t\t\t<string>List</string>",
    "\t\t\t\t\t<key>Types</key>",
    "\t\t\t\t\t<array>",
    "\t\t\t\t\t\t<string>com.apple.cocoa.path</string>",
    "\t\t\t\t\t</array>",
    "\t\t\t\t</dict>",
    "\t\t\t\t<key>ActionBundlePath</key>",
    "\t\t\t\t<string>/System/Library/Automator/Open Finder Items.action</string>",
    "\t\t\t\t<key>ActionName</key>",
    "\t\t\t\t<string>Open Finder Items</string>",
    "\t\t\t\t<key>ActionParameters</key>",
    "\t\t\t\t<dict>",
    "\t\t\t\t\t<key>appPath</key>",
    `\t\t\t\t\t<string>${escapeXml(appPath)}</string>`,
    "\t\t\t\t</dict>",
    "\t\t\t\t<key>BundleIdentifier</key>",
    "\t\t\t\t<string>com.apple.Automator.OpenFinderItems</string>",
    "\t\t\t\t<key>CFBundleVersion</key>",
    "\t\t\t\t<string>1.1.1</string>",
    "\t\t\t\t<key>CanShowSelectedItemsWhenRun</key>",
    "\t\t\t\t<true/>",
    "\t\t\t\t<key>CanShowWhenRun</key>",
    "\t\t\t\t<true/>",
    "\t\t\t\t<key>Category</key>",
    "\t\t\t\t<array>",
    "\t\t\t\t\t<string>AMCategoryFilesAndFolders</string>",
    "\t\t\t\t</array>",
    "\t\t\t\t<key>Class Name</key>",
    "\t\t\t\t<string>AMOpenFinderItems</string>",
    "\t\t\t\t<key>InputUUID</key>",
    `\t\t\t\t<string>${inputUuid}</string>`,
    "\t\t\t\t<key>Keywords</key>",
    "\t\t\t\t<array>",
    "\t\t\t\t\t<string>Sitio</string>",
    "\t\t\t\t\t<string>Folder</string>",
    "\t\t\t\t\t<string>Project</string>",
    "\t\t\t\t</array>",
    "\t\t\t\t<key>OutputUUID</key>",
    `\t\t\t\t<string>${outputUuid}</string>`,
    "\t\t\t\t<key>UUID</key>",
    `\t\t\t\t<string>${actionUuid}</string>`,
    "\t\t\t\t<key>UnlocalizedApplications</key>",
    "\t\t\t\t<array>",
    "\t\t\t\t\t<string>Finder</string>",
    "\t\t\t\t</array>",
    "\t\t\t\t<key>arguments</key>",
    "\t\t\t\t<dict>",
    "\t\t\t\t\t<key>0</key>",
    "\t\t\t\t\t<dict>",
    "\t\t\t\t\t\t<key>default value</key>",
    "\t\t\t\t\t\t<string></string>",
    "\t\t\t\t\t\t<key>name</key>",
    "\t\t\t\t\t\t<string>appPath</string>",
    "\t\t\t\t\t\t<key>required</key>",
    "\t\t\t\t\t\t<string>0</string>",
    "\t\t\t\t\t\t<key>type</key>",
    "\t\t\t\t\t\t<string>0</string>",
    "\t\t\t\t\t\t<key>uuid</key>",
    "\t\t\t\t\t\t<string>0</string>",
    "\t\t\t\t\t</dict>",
    "\t\t\t\t</dict>",
    "\t\t\t\t<key>conversionLabel</key>",
    "\t\t\t\t<integer>0</integer>",
    "\t\t\t\t<key>isViewVisible</key>",
    "\t\t\t\t<integer>1</integer>",
    "\t\t\t\t<key>location</key>",
    "\t\t\t\t<string>309.000000:224.000000</string>",
    "\t\t\t\t<key>nibPath</key>",
    "\t\t\t\t<string>/System/Library/Automator/Open Finder Items.action/Contents/Resources/Base.lproj/main.nib</string>",
    "\t\t\t</dict>",
    "\t\t\t<key>isViewVisible</key>",
    "\t\t\t<integer>1</integer>",
    "\t\t</dict>",
    "\t</array>",
    "\t<key>connectors</key>",
    "\t<dict/>",
    "\t<key>workflowMetaData</key>",
    "\t<dict>",
    "\t\t<key>applicationBundleID</key>",
    "\t\t<string>com.apple.finder</string>",
    "\t\t<key>applicationBundleIDsByPath</key>",
    "\t\t<dict>",
    "\t\t\t<key>/System/Library/CoreServices/Finder.app</key>",
    "\t\t\t<string>com.apple.finder</string>",
    "\t\t</dict>",
    "\t\t<key>applicationPath</key>",
    "\t\t<string>/System/Library/CoreServices/Finder.app</string>",
    "\t\t<key>applicationPaths</key>",
    "\t\t<array>",
    "\t\t\t<string>/System/Library/CoreServices/Finder.app</string>",
    "\t\t</array>",
    "\t\t<key>inputTypeIdentifier</key>",
    "\t\t<string>com.apple.Automator.fileSystemObject</string>",
    "\t\t<key>outputTypeIdentifier</key>",
    "\t\t<string>com.apple.Automator.nothing</string>",
    "\t\t<key>presentationMode</key>",
    "\t\t<integer>15</integer>",
    "\t\t<key>processesInput</key>",
    "\t\t<integer>0</integer>",
    "\t\t<key>serviceApplicationBundleID</key>",
    "\t\t<string>com.apple.finder</string>",
    "\t\t<key>serviceApplicationPath</key>",
    "\t\t<string>/System/Library/CoreServices/Finder.app</string>",
    "\t\t<key>serviceInputTypeIdentifier</key>",
    "\t\t<string>com.apple.Automator.fileSystemObject</string>",
    "\t\t<key>serviceOutputTypeIdentifier</key>",
    "\t\t<string>com.apple.Automator.nothing</string>",
    "\t\t<key>serviceProcessesInput</key>",
    "\t\t<integer>0</integer>",
    "\t\t<key>systemImageName</key>",
    "\t\t<string>NSActionTemplate</string>",
    "\t\t<key>useAutomaticInputType</key>",
    "\t\t<integer>0</integer>",
    "\t\t<key>workflowTypeIdentifier</key>",
    "\t\t<string>com.apple.Automator.servicesMenu</string>",
    "\t</dict>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

async function runCommand(command: string, args: string[]) {
  const child = Bun.spawn([command, ...args], {
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;

  if (exitCode !== 0) {
    throw new Error(`${command} exited with code ${exitCode}`);
  }
}

function writeExecutableFile(filePath: string, contents: string) {
  writeFileSync(filePath, contents, "utf8");
  chmodSync(filePath, 0o755);
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
