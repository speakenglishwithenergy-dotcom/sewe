import fs from 'fs/promises';
import path from 'path';
import { OpenAIService } from './openai.service';
import {
  finalizeThumbnailImage,
  finalizeShortThumbnailImage,
  getImageDimensions,
  prepareReferenceImage,
  prepareShortReferenceImage,
  SHORT_THUMB_HEIGHT,
  SHORT_THUMB_WIDTH,
  YOUTUBE_THUMB_HEIGHT,
  YOUTUBE_THUMB_WIDTH,
} from './thumbnail-image.util';
import { PodcastScript, ShortScript } from '../types';
import {
  buildThumbnailImagePrompt,
  buildThumbnailScenePrompt,
} from '../prompts/thumbnail.prompt';
import {
  buildShortThumbnailImagePrompt,
  buildShortThumbnailScenePrompt,
} from '../prompts/short-thumbnail.prompt';
import { logger } from '../utils/logger';

export class ThumbnailService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly assetsDir: string,
  ) {}

  async generate(script: PodcastScript, topic: string, outputPath: string): Promise<void> {
    const demoPath = path.join(this.assetsDir, 'demo-thumbnail.png');

    const thumbnailScene =
      script.thumbnailScene ??
      (await this.generateScene(topic, script.title, script.thumbnailText));

    const prompt = buildThumbnailImagePrompt({
      topic,
      episodeTitle: script.title,
      thumbnailText: script.thumbnailText,
      thumbnailScene,
    });

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

    const thumbnailBuffer = await finalizeThumbnailImage(apiBuffer);
    await fs.writeFile(outputPath, thumbnailBuffer);

    logger.success(
      `Thumbnail saved → ${outputPath} (${YOUTUBE_THUMB_WIDTH}x${YOUTUBE_THUMB_HEIGHT}, 16:9)`,
    );
  }

  async generateShort(
    script: ShortScript,
    episode: Pick<PodcastScript, 'title' | 'thumbnailText' | 'thumbnailScene'>,
    topic: string,
    outputPath: string,
  ): Promise<void> {
    const demoShortPath = path.join(this.assetsDir, 'demo-short-thumbnail.png');
    const demoLandscapePath = path.join(this.assetsDir, 'demo-thumbnail.png');

    const thumbnailScene =
      episode.thumbnailScene ??
      script.thumbnailScene ??
      (await this.generateShortScene(topic, episode.title, episode.thumbnailText));

    const prompt = buildShortThumbnailImagePrompt({
      topic,
      episodeTitle: episode.title,
      thumbnailText: episode.thumbnailText,
      thumbnailScene,
    });

    logger.info(`Generating short thumbnail for: "${episode.thumbnailText}"`);

    const shortReferenceBuffer = await prepareShortReferenceImage(demoShortPath);
    const landscapeReferenceBuffer = await prepareReferenceImage(demoLandscapePath);
    const refSize = await getImageDimensions(shortReferenceBuffer);
    logger.info(`Reference prepared → ${refSize.width}x${refSize.height} (9:16 content letterboxed for API)`);
    logger.info('Including landscape reference for Victor/Lisa sweater color consistency');

    const apiBuffer = await this.openai.generateImageEdit(
      prompt,
      [shortReferenceBuffer, landscapeReferenceBuffer],
      ['demo-short-thumbnail.png', 'demo-thumbnail-character-colors.png'],
    );
    const apiSize = await getImageDimensions(apiBuffer);
    logger.info(`API returned → ${apiSize.width}x${apiSize.height}`);

    const thumbnailBuffer = await finalizeShortThumbnailImage(apiBuffer);
    await fs.writeFile(outputPath, thumbnailBuffer);

    logger.success(
      `Short thumbnail saved → ${outputPath} (${SHORT_THUMB_WIDTH}x${SHORT_THUMB_HEIGHT}, 9:16)`,
    );
  }

  private async generateScene(
    topic: string,
    episodeTitle: string,
    thumbnailText: string,
  ): Promise<string> {
    logger.info('Generating thumbnail scene description...');

    const result = await this.openai.generateJSON(
      buildThumbnailScenePrompt(topic, episodeTitle, thumbnailText),
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

  private async generateShortScene(
    topic: string,
    episodeTitle: string,
    thumbnailText: string,
  ): Promise<string> {
    logger.info('Generating short thumbnail scene description...');

    const result = await this.openai.generateJSON(
      buildShortThumbnailScenePrompt(topic, episodeTitle, thumbnailText),
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
