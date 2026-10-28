import { Controller, Post, Get, Delete, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ZTTeamCrawlerService } from './crawler.service';
import { ZTTeamFetcherService } from './fetcher.service';
import { ZTTeamCrawlerCron } from './crawler.cron';
import { ZTTeamAuthGuard } from '../auth/auth.guard';

@Controller('crawler')
@UseGuards(ZTTeamAuthGuard)
export class ZTTeamCrawlerController {
  constructor(
    private readonly crawlerService: ZTTeamCrawlerService,
    private readonly fetcherService: ZTTeamFetcherService,
    private readonly crawlerCron: ZTTeamCrawlerCron,
  ) {}

  @Post('test-scrape')
  ztteam_testScrape(@Body() body: { url: string }) {
    return this.fetcherService.ztteam_fetchUrlData(body.url);
  }

  @Post('crawl-and-process')
  ztteam_crawlAndProcess(
    @Body()
    body: {
      sourceUrl: string;
      targetSiteId: string;
      pageId?: string;
      addLinkToComment?: boolean;
      sourceCategory?: string;
      keepContentImages?: boolean;
    }
  ) {
    return this.crawlerService.ztteam_crawlAndPublishStory(body);
  }

  @Post('sites/:siteId/sources')
  ztteam_createSource(
    @Param('siteId') siteId: string,
    @Body()
    body: {
      sourceUrl: string;
      sourceCategory: string;
      frequencyCron: string;
      addLinkToComment?: boolean;
      batchSize?: number;
      keepContentImages?: boolean;
      maxScanPages?: number;
    }
  ) {
    return this.crawlerService.ztteam_createSource(siteId, body);
  }

  @Get('sites/:siteId/sources')
  ztteam_getSources(@Param('siteId') siteId: string) {
    return this.crawlerService.ztteam_getSources(siteId);
  }

  @Patch('sources/:sourceId/edit')
  ztteam_updateSource(
    @Param('sourceId') sourceId: string,
    @Body()
    body: {
      sourceUrl: string;
      sourceCategory: string;
      frequencyCron: string;
      addLinkToComment?: boolean;
      batchSize?: number;
      keepContentImages?: boolean;
      maxScanPages?: number;
    }
  ) {
    return this.crawlerService.ztteam_updateSource(sourceId, body);
  }

  @Post('sources/:sourceId/scan-now')
  ztteam_scanSourceNow(@Param('sourceId') sourceId: string) {
    return this.crawlerCron.ztteam_scanSourceNow(sourceId);
  }

  @Delete('sources/:sourceId')
  ztteam_deleteSource(@Param('sourceId') sourceId: string) {
    return this.crawlerService.ztteam_deleteSource(sourceId);
  }

  @Patch('sources/:sourceId/toggle')
  ztteam_toggleSource(
    @Param('sourceId') sourceId: string,
    @Body() body: { enabled: boolean }
  ) {
    return this.crawlerService.ztteam_toggleSource(sourceId, body.enabled);
  }

  @Get('sources/:sourceId/history')
  ztteam_getHistory(@Param('sourceId') sourceId: string) {
    return this.crawlerService.ztteam_getHistory(sourceId);
  }

  @Delete('sources/:sourceId/history')
  ztteam_deleteHistory(@Param('sourceId') sourceId: string) {
    return this.crawlerService.ztteam_deleteHistory(sourceId);
  }
}
