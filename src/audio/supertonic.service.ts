/**
 * Supertonic TTS Service
 *
 * On-device text-to-speech using Supertonic ONNX models.
 * Port of the official Node.js example from https://github.com/supertone-inc/supertonic
 *
 * Prerequisites:
 *   git lfs install
 *   git clone https://huggingface.co/Supertone/supertonic-3 assets/supertonic-3
 */

import fs from 'fs';
import path from 'path';
import * as ort from 'onnxruntime-node';
import { logger } from '../utils/logger';

// ─── Constants ───────────────────────────────────────────────────────────────

const AVAILABLE_LANGS = [
  'en', 'ko', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es',
  'et', 'fi', 'fr', 'hi', 'hr', 'hu', 'id', 'it', 'lt', 'lv',
  'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi', 'na',
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface TtsConfig {
  ae: { sample_rate: number; base_chunk_size: number };
  ttl: { chunk_compress_factor: number; latent_dim: number };
}

interface Style {
  ttl: ort.Tensor;
  dp: ort.Tensor;
}

type UnicodeIndexer = Record<number, number>;

// ─── Text Processor ──────────────────────────────────────────────────────────

class UnicodeProcessor {
  private readonly indexer: UnicodeIndexer;

  constructor(unicodeIndexerJsonPath: string) {
    this.indexer = JSON.parse(
      fs.readFileSync(unicodeIndexerJsonPath, 'utf-8'),
    ) as UnicodeIndexer;
  }

  private preprocessText(text: string, lang: string): string {
    text = text.normalize('NFKD');

    // Remove emojis
    const emojiPattern =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;
    text = text.replace(emojiPattern, '');

    // Replace dashes and symbols
    const replacements: Record<string, string> = {
      '–': '-', '‑': '-', '—': '-', '_': ' ',
      '\u201C': '"', '\u201D': '"', '\u2018': "'", '\u2019': "'",
      '´': "'", '`': "'", '[': ' ', ']': ' ', '|': ' ',
      '/': ' ', '#': ' ', '→': ' ', '←': ' ',
    };
    for (const [k, v] of Object.entries(replacements)) {
      text = text.replaceAll(k, v);
    }

    // Remove special symbols
    text = text.replace(/[♥☆♡©\\]/g, '');

    // Replace known expressions
    const exprReplacements: Record<string, string> = {
      '@': ' at ', 'e.g.,': 'for example, ', 'i.e.,': 'that is, ',
    };
    for (const [k, v] of Object.entries(exprReplacements)) {
      text = text.replaceAll(k, v);
    }

    // Fix spacing around punctuation
    text = text.replace(/ ,/g, ',').replace(/ \./g, '.').replace(/ !/g, '!');
    text = text.replace(/ \?/g, '?').replace(/ ;/g, ';').replace(/ :/g, ':').replace(/ '/g, "'");

    // Remove duplicate quotes
    while (text.includes('""')) text = text.replace('""', '"');
    while (text.includes("''")) text = text.replace("''", "'");

    // Remove extra spaces
    text = text.replace(/\s+/g, ' ').trim();

    // Add period if text doesn't end with punctuation
    if (!/[.!?;:,'")\]}…。」』】〉》›»]$/.test(text)) {
      text += '.';
    }

    if (!AVAILABLE_LANGS.includes(lang)) {
      throw new Error(`Invalid language: ${lang}. Available: ${AVAILABLE_LANGS.join(', ')}`);
    }

    return `<${lang}>${text}</${lang}>`;
  }

  call(
    textList: string[],
    langList: string[],
  ): { textIds: number[][]; textMask: number[][][] } {
    const processedTexts = textList.map((t, i) => this.preprocessText(t, langList[i]));
    const textIdsLengths = processedTexts.map(t => t.length);
    const maxLen = Math.max(...textIdsLengths);

    const textIds: number[][] = [];
    for (let i = 0; i < processedTexts.length; i++) {
      const row = new Array<number>(maxLen).fill(0);
      for (let j = 0; j < processedTexts[i].length; j++) {
        const code = processedTexts[i].charCodeAt(j);
        row[j] = this.indexer[code] ?? 0;
      }
      textIds.push(row);
    }

    const textMask = lengthToMask(textIdsLengths);
    return { textIds, textMask };
  }
}

// ─── Tensor helpers ───────────────────────────────────────────────────────────

function lengthToMask(lengths: number[], maxLen?: number): number[][][] {
  const mLen = maxLen ?? Math.max(...lengths);
  return lengths.map(len => {
    const row = Array.from({ length: mLen }, (_, j) => (j < len ? 1.0 : 0.0));
    return [row]; // shape [1, mLen]
  });
}

function getLatentMask(
  wavLengths: number[],
  baseChunkSize: number,
  chunkCompressFactor: number,
): number[][][] {
  const latentSize = baseChunkSize * chunkCompressFactor;
  const latentLengths = wavLengths.map(len =>
    Math.floor((len + latentSize - 1) / latentSize),
  );
  return lengthToMask(latentLengths);
}

/** Flatten any nested numeric array and create a float32 ONNX tensor. */
function arrayToTensor(array: unknown, dims: number[]): ort.Tensor {
  const flat: number[] = [];
  const flatten = (a: unknown): void => {
    if (Array.isArray(a)) {
      for (const item of a) flatten(item);
    } else {
      flat.push(a as number);
    }
  };
  flatten(array);
  return new ort.Tensor('float32', Float32Array.from(flat), dims);
}

function intArrayToTensor(array: number[][], dims: number[]): ort.Tensor {
  const flat: number[] = [];
  for (const row of array) flat.push(...row);
  return new ort.Tensor('int64', BigInt64Array.from(flat.map(BigInt)), dims);
}

// ─── Audio helpers ───────────────────────────────────────────────────────────

export function writeWavFile(
  filename: string,
  audioData: number[],
  sampleRate: number,
): void {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = audioData.length * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < audioData.length; i++) {
    const sample = Math.max(-1, Math.min(1, audioData[i]));
    buffer.writeInt16LE(Math.floor(sample * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filename, buffer);
}

// ─── Text chunking ───────────────────────────────────────────────────────────

function chunkText(text: string, maxLen = 300): string[] {
  const paragraphs = text.trim().split(/\n\s*\n+/).filter(p => p.trim());
  const chunks: string[] = [];

  for (let paragraph of paragraphs) {
    paragraph = paragraph.trim();
    if (!paragraph) continue;

    const sentences = paragraph.split(
      /(?<!Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Sr\.|Jr\.|Ph\.D\.|etc\.|e\.g\.|i\.e\.|vs\.|Inc\.|Ltd\.|Co\.|Corp\.|St\.|Ave\.|Blvd\.)(?<!\b[A-Z]\.)(?<=[.!?])\s+/,
    );

    let currentChunk = '';
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length + 1 <= maxLen) {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

// ─── TextToSpeech (ONNX inference) ───────────────────────────────────────────

class TextToSpeech {
  readonly sampleRate: number;
  private readonly baseChunkSize: number;
  private readonly chunkCompressFactor: number;
  private readonly ldim: number;

  constructor(
    cfgs: TtsConfig,
    private readonly textProcessor: UnicodeProcessor,
    private readonly dpOrt: ort.InferenceSession,
    private readonly textEncOrt: ort.InferenceSession,
    private readonly vectorEstOrt: ort.InferenceSession,
    private readonly vocoderOrt: ort.InferenceSession,
  ) {
    this.sampleRate = cfgs.ae.sample_rate;
    this.baseChunkSize = cfgs.ae.base_chunk_size;
    this.chunkCompressFactor = cfgs.ttl.chunk_compress_factor;
    this.ldim = cfgs.ttl.latent_dim;
  }

  private sampleNoisyLatent(duration: number[]): {
    noisyLatent: number[][][];
    latentMask: number[][][];
  } {
    const wavLenMax = Math.max(...duration) * this.sampleRate;
    const wavLengths = duration.map(d => Math.floor(d * this.sampleRate));
    const chunkSize = this.baseChunkSize * this.chunkCompressFactor;
    const latentLen = Math.floor((wavLenMax + chunkSize - 1) / chunkSize);
    const latentDim = this.ldim * this.chunkCompressFactor;

    const noisyLatent: number[][][] = [];
    for (let b = 0; b < duration.length; b++) {
      const batch: number[][] = [];
      for (let d = 0; d < latentDim; d++) {
        const row: number[] = [];
        for (let t = 0; t < latentLen; t++) {
          // Box-Muller transform for normal distribution
          const eps = 1e-10;
          const u1 = Math.max(eps, Math.random());
          const u2 = Math.random();
          row.push(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2));
        }
        batch.push(row);
      }
      noisyLatent.push(batch);
    }

    const latentMask = getLatentMask(wavLengths, this.baseChunkSize, this.chunkCompressFactor);
    for (let b = 0; b < noisyLatent.length; b++) {
      for (let d = 0; d < noisyLatent[b].length; d++) {
        for (let t = 0; t < noisyLatent[b][d].length; t++) {
          noisyLatent[b][d][t] *= latentMask[b][0][t];
        }
      }
    }

    return { noisyLatent, latentMask };
  }

  private async infer(
    textList: string[],
    langList: string[],
    style: Style,
    totalStep: number,
    speed: number,
  ): Promise<{ wav: number[]; duration: number[] }> {
    const bsz = textList.length;
    const { textIds, textMask } = this.textProcessor.call(textList, langList);
    const textIdsShape = [bsz, textIds[0].length];
    const textMaskShape = [bsz, 1, textMask[0][0].length];
    const textMaskTensor = arrayToTensor(textMask, textMaskShape);

    // Duration prediction
    const dpResult = await this.dpOrt.run({
      text_ids: intArrayToTensor(textIds, textIdsShape),
      style_dp: style.dp,
      text_mask: textMaskTensor,
    });
    const durOnnx = Array.from(dpResult['duration'].data as Float32Array);
    for (let i = 0; i < durOnnx.length; i++) durOnnx[i] /= speed;

    // Text encoding
    const textEncResult = await this.textEncOrt.run({
      text_ids: intArrayToTensor(textIds, textIdsShape),
      style_ttl: style.ttl,
      text_mask: textMaskTensor,
    });
    const textEmbTensor = textEncResult['text_emb'];

    // Sample and denoise latent
    let { noisyLatent, latentMask } = this.sampleNoisyLatent(durOnnx);
    const latentShape = [bsz, noisyLatent[0].length, noisyLatent[0][0].length];
    const latentMaskShape = [bsz, 1, latentMask[0][0].length];
    const latentMaskTensor = arrayToTensor(latentMask, latentMaskShape);

    const scalarShape = [bsz];
    const totalStepTensor = arrayToTensor(new Array(bsz).fill(totalStep), scalarShape);

    for (let step = 0; step < totalStep; step++) {
      const vectorEstResult = await this.vectorEstOrt.run({
        noisy_latent: arrayToTensor(noisyLatent, latentShape),
        text_emb: textEmbTensor,
        style_ttl: style.ttl,
        text_mask: textMaskTensor,
        latent_mask: latentMaskTensor,
        total_step: totalStepTensor,
        current_step: arrayToTensor(new Array(bsz).fill(step), scalarShape),
      });

      const denoisedLatent = Array.from(
        vectorEstResult['denoised_latent'].data as Float32Array,
      );
      let idx = 0;
      for (let b = 0; b < noisyLatent.length; b++) {
        for (let d = 0; d < noisyLatent[b].length; d++) {
          for (let t = 0; t < noisyLatent[b][d].length; t++) {
            noisyLatent[b][d][t] = denoisedLatent[idx++];
          }
        }
      }
    }

    // Vocoder
    const vocoderResult = await this.vocoderOrt.run({
      latent: arrayToTensor(noisyLatent, latentShape),
    });
    const wav = Array.from(vocoderResult['wav_tts'].data as Float32Array);

    return { wav, duration: durOnnx };
  }

  /**
   * Synthesize a single text, automatically chunking long inputs.
   */
  async synthesize(
    text: string,
    lang: string,
    style: Style,
    totalStep = 8,
    speed = 1.05,
    silenceDuration = 0.3,
  ): Promise<{ wav: number[]; duration: number[] }> {
    const maxLen = lang === 'ko' || lang === 'ja' ? 120 : 300;
    const chunks = chunkText(text, maxLen);

    let wavCat: number[] | null = null;
    let durCat = 0;

    for (const chunk of chunks) {
      const { wav, duration } = await this.infer([chunk], [lang], style, totalStep, speed);

      if (wavCat === null) {
        wavCat = wav;
        durCat = duration[0];
      } else {
        const silenceLen = Math.floor(silenceDuration * this.sampleRate);
        const silence = new Array<number>(silenceLen).fill(0);
        wavCat = [...wavCat, ...silence, ...wav];
        durCat += duration[0] + silenceDuration;
      }
    }

    return { wav: wavCat ?? [], duration: [durCat] };
  }
}

// ─── Model loaders ────────────────────────────────────────────────────────────

async function loadOnnxModels(
  onnxDir: string,
): Promise<{
  dpOrt: ort.InferenceSession;
  textEncOrt: ort.InferenceSession;
  vectorEstOrt: ort.InferenceSession;
  vocoderOrt: ort.InferenceSession;
}> {
  const [dpOrt, textEncOrt, vectorEstOrt, vocoderOrt] = await Promise.all([
    ort.InferenceSession.create(path.join(onnxDir, 'duration_predictor.onnx')),
    ort.InferenceSession.create(path.join(onnxDir, 'text_encoder.onnx')),
    ort.InferenceSession.create(path.join(onnxDir, 'vector_estimator.onnx')),
    ort.InferenceSession.create(path.join(onnxDir, 'vocoder.onnx')),
  ]);
  return { dpOrt, textEncOrt, vectorEstOrt, vocoderOrt };
}

function loadTextToSpeechSync(
  onnxDir: string,
  dpOrt: ort.InferenceSession,
  textEncOrt: ort.InferenceSession,
  vectorEstOrt: ort.InferenceSession,
  vocoderOrt: ort.InferenceSession,
): TextToSpeech {
  const cfgs = JSON.parse(
    fs.readFileSync(path.join(onnxDir, 'tts.json'), 'utf-8'),
  ) as TtsConfig;
  const textProcessor = new UnicodeProcessor(
    path.join(onnxDir, 'unicode_indexer.json'),
  );
  return new TextToSpeech(cfgs, textProcessor, dpOrt, textEncOrt, vectorEstOrt, vocoderOrt);
}

function loadVoiceStyle(voiceStylePath: string): Style {
  interface VoiceStyleJson {
    style_ttl: { data: unknown[]; dims: number[] };
    style_dp: { data: unknown[]; dims: number[] };
  }

  const raw = JSON.parse(
    fs.readFileSync(voiceStylePath, 'utf-8'),
  ) as VoiceStyleJson;

  const ttlDims = raw.style_ttl.dims;
  const dpDims = raw.style_dp.dims;

  const ttlFlat: number[] = [];
  const flatten = (a: unknown): void => {
    if (Array.isArray(a)) for (const item of a) flatten(item);
    else ttlFlat.push(a as number);
  };
  flatten(raw.style_ttl.data);

  const dpFlat: number[] = [];
  const flattenDp = (a: unknown): void => {
    if (Array.isArray(a)) for (const item of a) flattenDp(item);
    else dpFlat.push(a as number);
  };
  flattenDp(raw.style_dp.data);

  return {
    ttl: new ort.Tensor('float32', Float32Array.from(ttlFlat), ttlDims),
    dp: new ort.Tensor('float32', Float32Array.from(dpFlat), dpDims),
  };
}

// ─── SupertonicService ────────────────────────────────────────────────────────

export class SupertonicService {
  private tts: TextToSpeech | null = null;

  constructor(
    private readonly onnxDir: string,
    private readonly voiceStylesDir: string,
  ) {}

  private async ensureLoaded(): Promise<TextToSpeech> {
    if (!this.tts) {
      logger.info('Loading Supertonic ONNX models (first run, this may take a moment)...');
      const { dpOrt, textEncOrt, vectorEstOrt, vocoderOrt } = await loadOnnxModels(
        this.onnxDir,
      );
      this.tts = loadTextToSpeechSync(
        this.onnxDir,
        dpOrt,
        textEncOrt,
        vectorEstOrt,
        vocoderOrt,
      );
      logger.success('Supertonic models loaded');
    }
    return this.tts;
  }

  /**
   * Synthesize speech and write a 44.1kHz 16-bit WAV to `outputPath`.
   *
   * @param text       Input text.
   * @param lang       BCP-47 language code (e.g. "en", "ko") or "na" for auto.
   * @param voiceName  Preset voice name without extension, e.g. "M1" or "F1".
   * @param outputPath Destination .wav file path.
   * @param speed      Speed factor (0.7–2.0). Default 1.05.
   * @param totalStep  Denoising steps (5–12). Default 8.
   */
  async generateSpeech(
    text: string,
    lang: string,
    voiceName: string,
    outputPath: string,
    speed = 1.05,
    totalStep = 8,
  ): Promise<void> {
    const tts = await this.ensureLoaded();

    const voiceStylePath = path.join(this.voiceStylesDir, `${voiceName}.json`);
    if (!fs.existsSync(voiceStylePath)) {
      throw new Error(
        `Voice style not found: ${voiceStylePath}\n` +
          `Download models: git lfs install && git clone https://huggingface.co/Supertone/supertonic-3 assets/supertonic-3`,
      );
    }

    const style = loadVoiceStyle(voiceStylePath);
    const { wav, duration } = await tts.synthesize(text, lang, style, totalStep, speed);

    const wavLen = Math.floor(tts.sampleRate * duration[0]);
    writeWavFile(outputPath, wav.slice(0, wavLen), tts.sampleRate);
  }
}
