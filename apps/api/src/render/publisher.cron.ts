import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ZTTeamFacebookService } from '../facebook/facebook.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as fs from 'fs';
import * as path from 'path';
import { ztteam_getReelsPath, ztteam_getImagesPath, ztteam_getStorageRoot } from '../common/ztteam_storage.util';
import { TelegramService, ztteam_extractErrorMessage } from '../telegram/telegram.service';

/**
 * ZTTeam: Kho Mồi Kích Hoạt Đa Dạng (Dynamic Viral Hook Comments)
 * Luân phiên và ngẫu nhiên các mẫu câu kích thích tò mò và kêu gọi để lại comment
 * Giúp tối ưu tương tác tự nhiên và tuyệt đối chống Facebook quét trùng lặp spam.
 */
export function ztteam_getRandomHookComment(seed?: string): string {
  const HOOK_TEMPLATES = [
    `...I know you're all very curious about what happens next, so if you want to read on, leave "YES" in the comments below! 👇`,
    `...Want to know the full truth of what happened next? Drop a "YES" or "NEXT" below! 👇🔥`,
    `...The next part will leave you completely speechless! Leave "YES" in the comments if you want me to share it right away! 👇✨`,
    `...Curious about the unexpected twist? Comment "YES" down below to continue reading! 👇👀`,
    `...If you're eager to see how this story ends, let me know by leaving a "YES" in the comments! 👇❤️`,
    `...Things took a crazy turn right after this! Drop "YES" below and I'll post the continuation! 👇💬`,
    `...Can you guess what happened next? Leave "YES" in the comments if you want the next part! 👇👇`,
    `...The ending completely shocked everyone! Comment "YES" or "MORE" below if you want the full story! 👇⚡`,
    `...Are you ready for the shocking revelation? Leave "YES" down below to find out! 👇😲`,
    `...You won't believe what they discovered next! Comment "YES" below and I'll send you the rest! 👇🙏`,
    `...Want to know how this ends? Drop a quick "YES" below and I'll unlock Part 2 for you! 👇💫`,
    `...I was blown away when I read the ending! Leave "YES" below if you want the conclusion! 👇📖`
  ];

  if (seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % HOOK_TEMPLATES.length;
    return HOOK_TEMPLATES[index];
  }

  const randomIndex = Math.floor(Math.random() * HOOK_TEMPLATES.length);
  return HOOK_TEMPLATES[randomIndex];
}

