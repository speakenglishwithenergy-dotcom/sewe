import fs from 'fs/promises';
import { ImageService } from './image.service';
import { OpenAIService } from './openai.service';
import {
  getImageDimensions,
  loadReferenceImagePng,
  normalizePodcastThumbnail,
  prepareReferenceImage,
  prepareShortReferenceImage,
  scaleShortThumbnailToVideoSize,
  SHORT_THUMB_HEIGHT,
  SHORT_THUMB_WIDTH,
} from './thumbnail-image.util';
import { DISABLE_THUMBNAIL_GENERATION } from './thumbnail.config';
import {
  normalizeManualThumbnail,
  printManualThumbnailInstructions,
  waitForManualThumbnailFile,
} from './manual-thumbnail.util';
import { ChannelContext } from '../channel/channel.types';
import { PodcastScript, ShortScript } from '../types';
import {
  buildThumbnailImagePrompt,
  buildThumbnailScenePrompt,
  composeFreshThumbnailScene,
  isFreshEpisodeThumbnail,
} from '../prompts/thumbnail.prompt';
import {
  buildBackgroundImagePrompt,
  buildBackgroundScenePrompt,
} from '../prompts/background.prompt';
import {
  buildShortThumbnailImagePrompt,
  buildShortThumbnailScenePrompt,
} from '../prompts/short-thumbnail.prompt';
import { logger } from '../utils/logger';

function parseSceneResponse(data: unknown, label: string): string {
  if (typeof data !== 'object' || data === null || !('thumbnailScene' in data)) {
    throw new Error(`Invalid ${label} response`);
  }

  const record = data as Record<string, unknown>;
  if (typeof record.thumbnailScene !== 'string' || !record.thumbnailScene.trim()) {
    throw new Error(`Invalid ${label} response`);
  }

  const hasFreshFields =
    typeof record.visualGenre === 'string' &&
    typeof record.colorMood === 'string' &&
    typeof record.setting === 'string' &&
    typeof record.interaction === 'string';

  if (hasFreshFields) {
    return composeFreshThumbnailScene({
      visualGenre: record.visualGenre as string,
      colorMood: record.colorMood as string,
      setting: record.setting as string,
      interaction: record.interaction as string,
      badgePlacement:
        typeof record.badgePlacement === 'string' ? record.badgePlacement : undefined,
      thumbnailScene: record.thumbnailScene,
    });
  }

  return record.thumbnailScene;
}

/** Reuse cached scene only if it already matches fresh-episode structured format. */
function resolveCachedScene(
  ctx: ChannelContext,
  cached: string | undefined,
): string | undefined {
  if (!cached?.trim()) return undefined;
  if (!isFreshEpisodeThumbnail(ctx)) return cached;
  return cached.includes('VISUAL GENRE:') ? cached : undefined;
}

