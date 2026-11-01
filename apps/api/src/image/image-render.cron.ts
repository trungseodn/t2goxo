import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZTTeamImageProcessor } from './image.processor';
import { ZTTeamWordpressService } from '../wordpress/wordpress.service';

@Injectable()
export class ZTTeamImageRenderCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(ZTTeamImageRenderCron.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageProcessor: ZTTeamImageProcessor,
    private readonly wordpressService: ZTTeamWordpressService,
  ) {}

  onApplicationBootstrap() {
    this.logger.log('Legacy Auto-Image Render Cron is decommissioned in favor of ZTTeamCrawlerCron.');
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async ztteam_handleCron() {
    /** Decommissioned: Image creation is 100% handled via ZTTeamCrawlerCron */
    return;
  }

  private async ztteam_processPage(page: any) {
    this.logger.log(`Checking new posts for page: ${page.name}`);
    
    let processedCount = 0;
    const batchSize = page.auto_scan_batch_size || 3;
    const maxAgeDays = page.auto_max_post_age_days || 7;
    const now = new Date();

    const intervalHours = page.auto_scan_interval_hours || 2;
    
    /** Fetch last scan time from settings to decouple from Reel scanner */
    const settingKey = `image_scan_${page.id}`;
    const scanSetting = await this.prisma.ztteam_settings.findUnique({ where: { key: settingKey } });
    const lastScanTime = scanSetting ? new Date(scanSetting.value) : null;
    
    if (lastScanTime) {
      const hoursSinceLastScan = (now.getTime() - lastScanTime.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastScan < intervalHours) {
        this.logger.debug(`Skipping page ${page.name}, interval not reached (${hoursSinceLastScan.toFixed(2)} / ${intervalHours} hours)`);
        return;
      }
    }

    for (const source of page.sources) {
      if (!source.is_active) continue;

      const site = await this.prisma.ztteam_target_sites.findUnique({
        where: { id: source.target_site_id }
      });
      if (!site || site.status !== 'active') continue;

      try {
        const posts = await this.wordpressService.ztteam_getPosts(source.target_site_id, undefined as any, source.target_category_id, source.target_tags);
        
        /** Process oldest first (FIFO) so chronological order is maintained on Fanpage */
        const reversedPosts = [...posts].reverse();

        for (const post of reversedPosts) {
          if (processedCount >= batchSize) break;

          const postDate = new Date(post.date);
          const ageDays = (now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24);
          
          if (ageDays > maxAgeDays) {
            continue;
          }

          /** Check if already used by this page */
          const history = await this.prisma.ztteam_image_history.findUnique({
            where: { page_id_wp_post_id: { page_id: page.id, wp_post_id: post.id.toString() } }
          });
          if (history) continue;

          /** Check if already used by ANY OTHER page sharing the same target site */
          const usedByOtherPage = await this.prisma.ztteam_images.findFirst({
            where: {
              wp_post_id: post.id.toString(),
              page: {
                sources: {
                  some: {
                    target_site_id: source.target_site_id,
                    is_active: true,
                  }
                }
              }
            }
          });
          if (usedByOtherPage) {
            this.logger.debug(`Skipping post #${post.id} for page ${page.name}: already used by another Fanpage`);
            continue;
          }

          const queueCount = await this.prisma.ztteam_images.count({
            where: {
              page_id: page.id,
              status: { in: ['QUEUED', 'RENDERING'] }
            }
          });
          if (queueCount >= (page.auto_queue_limit || 10)) {
            this.logger.log(`Queue limit reached for page ${page.name}`);
            break;
          }

          const image = await this.prisma.ztteam_images.create({
            data: {
              page_id: page.id,
              wp_post_id: post.id.toString(),
              wp_post_title: post.title,
              wp_post_url: post.link,
              template_id: 'auto',
              status: 'QUEUED',
            },
          });

          await this.prisma.ztteam_image_history.upsert({
            where: { page_id_wp_post_id: { page_id: page.id, wp_post_id: post.id.toString() } },
            create: { page_id: page.id, wp_post_id: post.id.toString() },
            update: {},
          });

          await this.imageProcessor.ztteam_addJob({
            imageId: image.id,
            pageId: page.id,
            wpPostId: post.id.toString(),
            templateId: 'auto',
          });

          processedCount++;
        }
      } catch (error: any) {
        this.logger.error(`Failed to fetch posts from site ${site.wp_url}: ${error.message}`);
      }

      if (processedCount >= batchSize) break;
    }

    if (processedCount > 0) {
      const settingKey = `image_scan_${page.id}`;
      await this.prisma.ztteam_settings.upsert({
        where: { key: settingKey },
        create: { key: settingKey, value: new Date().toISOString() },
        update: { value: new Date().toISOString() }
      });
      this.logger.log(`Queued ${processedCount} images for page ${page.name}`);
    }
  }
}
