import { existsSync } from "node:fs"
import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"
import { reactCompilerLogger } from "./react-compiler-logger.ts"

if (existsSync("../../.env")) process.loadEnvFile("../../.env")

const config = defineConfig(({ mode }) => ({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({
      presets: [
        reactCompilerPreset({ target: "19", logger: reactCompilerLogger }),
      ],
    }),
    mode === "production" ? nitro() : null,
  ].filter(Boolean),
}))

export default config
