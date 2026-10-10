// Which GitHub release this copy should update to. Pure, so it can check itself:
//   node apps/desktop/src/updates.js --check
// The release workflow names versions 0.0.2-alpha.1, 0.0.2-beta.1 and 0.0.2.

const RELEASES = 'https://api.github.com/repos/aiyu-ayaan/Domus-Rust/releases?per_page=30'
const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)\.(\d+))?$/
const STAGE = { alpha: 0, beta: 1, stable: 2 }

/** `1.2.3-beta.4` as [major, minor, patch, stage, number]; null for any other shape. */
function versionKey(text) {
  const m = VERSION.exec(String(text).trim())
  // A stable release has no pre-release number and still sorts above every one of its pre-releases.
  return m && [+m[1], +m[2], +m[3], STAGE[m[4] ?? 'stable'], m[5] ? +m[5] : Infinity]
}
const newer = (a, b) => {
  const i = a.findIndex((part, n) => part !== b[n])
  return i !== -1 && a[i] > b[i]
}

/** The channel a build belongs to, the default: whoever installed an alpha wants alphas. */
const channelOf = (version) => Object.keys(STAGE).find((name) => STAGE[name] === versionKey(version)?.[3]) ?? 'stable'

/**
 * The newest release on `channel` (which also takes every steadier one) that is newer than
 * `installed` and has an asset ending in `suffix`. Releases without one are passed over.
 */
function pick(releases, installed, channel, suffix) {
  const current = versionKey(installed)
  let best = null
  for (const release of current ? releases : []) {
    const key = versionKey(release.tag_name)
    const asset = (release.assets ?? []).find((a) => a.name.endsWith(suffix))
    if (!key || !asset || key[3] < STAGE[channel] || !newer(key, best?.key ?? current)) continue
    best = { key, version: release.tag_name.replace(/^v/, ''), url: asset.browser_download_url }
  }
  return best && { version: best.version, url: best.url }
}

module.exports = { RELEASES, STAGE, channelOf, pick }

if (require.main === module && process.argv.includes('--check')) {
  const { deepStrictEqual: eq } = require('assert')
  const release = (tag, ...names) => ({ tag_name: `v${tag}`, assets: names.map((name) => ({ name, browser_download_url: `u/${name}` })) })
  const releases = [release('0.0.2-alpha.1', 'a.AppImage'), release('0.0.1', 'b.AppImage', 'b.deb'), release('0.0.1-beta.2', 'c.AppImage'), release('0.0.3', 'd.apk')]
  eq(pick(releases, '0.0.1-alpha.1', 'alpha', '.AppImage'), { version: '0.0.2-alpha.1', url: 'u/a.AppImage' })
  // Beta takes the stable release too; the alpha is not for it, and 0.0.3 has no desktop build.
  eq(pick(releases, '0.0.1-beta.2', 'beta', '.AppImage'), { version: '0.0.1', url: 'u/b.AppImage' })
  eq(pick(releases, '0.0.1-beta.2', 'beta', '.deb'), { version: '0.0.1', url: 'u/b.deb' })
  eq(pick(releases, '0.0.1', 'stable', '.AppImage'), null)
  eq(pick(releases, 'not-a-version', 'alpha', '.AppImage'), null)
  eq(channelOf('0.0.1-alpha.1'), 'alpha')
  eq(channelOf('1.2.3'), 'stable')
  console.log('desktop updates self-check passed')
}
