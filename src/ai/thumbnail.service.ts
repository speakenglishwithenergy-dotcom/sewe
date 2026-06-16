import fs from 'fs/promises';
import path from 'path';
import { OpenAIService } from './openai.service';
import {
  getImageDimensions,
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

export class ThumbnailService {
  constructor(
    private readonly openai: OpenAIService,
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
      script.thumbnailScene ??
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

    const referenceBuffer = await prepareReferenceImage(demoPath);
    const refSize = await getImageDimensions(referenceBuffer);
    logger.info(`Reference prepared → ${refSize.width}x${refSize.height} (16:9 content letterboxed for API)`);

    const apiBuffer = await this.openai.generateImageEdit(
      prompt,
      [referenceBuffer],
      ['demo-thumbnail.png'],
    );
    const apiSize = await getImageDimensions(apiBuffer);
    logger.info(`API returned → ${apiSize.width}x${apiSize.height}`);

    await fs.writeFile(outputPath, apiBuffer);

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
      script.thumbnailScene ??
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

    const referenceBuffer = await prepareReferenceImage(templatePath);
    const refSize = await getImageDimensions(referenceBuffer);
    logger.info(`Background reference prepared → ${refSize.width}x${refSize.height}`);

    const apiBuffer = await this.openai.generateImageEdit(
      prompt,
      [referenceBuffer],
      ['background.png'],
    );
    const apiSize = await getImageDimensions(apiBuffer);
    logger.info(`API returned → ${apiSize.width}x${apiSize.height}`);

    await fs.writeFile(outputPath, apiBuffer);

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
      episode.thumbnailScene ??
      script.thumbnailScene ??
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

    const shortReferenceBuffer = await prepareShortReferenceImage(demoShortPath);
    const refSize = await getImageDimensions(shortReferenceBuffer);
    logger.info(`Reference prepared → ${refSize.width}x${refSize.height} (9:16 content letterboxed for portrait API)`);

    const apiBuffer = await this.openai.generateImageEdit(
      prompt,
      [shortReferenceBuffer],
      ['demo-short-thumbnail.png'],
      { size: '1024x1536' },
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

  private async generateScene(
    topic: string,
    episodeTitle: string,
    thumbnailText: string,
  ): Promise<string> {
    logger.info('Generating thumbnail scene description...');

    const result = await this.openai.generateJSON(
      buildThumbnailScenePrompt(this.ctx, topic, episodeTitle, thumbnailText),
      'You are a creative art director. Respond only with valid JSON.',
      (data: unknown) => {
        if (
          typeof data !== 'object' ||
          data === null ||
          !('thumbnailScene' in data) ||
          typeof (data as { thumbnailScene: unknown }).thumbnailScene !== 'string'
        ) {
          throw new Error('Invalid thumbnail scene response');
        }
        return (data as { thumbnailScene: string }).thumbnailScene;
      },
    );

    return result;
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
    logger.info('Generating short thumbnail scene description...');

    const result = await this.openai.generateJSON(
      buildShortThumbnailScenePrompt(this.ctx, topic, episodeTitle, thumbnailText),
      'You are a creative art director. Respond only with valid JSON.',
      (data: unknown) => {
        if (
          typeof data !== 'object' ||
          data === null ||
          !('thumbnailScene' in data) ||
          typeof (data as { thumbnailScene: unknown }).thumbnailScene !== 'string'
        ) {
          throw new Error('Invalid short thumbnail scene response');
        }
        return (data as { thumbnailScene: string }).thumbnailScene;
      },
    );

    return result;
  }
}
