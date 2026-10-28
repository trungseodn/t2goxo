import { create } from 'zustand';
import api from '../services/api';

export interface CrawlSource {
  id: string;
  target_site_id: string;
  source_url: string;
  source_category: string | null;
  extract_rules_json: string;
  frequency_cron: string;
  enabled: boolean;
  created_at: string;
  last_crawled_at?: string | null;
  next_crawl_at?: string | null;
}

export interface ZTTeamCrawlAndProcessParams {
  sourceUrl: string;
  targetSiteId: string;
  pageId?: string;
  addLinkToComment?: boolean;
  sourceCategory?: string;
  keepContentImages?: boolean;
}

export interface ZTTeamCrawlAndProcessResult {
  success: boolean;
  title: string;
  wpPostId: number;
  wpPostUrl: string;
  image2kUrl: string;
  fanpageCaption: string;
  firstComment?: string;
  pageId?: string;
  imageId?: string;
}

interface CrawlerState {
  sources: CrawlSource[];
  isLoading: boolean;
  error: string | null;
  ztteam_fetchSources: (siteId: string) => Promise<void>;
  ztteam_createSource: (siteId: string, data: { sourceUrl: string; sourceCategory: string; frequencyCron: string; addLinkToComment?: boolean; batchSize?: number; keepContentImages?: boolean; maxScanPages?: number }) => Promise<void>;
  ztteam_updateSource: (sourceId: string, data: { sourceUrl: string; sourceCategory: string; frequencyCron: string; addLinkToComment?: boolean; batchSize?: number; keepContentImages?: boolean; maxScanPages?: number }) => Promise<void>;
  ztteam_deleteSource: (sourceId: string) => Promise<void>;
  ztteam_toggleSource: (sourceId: string, enabled: boolean) => Promise<void>;
  ztteam_scanSourceNow: (sourceId: string) => Promise<{ success: boolean; message: string; processedCount: number; freshFoundCount: number }>;
  ztteam_testScrape: (url: string) => Promise<any>;
  ztteam_fetchHistory: (sourceId: string) => Promise<any[]>;
  ztteam_crawlAndProcess: (params: ZTTeamCrawlAndProcessParams) => Promise<ZTTeamCrawlAndProcessResult>;
}

export const useCrawlerStore = create<CrawlerState>((set, get) => ({
  sources: [],
  isLoading: false,
  error: null,

  ztteam_fetchSources: async (siteId) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get(`/crawler/sites/${siteId}/sources`);
      set({ sources: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.message || 'Failed to fetch crawl sources', isLoading: false });
    }
  },

  ztteam_createSource: async (siteId, data) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`/crawler/sites/${siteId}/sources`, data);
      await get().ztteam_fetchSources(siteId);
    } catch (error: any) {
      set({ error: error.response?.data?.message || 'Failed to create crawl source', isLoading: false });
      throw error;
    }
  },

  ztteam_updateSource: async (sourceId, data) => {
    set({ isLoading: true, error: null });
    try {
      await api.patch(`/crawler/sources/${sourceId}/edit`, data);
      set((state) => ({
        sources: state.sources.map(s => s.id === sourceId ? { ...s, source_url: data.sourceUrl, source_category: data.sourceCategory, frequency_cron: data.frequencyCron } : s),
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.response?.data?.message || 'Failed to update crawl source', isLoading: false });
      throw error;
    }
  },

  ztteam_deleteSource: async (sourceId) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/crawler/sources/${sourceId}`);
      set((state) => ({
        sources: state.sources.filter(s => s.id !== sourceId),
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.response?.data?.message || 'Failed to delete crawl source', isLoading: false });
      throw error;
    }
  },

  ztteam_toggleSource: async (sourceId, enabled) => {
    try {
      await api.patch(`/crawler/sources/${sourceId}/toggle`, { enabled });
      set((state) => ({
        sources: state.sources.map(s => s.id === sourceId ? { ...s, enabled } : s)
      }));
    } catch (error: any) {
      set({ error: error.response?.data?.message || 'Failed to toggle crawl source' });
      throw error;
    }
  },

  ztteam_scanSourceNow: async (sourceId: string) => {
    try {
      const response = await api.post(`/crawler/sources/${sourceId}/scan-now`);
      return response.data;
    } catch (error: any) {
      throw error;
    }
  },

  ztteam_testScrape: async (url: string) => {
    try {
      const response = await api.post('/crawler/test-scrape', { url });
      return response.data;
    } catch (error: any) {
      throw error;
    }
  },

  ztteam_fetchHistory: async (sourceId: string) => {
    try {
      const response = await api.get(`/crawler/sources/${sourceId}/history`);
      return response.data;
    } catch (error: any) {
      throw error;
    }
  },

  ztteam_crawlAndProcess: async (params: ZTTeamCrawlAndProcessParams) => {
    try {
      const response = await api.post('/crawler/crawl-and-process', params);
      return response.data;
    } catch (error: any) {
      throw error;
    }
  }
}));
