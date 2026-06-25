#!/usr/bin/env node
const { spawn } = require("child_process")
const path = require("path")

const binPath = path.join(__dirname, "bin", "wechat-opencode-win32-x64.exe")
const child = spawn(binPath, process.argv.slice(2), { stdio: "inherit" })
child.on("exit", (code) => process.exit(code ?? 1))
