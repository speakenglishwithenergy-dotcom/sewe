import fs from 'fs/promises';
import path from 'path';
import { OpenAIService } from './openai.service';
import {
  finalizeThumbnailImage,
  getImageDimensions,
  prepareReferenceImage,
  YOUTUBE_THUMB_HEIGHT,
  YOUTUBE_THUMB_WIDTH,
} from './thumbnail-image.util';
import { PodcastScript } from '../types';
import {
  buildThumbnailImagePrompt,
  buildThumbnailScenePrompt,
} from '../prompts/thumbnail.prompt';
import { logger } from '../utils/logger';

export class ThumbnailService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly assetsDir: string,
  ) {}

  async generate(script: PodcastScript, topic: string, outputPath: string): Promise<void> {
    const demoPath = path.join(this.assetsDir, 'demo-thumbnail.png');

    const thumbnailScene =
      script.thumbnailScene ?? (await this.generateScene(topic, script.thumbnailText));

    const prompt = buildThumbnailImagePrompt({
      topic,
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

  private async generateScene(topic: string, thumbnailText: string): Promise<string> {
    logger.info('Generating thumbnail scene description...');

    const result = await this.openai.generateJSON(
      buildThumbnailScenePrompt(topic, thumbnailText),
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
}
