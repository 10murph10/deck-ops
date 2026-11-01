// Runs after `npx cap add android`: permissions, notification icon, status bar colours, version numbers.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [ma, mi, pa] = pkg.version.split('.').map(Number);

// 1. Manifest permissions + camera intent query
const mf = 'android/app/src/main/AndroidManifest.xml';
let m = readFileSync(mf, 'utf8');
const perms = [
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  '<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
  '<uses-permission android:name="android.permission.VIBRATE" />',
  '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />'
].filter(p => !m.includes(p.match(/name="([^"]+)"/)[1] + '"'));
const queries = m.includes('IMAGE_CAPTURE') ? '' : '\n    <queries>\n        <intent>\n            <action android:name="android.media.action.IMAGE_CAPTURE" />\n        </intent>\n    </queries>';
m = m.replace('</manifest>', '    ' + perms.join('\n    ') + queries + '\n</manifest>');
writeFileSync(mf, m);

// 2. Monochrome notification icon: a ">_" prompt
const dr = 'android/app/src/main/res/drawable';
mkdirSync(dr, { recursive: true });
writeFileSync(dr + '/ic_stat_deckops.xml', `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M4.6,5.2 L11.4,12 L4.6,18.8 L3.2,17.4 L8.6,12 L3.2,6.6 Z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M13,16.4 L21,16.4 L21,18.8 L13,18.8 Z"/>
</vector>
`);

// 3. Dark system bars, no edge-to-edge overlap
const st = 'android/app/src/main/res/values/styles.xml';
if (existsSync(st)) {
  let s = readFileSync(st, 'utf8');
  const items = `
        <item name="android:statusBarColor">#03140c</item>
        <item name="android:navigationBarColor">#020f08</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>`;
  s = s.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, '$1' + items);
  writeFileSync(st, s);
}

// 4. Version numbers from package.json
const bg = 'android/app/build.gradle';
let g = readFileSync(bg, 'utf8');
g = g.replace(/versionCode \d+/, 'versionCode ' + (ma * 10000 + mi * 100 + pa)).replace(/versionName "[^"]*"/, 'versionName "' + pkg.version + '"');
writeFileSync(bg, g);
console.log('android patched for', pkg.version);
