#!/usr/bin/env bun
import { $ } from "bun"
import { rm, mkdir, cp, readFile, writeFile } from "fs/promises"
import { join } from "path"

interface TargetDef {
  label: string
  bunTarget: string
  ext: string
}

const TARGETS: TargetDef[] = [
  { label: "win32-x64", bunTarget: "bun-windows-x64", ext: ".exe" },
]

async function main() {
  const pkg = JSON.parse(await readFile("package.json", "utf-8"))
  const version = pkg.version
  const npmTag = process.env.NPM_TAG ?? "latest"
  const npmOtp = process.env.NPM_OTP ?? ""

  const ghPath = (() => {
    const candidates = [
      "D:\\DEV\\GitHub CLI\\gh.exe"
    ]
    for (const p of candidates) {
      try { if (Bun.file(p).size > 0) return p } catch {}
    }
    const fromPath = process.env.PATH?.split(";").find(p => {
      try { return Bun.file(`${p}\\gh.exe`).size > 0 } catch { return false }
    })
    return fromPath ? `${fromPath}\\gh.exe` : ""
  })()
  console.log(`  ghPath: ${ghPath || "(not found)"}`)
  if (!ghPath) console.log("⚠️  gh CLI 未找到，跳过 GitHub release")

  console.log(`=== ${pkg.name} v${version} 发布 ===`)

  await rm("dist", { recursive: true, force: true })
  await rm("npm", { recursive: true, force: true })
  await mkdir("dist", { recursive: true })
  await mkdir("npm/bin", { recursive: true })

  // build
  for (const t of TARGETS) {
    const outFile = `wechat-opencode-${t.label}${t.ext}`
    console.log(`Building ${t.label}...`)
    await $`bun build --compile --target=${t.bunTarget} --define APP_VERSION='"${version}"' --outfile dist/${outFile} src/index.ts`
    await cp(join("dist", outFile), join("npm/bin", outFile))
  }
  await cp("scripts/install.js", "npm/install.js")
  await cp("README.md", "npm/README.md").catch(() => {})

  // write npm/package.json
  const npmPkg: Record<string, unknown> = {
    name: pkg.name,
    version,
    description: pkg.description ?? "微信与 OpenCode CLI 桥接工具",
    author: pkg.author,
    license: pkg.license ?? "MIT",
    type: "commonjs",
    bin: { "wechat-opencode": "install.js" },
    files: ["bin", "install.js", "README.md"],
    engines: { node: ">=18" },
    os: ["win32"],
    cpu: ["x64"],
  }
  if (pkg.repository) npmPkg.repository = pkg.repository
  if (pkg.homepage) npmPkg.homepage = pkg.homepage

  await writeFile("npm/package.json", JSON.stringify(npmPkg, null, 2))

  // publish (check first)
  const npmView = await $`npm view ${pkg.name}@${version} version --json`.quiet().nothrow()
  if (npmView.exitCode === 0 && npmView.text().trim()) {
    console.log(`⏭️  npm ${pkg.name}@${version} 已存在，跳过`)
  } else {
    const otpFlag = npmOtp ? `--otp=${npmOtp}` : ""
    console.log(`\nPublishing ${pkg.name}@${version} (tag: ${npmTag})...`)
    const cwd = process.cwd()
    process.chdir("npm")
    if (otpFlag) {
      await $`npm publish --access public --tag=${npmTag} ${otpFlag}`
    } else {
      await $`npm publish --access public --tag=${npmTag}`
    }
    process.chdir(cwd)
  }

  // github release (check first)
  const exeAsset = join("dist", `wechat-opencode-${TARGETS[0].label}${TARGETS[0].ext}`)
  if (ghPath) {
    const ghView = await $`${ghPath} release view v${version} --json tagName`.quiet().nothrow()
    if (ghView.exitCode === 0) {
      console.log(`⏭️  GitHub tag v${version} 已存在，跳过`)
    } else {
      console.log(`\n🏷️  创建 GitHub release v${version}...`)
      await $`${ghPath} release create v${version} ${exeAsset} --title "v${version}" --generate-notes`
      console.log(`✅ GitHub release v${version} 已创建`)
    }
  }

  console.log(`\n✅ ${pkg.name}@${version} 已发布 [win32-x64]`)
}

main().catch((e) => {
  console.error("发布失败:", e)
  process.exit(1)
})
