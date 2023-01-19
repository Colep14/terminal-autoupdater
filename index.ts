import { spawn } from 'child_process'
import { readFile } from 'fs/promises'

const { BIN_PATH } = JSON.parse( await readFile('./config.json', { encoding: "utf-8" }) );

const process = spawn(`${BIN_PATH}WindowsTerminal.exe`);

process.on("exit", async (code) => {
    console.log(`terminal exited with code ${code}.`)
    if (code === 0) {
        console.log("Checking for updates.")
        const { default: update } = await import('./update.js')
        update();
    }
})