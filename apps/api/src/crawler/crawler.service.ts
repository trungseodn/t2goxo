import { Injectable, Logger, HttpException, HttpStatus, Inject, forwardRef } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ZTTeamFetcherService } from './fetcher.service';
import { ZTTeamWordpressService } from '../wordpress/wordpress.service';
import { ZTTeamStoryTestService } from '../story-test/story-test.service';
import { ZTTeamHookVideoService } from '../media/hook-video.service';
import { ztteam_getImagesPath, ztteam_getStorageRoot } from '../common/ztteam_storage.util';

@Injectable()
export class ZTTeamCrawlerService {
  private readonly logger = new Logger(ZTTeamCrawlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fetcherService: ZTTeamFetcherService,
    private readonly wordpressService: ZTTeamWordpressService,
    private readonly hookVideoService: ZTTeamHookVideoService,
    @Inject(forwardRef(() => ZTTeamStoryTestService))
    private readonly storyTestService: ZTTeamStoryTestService,
  ) {}

  /**
   * Complete automated story processing pipeline:
   * 1. Crawl clean story content via Smart Proxy (bypasses Cloudflare / geo-block)
   * 2. AI generates dramatic scene prompt & renders 2K image via SangTao.ai
   * 3. Post full story + 2K image (as Featured Image) to WordPress target site
   * 4. Prepare Fanpage post resource:
   *    - Attached image: 2K SangTao.ai image
   *    - Content: TITLE VIẾT HOA + Part 1 / Hook kịch tính
   *    - First comment: Link đọc full câu chuyện trên website đích (tuỳ chọn)
   */
  async ztteam_crawlAndPublishStory(params: {
    sourceId?: string;
    sourceUrl: string;
    targetSiteId: string;
    pageId?: string;
    addLinkToComment?: boolean;
    sourceCategory?: string;
    existingImageUrl?: string;
    forceRecreate?: boolean;
    keepContentImages?: boolean;
  }): Promise<{
    success: boolean;
    title: string;
    wpPostId: number;
    wpPostUrl: string;
    image2kUrl: string;
    fanpageCaption: string;
    firstComment?: string;
    pageId?: string;
    imageId?: string;
  }> {
    const { sourceUrl, targetSiteId, pageId, addLinkToComment = true, sourceCategory, existingImageUrl, forceRecreate = false, keepContentImages = false } = params;

    this.logger.log(`Starting Crawl -> 2K AI Image -> WordPress -> Fanpage pipeline for: ${sourceUrl}`);

    /** 0. PRE-FLIGHT CHECK: Xác thực quyền WordPress trước khi gọi AI tạo ảnh tốn phí */
    await this.wordpressService.ztteam_verifySite(targetSiteId);

    /** 1. Fetch & clean story from source URL */
    const storyData = await this.fetcherService.ztteam_fetchUrlData(sourceUrl);
    if (!storyData || !storyData.title || !storyData.content) {
      throw new HttpException('Không thể lấy nội dung câu chuyện từ link nguồn', HttpStatus.BAD_REQUEST);
    }

    const cleanContent = this.fetcherService.ztteam_cleanStoryContent(storyData.content);
    const storyTitle = storyData.title.trim();

    /** ZTTeam Gatekeeper: Kiểm duyệt chất lượng tiêu đề và nội dung */
    const validation = this.fetcherService.ztteam_validateStoryArticle(storyTitle, cleanContent);
    if (!validation.isValid) {
      throw new HttpException(`Nội dung không đạt tiêu chuẩn bài viết (${validation.reason})`, HttpStatus.BAD_REQUEST);
    }

    /** 1.1 Tải và lưu trữ ảnh gốc từ website nguồn vào ổ cứng VPS làm bản dự phòng an toàn */
    let sourceBackupImageUrl: string | null = null;
    let sourceBackupLocalPath: string | null = null;
    const rawCandidateImage = storyData.image || (storyData.images && storyData.images.length > 0 ? storyData.images[0] : null);

    if (rawCandidateImage) {
      try {
        const savedSource = await this.fetcherService.ztteam_downloadAndSaveSourceImage(rawCandidateImage, storyTitle);
        sourceBackupImageUrl = savedSource.storageUrl;
        sourceBackupLocalPath = savedSource.localPath;
      } catch (backupErr: any) {
        this.logger.warn(`Không thể tải ảnh gốc dự phòng (${rawCandidateImage}): ${backupErr.message}`);
      }
    }

    /** 2. Xử lý ảnh 2K: Tái sử dụng ảnh đã có hoặc chỉ tạo mới khi chưa có / khi người dùng yêu cầu render lại */
    let image2kUrl = existingImageUrl || '';
    let imageLocalPath = '';
    let currentTemplateId = 'sangtao_2k';

    if (!image2kUrl && !forceRecreate) {
      /** Kiểm tra nếu bài viết này đã từng tạo ảnh trong hệ thống trước đó */
      const existingImgRecord = await this.prisma.ztteam_images.findFirst({
        where: {
          wp_post_title: storyTitle,
          image_url: { not: null }
        },
        select: { image_url: true, template_id: true }
      });
      if (existingImgRecord && existingImgRecord.image_url) {
        image2kUrl = existingImgRecord.image_url;
        currentTemplateId = existingImgRecord.template_id || 'sangtao_2k';
      }
    }

    if (!image2kUrl || forceRecreate) {
      /** Chỉ khi chưa có ảnh sẵn hoặc người dùng bấm render lại thủ công mới gọi SangTao.ai */
      try {
        this.logger.log(`Analyzing story and generating 2K image via SangTao.ai for "${storyTitle}"...`);
        const promptData = await this.storyTestService.ztteam_generateStoryImagePrompt(
          cleanContent,
          'cinematic',
          '4:5',
        );

        const imageResult = await this.storyTestService.ztteam_renderStoryImage({
          prompt: promptData.image_prompt_en,
          aspectRatio: '4:5',
        });

        image2kUrl = imageResult.imageUrl;
        imageLocalPath = imageResult.localPath;
        currentTemplateId = 'sangtao_2k';
        this.logger.log(`SangTao.ai 2K image generated: ${image2kUrl}`);
      } catch (sangTaoErr: any) {
        this.logger.warn(`SangTao.ai gặp sự cố (${sangTaoErr.message}). Tự động kích hoạt Fallback sang ảnh gốc dự phòng!`);
        if (sourceBackupImageUrl && sourceBackupLocalPath && fs.existsSync(sourceBackupLocalPath)) {
          image2kUrl = sourceBackupImageUrl;
          imageLocalPath = sourceBackupLocalPath;
          currentTemplateId = 'source_original';
          this.logger.log(`Đã kích hoạt thành công ảnh gốc dự phòng: ${image2kUrl}`);
        } else {
          /** ZTTeam: Nếu không có cả ảnh gốc lẫn ảnh AI -> Bỏ qua bài viết, không đủ điều kiện */
          throw new Error(`[KHÔNG ĐỦ ĐIỀU KIỆN] Bài viết không có ảnh gốc dự phòng và SangTao.ai không thể tạo ảnh (${sangTaoErr.message})`);
        }
      }
    } else {
      this.logger.log(`Reusing existing 2K image (Tiết kiệm 100% chi phí API): ${image2kUrl}`);
      if (image2kUrl.startsWith('/storage/')) {
        imageLocalPath = path.join(ztteam_getStorageRoot(), image2kUrl.replace('/storage/', ''));
      }
    }

    /** 3. Post to WordPress Target Site with 2K image as Featured Media */
    const contentForWp = (keepContentImages && storyData.cleanHtmlWithImages)
      ? storyData.cleanHtmlWithImages
      : cleanContent;

    const wpResult = await this.wordpressService.ztteam_createPost(targetSiteId, {
      title: storyTitle,
      content: contentForWp,
      excerpt: cleanContent.substring(0, 200) + '...',
      categories: sourceCategory ? [Number(sourceCategory)] : undefined,
      imageUrl: image2kUrl,
    });

    this.logger.log(`Posted to WordPress: ID=${wpResult.id}, URL=${wpResult.url}`);

    /** 4. Prepare Fanpage Resource: TITLE VIẾT HOA + Part 1 Hook + Part 2 cho comment */
    const titleUppercase = storyTitle.toUpperCase();
    const { part1, part2 } = this.fetcherService.ztteam_extractStoryParts(cleanContent, 900, 700);

    /** 5. Determine Target Fanpage (Exclusive 1 Post per Fanpage across same Source & Category) */
    const targetPages: any[] = [];

    /** ZTTeam: Kiểm tra xem Website WordPress đích có đang bật Chế độ Đăng Thủ Công không */
    const targetSiteConfig = await this.prisma.ztteam_target_sites.findUnique({
      where: { id: targetSiteId },
      select: { is_manual: true }
    });

    if (targetSiteConfig?.is_manual) {
      this.logger.log(`Target Site #${targetSiteId} được cấu hình [CHẾ ĐỘ ĐĂNG THỦ CÔNG]. Chuyển thẳng bài viết vào Kho Đăng Thủ Công độc lập.`);
    } else if (pageId) {
      const p = await this.prisma.ztteam_pages.findUnique({ where: { id: pageId } });
      if (p) targetPages.push(p);
    } else {
      /** Find candidate active pages sharing this target site & category */
      let candidatePages: any[] = [];

      if (sourceCategory) {
        /** Specific Category Source: Match pages configured for this category OR pages accepting all categories */
        const linkedSources = await this.prisma.ztteam_page_sources.findMany({
          where: {
            target_site_id: targetSiteId,
            is_active: true,
            OR: [
              { target_category_id: null },
              { target_category_id: '' },
              { target_category_id: String(sourceCategory) }
            ],
          },
          include: { page: true },
        });
        for (const ls of linkedSources) {
          if (ls.page && ls.page.is_active && !candidatePages.some(tp => tp.id === ls.page.id)) {
            candidatePages.push(ls.page);
          }
        }
      } else {
        /** General Source (sourceCategory is empty/undefined):
         * All active pages linked to this target site can receive articles!
         */
        const linkedSources = await this.prisma.ztteam_page_sources.findMany({
          where: {
            target_site_id: targetSiteId,
            is_active: true,
          },
          include: { page: true },
        });
        for (const ls of linkedSources) {
          if (ls.page && ls.page.is_active && !candidatePages.some(tp => tp.id === ls.page.id)) {
            candidatePages.push(ls.page);
          }
        }
      }

      /** Check which pages have ALREADY posted or queued this WP post */
      const existingAssignments = await this.prisma.ztteam_images.findMany({
        where: { wp_post_id: wpResult.id.toString() },
        select: { page_id: true }
      });
      const usedPageIds = new Set(existingAssignments.map(a => a.page_id));

      const existingHistory = await this.prisma.ztteam_image_history.findMany({
        where: { wp_post_id: wpResult.id.toString() },
        select: { page_id: true }
      });
      existingHistory.forEach(h => usedPageIds.add(h.page_id));

      /** Filter candidate pages that haven't received this post yet */
      const eligiblePages = candidatePages.filter(p => !usedPageIds.has(p.id));

      if (eligiblePages.length > 0) {
        /** Strict Round-Robin: Pick the page that received a post least recently (oldest or null created_at) */
        let chosenPage = eligiblePages[0];
        if (eligiblePages.length > 1) {
          const pageLastAssigned = await Promise.all(
            eligiblePages.map(async (p) => {
              const lastImage = await this.prisma.ztteam_images.findFirst({
                where: { page_id: p.id },
                orderBy: { created_at: 'desc' },
                select: { created_at: true }
              });
              return {
                page: p,
                lastTime: lastImage?.created_at ? new Date(lastImage.created_at).getTime() : 0,
              };
            })
          );
          /** Sắp xếp tăng dần theo lastTime: Page nào có lastTime nhỏ nhất (lâu nhất chưa nhận bài) sẽ đứng đầu */
          pageLastAssigned.sort((a, b) => a.lastTime - b.lastTime);
          chosenPage = pageLastAssigned[0].page;
        }
        targetPages.push(chosenPage);
        this.logger.log(`[Round-Robin] Assigned story #${wpResult.id} exclusively to Page: ${chosenPage.name} (${chosenPage.id})`);
      } else if (candidatePages.length === 0) {
        /**
         * ZTTeam: Nguồn cào này không có Fanpage nào liên kết active.
         * Tuyệt đối KHÔNG fallback tự ý gán vào Fanpage khác.
         * Để targetPages rỗng ([]) để hệ thống chuyển sang lưu vào Kho Đăng Thủ Công độc lập (page_id: null).
         */
        this.logger.log(`Nguồn cào (Target site #${targetSiteId}) không có Fanpage nào liên kết active. Tự động chuyển bài viết sang Kho Đăng Thủ Công.`);
      } else {
        this.logger.log(`Story #${wpResult.id} has already been assigned to all matching Fanpages. Skipping duplicate assignment.`);
      }
    }

    let createdImageId: string | undefined = undefined;

    for (const targetPage of targetPages) {
      /** Prepare Caption & First Comment based on Facebook Viral standard */
      const captionCTA = '...FULL STORY IN THE COMMENT 👇👇👇';
      let fanpageCaption = `${titleUppercase}\n\n${part1}\n\n${captionCTA}`;
      if (targetPage.add_link_to_caption) {
        fanpageCaption += `\n\n👉 Read full story here: ${wpResult.url}`;
      }

      const commentCTA = `👉 FULL STORY HERE 👇👇👇\n${wpResult.url}`;
      let firstCommentText: string | null = part2 ? `${part2}\n\n${commentCTA}` : commentCTA;

      let imgRecord = await this.prisma.ztteam_images.findFirst({
        where: {
          page_id: targetPage.id,
          wp_post_id: wpResult.id.toString(),
        },
      });

      const shouldAutoQueueVideo = targetPage.post_format === 'reel' || targetPage.post_format === 'mixed';

      if (imgRecord) {
        imgRecord = await this.prisma.ztteam_images.update({
          where: { id: imgRecord.id },
          data: {
            wp_post_title: storyTitle,
            wp_post_url: wpResult.url,
            template_id: currentTemplateId,
            image_url: image2kUrl,
            ai_caption: fanpageCaption,
            ai_first_comment: firstCommentText,
            comment_step: 0,
            status: 'COMPLETED',
            video_status: shouldAutoQueueVideo ? 'PENDING' : 'NONE',
            created_at: new Date(), /** Update timestamp to reflect exact recent crawl/render time */
            updated_at: new Date(),
          },
        });
      } else {
        imgRecord = await this.prisma.ztteam_images.create({
          data: {
            page_id: targetPage.id,
            wp_post_id: wpResult.id.toString(),
            wp_post_title: storyTitle,
            wp_post_url: wpResult.url,
            template_id: currentTemplateId,
            image_url: image2kUrl,
            ai_caption: fanpageCaption,
            ai_first_comment: firstCommentText,
            comment_step: 0,
            status: 'COMPLETED', /** Ready for publisher.cron to post to Facebook! */
            video_status: shouldAutoQueueVideo ? 'PENDING' : 'NONE',
          },
        });
      }
      if (!createdImageId) createdImageId = imgRecord.id;

      /** Copy image to standard storage folder so publisher.cron and manual publish can find it */
      try {
        const targetDir = ztteam_getImagesPath(imgRecord.id);
        fs.mkdirSync(targetDir, { recursive: true });
        if (imageLocalPath && fs.existsSync(imageLocalPath)) {
          fs.copyFileSync(imageLocalPath, path.join(targetDir, 'output.png'));

          await this.prisma.ztteam_images.update({
            where: { id: imgRecord.id },
            data: {
              image_url: `/storage/images/${imgRecord.id}/output.png`,
            },
          });
        }

        /** Lưu bản sao ảnh gốc trực tiếp vào thư mục bài viết để sẵn sàng chuyển đổi */
        if (sourceBackupLocalPath && fs.existsSync(sourceBackupLocalPath)) {
          fs.copyFileSync(sourceBackupLocalPath, path.join(targetDir, 'source_original.png'));
        }
      } catch (copyErr: any) {
        this.logger.warn(`Failed to copy image to standard folder: ${copyErr.message}`);
      }

      this.logger.log(`Created Fanpage ready-to-post image item: ${imgRecord.id} for Page ${targetPage.id} (${targetPage.name})`);

      /** ZTTeam: Nếu Fanpage cấu hình đăng Reel hoặc Mixed và chọn engine hook_image (mặc định), tự động render Video Hook sắc nét */
      if (shouldAutoQueueVideo) {
        const engine = (targetPage as any).video_engine || 'hook_image';
        if (engine === 'hook_image' || engine === 'text_story') {
          this.logger.log(`[Auto Video] Tự động render video ${engine} 10s cho bài viết ${imgRecord.id} (Page: ${targetPage.name})`);
          this.hookVideoService.ztteam_renderHookVideo(imgRecord.id).catch(err => {
            this.logger.error(`[Auto Video Error] ${err.message}`);
          });
        }
      }
    }

    /** ZTTeam: Trường hợp KHÔNG CÓ Fanpage nào hoạt động -> Lưu bài viết vào Kho Đăng Thủ Công độc lập (page_id = null) */
    if (targetPages.length === 0) {
      const captionCTA = '...FULL STORY IN THE COMMENT 👇👇👇';
      const fanpageCaption = `${titleUppercase}\n\n${part1}\n\n${captionCTA}`;
      const commentCTA = `👉 FULL STORY HERE 👇👇👇\n${wpResult.url}`;
      const firstCommentText = part2 ? `${part2}\n\n${commentCTA}` : commentCTA;

      let imgRecord = await this.prisma.ztteam_images.findFirst({
        where: {
          page_id: null,
          wp_post_id: wpResult.id.toString(),
        },
      });

      if (imgRecord) {
        imgRecord = await this.prisma.ztteam_images.update({
          where: { id: imgRecord.id },
          data: {
            wp_post_title: storyTitle,
            wp_post_url: wpResult.url,
            template_id: currentTemplateId,
            image_url: image2kUrl,
            ai_caption: fanpageCaption,
            ai_first_comment: firstCommentText,
            comment_step: 0,
            status: 'COMPLETED',
            video_status: imgRecord.video_url ? 'COMPLETED' : 'PENDING',
            created_at: new Date(),
            updated_at: new Date(),
          },
        });
      } else {
        imgRecord = await this.prisma.ztteam_images.create({
          data: {
            page_id: null,
            wp_post_id: wpResult.id.toString(),
            wp_post_title: storyTitle,
            wp_post_url: wpResult.url,
            template_id: currentTemplateId,
            image_url: image2kUrl,
            ai_caption: fanpageCaption,
            ai_first_comment: firstCommentText,
            comment_step: 0,
            status: 'COMPLETED',
            video_status: 'PENDING',
            is_posted: false,
          },
        });
      }
      if (!createdImageId) createdImageId = imgRecord.id;

      /** Copy image to standard storage folder */
      try {
        const targetDir = ztteam_getImagesPath(imgRecord.id);
        fs.mkdirSync(targetDir, { recursive: true });
        if (imageLocalPath && fs.existsSync(imageLocalPath)) {
          fs.copyFileSync(imageLocalPath, path.join(targetDir, 'output.png'));
          await this.prisma.ztteam_images.update({
            where: { id: imgRecord.id },
            data: {
              image_url: `/storage/images/${imgRecord.id}/output.png`,
            },
          });
        }
        if (sourceBackupLocalPath && fs.existsSync(sourceBackupLocalPath)) {
          fs.copyFileSync(sourceBackupLocalPath, path.join(targetDir, 'source_original.png'));
        }
      } catch (copyErr: any) {
        this.logger.warn(`Failed to copy image to standard folder: ${copyErr.message}`);
      }

      this.logger.log(`[Manual Studio] Created standalone manual post: ${imgRecord.id} (wp_post_id: ${wpResult.id}) with page_id = null`);

      /** Tự động tạo Video Hook 10s cho bài viết Kho Thủ Công */
      this.hookVideoService.ztteam_renderHookVideo(imgRecord.id).catch(err => {
        this.logger.error(`[Manual Store Hook Video Error] ${err.message}`);
      });
    }

    /** 6. Record to crawl history for Dashboard & UI tracking */
    try {
      let source: any = null;
      if (params.sourceId) {
        source = await this.prisma.ztteam_crawl_sources.findUnique({
          where: { id: params.sourceId },
        });
      }
      if (!source) {
        source = await this.prisma.ztteam_crawl_sources.findFirst({
          where: { target_site_id: targetSiteId },
        });
      }
      if (!source) {
        source = await this.prisma.ztteam_crawl_sources.create({
          data: {
            target_site_id: targetSiteId,
            source_url: sourceUrl,
            source_category: sourceCategory || 'manual',
            frequency_cron: '0 * * * *',
            enabled: false,
            extract_rules_json: JSON.stringify({ manual: true }),
          },
        });
      }

      await this.prisma.ztteam_crawl_history.upsert({
        where: {
          source_id_url: {
            source_id: source.id,
            url: sourceUrl,
          },
        },
        update: {
          title: storyTitle,
          status: 'SUCCESS',
        },
        create: {
          source_id: source.id,
          url: sourceUrl,
          title: storyTitle,
          status: 'SUCCESS',
        },
      });
    } catch (histErr: any) {
      this.logger.warn(`Failed to save crawl history: ${histErr.message}`);
    }

    const primaryPage = targetPages[0];
    const primaryCaption = `${titleUppercase}\n\n${part1}\n\n...FULL STORY IN THE COMMENT 👇👇👇` + (primaryPage?.add_link_to_caption ? `\n\n👉 Read full story here: ${wpResult.url}` : '');
    const primaryComment = part2 ? `${part2}\n\n👉 FULL STORY HERE 👇👇👇\n${wpResult.url}` : `👉 FULL STORY HERE 👇👇👇\n${wpResult.url}`;

    return {
      success: true,
      title: storyTitle,
      wpPostId: wpResult.id,
      wpPostUrl: wpResult.url,
      image2kUrl,
      fanpageCaption: primaryCaption,
      firstComment: primaryComment,
      pageId: primaryPage?.id,
      imageId: createdImageId,
    };
  }

