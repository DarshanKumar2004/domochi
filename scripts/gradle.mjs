// Run the Android Gradle wrapper from any shell (cmd, PowerShell, Git Bash):
// node scripts/gradle.mjs bundleRelease
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const android = fileURLToPath(new URL('../android/', import.meta.url));
const win = process.platform === 'win32';
// The full path: some Windows setups don't run scripts from the current folder by name.
const wrapper = join(android, win ? 'gradlew.bat' : 'gradlew');
const r = spawnSync(win ? `"${wrapper}"` : wrapper, process.argv.slice(2), { cwd: android, stdio: 'inherit', shell: win });
process.exit(r.status ?? 1);
