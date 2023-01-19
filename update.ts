import type Config from './config'
import { existsSync } from 'fs'
import fs, { rm, readdir, mkdir, readFile, writeFile, cp } from 'fs/promises'
// import Szip from 'node-7z' //imported conditionally in `update()`
import { DOMParser } from 'xmldom'

const { ARCH, BIN_PATH, PREVIEW, WIN_VER }: Config = JSON.parse(await readFile('./config.json', { encoding: 'utf-8' }))

process.on('unhandledRejection', async (error) => {
    console.error(error)
    const file = await readFile('./error_log.txt', { encoding: 'utf-8' })
                      .catch(async (reason) => {
                          if (existsSync('./error_log.txt')) throw new Error(reason);
                          await fs.writeFile('./error_log.txt', "")
                          return ""
                      })
    const now = new Date()
    await writeFile('./error_log.txt', `${file}\n${now.getTime()}: ${error}`).then(() => process.exit(1))
})

export default async function (): Promise<void> {

    let installedVersion = 0

    const manifest = await readFile(`${BIN_PATH}AppxManifest.xml`, { encoding: "utf-8" })
    .catch(error => {
        if (error.errno === -4058) {
            console.error("Manifest does not exist? Is the app installed? Proceeding anyway 😂")
            return ""
        }
        //unhandled
        throw error
    })

    if (manifest !== "") {

        const parser = new DOMParser();

        const manifestDOM: any = parser.parseFromString(manifest, "text/xml")
        // This order better not change. Please add DOMParser to node.
        installedVersion = parseInt(manifestDOM.childNodes[3].childNodes[3].attributes[2].value)

    }
    console.log(installedVersion)

    const release = await getLatestRelease()
    const releaseVersion = parseInt(release.name.split(`_Win${WIN_VER}_`)[1].split("_")[0])

    if (releaseVersion === installedVersion) {
        // process.exit(0)
        console.log("Program is up to date.")
        return;
    }

    if (releaseVersion < installedVersion) throw new Error("Github version is lower than installed version!")

    if (releaseVersion > installedVersion) return update();

}

async function getLatestRelease() {
    let candidate: any
    const releases = await (await fetch(`https://api.github.com/repos/microsoft/terminal/releases?per_page=10`, {
        headers: {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }
    })).json()

    for (const release of releases) {
        if (PREVIEW) {
            if (!release.name.includes('Preview')) continue;
        } else {
            if (release.name.includes('Preview')) continue;
        }

        for (const file of release.assets) {
            if (PREVIEW) {
                if (!file.name.startsWith(`Microsoft.WindowsTerminalPreview_Win${WIN_VER}`) || !file.name.endsWith('.msixbundle')) continue;
            } else {
                if (!file.name.startsWith(`Microsoft.WindowsTerminal_Win${WIN_VER}`) || !file.name.endsWith('.msixbundle')) continue;
            }
            if (candidate !== undefined) throw new Error(`Two possible download candidates found for ${release.name}`)
            candidate = file
        }

        break;
    }
    return candidate
}

async function downloadFile(url: any, destination: string) {
    const response = await fetch(url, {
        headers: {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }
    });
    const blob = await response.blob();
    const buffer = Buffer.from(await blob.arrayBuffer());
    return writeFile(destination, buffer);
};

async function update(): Promise<void> {
    
    const { default: Szip } = await import('node-7z')

    await rm('./work/', { recursive: true, force: true }).catch(console.error)

    await mkdir('./work/')

    const downloadURL = (await getLatestRelease()).browser_download_url
    
    await downloadFile(downloadURL, './work/release.msixbundle')

    console.log('spawning 7-zip to write to work/extract/')

    function extract(to: string, from: string, options: any = undefined): Promise<void> { return new Promise((resolve) => {
        const stream = Szip.extractFull(to, from, options);
        stream.on('end', () => {
            resolve()
        })
    })}

    await extract('./work/release.msixbundle', './work/extract/')

    const extractdir = await readdir('./work/extract')

    for (const file of extractdir) {
        if (file.endsWith(`${ARCH}.msix`)) {
            console.log('spawning 7-zip to copy to ./work/final')
            // const process2 = spawn(SZIP, ['e', `./work/extract/${file}`, `-oC:/Users/colep/Documents/WinTermAutoupdater/work/final/`])
            await extract(`./work/extract/${file}`, './work/final/')
            break;
        }
    }

    await rm(BIN_PATH, {recursive: true, force: true});

    await mkdir(BIN_PATH)

    await cp('./work/final/', BIN_PATH, { recursive: true })

    return;
}