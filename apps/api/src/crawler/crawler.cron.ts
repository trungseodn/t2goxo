import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZTTeamFetcherService } from './fetcher.service';
import { ZTTeamWordpressService } from '../wordpress/wordpress.service';
import { ZTTeamCrawlerService } from './crawler.service';
import Parser from 'rss-parser';
import { TelegramService, ztteam_extractErrorMessage } from '../telegram/telegram.service';

@Injectable()
export class ZTTeamCrawlerCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(ZTTeamCrawlerCron.name);
  private rssParser: Parser;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fetcherService: ZTTeamFetcherService,
    private readonly wordpressService: ZTTeamWordpressService,
    private readonly telegramService: TelegramService,
    private readonly crawlerService: ZTTeamCrawlerService,
  ) {
    this.rssParser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });
  }

  onApplicationBootstrap() {
    if (process.env.ENABLE_AUTO_CRON === 'false') {
      this.logger.log('Auto-Crawler Cron is disabled via ENABLE_AUTO_CRON=false');
      return;
    }
    this.logger.log('Application started, triggering initial crawler run...');
    this.ztteam_handleCron();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async ztteam_handleCron() {
    if (process.env.ENABLE_AUTO_CRON === 'false') {
      return;
    }
    if (this.isRunning) {
      this.logger.warn('Crawler cron is already running, skipping this tick');
      return;
    }
    this.isRunning = true;
    this.logger.log('Starting Auto-Crawler Cron...');

    try {
      const sources = await this.prisma.ztteam_crawl_sources.findMany({
        where: { enabled: true },
        include: { target_site: true },
        take: 50, /** Batch limit */
      });

      for (const source of sources) {
        if (!source.target_site) continue;
        
        /** Determine the interval in milliseconds based on frequency_cron */
        let intervalMs = 0;
        switch (source.frequency_cron) {
          case '0 */5 * * * *': intervalMs = 5 * 60 * 1000; break;
          case '0 */15 * * * *': intervalMs = 15 * 60 * 1000; break;
          case '0 */30 * * * *': intervalMs = 30 * 60 * 1000; break;
          case '0 */1 * * *': intervalMs = 1 * 60 * 60 * 1000; break;
          case '0 */2 * * *': intervalMs = 2 * 60 * 60 * 1000; break;
          case '0 */3 * * *': intervalMs = 3 * 60 * 60 * 1000; break;
          case '0 */4 * * *': intervalMs = 4 * 60 * 60 * 1000; break;
          case '0 */6 * * *': intervalMs = 6 * 60 * 60 * 1000; break;
          case '0 */12 * * *': intervalMs = 12 * 60 * 60 * 1000; break;
          case '0 0 * * *': intervalMs = 24 * 60 * 60 * 1000; break;
          default: intervalMs = 60 * 60 * 1000; /** Default 1 hour instead of 2 mins */
        }

        /** Check last crawl time */
        const lastCrawl = await this.prisma.ztteam_crawl_history.findFirst({
          where: { source_id: source.id },
          orderBy: { created_at: 'desc' }
        });

        if (lastCrawl) {
          const timeSinceLastCrawl = Date.now() - new Date(lastCrawl.created_at).getTime();
          if (timeSinceLastCrawl < intervalMs) {
            this.logger.debug(`Skipping source ${source.source_url} (Crawled recently. Next run in ${Math.round((intervalMs - timeSinceLastCrawl) / 60000)} mins)`);
            continue;
          }
        }

        this.logger.log(`Crawling source: ${source.source_url} for site: ${source.target_site.wp_url}`);
        
        try {
          await this.ztteam_crawlSource(source);
        } catch (error: any) {
          this.logger.error(`Failed to crawl source ${source.id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Crawler cron failed: ${error.message}`);
    } finally {
      this.isRunning = false;
      this.logger.log('Auto-Crawler Cron finished.');
    }
  }

  /**
   * ZTTeam: Kích hoạt quét ngay lập tức 1 nguồn cào cụ thể (hỗ trợ gọi từ Web UI hoặc API)
   */
  async ztteam_scanSourceNow(sourceId: string): Promise<{ success: boolean; message: string; processedCount: number; freshFoundCount: number }> {
    const source = await this.prisma.ztteam_crawl_sources.findUnique({
      where: { id: sourceId },
      include: { target_site: true },
    });
    if (!source) {
      throw new Error('Không tìm thấy nguồn cào bài viết tương ứng');
    }
    this.logger.log(`[Manual Scan] Người dùng yêu cầu quét ngay nguồn #${source.id}: ${source.source_url}`);
    const res = await this.ztteam_crawlSource(source, true);
    return {
      success: true,
      message: `Đã quét sâu qua ${res.scannedPagesCount} trang, phát hiện ${res.freshFoundCount} bài viết mới và xử lý thành công ${res.processedCount} bài viết.`,
      processedCount: res.processedCount,
      freshFoundCount: res.freshFoundCount,
    };
  }

  /**
   * ZTTeam: Bóc tách danh sách link bài viết từ trang chỉ định với hỗ trợ RSS, HTML trực tiếp và Smart Proxy
   */
  private async ztteam_extractArticleLinksFromPage(
    pageUrl: string,
    source: any,
    pageNum: number
  ): Promise<{ articles: string[]; nextPageUrl?: string | null; allPageUrls?: string[]; loadMoreData?: any }> {
    const extractedSet = new Set<string>();
    let nextPageUrl: string | null = null;
    let allPageUrls: string[] = [];
    let loadMoreData: any = null;

    // 1. Nếu là RSS feed
    const isRssCandidate = pageUrl.includes('/feed') || pageUrl.includes('/rss') || pageUrl.endsWith('.xml');
    if (isRssCandidate || pageNum === 1) {
      try {
        const rssLinks = await this.fetcherService.ztteam_fetchRssArticles(pageUrl, pageNum);
        if (rssLinks.length > 0) {
          return { articles: rssLinks };
        }
      } catch (e) {
        // Tiếp tục bóc tách HTML
      }
    }

    // 2. Bóc tách HTML trực tiếp & phát hiện phân trang / load more
    try {
      const html = await this.fetcherService.ztteam_fetchHtml(pageUrl);
      const discovery = this.fetcherService.ztteam_discoverPagination(html, pageUrl);
      nextPageUrl = discovery.nextPageUrl;
      allPageUrls = discovery.allPageUrls;
      loadMoreData = discovery.loadMoreData;

      const directArticles = this.fetcherService.ztteam_extractArticleLinksFromHtml(html, pageUrl);
      for (const a of directArticles) {
        extractedSet.add(a);
      }

      if (extractedSet.size === 0) {
        this.logger.log(`Không tìm thấy link bài viết trực tiếp trên ${pageUrl}. Chuyển sang Smart Proxy...`);
        const proxyLinks = await this.fetcherService.ztteam_extractArticleLinksViaProxy(pageUrl);
        for (const pl of proxyLinks) {
          extractedSet.add(pl);
        }
      }
    } catch (htmlErr: any) {
      this.logger.warn(`Lấy HTML trực tiếp thất bại cho ${pageUrl} (${htmlErr.message}). Chuyển sang Smart Proxy...`);
      try {
        const proxyLinks = await this.fetcherService.ztteam_extractArticleLinksViaProxy(pageUrl);
        for (const pl of proxyLinks) {
          extractedSet.add(pl);
        }
      } catch (proxyErr: any) {
        this.logger.error(`Smart proxy cũng thất bại cho ${pageUrl}: ${proxyErr.message}`);
      }
    }

    return {
      articles: Array.from(extractedSet),
      nextPageUrl,
      allPageUrls,
      loadMoreData,
    };
  }

  /**
   * ZTTeam: Quét sâu phân trang và Load More của nguồn cào (Deep Flexible Pagination & Load More Engine)
   */
  public async ztteam_crawlSource(
    source: any,
    isManualTrigger = false
  ): Promise<{ processedCount: number; freshFoundCount: number; scannedPagesCount: number }> {
    let maxArticlesPerCycle = 1;
    let maxScanPages = 20; // Mặc định quét sâu tối đa 20 trang phân trang
    let keepContentImages = false;

    try {
      const rules = JSON.parse(source.extract_rules_json || '{}');
      if (rules.batchSize && Number(rules.batchSize) > 0) {
        maxArticlesPerCycle = Math.max(1, Math.min(20, parseInt(rules.batchSize, 10)));
      }
      if (rules.maxScanPages && Number(rules.maxScanPages) > 0) {
        maxScanPages = Math.max(5, Math.min(50, parseInt(rules.maxScanPages, 10)));
      }
      keepContentImages = Boolean(rules.keepContentImages);
    } catch (e) {}

    // Ngưỡng gom bài viết mới để đảm bảo kho bài dồi dào, không bị dừng sớm
    const targetPoolSize = Math.max(15, maxArticlesPerCycle * 3);

    const urlsToFetch: string[] = [];
    const seenArticleSignatures = new Set<string>();
    const visitedPageUrls = new Set<string>();
    let queuedNextPageUrl: string | null = null;
    let explicitPageLinks: string[] = [];
    let detectedLoadMoreData: any = null;
    let wpRestAvailable: boolean | null = null;
    let isRssSource = false;
    let scannedPagesCount = 0;

    this.logger.log(
      `[Deep Crawler] Bắt đầu quét sâu nguồn: ${source.source_url} (Độ sâu tối đa: ${maxScanPages} trang, Mục tiêu bài/lần: ${maxArticlesPerCycle})`
    );

    for (let p = 1; p <= maxScanPages; p++) {
      scannedPagesCount++;

      // Kiểm tra trạng thái nguồn: nếu người dùng tắt nguồn giữa chừng thì dừng ngay
      if (!isManualTrigger) {
        const freshSource = await this.prisma.ztteam_crawl_sources.findUnique({
          where: { id: source.id },
          select: { enabled: true },
        });
        if (!freshSource || !freshSource.enabled) {
          this.logger.log(`Nguồn #${source.id} đã bị tắt bởi người dùng. Dừng vòng lặp quét ngay lập tức.`);
          break;
        }
      }

      let pageArticles: string[] = [];

      // Kiểm tra WP REST API nếu chưa thử hoặc đã xác nhận có
      if (wpRestAvailable !== false) {
        const wpResult = await this.fetcherService.ztteam_fetchWpRestApiPosts(source.source_url, p, 20);
        if (wpResult && wpResult.articles.length > 0) {
          wpRestAvailable = true;
          pageArticles = wpResult.articles;
          this.logger.log(`[Trang ${p}/${maxScanPages}] WP REST API trả về ${pageArticles.length} bài viết (Tổng số trang: ${wpResult.totalPages})`);
        } else if (p === 1) {
          wpRestAvailable = false;
        }
      }

      // Nếu không dùng WP REST API, thử RSS Feed hoặc HTML
      if (pageArticles.length === 0) {
        if (isRssSource || source.source_url.includes('/feed') || source.source_url.includes('/rss')) {
          isRssSource = true;
          pageArticles = await this.fetcherService.ztteam_fetchRssArticles(source.source_url, p);
          if (pageArticles.length > 0) {
            this.logger.log(`[Trang ${p}/${maxScanPages}] RSS Feed trả về ${pageArticles.length} bài viết`);
          }
        }
      }

      // Nếu vẫn chưa có bài viết, sử dụng HTML scraping & Load More
      if (pageArticles.length === 0) {
        // Thử Load More AJAX nếu ở trang > 1 và đã nhận diện được endpoint
        if (p > 1 && detectedLoadMoreData) {
          const ajaxArticles = await this.fetcherService.ztteam_fetchLoadMoreAjaxArticles(detectedLoadMoreData, source.source_url, p);
          if (ajaxArticles.length > 0) {
            pageArticles = ajaxArticles;
            this.logger.log(`[Trang ${p}/${maxScanPages}] Load More AJAX trả về ${pageArticles.length} bài viết`);
          }
        }

        // Nếu chưa có, xác định URL trang cần fetch
        if (pageArticles.length === 0) {
          let targetPageUrl = '';
          if (p === 1) {
            targetPageUrl = source.source_url;
          } else if (queuedNextPageUrl && !visitedPageUrls.has(queuedNextPageUrl)) {
            targetPageUrl = queuedNextPageUrl;
            queuedNextPageUrl = null;
          } else if (explicitPageLinks.length > 0) {
            // Tìm trong danh sách link phân trang đã thu thập được link có chứa trang p
            const matchLink = explicitPageLinks.find(
              (l) => l.includes(`/page/${p}/`) || l.includes(`page=${p}`) || l.includes(`paged=${p}`) || l.includes(`/p/${p}/`)
            );
            if (matchLink && !visitedPageUrls.has(matchLink)) {
              targetPageUrl = matchLink;
            }
          }

          // Nếu chưa có URL rõ ràng, thử danh sách URL ứng viên phân trang linh hoạt
          if (!targetPageUrl) {
            const candidates = this.fetcherService.ztteam_generateCandidatePageUrls(source.source_url, p);
            for (const candUrl of candidates) {
              if (visitedPageUrls.has(candUrl)) continue;

              this.logger.log(`[Trang ${p}/${maxScanPages}] Thử quét URL ứng viên: ${candUrl}`);
              visitedPageUrls.add(candUrl);

              const pageData = await this.ztteam_extractArticleLinksFromPage(candUrl, source, p);
              if (pageData.articles.length > 0) {
                targetPageUrl = candUrl;
                pageArticles = pageData.articles;
                if (pageData.nextPageUrl) queuedNextPageUrl = pageData.nextPageUrl;
                if (pageData.allPageUrls && pageData.allPageUrls.length > 0) {
                  explicitPageLinks = Array.from(new Set([...explicitPageLinks, ...pageData.allPageUrls]));
                }
                if (pageData.loadMoreData) detectedLoadMoreData = pageData.loadMoreData;
                break;
              }
            }
          } else {
            this.logger.log(`[Trang ${p}/${maxScanPages}] Đang quét URL phân trang: ${targetPageUrl}`);
            visitedPageUrls.add(targetPageUrl);
            const pageData = await this.ztteam_extractArticleLinksFromPage(targetPageUrl, source, p);
            pageArticles = pageData.articles;
            if (pageData.nextPageUrl) queuedNextPageUrl = pageData.nextPageUrl;
            if (pageData.allPageUrls && pageData.allPageUrls.length > 0) {
              explicitPageLinks = Array.from(new Set([...explicitPageLinks, ...pageData.allPageUrls]));
            }
            if (pageData.loadMoreData) detectedLoadMoreData = pageData.loadMoreData;
          }
        }
      }

      // Nếu trang hoàn toàn không có bài viết nào (404 hoặc đã hết phân trang), kết thúc quét
      if (pageArticles.length === 0) {
        this.logger.log(
          `[Trang ${p}/${maxScanPages}] Không tìm thấy bài viết nào (đã hết phân trang hoặc trang không tồn tại). Kết thúc quét sâu cho ${source.source_url}.`
        );
        break;
      }

      // Kiểm tra trùng lặp toàn trang (Chống website redirect trang không tồn tại về trang 1 gây lặp vô tận)
      const pageSignature = pageArticles.slice(0, 3).sort().join('|');
      if (seenArticleSignatures.has(pageSignature)) {
        this.logger.log(
          `[Trang ${p}/${maxScanPages}] Nội dung trang này trùng lặp với trang trước (Website đã chuyển hướng về trang đầu). Kết thúc quét phân trang.`
        );
        break;
      }
      seenArticleSignatures.add(pageSignature);

      // Kiểm tra lịch sử để lọc ra các bài viết MỚI chưa cào
      const unCrawledOnThisPage: string[] = [];
      for (const url of pageArticles) {
        if (urlsToFetch.includes(url)) continue;

        const history = await this.prisma.ztteam_crawl_history.findUnique({
          where: { source_id_url: { source_id: source.id, url } },
        });

        const isAlreadyProcessed =
          history &&
          (history.status === 'SUCCESS' || history.status.startsWith('SKIPPED') || history.status === 'FAILED');

        if (!isAlreadyProcessed) {
          unCrawledOnThisPage.push(url);
        }
      }

      this.logger.log(
        `[Trang ${p}/${maxScanPages}] Quét được ${pageArticles.length} bài (${unCrawledOnThisPage.length} bài mới chưa cào). Tổng tích lũy: ${urlsToFetch.length + unCrawledOnThisPage.length} bài.`
      );

      if (unCrawledOnThisPage.length > 0) {
        urlsToFetch.push(...unCrawledOnThisPage);
      }

      // Nếu đã tích lũy đủ số lượng bài mới cần thiết cho đợt xử lý, dừng quét phân trang để bắt đầu cào bài
      if (urlsToFetch.length >= targetPoolSize) {
        this.logger.log(
          `[Deep Crawler] Đã tích lũy đủ kho bài (${urlsToFetch.length} bài mới >= mục tiêu ${targetPoolSize}). Bắt đầu chuyển sang khâu xử lý bài viết!`
        );
        break;
      }
    }

    if (urlsToFetch.length === 0) {
      this.logger.warn(`Không tìm thấy bài viết mới nào sau khi quét sâu ${scannedPagesCount} trang cho nguồn ${source.source_url}`);
      await this.ztteam_markSourceSyncTime(source.id);
      return { processedCount: 0, freshFoundCount: 0, scannedPagesCount };
    }

    // Đánh dấu thời điểm đồng bộ nguồn ngay để chốt interval
    await this.ztteam_markSourceSyncTime(source.id);

    // 2. Xử lý xuất bản các bài viết mới thu thập được
    let processedCount = 0;
    let attemptCount = 0;

    for (const url of urlsToFetch) {
      if (processedCount >= maxArticlesPerCycle) {
        break;
      }

      // Kiểm tra thời gian thực nếu người dùng tắt nguồn
      if (!isManualTrigger) {
        const freshSource = await this.prisma.ztteam_crawl_sources.findUnique({
          where: { id: source.id },
          select: { enabled: true },
        });
        if (!freshSource || !freshSource.enabled) {
          this.logger.log(`Nguồn #${source.id} đã bị tắt. Dừng chu trình cào ngay lập tức.`);
          break;
        }
      }

      try {
        const history = await this.prisma.ztteam_crawl_history.findUnique({
          where: { source_id_url: { source_id: source.id, url } },
        });

        if (history && (history.status === 'SUCCESS' || history.status.startsWith('SKIPPED') || history.status === 'FAILED')) {
          continue;
        }

        const result = await this.crawlerService.ztteam_crawlAndPublishStory({
          sourceId: source.id,
          sourceUrl: url,
          targetSiteId: source.target_site_id,
          sourceCategory: source.source_category,
          keepContentImages,
        });

        await this.prisma.ztteam_crawl_history.upsert({
          where: { source_id_url: { source_id: source.id, url } },
          create: { source_id: source.id, url, title: result.title, status: 'SUCCESS' },
          update: { title: result.title, status: 'SUCCESS' },
        });

        this.logger.log(`Đã xử lý bài viết thành công: "${result.title}" -> WP: ${result.wpPostUrl} | Fanpage Ready: ${result.imageId || 'N/A'}`);
        processedCount++;
        attemptCount++;
      } catch (err: any) {
        const isConditionUnmet =
          err.message?.includes('Không phải bài viết hợp lệ') ||
          err.message?.includes('Nội dung không đạt tiêu chuẩn bài viết') ||
          err.message?.includes('[KHÔNG ĐỦ ĐIỀU KIỆN]');

        if (isConditionUnmet) {
          this.logger.log(`[TỰ ĐỘNG BỎ QUA] URL không đáp ứng điều kiện: ${url} (${err.message})`);
          try {
            await this.prisma.ztteam_crawl_history.upsert({
              where: { source_id_url: { source_id: source.id, url } },
              create: { source_id: source.id, url, status: 'SKIPPED_NOT_ARTICLE' },
              update: { status: 'SKIPPED_NOT_ARTICLE' },
            });
          } catch (e) {}
          // Tiếp tục bài viết tiếp theo trong danh sách urlsToFetch đã thu thập
          continue;
        }

        attemptCount++;
        this.logger.error(`Lỗi khi xử lý URL ${url}: ${err.message}`);

        let sourceDomain = 'Không rõ';
        try {
          sourceDomain = new URL(source.source_url).hostname;
        } catch (e) {
          sourceDomain = source.source_url;
        }

        let targetWpSite = source.target_site?.wp_url || 'Không rõ';
        let memberEmail = 'N/A';
        if (source.target_site?.owner_user_id) {
          const u = await this.prisma.ztteam_users.findUnique({
            where: { id: source.target_site.owner_user_id },
            select: { email: true },
          });
          if (u) memberEmail = u.email;
        }

        let failStep = 'Xử lý luồng cào bài viết tự động';
        const extractedError = ztteam_extractErrorMessage(err);
        const em = extractedError.toLowerCase();
        if (em.includes('không thể lấy nội dung') || em.includes('fetch') || em.includes('không phải bài viết')) {
          failStep = 'Bước 1/4: Thu thập và kiểm duyệt nội dung bài viết từ website nguồn';
        } else if (em.includes('sangtao') || em.includes('ảnh gốc') || em.includes('credit')) {
          failStep = 'Bước 2/4: Tải ảnh gốc dự phòng hoặc tạo ảnh AI 2K';
        } else if (em.includes('wordpress') || em.includes('featured media') || em.includes('tải ảnh lên wp')) {
          failStep = 'Bước 3/4: Đăng bài viết & Featured Media lên Website WordPress đích';
        } else if (em.includes('fanpage') || em.includes('facebook')) {
          failStep = 'Bước 4/4: Chuẩn bị nội dung bài đăng Fanpage Facebook';
        }

        const alertText = this.telegramService.ztteam_formatAlert({
          systemName: `Auto-Crawler (${sourceDomain})`,
          targetSite: targetWpSite,
          sourceUrl: url,
          step: failStep,
          rawError: extractedError,
          nextAction: 'Hệ thống đã tự động BỎ QUA bài viết này để tiếp tục cào các bài tiếp theo, không lặp lại.',
          memberEmail,
        });

        this.telegramService.ztteam_sendMessage(alertText).catch(() => {});

        try {
          await this.prisma.ztteam_crawl_history.upsert({
            where: { source_id_url: { source_id: source.id, url } },
            create: { source_id: source.id, url, status: 'SKIPPED_FAILED' },
            update: { status: 'SKIPPED_FAILED' },
          });
        } catch (e) {}

        const isAuthOrForbidden =
          err.message?.toLowerCase().includes('forbidden') ||
          err.message?.toLowerCase().includes('401') ||
          err.message?.toLowerCase().includes('unauthorized') ||
          err.message?.toLowerCase().includes('status is forbidden');
        if (isAuthOrForbidden) {
          this.logger.error(`Circuit breaker triggered: WordPress auth error. Aborting remaining URLs.`);
          break;
        }
      }
    }

    return {
      processedCount,
      freshFoundCount: urlsToFetch.length,
      scannedPagesCount,
    };
  }

  /** Update SYNC_CHECK record to mark the last time we checked this source */
  private async ztteam_markSourceSyncTime(sourceId: string): Promise<void> {
    try {
      const syncUrl = 'SYNC_CHECK';
      await this.prisma.ztteam_crawl_history.deleteMany({
        where: { source_id: sourceId, url: syncUrl }
      });
      await this.prisma.ztteam_crawl_history.create({
        data: { source_id: sourceId, url: syncUrl, status: 'SYNC' }
      });
    } catch (e: any) {
      this.logger.warn(`Could not update SYNC_CHECK for source ${sourceId}: ${e.message}`);
    }
  }
}
