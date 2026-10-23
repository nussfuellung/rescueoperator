// afterPack-Hook: setzt das App-Icon in die Windows-exe. electron-builder macht das nur mit
// signAndEditExecutable (rcedit über wine); resedit kommt ohne wine aus und läuft auch unter Linux/macOS.
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

exports.default = async function exeIcon(context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const exePath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const exe = ResEdit.NtExecutable.from(readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const ico = ResEdit.Data.IconFile.from(readFileSync(join(__dirname, '../build/icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const { id, lang } = groups[0] ?? { id: 1, lang: 1033 };
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map((i) => i.data));
  res.outputResource(exe);
  writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`  • Icon gesetzt: ${exePath}`);
};
