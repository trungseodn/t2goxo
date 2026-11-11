import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { PrismaService } from '../prisma/prisma.service';

/**
 * ZTTeamAIService — Provider adapter for AI text generation.
 * Currently supports OpenAI GPT. Expandable to Claude/Gemini via env config.
 */
@Injectable()
export class ZTTeamAIService {
  private readonly logger = new Logger('ZTTeamAIService');

  constructor(private readonly prisma: PrismaService) { }

  private async getSettings() {
    const records = await this.prisma.ztteam_settings.findMany({
      where: {
        key: {
          in: [
            'active_ai_provider',
            'openai_api_key',
            'deepseek_api_key',
            'gemini_api_key',
          ]
        }
      }
    });
    const settings: Record<string, string> = {};
    records.forEach(r => settings[r.key] = r.value);

    return {
      activeProvider: settings['active_ai_provider'] || 'openai',
      openaiKey: settings['openai_api_key'] || process.env.OPENAI_API_KEY,
      deepseekKey: settings['deepseek_api_key'] || process.env.DEEPSEEK_API_KEY,
      geminiKey: settings['gemini_api_key'] || process.env.GEMINI_API_KEY,
    };
  }

  /**
   * ZTTeam: Gọi Gemini API với cơ chế tự động thử lại và Fallback model chống lỗi 503 High Demand
   */
  private async ztteam_callGeminiWithFallback(
    geminiKey: string,
    prompt: string,
    options?: { jsonMode?: boolean; temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(geminiKey);

    const modelsToTry = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'];
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: options?.temperature ?? 0.75,
            maxOutputTokens: options?.maxTokens,
            ...(options?.jsonMode ? { responseMimeType: 'application/json' } : {})
          }
        });
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (err: any) {
        lastError = err;
        this.logger.warn(`Gemini model ${modelName} gặp lỗi (${err.message}), đang thử model dự phòng...`);
        /** Nghỉ 1 giây trước khi thử model tiếp theo */
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    throw lastError;
  }

  /**
   * Generate a simple short caption for YouTube videos
   */
  async ztteam_generateShortCaption(promptText: string): Promise<string> {
    const settings = await this.getSettings();
    if (!settings.openaiKey && !settings.deepseekKey && !settings.geminiKey) {
      this.logger.warn('No API keys found, returning default caption');
      return 'Awesome short video!';
    }
    try {
      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        const text = await this.ztteam_callGeminiWithFallback(settings.geminiKey, promptText, { temperature: 0.8 });
        return (text || '').trim();
      } else {
        const OpenAI = require('openai').default;
        const isDeepseek = settings.activeProvider === 'deepseek' && settings.deepseekKey;
        const rawKey = isDeepseek ? settings.deepseekKey : settings.openaiKey;
        const apiKey = (rawKey || '').trim();
        const baseURL = isDeepseek ? 'https://api.deepseek.com' : undefined;
        const modelName = isDeepseek ? 'deepseek-chat' : 'gpt-4o-mini';

        if (!apiKey) throw new Error(`Missing API Key for ${settings.activeProvider}`);

        const openai = new OpenAI({ apiKey, baseURL });
        const response = await openai.chat.completions.create({
          model: modelName,
          messages: [
            { role: 'user', content: promptText }
          ],
          max_tokens: 300,
          temperature: 0.8,
        });

        return response.choices[0]?.message?.content?.trim() || 'Awesome short video!';
      }
    } catch (e: any) {
      this.logger.error(`Error generating short caption: ${e.message}`);
      return 'Awesome short video!';
    }
  }

  /**
   * Generate a short reel script (~15 seconds) from a WordPress post.
   * @param postContent - The article text content
   * @param tone - Writing tone (professional, humorous, dramatic, etc.)
   * @param maxWords - Target word count for the script
   * @returns The generated script text
   */
  async ztteam_generateScript(
    postContent: string,
    tone: string = 'professional',
    maxWords: number = 60,
    customPrompt?: string | null,
  ): Promise<{ caption: string; hook: string; sub_voice: string }> {
    this.logger.log(`Generating reel script (tone: ${tone}, maxWords: ${maxWords})`);

    const settings = await this.getSettings();
    if (!settings.openaiKey && !settings.deepseekKey && !settings.geminiKey) {
      this.logger.warn('No API keys found, returning mock script');
      const mockScript = await this.ztteam_getMockScript(postContent);
      return { caption: 'Mock Caption', hook: 'Mock Hook', sub_voice: mockScript };
    }

    const defaultSystemPrompt = `Bạn là chuyên gia viết kịch bản video ngắn (Reel) cho mạng xã hội.
Viết kịch bản giọng đọc cho video ~15 giây dựa trên bài viết người dùng cung cấp.

QUY TẮC TUYỆT ĐỐI CẦN TUÂN THỦ:
- CHỈ VIẾT ĐÚNG ${maxWords} TỪ HOẶC ÍT HƠN. KHÔNG ĐƯỢC VƯỢT QUÁ SỐ TỪ NÀY.
- Giọng văn: ${tone}
- Ngôn ngữ: Tự động viết bằng đúng ngôn ngữ của bài viết gốc (Nếu bài viết bằng tiếng Anh thì viết kịch bản bằng tiếng Anh, nếu bài viết bằng tiếng Việt thì viết kịch bản bằng tiếng Việt).
- Phải có hook mạnh ở câu đầu (gây tò mò)
- Kết thúc bằng CTA ngắn gọn
- KHÔNG dùng emoji, hashtag, hay kí tự đặc biệt trong kịch bản giọng đọc`;

    const systemPrompt = customPrompt ? customPrompt : defaultSystemPrompt;
    const promptWithRules = `${systemPrompt}

BẮT BUỘC TRẢ VỀ DẠNG KẾT QUẢ ĐÚNG THEO ĐỊNH DẠNG JSON SAU (KHÔNG KÈM THEO BẤT KỲ VĂN BẢN NGOÀI NÀO):
{
  "caption": "Trạng thái bài đăng mạng xã hội (kèm hashtag nếu phù hợp)",
  "hook": "Tiêu đề ngắn gây chú ý hiển thị trên video",
  "sub_voice": "Kịch bản đọc voiceover hoàn chỉnh"
}`;

    const userContent = `Generate Reel content from the following article:\n\n${postContent.substring(0, 2000)}`;

    try {
      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        const text = await this.ztteam_callGeminiWithFallback(
          settings.geminiKey,
          `${promptWithRules}\n\n${userContent}`,
          { jsonMode: true, temperature: 0.8, maxTokens: Math.max(2000, Math.round(maxWords * 8)) }
        );
        const jsonResult = this.ztteam_safeParseJson(text);
        return {
          caption: jsonResult.caption || '',
          hook: jsonResult.hook || '',
          sub_voice: jsonResult.sub_voice || ''
        };
      } else {
        /** Fallback or explicit choice for OpenAI / Deepseek */
        const isDeepseek = settings.activeProvider === 'deepseek' && settings.deepseekKey;
        const rawKey = isDeepseek ? settings.deepseekKey : settings.openaiKey;
        const apiKey = (rawKey || '').trim();
        const baseURL = isDeepseek ? 'https://api.deepseek.com' : undefined;
        const modelName = isDeepseek ? 'deepseek-chat' : 'gpt-4o-mini';

        if (!apiKey) throw new Error(`Missing API Key for ${settings.activeProvider}`);

        const openai = new OpenAI({ apiKey, baseURL });
        const response = await openai.chat.completions.create({
          model: modelName,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: promptWithRules },
            { role: 'user', content: userContent },
          ],
          max_tokens: Math.max(2000, Math.round(maxWords * 8)),
          temperature: 0.8,
        });

        const resultString = response.choices[0]?.message?.content?.trim() || '{}';
        const result = this.ztteam_safeParseJson(resultString);

        this.logger.log(`Script generated: Hook="${result.hook}"`);
        return {
          caption: result.caption || '',
          hook: result.hook || '',
          sub_voice: result.sub_voice || ''
        };
      }
    } catch (error: any) {
      this.logger.error(`AI script generation failed: ${error.message}`);
      throw new Error('Lỗi tạo kịch bản AI: ' + error.message);
    }
  }

  /**
   * Safe JSON Parser & Repair Helper
   * Cleans markdown blocks, repairs unclosed quotes/braces, and extracts fields via Regex fallback if JSON is truncated
   */
  private ztteam_safeParseJson(rawText: string): any {
    if (!rawText || !rawText.trim()) return {};

    /** 1. Strip markdown code fences if present */
    let cleanText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    /** 2. Attempt standard JSON.parse */
    try {
      return JSON.parse(cleanText);
    } catch (e1) {
      this.logger.warn(`Initial JSON parse failed: ${(e1 as Error).message}. Attempting repair...`);
    }

    /** 3. Attempt to repair truncated JSON (append closing quote and brace if cut off) */
    const repairAttempts = [
      cleanText + '"}' ,
      cleanText + '}' ,
      cleanText + '"}]' ,
      cleanText + '}]' ,
    ];

    for (const attempt of repairAttempts) {
      try {
        return JSON.parse(attempt);
      } catch (e2) {
        /** continue trying */
      }
    }

    /** 4. Regex fallback extraction for caption, hook, sub_voice, comment */
    this.logger.warn('JSON repair failed. Using regex extraction fallback...');
    const result: Record<string, string> = {};

    const captionMatch = cleanText.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*)"?/s);
    if (captionMatch && captionMatch[1]) {
      result.caption = captionMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }

    const hookMatch = cleanText.match(/"hook"\s*:\s*"((?:[^"\\]|\\.)*)"?/s);
    if (hookMatch && hookMatch[1]) {
      result.hook = hookMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }

    const voiceMatch = cleanText.match(/"sub_voice"\s*:\s*"((?:[^"\\]|\\.)*)"?/s);
    if (voiceMatch && voiceMatch[1]) {
      result.sub_voice = voiceMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }

    const commentMatch = cleanText.match(/"comment"\s*:\s*"((?:[^"\\]|\\.)*)"?/s);
    if (commentMatch && commentMatch[1]) {
      result.comment = commentMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }

    return result;
  }

  /**
   * Generate an AI caption and first comment for an image post based on a WordPress article.
   */
  async ztteam_generateImageContent(
    postContent: string,
    tone: string = 'professional',
    customPrompt?: string | null,
  ): Promise<{ caption: string; comment: string }> {
    this.logger.log(`Generating image content (tone: ${tone})`);

    const settings = await this.getSettings();
    if (!settings.openaiKey && !settings.deepseekKey && !settings.geminiKey) {
      this.logger.warn('No API keys found, returning mock image content');
      return { caption: 'Mock Caption', comment: 'Mock Comment' };
    }

    const defaultSystemPrompt = `Bạn là chuyên gia viết bài đăng (Post) kèm hình ảnh cho Fanpage mạng xã hội.
Viết một nội dung bài đăng thật thu hút dựa trên bài viết người dùng cung cấp.

QUY TẮC TUYỆT ĐỐI CẦN TUÂN THỦ:
- Giọng văn: ${tone}
- Ngôn ngữ: Tự động viết bằng đúng ngôn ngữ của bài viết gốc (Nếu bài viết bằng tiếng Anh thì viết kịch bản bằng tiếng Anh, nếu bài viết bằng tiếng Việt thì viết kịch bản bằng tiếng Việt).
- Viết 1 tiêu đề (caption) hấp dẫn, ngắn gọn, súc tích, chia đoạn rõ ràng.
- Viết 1 bình luận (comment) để ghim dưới bài viết nhằm kêu gọi tương tác (call to action).
- CÓ THỂ dùng emoji phù hợp.`;

    const systemPrompt = customPrompt ? customPrompt : defaultSystemPrompt;
    const promptWithRules = `${systemPrompt}

BẮT BUỘC TRẢ VỀ DẠNG KẾT QUẢ ĐÚNG THEO ĐỊNH DẠNG JSON SAU (KHÔNG KÈM THEO BẤT KỲ VĂN BẢN NGOÀI NÀO):
{
  "caption": "Nội dung bài đăng kèm ảnh",
  "comment": "Bình luận kêu gọi tương tác để ghim dưới bài viết"
}`;

    const userContent = `Generate Facebook image post content from the following article:\n\n${postContent.substring(0, 2000)}`;

    try {
      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        const text = await this.ztteam_callGeminiWithFallback(
          settings.geminiKey,
          `${promptWithRules}\n\n${userContent}`,
          { jsonMode: true, temperature: 0.8, maxTokens: 2000 }
        );
        const jsonResult = this.ztteam_safeParseJson(text);
        return {
          caption: jsonResult.caption || '',
          comment: jsonResult.comment || ''
        };
      } else {
        const isDeepseek = settings.activeProvider === 'deepseek' && settings.deepseekKey;
        const rawKey = isDeepseek ? settings.deepseekKey : settings.openaiKey;
        const apiKey = (rawKey || '').trim();
        const baseURL = isDeepseek ? 'https://api.deepseek.com' : undefined;
        const modelName = isDeepseek ? 'deepseek-chat' : 'gpt-4o-mini';

        if (!apiKey) throw new Error(`Missing API Key for ${settings.activeProvider}`);

        const openai = new OpenAI({ apiKey, baseURL });
        const response = await openai.chat.completions.create({
          model: modelName,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: promptWithRules },
            { role: 'user', content: userContent },
          ],
          max_tokens: 2000,
          temperature: 0.8,
        });

        const resultString = response.choices[0]?.message?.content?.trim() || '{}';
        const result = this.ztteam_safeParseJson(resultString);

        return {
          caption: result.caption || '',
          comment: result.comment || ''
        };
      }
    } catch (error: any) {
      this.logger.error(`AI image content generation failed: ${error.message}`);
      throw new Error('Lỗi tạo content AI: ' + error.message);
    }
  }

  /**
   * Generate subtitles with precise timing synchronization.
   * Uses smart chunking (breaks on punctuation like commas and periods)
   * and calculates sentence durations using speech pause weights to match natural TTS audio timing.
   * @param script - Full text script
   * @param audioDuration - Total audio duration in seconds
   * @returns Array of subtitle entries with start, end, and text
   */
  ztteam_generateSubtitles(
    script: string,
    audioDuration: number,
  ): Array<{ start: number; end: number; text: string }> {
    /** Clean text and split into words */
    const cleanedScript = script.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    const words = cleanedScript.split(' ').filter(w => w.length > 0);
    
    if (words.length === 0 || audioDuration <= 0) return [];

    const sentences: string[] = [];
    let currentChunk: string[] = [];

    for (const word of words) {
      currentChunk.push(word);
      /** Break chunk if:
       * 1. Reaches 6 words max (ideal for readable short video subtitles)
       * 2. Ends with comma/semicolon/colon when chunk has >= 3 words
       * 3. Ends with period/question/exclamation mark
       */
      const isSentenceEnd = /[.!?。]$/.test(word);
      const isClauseEnd = /[,;:，；:]$/.test(word) && currentChunk.length >= 3;
      const isMaxWords = currentChunk.length >= 6;

      if (isSentenceEnd || isClauseEnd || isMaxWords) {
        sentences.push(currentChunk.join(' '));
        currentChunk = [];
      }
    }
    if (currentChunk.length > 0) {
      sentences.push(currentChunk.join(' '));
    }

    if (sentences.length === 0) return [];

    /** 
     * Calculate speech weight for each sentence chunk:
     * - Base weight: 0.28s per word
     * - Character weight: 0.04s per character
     * - Comma/Clause pause weight: +0.35s
     * - Sentence end pause weight: +0.55s
     */
    const weights = sentences.map(text => {
      const wordCount = text.split(/\s+/).length;
      const charCount = text.length;
      const hasPause = /[,;:，；:]$/.test(text);
      const hasStop = /[.!?。]$/.test(text);

      let weight = (wordCount * 0.28) + (charCount * 0.04);
      if (hasPause) weight += 0.35;
      if (hasStop) weight += 0.55;

      return Math.max(0.6, weight);
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    let currentTime = 0;
    
    return sentences.map((text, i) => {
      const sentenceDuration = (weights[i] / totalWeight) * audioDuration;
      
      const start = Math.round(currentTime * 100) / 100;
      const end = Math.round((currentTime + sentenceDuration) * 100) / 100;
      
      currentTime = end;
      
      return { start, end, text: text.trim() };
    });
  }

  /**
   * Generate an ASS subtitle file content from subtitle data.
   * ASS format is used because FFmpeg renders it beautifully with custom fonts/colors.
   */
  ztteam_generateASSContent(
    subtitles: Array<{ start: number; end: number; text: string }>,
    videoY: number = 0,
    videoHeight: number = 1920,
    hookText?: string,
    subtitlesY?: number
  ): string {
    const formatTime = (seconds: number): string => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const cs = Math.round((seconds % 1) * 100);
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    };

    /** Position subtitle based on subtitlesY or inside the video frame */
    const bottomOfVideo = videoY + videoHeight;
    /** For Alignment=8 (Top Center), MarginV is from the top! */
    const marginV = subtitlesY !== undefined ? subtitlesY : (bottomOfVideo + 40);
    const topMarginV = Math.max(120, videoY + 120);

    let ass = `[Script Info]
Title: ZTReel Subtitles
ScriptType: v4.00+
WrapStyle: 1
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Montserrat Black,60,&H0000FFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,0,2,8,40,40,${marginV},1
Style: Hook,Montserrat Black,70,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,0,3,8,40,40,${topMarginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    if (hookText && subtitles.length > 0) {
      /** Show hook text for the first 5 seconds or until video ends */
      const hookEnd = formatTime(Math.min(5, subtitles[subtitles.length - 1].end));
      ass += `Dialogue: 1,0:00:00.00,${hookEnd},Hook,,0,0,0,,{\\b1\\c&H00FFFF&\\3c&H000000&}${hookText}\n`;
    }

    for (const sub of subtitles) {
      const durationSec = sub.end - sub.start;
      const words = sub.text.split(' ').filter(w => w.trim().length > 0);
      if (words.length === 0) continue;

      /** Fake karaoke effect: split duration equally among words */
      const wordDurationCs = Math.round((durationSec * 100) / words.length);
      const karaokeText = words.map(w => `{\\k${wordDurationCs}}${w}`).join(' ');

      ass += `Dialogue: 0,${formatTime(sub.start)},${formatTime(sub.end)},Default,,0,0,0,,${karaokeText}\n`;
    }

    return ass;
  }

  /** Mock script for development without API key */
  private ztteam_getMockScript(postContent: string): string {
    const firstSentence = postContent.split(/[.!?]/)[0]?.trim() || 'Tin tức nóng hổi';
    return `Bạn có biết? ${firstSentence}. Đây là thông tin bạn không nên bỏ lỡ. Theo dõi ngay để cập nhật thêm!`;
  }

  /**
   * Transcribe an audio file using OpenAI Whisper (Speech to Text)
   * @param audioPath - Path to the local MP3/WAV file
   * @returns The transcribed text
   */
  async ztteam_transcribeAudio(audioPath: string): Promise<string> {
    const settings = await this.getSettings();
    if (!settings.openaiKey) {
      throw new Error('Bạn chưa cấu hình OpenAI API Key để dùng Whisper.');
    }

    this.logger.log(`Transcribing audio: ${audioPath}`);
    const fs = require('fs');

    try {
      const OpenAI = require('openai').default;
      const openai = new OpenAI({ apiKey: settings.openaiKey.trim() });

      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
        language: 'vi',
        prompt: 'Đây là một video TikTok tiếng Việt. Nếu có đoạn nhạc không lời hoặc im lặng, hãy bỏ qua và không ghi gì cả.',
        temperature: 0,
      });

      let text = transcription.text.trim();

      /** Basic filter for common Whisper hallucinations on silence/music */
      const hallucinations = ['Biên lơn thắng cô hồn', 'cảm ơn các bạn', 'đăng ký kênh', 'hẹn gặp lại', 'chúc các bạn', 'Amara.org'];
      for (const h of hallucinations) {
        if (text.toLowerCase().includes(h.toLowerCase()) && text.length < 50) {
          text = '';
        }
      }

      return text;
    } catch (error: any) {
      this.logger.error(`Error transcribing audio: ${error.message}`);
      throw new Error('Lỗi chuyển đổi giọng nói thành văn bản: ' + error.message);
    }
  }

  /**
   * Rewrite an original script (e.g. from TikTok) into a new, unique script for a Reel.
   * @param originalText - The transcribed text from original video
   * @param customPrompt - Optional custom instructions
   * @returns The generated script object
   */
  async ztteam_rewriteTikTokScript(
    originalText: string,
    customPrompt?: string | null,
  ): Promise<{ caption: string; hook: string; sub_voice: string }> {
    this.logger.log(`Rewriting TikTok script`);

    const settings = await this.getSettings();
    if (!settings.openaiKey && !settings.deepseekKey && !settings.geminiKey) {
      throw new Error('Chưa cấu hình API Key (OpenAI/Gemini/Deepseek) để viết lại kịch bản.');
    }

    const defaultSystemPrompt = `Bạn là chuyên gia Reup nội dung Video ngắn (Reel/TikTok) chuyên nghiệp.
Dưới đây là nội dung bóc băng từ một video TikTok của người khác. Nhiệm vụ của bạn là VIẾT LẠI (Rephrase) kịch bản này để làm một video mới.

QUY TẮC TUYỆT ĐỐI CẦN TUÂN THỦ:
- BÁM SÁT NỘI DUNG GỐC: Bạn PHẢI giữ nguyên ý nghĩa cốt lõi của bản gốc.
- NGẮN GỌN & GIẬT GÂN: Kịch bản mới phải mang hơi hướng kịch tính, giật gân, gây sốc nhẹ hoặc tò mò tột độ. Viết thật ngắn gọn, súc tích (khoảng 80 - 120 từ).
- CHỈ THAY ĐỔI CÂU TỪ: Hãy diễn đạt lại bằng từ đồng nghĩa, tuyệt đối không trùng lặp từ ngữ với bản gốc (để lách bản quyền).
- Hook (Câu đầu tiên) phải cực kỳ giật gân và thu hút.
- BẮT BUỘC Ở CUỐI VIDEO: Bạn phải thêm chính xác câu này vào cuối kịch bản: "Liên hệ với chúng tôi qua Zalo 0919901493 hoặc gọi trực tiếp để được hỗ trợ nhanh hơn".
- KHÔNG dùng emoji, hashtag, hay kí tự đặc biệt trong kịch bản giọng đọc (sub_voice).`;

    const systemPrompt = customPrompt ? customPrompt : defaultSystemPrompt;
    const promptWithRules = `${systemPrompt}

IMPORTANT: YOU MUST ALWAYS RETURN THE RESULT IN VIETNAMESE.
YOU MUST RETURN EXACTLY ONE JSON OBJECT WITH THE FOLLOWING STRUCTURE:
{
  "caption": "A catchy social media caption (with hashtags)",
  "hook": "A short, engaging text hook to display on the video",
  "sub_voice": "The spoken script for the voiceover. BẮT BUỘC PHẢI KẾT THÚC BẰNG CÂU LIÊN HỆ ZALO 0919901493."
}`;

    const userContent = `Original Script:\n\n${originalText.substring(0, 3000)}`;

    try {
      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        const text = await this.ztteam_callGeminiWithFallback(
          settings.geminiKey,
          `${promptWithRules}\n\n${userContent}`,
          { jsonMode: true, temperature: 0.8, maxTokens: 500 }
        );
        const jsonResult = JSON.parse(text || '{}');
        return {
          caption: jsonResult.caption || '',
          hook: jsonResult.hook || '',
          sub_voice: jsonResult.sub_voice || ''
        };
      } else {
        const OpenAI = require('openai').default;
        const isDeepseek = settings.activeProvider === 'deepseek' && settings.deepseekKey;
        const rawKey = isDeepseek ? settings.deepseekKey : settings.openaiKey;
        const apiKey = (rawKey || '').trim();
        const baseURL = isDeepseek ? 'https://api.deepseek.com' : undefined;
        const modelName = isDeepseek ? 'deepseek-chat' : 'gpt-4o-mini';

        const openai = new OpenAI({ apiKey, baseURL });
        const response = await openai.chat.completions.create({
          model: modelName,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: promptWithRules },
            { role: 'user', content: userContent },
          ],
          max_tokens: 500,
          temperature: 0.8,
        });

        const resultString = response.choices[0]?.message?.content?.trim() || '{}';
        const result = JSON.parse(resultString);

        return {
          caption: result.caption || '',
          hook: result.hook || '',
          sub_voice: result.sub_voice || ''
        };
      }
    } catch (error: any) {
      this.logger.error(`AI rewrite failed: ${error.message}`);
      throw new Error('Lỗi khi AI viết lại kịch bản: ' + error.message);
    }
  }

  /**
   * ZTTeam: Viết lại kịch bản câu chuyện cho Muse.ai khi bị từ chối
   * Dựa chính xác vào thông báo từ chối của Muse để khắc phục vi phạm,
   * bám sát nội dung gốc nhất có thể, nhưng chuyển sang phong cách điện ảnh an toàn 100%.
   */
  async ztteam_rewriteSafeStoryForMuse(originalContent: string, museFeedback: string): Promise<string> {
    const settings = await this.getSettings();
    if (!settings.openaiKey && !settings.geminiKey) {
      throw new Error('Chưa cấu hình API Key AI (OpenAI hoặc Gemini).');
    }

    const systemPrompt = `You are an elite Hollywood script doctor and video prompt specialist for Muse.ai.
A video generation request on Muse.ai was STRICTLY REJECTED with this message from Muse's safety filter:
"${museFeedback}"

Your mission is to rewrite the story into an engaging, dramatic 15-second cinematic teaser (3-4 sentences in English) that is 100% COMPLIANT with Muse's policy.

CRITICAL RULES:
1. ADAPT MUSE'S SUGGESTION:
   - Carefully read Muse's feedback: "${museFeedback}". If Muse suggested a safe alternative direction (e.g. starting a new life, emotional departure, uncovering a secret without mentioning divorce or papers), YOU MUST FULLY EMBRACE AND FOLLOW THAT DIRECTION.
2. ABSOLUTELY FORBIDDEN WORDS (DO NOT USE ANY OF THESE WORDS OR VARIATIONS):
   - NO: "backup", "backup husband", "backup spouse", "divorce", "divorced", "divorcing", "affair", "cheating", "ex", "ex-husband", "ex-wife", "mistress", "wife", "husband"
   - NO: "signed a document", "sign a document", "agreement", "papers", "contract", "lawsuit", "sue", "court", "defamation"
   - NO: "blood", "kill", "murder", "gun", "weapon", "crime", "dead", "corpse", "violence"
3. HOW TO CONVERT THE CONFLICT SAFELY:
   - Keep the main character's name (e.g. Matthew), the dramatic tension, the departure/flight to Australia, the clever plan, and the unexpected twist.
   - Frame the conflict as a dramatic personal parting of ways, a betrayal of trust, or a new beginning after heartbreak — NEVER mention marriage dissolution, backup husbands, or signing papers.
4. FORMAT: Output ONLY the 3-4 sentence English story ready for video generation narration. No quotes, no intro, no explanation.`;

    try {
      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        const text = await this.ztteam_callGeminiWithFallback(
          settings.geminiKey,
          `${systemPrompt}\n\nORIGINAL STORY:\n"""\n${originalContent}\n"""`,
          { temperature: 0.7, maxTokens: 350 }
        );
        return (text || '').trim();
      } else {
        const OpenAI = require('openai').default;
        const apiKey = (settings.openaiKey || '').trim();
        const openai = new OpenAI({ apiKey });

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `ORIGINAL STORY:\n"""\n${originalContent}\n"""` },
          ],
          max_tokens: 350,
          temperature: 0.7,
        });

        return response.choices[0]?.message?.content?.trim() || originalContent;
      }
    } catch (e: any) {
      this.logger.error(`Error rewriting safe story for Muse: ${e.message}`);
      throw new Error(`Lỗi khi AI viết lại kịch bản an toàn: ${e.message}`);
    }
  }

  /**
   * ZTTeam: Tạo kịch bản Hook 3 đoạn cho Video Reel từ bài viết gốc
   * Bám sát 100% cốt truyện thực tế của bài viết, cực kỳ kịch tính, lôi cuốn
   * Tự động highlight từ khóa cảm xúc bằng thẻ <span class="hl">...</span>
   */
  async ztteam_generateReelHookStory(
    title: string,
    content: string,
  ): Promise<{ hookHtml: string; plainText: string; paragraphs: string[] }> {
    const cleanTitle = (title || '').replace(/<[^>]*>?/gm, '').trim();
    const cleanContent = (content || '').replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();

    const systemPrompt = `PROMPT: VIRAL FACEBOOK STORY HOOK GENERATOR (CONDENSED 3-PARAGRAPH REEL FORMAT)
You are an expert English-language storyteller specializing in emotionally compelling Facebook story posts for American audiences aged 35–65.
Your task is to transform the provided real story into ONE powerful, suspenseful 3-paragraph opening hook designed for a vertical video reel.

CORE STORYTELLING STRUCTURE:
Follow this emotional progression:
INJUSTICE → CONFLICT / HIDDEN ADVANTAGE → POWER REVERSAL & CLIFFHANGER

CRITICAL REQUIREMENTS:
1. TRUTHFUL TO ORIGINAL: Every character, quote, and detail must come strictly from the provided story.
2. PARAGRAPH 1 (OPENING HOOK & INJUSTICE): Begin immediately with a shocking, unfair, or emotionally painful situation. 1-2 punchy sentences. (e.g., "Imagine discovering that your spouse transferred your entire retirement savings to their lover the morning of your surgery.")
3. PARAGRAPH 2 (CONFLICT & HIDDEN ADVANTAGE): Build emotional tension. Reveal that the protagonist knows a crucial secret or holds evidence that the antagonist doesn't know about yet.
4. PARAGRAPH 3 (POWER REVERSAL & CLIFFHANGER): The antagonist is about to lose control. End on an intense high-stakes moment or revelation immediately before the climax. Never explain the final resolution.
5. EMOTIONAL TRIGGERS: Emphasize family betrayal, public humiliation, financial manipulation, hidden evidence, or underestimated protagonists.
6. WRITING STYLE: Natural American English, short punchy sentences (1-2 sentences per paragraph), believable human storytelling voice.
7. KEYWORD HIGHLIGHTS: In each paragraph, wrap 1 to 2 key dramatic phrases in <span class="hl">...</span> (e.g. <span class="hl">secret bank account</span>, <span class="hl">shocking discovery</span>).
8. TOTAL LENGTH: Keep between 65 and 80 words total across all 3 paragraphs (20-25 words each) so large bold typography fits strictly inside the framed video card without overflowing.
9. OUTPUT FORMAT: Return strictly 3 paragraphs separated by double line breaks. No title, no numbering, no markdown headers, and DO NOT include "Continue Reading" or explanations.

Story Title: "${cleanTitle}"
Story Details:
"${cleanContent.substring(0, 3500)}"`;

    try {
      const settings = await this.getSettings();
      let rawResponse = '';

      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        rawResponse = await this.ztteam_callGeminiWithFallback(
          settings.geminiKey,
          systemPrompt,
          { temperature: 0.75, maxTokens: 300 }
        );
      } else {
        const OpenAI = require('openai').default;
        const isDeepseek = settings.activeProvider === 'deepseek' && settings.deepseekKey;
        const rawKey = isDeepseek ? settings.deepseekKey : settings.openaiKey;
        const apiKey = (rawKey || '').trim();
        const baseURL = isDeepseek ? 'https://api.deepseek.com' : undefined;
        const modelName = isDeepseek ? 'deepseek-chat' : 'gpt-4o-mini';

        if (apiKey) {
          const openai = new OpenAI({ apiKey, baseURL });
          const response = await openai.chat.completions.create({
            model: modelName,
            messages: [
              { role: 'user', content: systemPrompt },
            ],
            max_tokens: 300,
            temperature: 0.75,
          });
          rawResponse = response.choices[0]?.message?.content || '';
        }
      }

      if (rawResponse && rawResponse.trim().length > 30) {
        /** Tách đoạn văn ưu tiên theo ngắt dòng kép, lọc bỏ dòng 'Continue Reading' nếu có */
        let paragraphs = rawResponse
          .trim()
          .split(/\n\s*\n/)
          .map(p => p.trim())
          .filter(p => p.length > 0 && !/^continue reading/i.test(p) && !/^read more/i.test(p));

        /** Nếu không có ngắt dòng kép, thử tách theo ngắt dòng đơn */
        if (paragraphs.length < 2) {
          const singleLineSplits = rawResponse
            .trim()
            .split(/\n+/)
            .map(p => p.trim())
            .filter(p => p.length > 15 && !/^continue reading/i.test(p) && !/^read more/i.test(p));
          if (singleLineSplits.length >= 2) {
            paragraphs = singleLineSplits;
          }
        }

        /** Nếu vẫn chỉ có 1 đoạn văn nhưng nội dung dày dặn (> 80 ký tự), tự động chia theo câu hoặc giữ nguyên 1 đoạn hoàn chỉnh */
        if (paragraphs.length === 1 && paragraphs[0].length >= 30) {
          const sentences = paragraphs[0].match(/[^.!?]+[.!?]+(\s|$)/g);
          if (sentences && sentences.length >= 2) {
            const mid = Math.ceil(sentences.length / 2);
            paragraphs = [
              sentences.slice(0, mid).join('').trim(),
              sentences.slice(mid).join('').trim()
            ].filter(p => p.length > 0);
          }
        }

        if (paragraphs.length >= 1) {
          const finalParagraphs = paragraphs.slice(0, 3).map(p => {
            // Lọc bỏ 'Continue Reading...' ở đuôi đoạn cuối nếu bị dính
            return p.replace(/\s*Continue Reading[.…]*\s*$/i, '').trim();
          });
          const hookHtml = finalParagraphs.map(p => `<p>${p}</p>`).join('\n');
          const plainText = finalParagraphs.join('\n\n').replace(/<[^>]*>?/gm, '');
          return { hookHtml, plainText, paragraphs: finalParagraphs };
        }
      }

      throw new Error(`AI không thể tạo kịch bản hook đạt chuẩn chất lượng (Kết quả trả về rỗng hoặc quá ngắn dưới 30 ký tự).`);
    } catch (err: any) {
      this.logger.error(`AI hook generation failed: ${err.message}`);
      throw new Error(`Lỗi AI tạo Hook kịch tính: ${err.message}`);
    }
  }

  /**
   * ZTTeam: Định dạng nội dung câu chuyện cho Text Story Reel (9:16 Frosted Glass)
   * - Bao gồm 1 câu Hook mở đầu kịch tính trong ngoặc kép (Quote)
   * - Tiếp theo là 5-6 đoạn văn dày dặn (~250 - 280 từ) bám sát 100% cốt truyện gốc
   * - Tự động bọc từ khóa cao trào bằng <span class="hl">...</span>
   * - Lấp kín card 1575px, để trống đúng ~10% ở đáy màn hình
   */
  async ztteam_generateTextStoryCardContent(
    title: string,
    content: string,
  ): Promise<{ hookQuote: string; paragraphs: string[]; plainText: string }> {
    const cleanTitle = (title || '').replace(/<[^>]*>?/gm, '').trim();
    const cleanContent = (content || '').replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();

    const systemPrompt = `PROMPT: VIRAL FACEBOOK STORY HOOK GENERATOR
You are an expert English-language storyteller specializing in emotionally compelling Facebook story posts for American audiences aged 35–65.
Your task is to read the full story provided below and transform it into ONE powerful, suspenseful opening story designed to capture attention, encourage readers to keep reading, and create genuine curiosity about what happens next.

1. CORE STORYTELLING STRUCTURE
Follow this emotional progression:
INJUSTICE → CONFLICT → EMOTIONAL TENSION → HIDDEN ADVANTAGE → POWER REVERSAL → CLIFFHANGER
- Begin with a shocking, unfair, or emotionally painful situation.
- Introduce the antagonist and their selfish or manipulative behavior.
- Make the reader emotionally connect with the protagonist.
- Reveal that the protagonist knows something the antagonist doesn't.
- Gradually build anticipation toward a satisfying reversal.
- End immediately before a major secret, confrontation, or revelation.
- Do not reveal the final outcome.

2. THE OPENING HOOK (LINE 1)
The first 1–2 sentences must immediately establish:
- Who is involved.
- What unfair or shocking event happened.
- Why the situation matters.
- A hint that the antagonist is about to lose control.
Use direct, emotionally charged language.
Example: "My husband announced our divorce at my retirement party. But when my boss stood up and grabbed the microphone, his smile disappeared."
Avoid slow introductions, background explanations, generic statements, and unnecessary descriptions.

3. EMOTIONAL TRIGGERS
Prioritize emotional elements naturally supported by the original story:
Family betrayal, Public humiliation, Financial manipulation, Injustice, Hidden wealth or identity, Unexpected evidence, Underestimated protagonists, Secret knowledge, A surprising reversal of power.
Do not force every element into one story.

4. WRITING STYLE
- Write in natural American English.
- Prefer first-person narration when appropriate.
- Use short, punchy sentences.
- Use emotionally meaningful dialogue.
- Keep paragraphs between 1–3 sentences.
- Make the story understandable within the first 3 seconds of reading.
- Avoid unnecessary names, complicated timelines, and excessive background information.
- Use specific details, numbers, or amounts when they exist in the source.
- Show emotions through actions and dialogue rather than explaining them.
- Avoid repetitive AI-style phrases, exaggerated metaphors, and generic suspense language.
- Maintain a believable, human storytelling voice.

5. STORY LENGTH & VISUAL READABILITY
- Target 140–165 English words across the entire story (Opening hook ~15-20 words, Body roughly 3-4 short punchy paragraphs of 30-40 words each).
- The text MUST strictly stay within the framed video card with generous breathing room.
- Every sentence must either advance the conflict, increase emotional tension, reveal a meaningful detail, or build toward the cliffhanger.
- Remove anything unnecessary.

6. CLIFFHANGER RULES
The final 2–3 sentences in the last paragraph must create a powerful unanswered question.
Prefer endings involving:
- Someone discovering unexpected evidence.
- A powerful character suddenly losing confidence.
- An unexpected person interrupting a confrontation.
- A hidden document about to be revealed.
- The protagonist calmly preparing to expose the truth.
Example:
"He looked at the envelope in my hand. His face went pale.
'Where did you get that?' he whispered.
I smiled. 'You should ask your mother.'"
Never explain the resolution in the hook.
Do not use generic endings such as "You won't believe what happened next."

7. CONTENT ACCURACY
- Preserve the original characters, events, relationships, and important facts.
- You may rearrange events or simplify dialogue for storytelling clarity.
- Do not invent major twists, financial amounts, crimes, or character motivations.
- If the original story lacks a dramatic reversal, build suspense from its actual conflict rather than fabricating one.
- Ensure the hook accurately represents the full story readers will find on the website.

8. KEYWORD HIGHLIGHTS
In each paragraph, wrap 1 or 2 dramatic phrases or key quotes in <span class="hl">...</span> (e.g. <span class="hl">secret account</span>, <span class="hl">threw the drink in my face</span>).

9. OUTPUT FORMAT
Output ONLY the finished English story hook with no preface, explanations, or analysis.
Structure:
Line 1: Opening hook (1–2 compelling sentences).
[blank line]
Paragraph 1: Background of unfairness & conflict.
[blank line]
Paragraph 2: Emotional tension & antagonist's arrogance.
[blank line]
Paragraph 3: Protagonist's hidden advantage / secret knowledge.
[blank line]
Paragraph 4: Power reversal & intense final cliffhanger (2–3 sentences).

Do NOT include the words "Continue Reading", hashtags, or markdown headers in the output.

ORIGINAL STORY:
Title: "${cleanTitle}"
Story Details:
"${cleanContent.substring(0, 4500)}"`;

    try {
      const settings = await this.getSettings();
      let rawResponse = '';

      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        rawResponse = await this.ztteam_callGeminiWithFallback(
          settings.geminiKey,
          systemPrompt,
          { temperature: 0.75, maxTokens: 600 }
        );
      } else {
        const OpenAI = require('openai').default;
        const isDeepseek = settings.activeProvider === 'deepseek' && settings.deepseekKey;
        const rawKey = isDeepseek ? settings.deepseekKey : settings.openaiKey;
        const apiKey = (rawKey || '').trim();
        const baseURL = isDeepseek ? 'https://api.deepseek.com' : undefined;
        const modelName = isDeepseek ? 'deepseek-chat' : 'gpt-4o-mini';

        if (apiKey) {
          const openai = new OpenAI({ apiKey, baseURL });
          const response = await openai.chat.completions.create({
            model: modelName,
            messages: [
              { role: 'user', content: systemPrompt },
            ],
            max_tokens: 600,
            temperature: 0.75,
          });
          rawResponse = response.choices[0]?.message?.content || '';
        }
      }

      if (rawResponse && rawResponse.trim().length > 100) {
        // Lọc bỏ dòng 'Continue Reading...' hoặc các dòng phân cách/chú thích thừa
        const chunks = rawResponse
          .trim()
          .split(/\n\s*\n/)
          .map(p => p.trim())
          .filter(p => p.length > 0 && !/^continue reading/i.test(p) && !/^read more/i.test(p));

        if (chunks.length >= 2) {
          const hookQuote = chunks[0].replace(/^["'“”]+|["'“”]+$/g, '').trim();
          let paragraphs = chunks.slice(1).map(p => {
            return p.replace(/\s*Continue Reading[.…]*\s*$/i, '').trim();
          }).filter(p => p.length > 0);

          // Giữ tối đa 4 đoạn kịch tính để vừa khít thẻ kính mờ 9:16
          if (paragraphs.length > 4) {
            paragraphs = paragraphs.slice(0, 4);
          }

          // Kiểm tra highlight, nếu AI quên bọc thẻ <span class="hl"> thì tự động bọc highlight theo regex
          paragraphs = paragraphs.map(p => {
            if (!p.includes('<span class="hl">')) {
              return p.replace(/\b(husband|wife|marriage|hospital|police|secret|truth|money|million|house|car|lawyer|divorce|pain|tears|betrayal|revenge|company|evidence|envelope|will|account)\b/gi, (m) => `<span class="hl">${m}</span>`);
            }
            return p;
          });

          const plainText = [hookQuote, ...paragraphs].join('\n\n').replace(/<[^>]*>?/gm, '');
          return {
            hookQuote: `“${hookQuote}”`,
            paragraphs,
            plainText,
          };
        }
      }
    } catch (err: any) {
      this.logger.warn(`AI text story generation warning: ${err.message}. Chuyển sang trích xuất trực tiếp.`);
    }

    /** ZTTeam: Fallback thông minh nếu AI lỗi hoặc không có API key - tự động trích xuất 260 từ từ nội dung gốc */
    return this.ztteam_fallbackTextStoryExtract(cleanTitle, cleanContent);
  }

  /**
   * ZTTeam: Thuật toán fallback trích xuất 150 - 170 từ trực tiếp từ bài viết gốc cho cỡ chữ 47px
   */
  private ztteam_fallbackTextStoryExtract(
    title: string,
    content: string,
  ): { hookQuote: string; paragraphs: string[]; plainText: string } {
    const hookQuote = title.length > 5 ? `“${title}”` : '“A Story You Need To Hear...”';
    const rawWords = content.split(/\s+/).filter(w => w.length > 0);
    const targetWords = rawWords.slice(0, 160);

    /** Chia 160 từ thành 4 đoạn cân đối */
    const paragraphCount = 4;
    const chunkSize = Math.ceil(targetWords.length / paragraphCount);
    const paragraphs: string[] = [];

    for (let i = 0; i < targetWords.length; i += chunkSize) {
      let pText = targetWords.slice(i, i + chunkSize).join(' ');
      /** Tự động bôi vàng từ khóa bằng regex trên một số từ/cụm từ cảm xúc */
      pText = pText.replace(/\b(husband|wife|marriage|hospital|police|secret|truth|money|million|house|car|lawyer|divorce|pain|tears|betrayal|revenge|company)\b/gi, (m) => `<span class="hl">${m}</span>`);
      paragraphs.push(pText);
    }

    const plainText = paragraphs.join('\n\n').replace(/<[^>]*>?/gm, '');
    return { hookQuote, paragraphs, plainText };
  }

  /**
   * ZTTeam: Sáng tạo prompt chuẩn cho Avatar (1:1) và Cover (16:9) bám sát Hạng mục (Category) và tên Page
   */
  async ztteam_generateBrandingPrompts(params: {
    pageName: string;
    category?: string | null;
    siteUrl?: string | null;
    tags?: string[];
    recentTitles?: string[];
  }): Promise<{ avatarPrompt: string; coverPrompt: string }> {
    const { pageName, category } = params;

    const categoryContext = category && category.trim().length > 0
      ? ` The page category is "${category}". The visual design, symbolism, color palette and aesthetic must strongly represent this "${category}" category.`
      : '';
    const topicsContext = params.recentTitles && params.recentTitles.length > 0
      ? ` Context themes: ${params.recentTitles.slice(0, 3).join(', ')}.`
      : '';

    const avatarPrompt = `Facebook page brand identity for "${pageName}".${categoryContext}${topicsContext} Create a premium, iconic 1:1 square profile avatar branding image. Clearly incorporate the exact brand name "${pageName}" in clean, modern typography. Professional aesthetic, sharp details, vibrant colors, iconic composition, 8k resolution.`;

    const coverPrompt = `Facebook page banner for "${pageName}".${categoryContext}${topicsContext} Create a breathtaking cinematic 16:9 wide panoramic cover banner photo. Prominently display the exact brand name "${pageName}" in bold, stylish cinematic typography. Rich atmospheric depth, premium social media visual branding, 8k resolution.`;

    return {
      avatarPrompt,
      coverPrompt,
    };
  }

  /**
   * ZTTeam: Vẽ ảnh chất lượng cao bằng OpenAI DALL-E 3 (Hỗ trợ tỉ lệ vuông 1:1 và ngang 16:9)
   */
  async ztteam_renderImageWithDallE(prompt: string, aspectRatio: '1:1' | '16:9' = '1:1'): Promise<{
    imageUrl: string;
    localPath: string;
  }> {
    const settings = await this.getSettings();
    const apiKey = (settings.openaiKey || process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error('Chưa cấu hình OPENAI_API_KEY trong hệ thống');
    }

    const OpenAI = require('openai').default;
    const openai = new OpenAI({ apiKey });

    /** Tự động chọn model hình ảnh phù hợp với tài khoản */
    let selectedModel = 'gpt-image-1';
    try {
      const list = await openai.models.list();
      const modelIds: string[] = list.data.map((m: any) => m.id);
      const candidates = ['gpt-image-1', 'gpt-image-1-mini', 'gpt-image-2', 'dall-e-3', 'dall-e-2'];
      const found = candidates.find(c => modelIds.includes(c));
      if (found) {
        selectedModel = found;
      }
    } catch (e: any) {
      this.logger.warn(`Không thể lấy danh sách models OpenAI, dùng mặc định: ${selectedModel}`);
    }

    /** Size mapping: DALL-E dùng 1024x1024 / 1792x1024, GPT-Image dùng 1024x1024 / 1536x1024 */
    let size = '1024x1024';
    if (aspectRatio === '16:9') {
      size = selectedModel.startsWith('dall-e') ? '1792x1024' : '1536x1024';
    }

    this.logger.log(`Calling OpenAI Image API (model: ${selectedModel}, size: ${size}) with prompt: ${prompt.substring(0, 80)}...`);

    const response = await openai.images.generate({
      model: selectedModel,
      prompt: prompt,
      n: 1,
      size: size,
    });

    const item = response.data?.[0];
    if (!item) {
      throw new Error('OpenAI không trả về kết quả hình ảnh');
    }

    /** Tải ảnh về lưu trữ cục bộ trong storage/branding */
    const fs = require('fs');
    const path = require('path');
    const { ztteam_getStorageRoot } = require('../common/ztteam_storage.util');
    const brandingDir = path.join(ztteam_getStorageRoot(), 'branding');
    fs.mkdirSync(brandingDir, { recursive: true });

    const filename = `dalle_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
    const localPath = path.join(brandingDir, filename);

    if (item.b64_json) {
      const buffer = Buffer.from(item.b64_json, 'base64');
      fs.writeFileSync(localPath, buffer);
    } else if (item.url) {
      const imgRes = await fetch(item.url);
      if (!imgRes.ok) {
        throw new Error(`Không thể tải ảnh từ OpenAI DALL-E 3: ${imgRes.statusText}`);
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(localPath, buffer);
    } else {
      throw new Error('OpenAI không trả về url hoặc b64_json');
    }

    const publicUrl = `/storage/branding/${filename}`;
    return {
      imageUrl: publicUrl,
      localPath,
    };
  }

  /**
   * ZTTeam: Phân loại thông minh bài viết là Story (Câu chuyện đời thực, gia đình, tình cảm, drama, confession)
   * hay News (Tin tức thời sự, chính trị, thể thao, chứng khoán, tai nạn, showbiz gossip).
   */
  async ztteam_classifyStoryOrNews(
    title: string,
    excerpt: string
  ): Promise<{ isStory: boolean; confidence: number; reason: string }> {
    const settings = await this.getSettings();
    if (!settings.openaiKey && !settings.deepseekKey && !settings.geminiKey) {
      return { isStory: true, confidence: 50, reason: 'Không có API key AI, chấp nhận theo rule mặc định' };
    }

    const promptText = `You are a strict content classification AI for a Story publishing network (we only publish narrative drama, confessions, family conflicts, emotional tales, Reddit-style stories, and moral fiction).
Your mission is to classify whether the given article is a STORY or NEWS.

- STORY: Personal narrative, family drama, relationship conflicts, moral life lessons, emotional tales, Reddit-style confessions, fiction, or life experiences.
- NEWS: Journalism, political updates, government policies, elections, military/war reports, sports games/scores, stock market/financial reports, crypto, local crime/police blotter/accident reporting, celebrity gossip/paparazzi reporting, weather forecasts, product releases, or how-to guides.

Article Title: "${title}"
Snippet: "${excerpt.slice(0, 1000)}"

Return ONLY valid JSON matching this schema without any markdown wrapping or extra text:
{
  "isStory": true or false,
  "confidence": number between 0 and 100,
  "reason": "Brief 1-sentence reason"
}`;

    try {
      let rawOutput = '';
      if (settings.activeProvider === 'gemini' && settings.geminiKey) {
        rawOutput = await this.ztteam_callGeminiWithFallback(settings.geminiKey, promptText, {
          jsonMode: true,
          temperature: 0.2,
        });
      } else {
        const OpenAI = require('openai').default;
        const isDeepseek = settings.activeProvider === 'deepseek' && settings.deepseekKey;
        const rawKey = isDeepseek ? settings.deepseekKey : settings.openaiKey;
        const apiKey = (rawKey || '').trim();
        const baseURL = isDeepseek ? 'https://api.deepseek.com' : undefined;
        const modelName = isDeepseek ? 'deepseek-chat' : 'gpt-4o-mini';

        if (!apiKey) throw new Error(`Missing API Key for ${settings.activeProvider}`);

        const openai = new OpenAI({ apiKey, baseURL });
        const response = await Promise.race([
          openai.chat.completions.create({
            model: modelName,
            messages: [
              { role: 'system', content: 'You are a precise JSON-only content classifier.' },
              { role: 'user', content: promptText }
            ],
            response_format: { type: 'json_object' },
            max_tokens: 150,
            temperature: 0.2,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('AI classification timeout (5s)')), 5000))
        ]) as any;

        rawOutput = response.choices?.[0]?.message?.content?.trim() || '';
      }

      const cleanJson = rawOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return {
        isStory: Boolean(parsed.isStory),
        confidence: Number(parsed.confidence) || 80,
        reason: String(parsed.reason || 'AI phân tích'),
      };
    } catch (err: any) {
      this.logger.warn(`AI classification failed or timed out: ${err.message}. Relying on heuristic result.`);
      return { isStory: true, confidence: 50, reason: `AI error: ${err.message}` };
    }
  }
}