  async ztteam_createSource(siteId: string, data: { sourceUrl: string; sourceCategory: string; frequencyCron: string; addLinkToComment?: boolean; batchSize?: number; keepContentImages?: boolean; maxScanPages?: number }) {
    try {
      const extractRules = {
        addLinkToComment: data.addLinkToComment !== undefined ? data.addLinkToComment : true,
        batchSize: data.batchSize ? Math.max(1, Math.min(20, Number(data.batchSize))) : 1,
        keepContentImages: Boolean(data.keepContentImages),
        maxScanPages: data.maxScanPages ? Math.max(1, Math.min(50, Number(data.maxScanPages))) : 20,
      };
      return await this.prisma.ztteam_crawl_sources.create({
        data: {
          target_site_id: siteId,
          source_url: data.sourceUrl,
          source_category: data.sourceCategory,
          extract_rules_json: JSON.stringify(extractRules),
          frequency_cron: data.frequencyCron,
          enabled: true
        }
      });
    } catch (error: any) {
      this.logger.error('Failed to create crawl source', error);
      throw new HttpException('Failed to create crawl source', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async ztteam_updateSource(sourceId: string, data: { sourceUrl: string; sourceCategory: string; frequencyCron: string; addLinkToComment?: boolean; batchSize?: number; keepContentImages?: boolean; maxScanPages?: number }) {
    const existing = await this.prisma.ztteam_crawl_sources.findUnique({ where: { id: sourceId } });
    let extractRules: any = {};
    try {
      extractRules = JSON.parse(existing?.extract_rules_json || '{}');
    } catch (e) {}

    /** Always clear out legacy targetPageId to ensure dynamic multi-page distribution */
    delete extractRules.targetPageId;

    if (data.addLinkToComment !== undefined) {
      extractRules.addLinkToComment = data.addLinkToComment;
    }
    if (data.batchSize !== undefined) {
      extractRules.batchSize = Math.max(1, Math.min(20, Number(data.batchSize)));
    }
    if (data.keepContentImages !== undefined) {
      extractRules.keepContentImages = Boolean(data.keepContentImages);
    }
    if (data.maxScanPages !== undefined) {
      extractRules.maxScanPages = Math.max(1, Math.min(50, Number(data.maxScanPages)));
    }

    return this.prisma.ztteam_crawl_sources.update({
      where: { id: sourceId },
      data: {
        source_url: data.sourceUrl,
        source_category: data.sourceCategory,
        frequency_cron: data.frequencyCron,
        extract_rules_json: JSON.stringify(extractRules),
      }
    });
  }

  async ztteam_getSources(siteId: string) {
    const sources = await this.prisma.ztteam_crawl_sources.findMany({
      where: { target_site_id: siteId },
      orderBy: { created_at: 'desc' },
      include: {
        history: {
          orderBy: { created_at: 'desc' },
          take: 1
        }
      }
    });

    return sources.map((source: any) => {
      const lastCrawl = source.history && source.history.length > 0 ? source.history[0].created_at : null;
      let nextCrawl = null;
      
      if (source.enabled) {
        let intervalMs = 1 * 60 * 60 * 1000;
        switch (source.frequency_cron) {
          case '0 */5 * * * *': intervalMs = 5 * 60 * 1000; break;
          case '0 */15 * * * *': intervalMs = 15 * 60 * 1000; break;
          case '0 */30 * * * *': intervalMs = 30 * 60 * 1000; break;
          case '0 */1 * * *': intervalMs = 1 * 60 * 60 * 1000; break;
          case '0 */2 * * *': intervalMs = 2 * 60 * 60 * 1000; break;
          case '0 */3 * * *': intervalMs = 3 * 60 * 60 * 1000; break;
          case '0 */6 * * *': intervalMs = 6 * 60 * 60 * 1000; break;
          case '0 */12 * * *': intervalMs = 12 * 60 * 60 * 1000; break;
          case '0 0 * * *': intervalMs = 24 * 60 * 60 * 1000; break;
        }
        
        if (lastCrawl) {
          nextCrawl = new Date(new Date(lastCrawl).getTime() + intervalMs);
        } else {
          nextCrawl = new Date();
        }
      }

      const { history, ...rest } = source;
      return {
        ...rest,
        last_crawled_at: lastCrawl,
        next_crawl_at: nextCrawl
      };
    });
  }

  async ztteam_deleteSource(sourceId: string) {
    return this.prisma.ztteam_crawl_sources.delete({
      where: { id: sourceId }
    });
  }

  async ztteam_toggleSource(sourceId: string, enabled: boolean) {
    return this.prisma.ztteam_crawl_sources.update({
      where: { id: sourceId },
      data: { enabled }
    });
  }

  async ztteam_getHistory(sourceId: string, limit = 50) {
    return this.prisma.ztteam_crawl_history.findMany({
      where: { 
        source_id: sourceId,
        url: { not: 'SYNC_CHECK' }
      },
      orderBy: { created_at: 'desc' },
      take: limit
    });
  }

  async ztteam_deleteHistory(sourceId: string) {
    await this.prisma.ztteam_crawl_history.deleteMany({
      where: { source_id: sourceId }
    });
    return { success: true };
  }
}
