export default Config

type Config = {
    ARCH: "amd" | "x86" | "x64",
    BIN_PATH: string,               // should end with "/"
    PREVIEW: boolean,               // whether or not to download the preview release
    WIN_VER: "10" | "11"
}