export class ThumbnailService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly images: ImageService,
    private readonly ctx: ChannelContext,
  ) {}

  async generate(script: PodcastScript, topic: string, outputPath: string): Promise<void> {
    if (await this.fileExists(outputPath)) {
      logger.info(`⏭  Thumbnail already exists — skipping → ${outputPath}`);
      if (DISABLE_THUMBNAIL_GENERATION) {
        await normalizeManualThumbnail('podcast', outputPath);
      }
      return;
    }

    const demoPath = this.ctx.assets.demoThumbnail;

    const thumbnailScene =
      resolveCachedScene(this.ctx, script.thumbnailScene) ??
      (await this.generateScene(topic, script.title, script.thumbnailText));

    const prompt = buildThumbnailImagePrompt(this.ctx, {
      topic,
      episodeTitle: script.title,
      thumbnailText: script.thumbnailText,
      thumbnailScene,
    });

    if (DISABLE_THUMBNAIL_GENERATION) {
      printManualThumbnailInstructions('podcast', outputPath, demoPath, prompt);
      await waitForManualThumbnailFile(outputPath);
      await normalizeManualThumbnail('podcast', outputPath);
      logger.success(`Manual thumbnail ready → ${outputPath}`);
      return;
    }

    logger.info(`Generating thumbnail image for: "${script.thumbnailText}"`);

    const referenceBuffer = await this.prepareLandscapeReference(demoPath);
    const refSize = await getImageDimensions(referenceBuffer);
    logger.info(`Reference prepared → ${refSize.width}x${refSize.height} (${this.images.provider})`);

    const apiBuffer = await this.images.generateImageEdit(
      prompt,
      [referenceBuffer],
      ['demo-thumbnail.png'],
      { size: '1536x1024', aspectRatio: '16:9' },
    );
    const finalBuffer =
      this.images.provider === 'openai' ? apiBuffer : await normalizePodcastThumbnail(apiBuffer);
    const apiSize = await getImageDimensions(finalBuffer);
    logger.info(`API returned → ${apiSize.width}x${apiSize.height}`);

    await fs.writeFile(outputPath, finalBuffer);

    logger.success(`Thumbnail saved → ${outputPath} (${apiSize.width}x${apiSize.height})`);
  }

  async generateBackground(
    script: PodcastScript,
    topic: string,
    outputPath: string,
    templatePath: string,
  ): Promise<void> {
    if (await this.fileExists(outputPath)) {
      logger.info(`⏭  Background already exists — skipping → ${outputPath}`);
      return;
    }

    const thumbnailScene =
      resolveCachedScene(this.ctx, script.thumbnailScene) ??
      (await this.generateBackgroundScene(topic, script.title));

    const prompt = buildBackgroundImagePrompt(this.ctx, {
      topic,
      episodeTitle: script.title,
      thumbnailScene,
    });

    if (DISABLE_THUMBNAIL_GENERATION) {
      printManualThumbnailInstructions('podcast', outputPath, templatePath, prompt);
      await waitForManualThumbnailFile(outputPath);
      await normalizeManualThumbnail('podcast', outputPath);
      logger.success(`Manual background ready → ${outputPath}`);
      return;
    }

    logger.info(`Generating episode background for: "${script.title}"`);

    const referenceBuffer = await this.prepareLandscapeReference(templatePath);
    const refSize = await getImageDimensions(referenceBuffer);
    logger.info(`Background reference prepared → ${refSize.width}x${refSize.height}`);

    const apiBuffer = await this.images.generateImageEdit(
      prompt,
      [referenceBuffer],
      ['background.png'],
      { size: '1536x1024', aspectRatio: '16:9' },
    );
    const finalBuffer =
      this.images.provider === 'openai' ? apiBuffer : await normalizePodcastThumbnail(apiBuffer);
    const apiSize = await getImageDimensions(finalBuffer);
    logger.info(`API returned → ${apiSize.width}x${apiSize.height}`);

    await fs.writeFile(outputPath, finalBuffer);

    logger.success(`Background saved → ${outputPath} (${apiSize.width}x${apiSize.height})`);
  }

  async generateShort(
    script: ShortScript,
    episode: Pick<PodcastScript, 'title' | 'thumbnailText' | 'thumbnailScene'>,
    topic: string,
    outputPath: string,
  ): Promise<void> {
    if (await this.fileExists(outputPath)) {
      logger.info(`⏭  Short thumbnail already exists — skipping → ${outputPath}`);
      if (DISABLE_THUMBNAIL_GENERATION) {
        await normalizeManualThumbnail('short', outputPath);
      }
      return;
    }

    const demoShortPath = this.ctx.assets.demoShortThumbnail;

    const thumbnailScene =
      resolveCachedScene(this.ctx, episode.thumbnailScene) ??
      resolveCachedScene(this.ctx, script.thumbnailScene) ??
      (await this.generateShortScene(topic, episode.title, episode.thumbnailText));

    const prompt = buildShortThumbnailImagePrompt(this.ctx, {
      topic,
      episodeTitle: episode.title,
      thumbnailText: episode.thumbnailText,
      thumbnailScene,
    });

    if (DISABLE_THUMBNAIL_GENERATION) {
      printManualThumbnailInstructions('short', outputPath, demoShortPath, prompt);
      await waitForManualThumbnailFile(outputPath);
      await normalizeManualThumbnail('short', outputPath);
      logger.success(`Manual short thumbnail ready → ${outputPath}`);
      return;
    }

    logger.info(`Generating short thumbnail for: "${episode.thumbnailText}"`);

    const shortReferenceBuffer = await this.preparePortraitReference(demoShortPath);
    const refSize = await getImageDimensions(shortReferenceBuffer);
    logger.info(`Reference prepared → ${refSize.width}x${refSize.height} (${this.images.provider})`);

    const apiBuffer = await this.images.generateImageEdit(
      prompt,
      [shortReferenceBuffer],
      ['demo-short-thumbnail.png'],
      { size: '1024x1536', aspectRatio: '9:16' },
    );
    const apiSize = await getImageDimensions(apiBuffer);
    logger.info(`API returned → ${apiSize.width}x${apiSize.height}`);

    const finalBuffer = await scaleShortThumbnailToVideoSize(apiBuffer);
    const finalSize = await getImageDimensions(finalBuffer);
    logger.info(
      `Short thumbnail scaled → ${finalSize.width}x${finalSize.height} (full image, no crop)`,
    );

    await fs.writeFile(outputPath, finalBuffer);

    logger.success(
      `Short thumbnail saved → ${outputPath} (${SHORT_THUMB_WIDTH}x${SHORT_THUMB_HEIGHT})`,
    );
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private prepareLandscapeReference(inputPath: string): Promise<Buffer> {
    return this.images.provider === 'openai'
      ? prepareReferenceImage(inputPath)
      : loadReferenceImagePng(inputPath);
  }

  private preparePortraitReference(inputPath: string): Promise<Buffer> {
    return this.images.provider === 'openai'
      ? prepareShortReferenceImage(inputPath)
      : loadReferenceImagePng(inputPath);
  }

  private async generateScene(
    topic: string,
    episodeTitle: string,
    thumbnailText: string,
  ): Promise<string> {
    logger.info(
      isFreshEpisodeThumbnail(this.ctx)
        ? 'Generating fresh-episode thumbnail scene...'
        : 'Generating thumbnail scene description...',
    );

    return this.openai.generateJSON(
      buildThumbnailScenePrompt(this.ctx, topic, episodeTitle, thumbnailText),
      'You are a creative art director. Respond only with valid JSON.',
      (data: unknown) => parseSceneResponse(data, 'thumbnail scene'),
    );
  }

  private async generateBackgroundScene(
    topic: string,
    episodeTitle: string,
  ): Promise<string> {
    logger.info('Generating background scene description...');

    const result = await this.openai.generateJSON(
      buildBackgroundScenePrompt(this.ctx, topic, episodeTitle),
      'You are a creative art director. Respond only with valid JSON.',
      (data: unknown) => {
        if (
          typeof data !== 'object' ||
          data === null ||
          !('thumbnailScene' in data) ||
          typeof (data as { thumbnailScene: unknown }).thumbnailScene !== 'string'
        ) {
          throw new Error('Invalid background scene response');
        }
        return (data as { thumbnailScene: string }).thumbnailScene;
      },
    );

    return result;
  }

  private async generateShortScene(
    topic: string,
    episodeTitle: string,
    thumbnailText: string,
  ): Promise<string> {
    logger.info(
      isFreshEpisodeThumbnail(this.ctx)
        ? 'Generating fresh-episode short thumbnail scene...'
        : 'Generating short thumbnail scene description...',
    );

    return this.openai.generateJSON(
      buildShortThumbnailScenePrompt(this.ctx, topic, episodeTitle, thumbnailText),
      'You are a creative art director. Respond only with valid JSON.',
      (data: unknown) => parseSceneResponse(data, 'short thumbnail scene'),
    );
  }
}
