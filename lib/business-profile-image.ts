import sharp from "sharp"

export const MAX_LOGO_UPLOAD_BYTES = 2_800_000
const MAX_LOGO_PIXELS = 100_000_000

export async function normalizeBusinessLogo(input: Buffer): Promise<Buffer> {
  if (input.byteLength === 0 || input.byteLength > MAX_LOGO_UPLOAD_BYTES) {
    throw new Error("Arquivo de logotipo vazio ou acima do limite.")
  }

  const options = { failOn: "error" as const, limitInputPixels: MAX_LOGO_PIXELS, sequentialRead: true }
  const metadata = await sharp(input, options).metadata()
  if (metadata.format !== "webp" || !metadata.width || !metadata.height) {
    throw new Error("Envie uma imagem WebP processada pelo editor.")
  }

  let dimension = 1200
  let quality = 82

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const output = await sharp(input, options)
      .rotate()
      .resize(dimension, dimension, { fit: "inside", withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer()

    if (output.byteLength <= MAX_LOGO_UPLOAD_BYTES) return output
    if (quality > 58) {
      quality -= 12
    } else {
      dimension = Math.max(512, Math.round(dimension * 0.8))
      quality = 76
    }
  }

  throw new Error("Não foi possível otimizar a imagem dentro do limite de upload.")
}