@Injectable()
export class ZTTeamPublisherCron {
  private readonly logger = new Logger(ZTTeamPublisherCron.name);
  private isRunning = false;
  /** ZTTeam: Lưu vết thời điểm xuất bản gần nhất trên toàn hệ thống (mọi Page) để chống Burst API */
  private ztteam_lastGlobalPublishTimestamp = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly facebookService: ZTTeamFacebookService,
    private readonly eventEmitter: EventEmitter2,
    private readonly telegramService: TelegramService,
  ) { }

  @Cron(CronExpression.EVERY_MINUTE)
  async ztteam_handleCron() {
    if (process.env.ENABLE_AUTO_CRON === 'false') {
      return;
    }

    if (this.isRunning) {
      this.logger.warn('Publisher cron is already running, skipping this tick');
      return;
    }
    this.isRunning = true;

    try {
      /** 0. Xử lý quy trình comment tự động sau 1 giờ và reply Part 2 sau 15 phút cho các bài đã đăng */
      await this.ztteam_handleDelayedComments();

      /** 0.1 Xử lý tự động gắn link theo ngưỡng view video (chạy mỗi 2 phút) */
      if (new Date().getMinutes() % 2 === 0) {
        await this.ztteam_handleViewThresholdLinkInjection();
      }

      /** 1. Tìm các Reel đã render xong đang chờ đăng (xếp theo thời gian tạo cũ nhất trước) */
      const pendingReels = await this.prisma.ztteam_reels.findMany({
        where: {
          status: 'COMPLETED',
          is_posted: false,
          source_type: { not: 'TIKTOK_CLONE' }
        },
        include: { page: { include: { fb_account: true } } },
        orderBy: { created_at: 'asc' },
      });

      /** 2. Tìm các Ảnh đã tạo xong đang chờ đăng (xếp theo thời gian tạo cũ nhất trước) */
      const pendingImages = await this.prisma.ztteam_images.findMany({
        where: {
          status: 'COMPLETED',
          is_posted: false,
        },
        include: { page: { include: { fb_account: true } } },
        orderBy: { created_at: 'asc' },
      });

      if (pendingReels.length === 0 && pendingImages.length === 0) {
        return;
      }

      /** 3. Tập hợp danh sách các Page có bài chờ đăng */
      const pagesMap = new Map<string, any>();
      for (const reel of pendingReels) {
        if (reel.page && !pagesMap.has(reel.page_id)) {
          pagesMap.set(reel.page_id, reel.page);
        }
      }
      for (const img of pendingImages) {
        if (img.page && img.page_id && !pagesMap.has(img.page_id)) {
          pagesMap.set(img.page_id, img.page);
        }
      }

      const now = new Date();

      /** 4. Duyệt các Page để lọc ra danh sách bài viết ứng viên đủ điều kiện xuất bản */
      const eligibleCandidates: Array<{
        page: any;
        selectedItem: { type: 'reel_legacy' | 'image_reel' | 'image_only'; data: any };
        diffMinutesFromLastPost: number;
        itemCreatedAt: number;
      }> = [];

      for (const [pageId, page] of pagesMap.entries()) {
        const { auto_publish_enabled, schedule_mode, schedule_fixed_times, schedule_immediate_gap_minutes, post_format } = page;

        /** Nếu Page đang tắt tự động đăng bài hoặc bị vô hiệu hóa thì bỏ qua */
        if (auto_publish_enabled === false || page.is_active === false) {
          continue;
        }

        /** Lấy bài đăng gần nhất (thành công HOẶC thất bại) của Page này để tính khoảng cách thời gian */
        const lastPostedReel = await this.prisma.ztteam_reels.findFirst({
          where: {
            page_id: pageId,
            OR: [{ is_posted: true }, { status: 'FAILED' }]
          },
          orderBy: { updated_at: 'desc' }
        });
        const lastPostedImage = await this.prisma.ztteam_images.findFirst({
          where: {
            page_id: pageId,
            OR: [{ is_posted: true }, { status: 'FAILED' }]
          },
          orderBy: { updated_at: 'desc' }
        });

        let lastPostTime: Date | null = null;
        let lastPostType: 'reel' | 'image' | null = null;

        if (lastPostedReel) {
          /** Dùng updated_at thay vì posted_at vì có thể nó là FAILED */
          lastPostTime = new Date(lastPostedReel.updated_at);
          lastPostType = 'reel';
        }
        if (lastPostedImage) {
          const imageTime = new Date(lastPostedImage.updated_at);
          if (!lastPostTime || imageTime > lastPostTime) {
            lastPostTime = imageTime;
            lastPostType = 'image';
          }
        }

        const diffMinutesFromLastPost = lastPostTime ? Math.floor((now.getTime() - lastPostTime.getTime()) / 60000) : Infinity;

        let shouldPublish = false;

        if (schedule_mode === 'fixed') {
          if (schedule_fixed_times && Array.isArray(schedule_fixed_times) && schedule_fixed_times.length > 0) {
            /** Luôn tính giờ và phút theo múi giờ chuẩn Việt Nam (Asia/Ho_Chi_Minh) */
            const vnFormatter = new Intl.DateTimeFormat('en-US', {
              timeZone: 'Asia/Ho_Chi_Minh',
              hour: 'numeric',
              minute: 'numeric',
              hour12: false,
            });
            const parts = vnFormatter.formatToParts(now);
            const vnH = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
            const vnM = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
            const currentMinutes = vnH * 60 + vnM;

            for (const time of schedule_fixed_times as string[]) {
              const [h, m] = time.split(':').map(Number);
              const fixedTimeMinutes = h * 60 + m;

              /** ZTTeam: Mở rộng khung giờ từ 5 phút lên 45 phút để các Page xếp hàng tuần tự không bị lỡ lượt */
              if (currentMinutes >= fixedTimeMinutes && currentMinutes < fixedTimeMinutes + 45) {
                /** Nếu đã đăng cách đây chưa đầy 45 phút -> Khung giờ này đã được xử lý */
                if (diffMinutesFromLastPost < 45) {
                  this.logger.log(`Page ${page.name}: Slot ${time} already served (${diffMinutesFromLastPost}m ago). Skipping.`);
                  break;
                }
                shouldPublish = true;
                break;
              }
            }
          }
        } else {
          /** immediate / gap mode */
          const gapMinutes = schedule_immediate_gap_minutes || 60;
          if (!lastPostTime || diffMinutesFromLastPost >= gapMinutes) {
            shouldPublish = true;
          } else {
            this.logger.log(`Page ${page.name}: Waiting for gap (${diffMinutesFromLastPost}/${gapMinutes}m).`);
          }
        }

        if (!shouldPublish) {
          continue;
        }

        /** 5. Phân loại bài đăng Video Reel và Ảnh cho Page này */
        const pageReelsOld = pendingReels.filter(r => r.page_id === pageId);
        const pageImagesWithVideo = pendingImages.filter(i => i.page_id === pageId && i.video_url);
        const pageImagesOnly = pendingImages.filter(i => i.page_id === pageId && !i.video_url);

        /** Tập hợp tất cả các ứng viên Reel */
        const allAvailableReels = [
          ...pageReelsOld.map(r => ({ type: 'reel_legacy' as const, data: r })),
          ...pageImagesWithVideo.map(i => ({ type: 'image_reel' as const, data: i })),
        ];

        /** Tập hợp tất cả các ứng viên Ảnh */
        const allAvailableImages = pageImagesOnly.map(i => ({ type: 'image_only' as const, data: i }));

        let selectedItem: { type: 'reel_legacy' | 'image_reel' | 'image_only'; data: any } | null = null;

        if (post_format === 'reel') {
          /** Cấu hình: Nếu chọn reel thì đăng reel, nếu bài chuẩn bị đăng ko có reel thì đăng ảnh (đảm bảo phải có bài để đăng) */
          if (allAvailableReels.length > 0) {
            selectedItem = allAvailableReels[0];
          } else if (allAvailableImages.length > 0) {
            selectedItem = allAvailableImages[0];
          } else if (pageImagesWithVideo.length > 0) {
            selectedItem = { type: 'image_only', data: pageImagesWithVideo[0] };
          }
        } else if (post_format === 'image') {
          /** Cấu hình: Nếu chọn ảnh thì chắc chắn phải đăng ảnh */
          if (allAvailableImages.length > 0) {
            selectedItem = allAvailableImages[0];
          } else if (pageImagesWithVideo.length > 0) {
            selectedItem = { type: 'image_only', data: pageImagesWithVideo[0] };
          }
        } else {
          /** Cấu hình: Nếu chọn ảnh và reel xen kẽ thì đăng đúng chuẩn, trường hợp reel ko có vẫn đăng ảnh */
          if (lastPostType === 'reel') {
            /** Lượt trước đăng Reel -> Lượt này đăng Ảnh */
            if (allAvailableImages.length > 0) {
              selectedItem = allAvailableImages[0];
            } else if (pageImagesWithVideo.length > 0) {
              selectedItem = { type: 'image_only', data: pageImagesWithVideo[0] };
            }
          } else {
            /** Lượt trước đăng Ảnh -> Lượt này đăng Reel. Trường hợp reel ko có vẫn đăng ảnh */
            if (allAvailableReels.length > 0) {
              selectedItem = allAvailableReels[0];
            } else if (allAvailableImages.length > 0) {
              selectedItem = allAvailableImages[0];
            } else if (pageImagesWithVideo.length > 0) {
              selectedItem = { type: 'image_only', data: pageImagesWithVideo[0] };
            }
          }
        }

        if (selectedItem) {
          const itemDate = selectedItem.data.created_at || selectedItem.data.updated_at || now;
          eligibleCandidates.push({
            page,
            selectedItem,
            diffMinutesFromLastPost,
            itemCreatedAt: new Date(itemDate).getTime(),
          });
        } else {
          this.logger.log(`Page ${page.name}: Không có bài viết đáp ứng điều kiện theo cấu hình "${post_format}" -> Bỏ qua, không gọi API đăng Facebook.`);
        }
      }

      if (eligibleCandidates.length === 0) {
        return;
      }

      /**
       * ZTTeam: Thuật toán điều phối hàng đợi (Priority Dispatcher):
       * 1. Ưu tiên Page nào lâu nhất chưa có bài đăng (diffMinutesFromLastPost giảm dần)
       * 2. Nếu bằng nhau, ưu tiên bài viết được tạo sớm nhất (itemCreatedAt tăng dần)
       */
      eligibleCandidates.sort((a, b) => {
        if (b.diffMinutesFromLastPost !== a.diffMinutesFromLastPost) {
          return b.diffMinutesFromLastPost - a.diffMinutesFromLastPost;
        }
        return a.itemCreatedAt - b.itemCreatedAt;
      });

      this.logger.log(`[ZTTeam Global Dispatcher] Có ${eligibleCandidates.length} bài sẵn sàng xuất bản. Đang điều phối bài ưu tiên cao nhất...`);

      /**
       * ZTTeam: Kiểm tra và đảm bảo khoảng cách an toàn toàn cục (Global Rate Limiter):
       * Tuyệt đối không gọi Facebook API nếu lần đăng gần nhất trên toàn hệ thống chưa đủ 45 giây.
       */
      const elapsedSinceLastGlobal = Date.now() - this.ztteam_lastGlobalPublishTimestamp;
      const MIN_GLOBAL_GAP_MS = 45000;
      if (this.ztteam_lastGlobalPublishTimestamp > 0 && elapsedSinceLastGlobal < MIN_GLOBAL_GAP_MS) {
        const waitMs = MIN_GLOBAL_GAP_MS - elapsedSinceLastGlobal;
        this.logger.log(`[ZTTeam Global Dispatcher] Giãn cách bảo vệ Meta: Chờ thêm ${Math.round(waitMs / 1000)}s trước khi gọi Facebook API...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }

      /** Lấy bài viết ưu tiên số 1 để đăng trong chu kỳ này */
      const target = eligibleCandidates[0];
      const { selectedItem, page } = target;

      this.logger.log(`[ZTTeam Global Dispatcher] Đang xuất bản cho Page: ${page.name} (Đã chờ: ${target.diffMinutesFromLastPost === Infinity ? 'Mới/Vô cực' : target.diffMinutesFromLastPost + 'm'})`);

      if (selectedItem.type === 'reel_legacy') {
        await this.ztteam_publishReel(selectedItem.data, page);
      } else if (selectedItem.type === 'image_only') {
        await this.ztteam_publishImage(selectedItem.data, page, true);
      } else {
        await this.ztteam_publishImage(selectedItem.data, page, false);
      }

      this.ztteam_lastGlobalPublishTimestamp = Date.now();
    } catch (error: any) {
      this.logger.error(`Unified publisher cron error: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Đăng video Reel lên Facebook Page
   */
  private async ztteam_publishReel(reel: any, page: any) {
    this.logger.log(`Auto-publishing reel ${reel.id} to page ${page.name}...`);

    try {
      const videoPath = ztteam_getReelsPath(reel.id, 'output.mp4');

      if (!fs.existsSync(videoPath)) {
        throw new Error('File video không tồn tại trên server');
      }

      let description = reel.ai_caption || reel.wp_post_title || '';

      /** Xóa tracking link cũ nếu có */
      if (description.includes('utm_source=reel')) {
        const parts = description.split(/(👉|🔥|📌|👇|🔗|Read more:)/);
        if (parts.length > 1) {
          description = parts[0].trim();
        } else {
          description = description.split(/\n\n.*utm_source=reel/)[0].trim();
        }
      }

      const slugify = (text: string) => {
        if (!text) return '';
        return text.toString().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-').trim();
      };

      const utmMedium = slugify(page?.fb_account?.name || 'account');
      const utmCampaign = slugify(page?.name || 'page');
      const trackingLink = reel.wp_post_url ? `${reel.wp_post_url}${reel.wp_post_url.includes('?') ? '&' : '?'}utm_source=reel&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}` : '';

      const isViewThreshold = page.link_mode === 'view_threshold';
      const isNone = page.link_mode === 'none';
      const isImmediate = page.link_mode === 'immediate';

      if (isImmediate && page.add_link_to_caption && reel.wp_post_url) {
        const prefixes = [
          '👉 Discover more here:',
          '🔥 Read the full story:',
          '📌 Check out the details:',
          '👇 Full article link:',
          '🔗 Learn more at:'
        ];
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        description = `${prefix} ${trackingLink}\n\n${description}`;
      }

      const response = await this.facebookService.ztteam_publishReel(
        page.fb_page_id,
        videoPath,
        description
      );

      if (isImmediate && page.add_link_to_comment && reel.wp_post_url && response.id) {
        try {
          const commentPrefixes = [
            '👉 Discover more here:',
            '🔥 Read the full story:',
            '📌 Check out the details:',
            '👇 Full article link:',
            '🔗 Learn more at:'
          ];
          const commentPrefix = commentPrefixes[Math.floor(Math.random() * commentPrefixes.length)];
          await this.facebookService.ztteam_publishComment(
            page.fb_page_id,
            response.id,
            `${commentPrefix} ${trackingLink}`
          );
        } catch (e: any) {
          this.logger.error(`Failed to post comment for reel ${reel.id}: ${e.message}`);
        }
      }

      await this.prisma.ztteam_reels.update({
        where: { id: reel.id },
        data: {
          status: 'POSTED',
          is_posted: true,
          posted_at: new Date(),
          fb_post_id: response.id,
          post_retry_count: 0,
          link_injected: isViewThreshold ? false : true,
          link_injected_at: (isImmediate && (page.add_link_to_caption || page.add_link_to_comment)) ? new Date() : null,
        }
      });

      this.eventEmitter.emit('reel.updated', { id: reel.id, status: 'POSTED', fb_post_id: response.id });
      this.logger.log(`Reel ${reel.id} successfully auto-published to page ${page.name}`);
    } catch (error: any) {
      const extractedError = ztteam_extractErrorMessage(error);
      const isIdentityCheckpoint =
        extractedError.includes('4854002') ||
        extractedError.includes('xác nhận danh tính') ||
        extractedError.includes('confirm your identity');

      let currentRetries = (reel.post_retry_count || 0) + 1;
      this.logger.error(`Failed to auto-publish reel ${reel.id} (Attempt ${currentRetries}/3): ${extractedError}`);

      if (isIdentityCheckpoint) {
        /**
         * ZTTeam: Kích hoạt Circuit Breaker ngay lập tức!
         * Meta yêu cầu xác nhận danh tính trên điện thoại.
         * Dừng thử lại ngay (set 3) và tạm dừng auto_publish trên Page để bảo vệ BM và các Page khác.
         */
        currentRetries = 3;
        await this.prisma.ztteam_pages.update({
          where: { id: page.id },
          data: {
            auto_publish_enabled: false,
            token_status: 'checkpoint_required'
          }
        }).catch(() => {});
        this.logger.warn(`[CIRCUIT BREAKER] Page ${page.name} kích hoạt bảo vệ do Facebook yêu cầu xác nhận danh tính. Tạm ngưng auto-publish.`);
      }

      if (currentRetries < 3) {
        await this.prisma.ztteam_reels.update({
          where: { id: reel.id },
          data: {
            post_retry_count: currentRetries,
            error_log: `Lần thử ${currentRetries}/3 thất bại: ${extractedError}`,
          }
        });
        this.logger.log(`Reel ${reel.id} kept in COMPLETED status for next time slot retry (Attempt ${currentRetries}/3)`);
      } else {
        await this.prisma.ztteam_reels.update({
          where: { id: reel.id },
          data: {
            status: 'FAILED',
            post_retry_count: currentRetries,
            error_log: isIdentityCheckpoint
              ? `[CIRCUIT BREAKER] Facebook yêu cầu Quản trị viên mở điện thoại xác minh danh tính (Subcode 4854002): ${extractedError}`
              : `Lỗi đăng bài sau 3 lần thử: ${extractedError}`,
          }
        });

        let ownerEmail = 'N/A';
        if (page?.fb_account?.owner_user_id) {
          const u = await this.prisma.ztteam_users.findUnique({ where: { id: page.fb_account.owner_user_id }, select: { email: true } });
          if (u) ownerEmail = u.email;
        }

        const alertMsg = this.telegramService.ztteam_formatAlert({
          systemName: isIdentityCheckpoint ? 'Xác Minh Danh Tính Fanpage' : 'Xuất Bản Fanpage (Đăng Video Reel)',
          fanpageName: page.name || 'Không rõ',
          postTitle: reel.wp_post_title || 'Video Reel',
          step: 'Đăng tải video Reel lên Facebook qua Graph API',
          rawError: extractedError,
          nextAction: isIdentityCheckpoint
            ? 'Hệ thống đã tự động tạm ngắt xuất bản trên Page này để bảo vệ BM. Vui lòng mở ứng dụng Facebook trên điện thoại -> Chuyển sang Page -> Đăng thử 1 bài viết để xác nhận danh tính, sau đó bật lại tự động đăng trên web.'
            : 'Đã thử lại 3 lần thất bại. Vui lòng kiểm tra lại token Fanpage hoặc quyền đăng bài.',
          memberEmail: ownerEmail,
        });
        this.telegramService.ztteam_sendMessage(alertMsg).catch(() => {});
      }
    }
  }

  /**
   * Đăng bài ảnh lên Facebook Page
   */
  private async ztteam_publishImage(image: any, page: any, forceImageOnly = false) {
    this.logger.log(`Auto-publishing image ${image.id} to page ${page.name} (forceImageOnly: ${forceImageOnly})...`);

    try {
      let absoluteImagePath = ztteam_getImagesPath(image.id, 'output.png');

      /** Fallback to image.image_url if output.png is not in standard dir */
      if (!fs.existsSync(absoluteImagePath) && image.image_url) {
        let fallback: string;
        if (image.image_url.startsWith('/storage') || image.image_url.startsWith('storage')) {
          fallback = path.join(ztteam_getStorageRoot(), image.image_url.replace(/^\/?storage[/\\]?/, ''));
        } else if (fs.existsSync(image.image_url)) {
          fallback = image.image_url;
        } else {
          fallback = path.join(ztteam_getStorageRoot(), image.image_url.replace(/^[/\\]+/, ''));
        }
        if (fs.existsSync(fallback)) {
          absoluteImagePath = fallback;
        }
      }

      if (!fs.existsSync(absoluteImagePath)) {
        this.logger.warn(`File ảnh không tồn tại trên server: ${absoluteImagePath}`);
        await this.prisma.ztteam_images.update({
          where: { id: image.id },
          data: {
            status: 'FAILED',
            error_log: 'File ảnh không tồn tại trên máy chủ (được tạo từ môi trường khác hoặc đã bị xóa)',
          }
        });
        return;
      }

      let caption = image.ai_caption || image.wp_post_title || '';

      const slugify = (text: string) => {
        if (!text) return '';
        return text.toString().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-').trim();
      };

      const utmMedium = slugify(page?.fb_account?.name || 'account');
      const utmCampaign = slugify(page?.name || 'page');
      const trackingLink = image.wp_post_url ? `${image.wp_post_url}${image.wp_post_url.includes('?') ? '&' : '?'}utm_source=image&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}` : '';

      const isViewThreshold = page.link_mode === 'view_threshold';
      const isNone = page.link_mode === 'none';
      const isImmediate = page.link_mode === 'immediate';

      if (isImmediate && page.add_link_to_caption && image.wp_post_url) {
        const prefixes = [
          '👉 Discover more here:',
          '🔥 Read the full story:',
          '📌 Check out the details:',
          '👇 Full article link:',
          '🔗 Learn more at:'
        ];
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        caption = `${prefix} ${trackingLink}\n\n${caption}`;
      }

      let fbPostId: string;
      /** ZTTeam: Nếu bài viết đã tạo Video Reel và không bắt buộc chỉ đăng ảnh, ưu tiên xuất bản Reel/Video lên Facebook */
      if (image.video_url && !forceImageOnly) {
        let absoluteVideoPath = '';
        if (image.video_url.startsWith('/storage/')) {
          absoluteVideoPath = path.join(ztteam_getStorageRoot(), image.video_url.replace(/^\/storage\//, ''));
        } else {
          absoluteVideoPath = path.join(ztteam_getStorageRoot(), image.video_url.replace(/^[/\\]+/, ''));
        }

        if (fs.existsSync(absoluteVideoPath)) {
          const response = await this.facebookService.ztteam_publishReel(
            page.fb_page_id,
            absoluteVideoPath,
            caption
          );
          fbPostId = response.id;
        } else {
          fbPostId = await this.facebookService.ztteam_publishPhoto(
            page.fb_page_id,
            absoluteImagePath,
            caption
          );
        }
      } else {
        fbPostId = await this.facebookService.ztteam_publishPhoto(
          page.fb_page_id,
          absoluteImagePath,
          caption
        );
      }

      if (isImmediate && page.add_link_to_comment && image.wp_post_url && fbPostId) {
        try {
          const commentPrefixes = [
            '👉 Discover more here:',
            '🔥 Read the full story:',
            '📌 Check out the details:',
            '👇 Full article link:',
            '🔗 Learn more at:'
          ];
          const commentPrefix = commentPrefixes[Math.floor(Math.random() * commentPrefixes.length)];
          await this.facebookService.ztteam_publishComment(
            page.fb_page_id,
            fbPostId,
            `${commentPrefix} ${trackingLink}`
          );
        } catch (e: any) {
          this.logger.error(`Failed to post immediate comment for image ${image.id}: ${e.message}`);
        }
      }

      await this.prisma.ztteam_images.update({
        where: { id: image.id },
        data: {
          is_posted: true,
          posted_at: new Date(),
          fb_post_id: fbPostId,
          status: 'POSTED',
          comment_step: page.link_mode === 'delayed_2step' ? 0 : 99,
          link_injected: isViewThreshold ? false : true,
          link_injected_at: (isImmediate && (page.add_link_to_caption || page.add_link_to_comment)) ? new Date() : null,
          post_retry_count: 0,
        }
      });

      this.logger.log(`Successfully published image ${image.id} to page ${page.name}, Post ID: ${fbPostId} (Comment Step 0 scheduled)`);
      this.eventEmitter.emit('image.posted', { imageId: image.id, pageId: page.id });
    } catch (error: any) {
      const extractedError = ztteam_extractErrorMessage(error);
      const isIdentityCheckpoint =
        extractedError.includes('4854002') ||
        extractedError.includes('xác nhận danh tính') ||
        extractedError.includes('confirm your identity');

      let currentRetries = (image.post_retry_count || 0) + 1;
      this.logger.error(`Failed to auto-publish image ${image.id} (Attempt ${currentRetries}/3): ${extractedError}`);

      if (isIdentityCheckpoint) {
        /**
         * ZTTeam: Kích hoạt Circuit Breaker ngay lập tức!
         * Meta yêu cầu xác nhận danh tính trên điện thoại.
         * Dừng thử lại ngay (set 3) và tạm dừng auto_publish trên Page để bảo vệ BM và các Page khác.
         */
        currentRetries = 3;
        await this.prisma.ztteam_pages.update({
          where: { id: page.id },
          data: {
            auto_publish_enabled: false,
            token_status: 'checkpoint_required'
          }
        }).catch(() => {});
        this.logger.warn(`[CIRCUIT BREAKER] Page ${page.name} kích hoạt bảo vệ do Facebook yêu cầu xác nhận danh tính. Tạm ngưng auto-publish.`);
      }

      if (currentRetries < 3) {
        await this.prisma.ztteam_images.update({
          where: { id: image.id },
          data: {
            post_retry_count: currentRetries,
            error_log: `Lần thử ${currentRetries}/3 thất bại: ${extractedError}`
          }
        });
        this.logger.log(`Image ${image.id} kept in COMPLETED status for next time slot retry (Attempt ${currentRetries}/3)`);
      } else {
        await this.prisma.ztteam_images.update({
          where: { id: image.id },
          data: {
            status: 'FAILED',
            post_retry_count: currentRetries,
            error_log: isIdentityCheckpoint
              ? `[CIRCUIT BREAKER] Facebook yêu cầu Quản trị viên mở điện thoại xác minh danh tính (Subcode 4854002): ${extractedError}`
              : `Lỗi đăng ảnh sau 3 lần thử: ${extractedError}`
          }
        });

        let ownerEmail = 'N/A';
        if (page?.fb_account?.owner_user_id) {
          const u = await this.prisma.ztteam_users.findUnique({ where: { id: page.fb_account.owner_user_id }, select: { email: true } });
          if (u) ownerEmail = u.email;
        }

        const alertMsg = this.telegramService.ztteam_formatAlert({
          systemName: isIdentityCheckpoint ? 'Xác Minh Danh Tính Fanpage' : 'Xuất Bản Fanpage (Đăng Ảnh 2K)',
          fanpageName: page.name || 'Không rõ',
          postTitle: image.wp_post_title || 'Bài viết ảnh',
          step: 'Đăng tải ảnh 2K và nội dung Caption lên Fanpage Facebook',
          rawError: extractedError,
          nextAction: isIdentityCheckpoint
            ? 'Hệ thống đã tự động tạm ngắt xuất bản trên Page này để bảo vệ BM. Vui lòng mở ứng dụng Facebook trên điện thoại -> Chuyển sang Page -> Đăng thử 1 bài viết để xác nhận danh tính, sau đó bật lại tự động đăng trên web.'
            : 'Đã thử lại 3 lần thất bại. Vui lòng kiểm tra lại token Fanpage hoặc kết nối mạng.',
          memberEmail: ownerEmail,
        });
        this.telegramService.ztteam_sendMessage(alertMsg).catch(() => {});
      }
    }
  }

  /**
   * Helper slugify chuỗi văn bản cho tracking link
   */
  private ztteam_slugify(text: string): string {
    if (!text) return '';
    return text.toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-').trim();
  }

  /**
   * Xử lý quy trình comment tự động 2 bước sau khi đăng bài:
   * Bước 1: Sau 60 phút từ posted_at -> Đăng bình luận mồi:
   * "...I know you're all very curious about what happens next, so if you want to read on, leave "YES" in the comments below! 👇"
   * Bước 2: Tương tác thông minh (Smart Engagement):
   * - Trong vòng 2 tiếng (120 phút): Quét mỗi 2 phút, nếu có bất kỳ độc giả thật nào comment -> Reply ngay Part 2 + link cho họ (gửi chuông thông báo).
   * - Nếu sau 2 tiếng vẫn 0 có ai comment: Kích hoạt Fallback tự động reply vào comment mồi của Page để đảm bảo luôn có link bài viết.
   */
  async ztteam_handleDelayedComments() {
    try {
      const now = new Date();

      /** Bước 1: Quét các bài viết đăng sau 60 phút nhưng chưa đăng comment mồi (comment_step = 0) */
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const step0Images = await this.prisma.ztteam_images.findMany({
        where: {
          is_posted: true,
          fb_post_id: { not: null },
          comment_step: 0,
          posted_at: { gte: oneDayAgo, lte: oneHourAgo },
          page: {
            link_mode: 'delayed_2step'
          }
        },
        include: {
          page: {
            include: { fb_account: true }
          }
        },
        take: 10
      });

      for (const img of step0Images) {
        if (!img.page?.fb_page_id || !img.fb_post_id) continue;

        /** Kiểm tra giãn cách thời gian an toàn nếu đã từng thử thất bại trước đó */
        if (img.post_retry_count > 0) {
          const elapsedMs = now.getTime() - new Date(img.updated_at).getTime();
          /** Lần 1 thất bại -> Chờ ít nhất 5 phút mới thử lần 2. Lần 2 thất bại -> Chờ ít nhất 10 phút mới thử lần 3. */
          const requiredWaitMs = img.post_retry_count === 1 ? 5 * 60 * 1000 : 10 * 60 * 1000;
          if (elapsedMs < requiredWaitMs) {
            const remainingMins = Math.ceil((requiredWaitMs - elapsedMs) / 60000);
            this.logger.log(`[Auto-Comment Step 1] Delay backoff active for image ${img.id} (Attempt ${img.post_retry_count}/3). Waiting ${remainingMins}m before next attempt...`);
            continue;
          }
        }

        try {
          const hookText = ztteam_getRandomHookComment(img.id);
          const res = await this.facebookService.ztteam_publishComment(
            img.page.fb_page_id,
            img.fb_post_id,
            hookText
          );

          const hookCommentId = typeof res === 'object' && res?.id ? String(res.id) : (typeof res === 'string' ? res : null);

          await this.prisma.ztteam_images.update({
            where: { id: img.id },
            data: {
              comment_step: 1,
              hook_comment_id: hookCommentId,
              hook_comment_at: new Date(),
              post_retry_count: 0, /** Reset lại về 0 khi thành công */
            }
          });

          this.logger.log(`[Auto-Comment Step 1] Posted YES hook comment for image ${img.id} (Post ${img.fb_post_id}, Comment ID: ${hookCommentId})`);
        } catch (err: any) {
          const extractedError = ztteam_extractErrorMessage(err);
          const currentRetries = (img.post_retry_count || 0) + 1;
          this.logger.error(`[Auto-Comment Step 1] Failed for image ${img.id} (Attempt ${currentRetries}/3): ${extractedError}`);

          if (currentRetries < 3) {
            /** Tự động giãn cách thời gian để thử lại ở chu kỳ tiếp theo, CHƯA báo Telegram */
            await this.prisma.ztteam_images.update({
              where: { id: img.id },
              data: {
                post_retry_count: currentRetries,
                error_log: `Lần thử ${currentRetries}/3 thất bại: ${extractedError}`,
              }
            }).catch(() => { });
            this.logger.log(`[Auto-Comment Step 1] Image ${img.id} scheduled for safe backoff retry ${currentRetries + 1}/3 after ${currentRetries === 1 ? '5' : '10'} minutes.`);
          } else {
            /** Sau 3 lần thử thất bại: Đánh dấu comment_step = 2 để kết thúc và báo Telegram */
            await this.prisma.ztteam_images.update({
              where: { id: img.id },
              data: {
                comment_step: 2,
                post_retry_count: currentRetries,
                error_log: `Lỗi comment mồi sau 3 lần thử (giãn cách an toàn 5-10 phút): ${extractedError}`,
              }
            }).catch(() => { });

            /** ZTTeam: Bắn thông báo cảnh báo lỗi bình luận Step 1 về Telegram */
            let ownerEmail = 'N/A';
            if (img.page?.fb_account?.owner_user_id) {
              const u = await this.prisma.ztteam_users.findUnique({ where: { id: img.page.fb_account.owner_user_id }, select: { email: true } });
              if (u) ownerEmail = u.email;
            }

            const alertMsg = this.telegramService.ztteam_formatAlert({
              systemName: 'Tự Động Bình Luận (Auto-Comment)',
              fanpageName: img.page?.name || 'Không rõ',
              postTitle: img.wp_post_title || 'Bài viết ảnh 2K',
              step: 'Bước 1: Đăng bình luận mồi (YES Hook Comment) dưới bài viết',
              rawError: extractedError,
              nextAction: 'Đã thử lại 3 lần (giãn cách an toàn 5-10 phút) đều thất bại. Hệ thống kết thúc quy trình để bảo vệ Fanpage.',
              memberEmail: ownerEmail,
            });
            this.telegramService.ztteam_sendMessage(alertMsg).catch(() => {});
          }
        }
      }

      /** Bước 2: Quét các bài viết đang ở comment_step = 1 (Đã đăng comment mồi, chờ độc giả tương tác hoặc fallback sau 5 tiếng) */
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const step1Images = await this.prisma.ztteam_images.findMany({
        where: {
          is_posted: true,
          comment_step: 1,
          hook_comment_id: { not: null },
          hook_comment_at: { gte: threeDaysAgo }
        },
        include: {
          page: {
            include: { fb_account: true }
          }
        },
        take: 10
      });

      for (const img of step1Images) {
        if (!img.page?.fb_page_id || !img.hook_comment_id || !img.hook_comment_at) continue;

        /** Kiểm tra giãn cách thời gian an toàn nếu từng thử thất bại ở Step 2 */
        if (img.post_retry_count > 0) {
          const elapsedMs = now.getTime() - new Date(img.updated_at).getTime();
          const requiredWaitMs = img.post_retry_count === 1 ? 5 * 60 * 1000 : 10 * 60 * 1000;
          if (elapsedMs < requiredWaitMs) {
            continue;
          }
        }

        try {
          const hookAgeMs = now.getTime() - new Date(img.hook_comment_at).getTime();
          const hookAgeMinutes = Math.floor(hookAgeMs / (60 * 1000));
          const isExpired5Hours = hookAgeMinutes >= 300; /** Đủ 5 tiếng (300 phút) */

          /** Chuẩn bị nội dung reply Part 2 + link bài viết */
          let replyContent = img.ai_first_comment;
          if (!replyContent || replyContent === 'NO_LINK') {
            const utmMedium = this.ztteam_slugify(img.page?.fb_account?.name || 'account');
            const utmCampaign = this.ztteam_slugify(img.page?.name || 'page');
            const trackingLink = img.wp_post_url
              ? `${img.wp_post_url}${img.wp_post_url.includes('?') ? '&' : '?'}utm_source=image&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}`
              : '';
            replyContent = `👉 FULL STORY HERE 👇👇👇\n${trackingLink}`;
          }

          if (isExpired5Hours) {
            /** KỊCH BẢN 1: Đã hết 5 tiếng mà không có ai comment -> Kích hoạt Fallback tự động reply vào chính comment mồi */
            await this.facebookService.ztteam_publishComment(
              img.page.fb_page_id,
              img.hook_comment_id,
              replyContent
            );

            await this.prisma.ztteam_images.update({
              where: { id: img.id },
              data: {
                comment_step: 2,
                post_retry_count: 0,
              }
            });

            this.logger.log(`[Auto-Comment Step 2 - Fallback 5h] Replied Part 2 & Link for image ${img.id} to hook comment ${img.hook_comment_id} after ${hookAgeMinutes}m`);
            continue;
          }

          /** KỊCH BẢN 2: Trong vòng 5 tiếng -> Quét mỗi 2 phút một lần để tìm tương tác từ độc giả thật */
          if (hookAgeMinutes % 2 !== 0) {
            /** Chưa đến chu kỳ 2 phút -> Bỏ qua tick này để tiết kiệm API */
            continue;
          }

          /** Gọi Graph API lấy bình luận bài viết (Field expansion kèm reply lồng nhau) */
          const comments = await this.facebookService.ztteam_getComments(
            img.page.fb_page_id,
            img.fb_post_id || img.hook_comment_id
          );

          /** Tìm bình luận từ độc giả thật (không phải do chính Fanpage tự comment) */
          let targetCommentId: string | null = null;
          let realCommenterName = '';

          for (const comment of comments) {
            /** Kiểm tra xem comment cấp 1 có phải của độc giả thật không */
            if (comment.from?.id && comment.from.id !== img.page.fb_page_id && comment.id !== img.hook_comment_id) {
              targetCommentId = comment.id;
              realCommenterName = comment.from?.name || '';
              break;
            }

            /** Kiểm tra các sub-comments (replies) lồng bên trong comment */
            if (comment.comments?.data && Array.isArray(comment.comments.data)) {
              for (const subComment of comment.comments.data) {
                if (subComment.from?.id && subComment.from.id !== img.page.fb_page_id) {
                  targetCommentId = subComment.id;
                  realCommenterName = subComment.from?.name || '';
                  break;
                }
              }
            }

            if (targetCommentId) break;
          }

          /** Nếu tìm thấy độc giả thật bình luận -> Reply ngay cho độc giả đó! */
          if (targetCommentId) {
            await this.facebookService.ztteam_publishComment(
              img.page.fb_page_id,
              targetCommentId,
              replyContent
            );

            await this.prisma.ztteam_images.update({
              where: { id: img.id },
              data: {
                comment_step: 2,
                post_retry_count: 0,
              }
            });

            this.logger.log(`[Auto-Comment Step 2 - Smart Engagement] Found real user (${realCommenterName}) on image ${img.id}! Replied Part 2 to comment ${targetCommentId}`);
          }
        } catch (err: any) {
          const extractedError = ztteam_extractErrorMessage(err);
          const currentRetries = (img.post_retry_count || 0) + 1;
          this.logger.error(`[Auto-Comment Step 2] Failed for image ${img.id} (Attempt ${currentRetries}/3): ${extractedError}`);

          if (currentRetries < 3) {
            await this.prisma.ztteam_images.update({
              where: { id: img.id },
              data: {
                post_retry_count: currentRetries,
                error_log: `Lần thử Step 2 ${currentRetries}/3 thất bại: ${extractedError}`,
              }
            }).catch(() => { });
            this.logger.log(`[Auto-Comment Step 2] Image ${img.id} scheduled for safe backoff retry ${currentRetries + 1}/3 after ${currentRetries === 1 ? '5' : '10'} minutes.`);
          } else {
            /** Sau 3 lần thử thất bại mới kết thúc và báo Telegram */
            await this.prisma.ztteam_images.update({
              where: { id: img.id },
              data: {
                comment_step: 2,
                post_retry_count: currentRetries,
                error_log: `Lỗi reply Part 2 sau 3 lần thử (giãn cách 5-10 phút): ${extractedError}`,
              }
            }).catch(() => { });

            let ownerEmail = 'N/A';
            if (img.page?.fb_account?.owner_user_id) {
              const u = await this.prisma.ztteam_users.findUnique({ where: { id: img.page.fb_account.owner_user_id }, select: { email: true } });
              if (u) ownerEmail = u.email;
            }

            const alertMsg = this.telegramService.ztteam_formatAlert({
              systemName: 'Tự Động Bình Luận (Auto-Comment)',
              fanpageName: img.page?.name || 'Không rõ',
              postTitle: img.wp_post_title || 'Bài viết ảnh 2K',
              step: 'Bước 2: Trả lời bình luận độc giả (kèm Link bài viết Part 2)',
              rawError: extractedError,
              nextAction: 'Đã thử lại 3 lần (giãn cách an toàn 5-10 phút) đều thất bại. Hệ thống đã kết thúc quy trình.',
              memberEmail: ownerEmail,
            });
            this.telegramService.ztteam_sendMessage(alertMsg).catch(() => {});
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`Error in ztteam_handleDelayedComments: ${error.message}`);
    }
  }

  /**
   * ZTTeam: Tự động quét lượt xem video và gắn link vào Comment hoặc Caption khi đạt ngưỡng view (View-Based Link Injection)
   */
  async ztteam_handleViewThresholdLinkInjection() {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // 1. Quét các video Reels đã đăng trong 7 ngày chưa được gắn link và page có link_mode = 'view_threshold'
      const pendingReels = await this.prisma.ztteam_reels.findMany({
        where: {
          is_posted: true,
          fb_post_id: { not: null },
          link_injected: false,
          posted_at: { gte: sevenDaysAgo },
          page: {
            link_mode: 'view_threshold'
          }
        },
        include: {
          page: {
            include: { fb_account: true }
          }
        },
        orderBy: [
          { last_views_checked_at: { sort: 'asc', nulls: 'first' } },
          { posted_at: 'desc' }
        ],
        take: 100
      });

      // 2. Quét các bài Image có video_url đã đăng dưới dạng video/reel trong 7 ngày
      const pendingVideoImages = await this.prisma.ztteam_images.findMany({
        where: {
          is_posted: true,
          fb_post_id: { not: null },
          video_url: { not: null },
          link_injected: false,
          posted_at: { gte: sevenDaysAgo },
          page: {
            link_mode: 'view_threshold'
          }
        },
        include: {
          page: {
            include: { fb_account: true }
          }
        },
        orderBy: [
          { last_views_checked_at: { sort: 'asc', nulls: 'first' } },
          { posted_at: 'desc' }
        ],
        take: 100
      });

      if (pendingReels.length === 0 && pendingVideoImages.length === 0) {
        return;
      }

      this.logger.log(`[View-Based Link] Checking views for ${pendingReels.length} reels and ${pendingVideoImages.length} video images...`);

      // Gom nhóm theo từng page để batch query metrics từ Facebook Graph API
      const pageReelsMap = new Map<string, { page: any; reels: any[]; images: any[] }>();

      for (const reel of pendingReels) {
        if (!reel.page?.fb_page_id) continue;
        if (!pageReelsMap.has(reel.page.id)) {
          pageReelsMap.set(reel.page.id, { page: reel.page, reels: [], images: [] });
        }
        pageReelsMap.get(reel.page.id)!.reels.push(reel);
      }

      for (const img of pendingVideoImages) {
        if (!img.page?.fb_page_id) continue;
        if (!pageReelsMap.has(img.page.id)) {
          pageReelsMap.set(img.page.id, { page: img.page, reels: [], images: [] });
        }
        pageReelsMap.get(img.page.id)!.images.push(img);
      }

      for (const [, group] of pageReelsMap) {
        const { page, reels, images } = group;
        if (!page.page_token_encrypted || !page.fb_page_id) continue;

        // Batch lấy metrics của các video gần nhất trên fanpage
        const recentMetrics = await this.facebookService.ztteam_getPageRecentVideoMetrics(page.fb_page_id, 100);

        // Xử lý từng Reel
        for (const reel of reels) {
          await this.ztteam_processSinglePostViewThreshold(reel, page, recentMetrics, 'reel');
        }

        // Xử lý từng Image Video
        for (const img of images) {
          await this.ztteam_processSinglePostViewThreshold(img, page, recentMetrics, 'image');
        }
      }
    } catch (error: any) {
      this.logger.error(`Error in ztteam_handleViewThresholdLinkInjection: ${error.message}`);
    }
  }

  private async ztteam_processSinglePostViewThreshold(
    item: any,
    page: any,
    recentMetrics: Map<string, { views: number; description?: string }>,
    type: 'reel' | 'image'
  ) {
    try {
      const postId = item.fb_post_id;
      if (!postId) return;

      let metric = recentMetrics.get(postId);
      if (!metric) {
        metric = await this.facebookService.ztteam_getVideoMetrics(page.fb_page_id, postId) || undefined;
      }

      const currentViews = metric?.views || 0;
      const targetThreshold = page.link_view_threshold || 1000;
      const targetPos = page.link_target_position || 'comment';
      const fallbackHours = page.link_fallback_hours !== undefined ? page.link_fallback_hours : 24;
      const fallbackAction = page.link_fallback_action || 'inject';

      const hoursElapsed = item.posted_at ? (Date.now() - new Date(item.posted_at).getTime()) / (1000 * 60 * 60) : 0;
      const isThresholdReached = currentViews >= targetThreshold;
      const isFallbackTimeout = fallbackHours > 0 && hoursElapsed >= fallbackHours;

      // Chuẩn bị tracking link
      const utmMedium = this.ztteam_slugify(page?.fb_account?.name || 'account');
      const utmCampaign = this.ztteam_slugify(page?.name || 'page');
      const trackingLink = item.wp_post_url
        ? `${item.wp_post_url}${item.wp_post_url.includes('?') ? '&' : '?'}utm_source=reel&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}`
        : '';

      const updateData: any = {
        last_views_checked: currentViews,
        last_views_checked_at: new Date(),
      };

      if (isThresholdReached || (isFallbackTimeout && fallbackAction === 'inject')) {
        const triggerReason = isThresholdReached
          ? `đạt ${currentViews} views (ngưỡng: ${targetThreshold})`
          : `fallback sau ${hoursElapsed.toFixed(1)}h (ngưỡng: ${fallbackHours}h)`;

        if (trackingLink) {
          // Gắn vào comment
          if (targetPos === 'comment' || targetPos === 'both') {
            const commentPrefixes = [
              '👉 Read the full story here:',
              '🔥 Full details and story link below:',
              '👇 Read the full episode here:',
              '✨ Full story available here:',
              '📌 Click to read the full story:'
            ];
            const prefix = commentPrefixes[Math.floor(Math.random() * commentPrefixes.length)];
            await this.facebookService.ztteam_publishComment(page.fb_page_id, postId, `${prefix} ${trackingLink}`);
          }

          // Gắn vào caption
          if (targetPos === 'caption' || targetPos === 'both') {
            const currentDesc = metric?.description || item.ai_caption || '';
            if (!currentDesc.includes(trackingLink)) {
              const updatedDesc = `${currentDesc}\n\n👉 Full Story: ${trackingLink}`.trim();
              await this.facebookService.ztteam_updateVideoDescription(page.fb_page_id, postId, updatedDesc);
            }
          }
        }

        updateData.link_injected = true;
        updateData.link_injected_at = new Date();
        updateData.injected_views_count = currentViews;

        this.logger.log(`[View-Based Link] Injected link for ${type} ${item.id} on page ${page.name} (${triggerReason}, vị trí: ${targetPos})`);
      } else if (isFallbackTimeout && fallbackAction === 'skip') {
        updateData.link_injected = true;
        updateData.injected_views_count = currentViews;
        this.logger.log(`[View-Based Link Fallback] Post ${postId} on page ${page.name} exceeded fallback ${fallbackHours}h (${currentViews} views). Skipped injection to keep video clean.`);
      }

      // Lưu lại database
      if (type === 'reel') {
        await this.prisma.ztteam_reels.update({
          where: { id: item.id },
          data: updateData
        });
      } else {
        await this.prisma.ztteam_images.update({
          where: { id: item.id },
          data: updateData
        });
      }
    } catch (e: any) {
      const errMessage = e.response?.data?.error?.message || e.message || '';
      this.logger.error(`Error processing view threshold for post ${item.fb_post_id}: ${errMessage}`);

      const isDeadPost =
        errMessage.includes('does not exist') ||
        errMessage.includes('cannot be loaded') ||
        errMessage.includes('Missing Permissions') ||
        e.response?.status === 400 ||
        e.response?.status === 404;

      const fallbackUpdate: any = {
        last_views_checked_at: new Date(),
      };
      if (isDeadPost) {
        fallbackUpdate.link_injected = true;
        this.logger.warn(`[View-Based Link] Post ${item.fb_post_id} on page ${page.name} is inaccessible or deleted on Facebook (${errMessage}). Marked link_injected=true to release queue.`);
      }

      try {
        if (type === 'reel') {
          await this.prisma.ztteam_reels.update({
            where: { id: item.id },
            data: fallbackUpdate
          });
        } else {
          await this.prisma.ztteam_images.update({
            where: { id: item.id },
            data: fallbackUpdate
          });
        }
      } catch (dbErr: any) {
        this.logger.error(`Failed to update fallback status for post ${item.fb_post_id}: ${dbErr.message}`);
      }
    }
  }
}
