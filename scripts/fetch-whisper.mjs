// Downloads the Whisper model Pip transcribes with into resources/models/ (once; Pip itself never downloads).
// Keep this list in step with WHISPER_FILES in src/main/transcribe.ts.
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

const MODEL = 'Xenova/whisper-base'
const FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx'
]
const dir = join(import.meta.dirname, '..', 'resources', 'models', MODEL)

for (const file of FILES) {
  const dest = join(dir, file)
  if (existsSync(dest)) {
    console.log(`have ${file}`)
    continue
  }
  const res = await fetch(`https://huggingface.co/${MODEL}/resolve/main/${file}`)
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
  mkdirSync(dirname(dest), { recursive: true })
  // Write then rename, so an interrupted download is not mistaken for a finished file.
  writeFileSync(`${dest}.part`, Buffer.from(await res.arrayBuffer()))
  renameSync(`${dest}.part`, dest)
  console.log(`got  ${file}`)
}
console.log(`Whisper model ready in ${dir}`)
