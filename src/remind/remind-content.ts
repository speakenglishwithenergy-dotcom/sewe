import fs from 'fs/promises';
import path from 'path';
import { TopicRegistryFile } from '../topic/topic.types';

export interface RemindEmailContent {
  subject: string;
  html: string;
  text: string;
}

async function loadRecentTopics(
  projectRoot: string,
  channelId: string,
): Promise<TopicRegistryFile['topics']> {
  const registryPath = path.join(projectRoot, 'channels', channelId, 'topics.json');
  try {
    const raw = await fs.readFile(registryPath, 'utf-8');
    const registry = JSON.parse(raw) as TopicRegistryFile;
    return registry.topics.slice(-5).reverse();
  } catch {
    return [];
  }
}

export async function buildRemindEmailContent(
  projectRoot: string,
  channelId: string,
): Promise<RemindEmailContent> {
  const recentTopics = await loadRecentTopics(projectRoot, channelId);
  const batchCommand = `npm run batch -- --channel=${channelId}`;

  const recentList = recentTopics.length > 0
    ? recentTopics.map((topic) => `• ${topic.topic} (${topic.scheduledDate})`).join('\n')
    : '• (chưa có topic nào trong registry)';

  const subject = '🎬 Nhắc làm video — Batch tuần này (SEWE)';

  const text = `Chào bạn,

Đến giờ làm video rồi.

Chạy lệnh sau trong thư mục project:

  ${batchCommand}

Gợi ý workflow:
1. Chọn 2 hoặc 3 video
2. AI gợi ý topic → duyệt
3. Chọn ngày đăng (2=T2, 4=T4, 6=T6...)
4. Generate + schedule tự động

Topic gần đây:
${recentList}

Chúc bạn một tuần sản xuất vui vẻ!
— SEWE Reminder`;

  const html = `
<p>Chào bạn,</p>
<p><strong>Đến giờ làm video rồi.</strong></p>
<p>Chạy lệnh sau trong thư mục project:</p>
<pre style="background:#f4f4f5;padding:12px;border-radius:8px;font-size:14px;">${batchCommand}</pre>
<p><strong>Gợi ý workflow:</strong></p>
<ol>
  <li>Chọn 2 hoặc 3 video</li>
  <li>AI gợi ý topic → duyệt</li>
  <li>Chọn ngày đăng (2=T2, 4=T4, 6=T6...)</li>
  <li>Generate + schedule tự động</li>
</ol>
<p><strong>Topic gần đây:</strong></p>
<ul>
  ${recentTopics.length > 0
    ? recentTopics.map((topic) => `<li>${topic.topic} <em>(${topic.scheduledDate})</em></li>`).join('')
    : '<li>(chưa có topic nào trong registry)</li>'}
</ul>
<p>Chúc bạn một tuần sản xuất vui vẻ!<br>— SEWE Reminder</p>
`.trim();

  return { subject, html, text };
}
