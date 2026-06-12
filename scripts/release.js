const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const versionArg = args.find((a) => /^\d+\.\d+\.\d+/.test(a))
const isWin = args.includes('--win')

if (!versionArg) {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'))
  console.log(`当前版本: v${pkg.version}`)
  console.log('')
  console.log('用法:')
  console.log('  pnpm release 1.2.0          # macOS/Linux 打包')
  console.log('  pnpm release 1.2.0 --win    # Windows 打包')
  console.log('')
  console.log('或使用 npm version（仅更新版本号，不打包）:')
  console.log('  npm version 1.2.0')
  process.exit(0)
}

const pkgPath = path.join(__dirname, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
const oldVersion = pkg.version
pkg.version = versionArg
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

console.log(`版本号: ${oldVersion} -> ${versionArg}`)

const buildCmd = 'tsc -p tsconfig.node.json && vite build'
const distCmd = isWin ? 'electron-builder --win' : 'electron-builder'

try {
  console.log('\n[1/2] 构建中...')
  execSync(buildCmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') })

  console.log('\n[2/2] 打包中...')
  execSync(distCmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') })

  console.log(`\n打包完成! v${versionArg}`)
} catch (err) {
  console.error('\n打包失败，版本号已回滚')
  pkg.version = oldVersion
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  process.exit(1)
}
