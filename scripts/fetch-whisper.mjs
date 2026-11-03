// Downloads the Whisper model Pip transcribes with into resources/models/ (once; Pip itself never downloads).
// Keep this list in step with WHISPER_FILES in src/main/transcribe.ts.
import { createHash } from 'crypto'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

const MODEL = 'Xenova/whisper-base'
// Pinned commit and per-file SHA-256, so a changed upstream repo can't slip different files into a build.
const REVISION = '64da57285918e20ea79ea5c88eed7197933abaa8'
const FILES = {
  'config.json': 'd1d347fdb422e6347c2f843a90d375aa67ea3f4b3e20d2c3075f9a9f6243685b',
  'generation_config.json': '3bba359e33fdd6dc1c10f71846a477d339b0242f462f70ea1dd73274caa38d05',
  'preprocessor_config.json': 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d',
  'tokenizer.json': '27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566',
  'tokenizer_config.json': '2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce',
  'onnx/encoder_model_quantized.onnx':
    '3e345e977b55620a37c0c2b2af0644e019afdfad562dcf71eb929bb7274285f9',
  'onnx/decoder_model_merged_quantized.onnx':
    'a6beb6baabb66f00b6a686d828c95ffca6146d51900cbad0266cad38f64cf861'
}
const dir = join(import.meta.dirname, '..', 'resources', 'models', MODEL)

for (const [file, sha256] of Object.entries(FILES)) {
  const dest = join(dir, file)
  if (existsSync(dest)) {
    console.log(`have ${file}`)
    continue
  }
  const res = await fetch(`https://huggingface.co/${MODEL}/resolve/${REVISION}/${file}`)
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
  mkdirSync(dirname(dest), { recursive: true })
  const bytes = Buffer.from(await res.arrayBuffer())
  // Write then rename, so an interrupted download is not mistaken for a finished file.
  writeFileSync(`${dest}.part`, bytes)
  const got = createHash('sha256').update(bytes).digest('hex')
  if (got !== sha256) {
    rmSync(`${dest}.part`)
    console.error(`${file}: SHA-256 mismatch (expected ${sha256}, got ${got})`)
    process.exit(1)
  }
  renameSync(`${dest}.part`, dest)
  console.log(`got  ${file}`)
}
console.log(`Whisper model ready in ${dir}`)
