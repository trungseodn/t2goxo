import React, { useEffect, useState } from 'react';
import { useWordpressStore } from '../stores/wordpressStore';
import { useCrawlerStore } from '../stores/crawlerStore';
import type { CrawlSource } from '../stores/crawlerStore';
import { useUIStore } from '../stores/uiStore';
import { ztteam_decodeHtmlEntity } from '../utils/stringUtils';
import api from '../services/api';
import CustomDropdown from '../components/CustomDropdown';
/** Cron value → human-readable label */
function ztteam_cronToLabel(cron: string): string {
  const map: Record<string, string> = {
    '0 */5 * * * *': 'Mỗi 5 phút',
    '0 */15 * * * *': 'Mỗi 15 phút',
    '0 */30 * * * *': 'Mỗi 30 phút',
    '0 */1 * * *': 'Mỗi 1 giờ',
    '0 */2 * * *': 'Mỗi 2 giờ',
    '0 */3 * * *': 'Mỗi 3 giờ',
    '0 */4 * * *': 'Mỗi 4 giờ (Tối ưu 1 Page 5 bài/ngày)',
    '0 */6 * * *': 'Mỗi 6 giờ',
    '0 */12 * * *': 'Mỗi 12 giờ',
    '0 0 * * *': 'Mỗi 24 giờ'
  };
  return map[cron] || cron;
}

export default function WordPressSites() {
  const { sites, isLoading, error, ztteam_fetchSites, ztteam_createSite, ztteam_updateSite, ztteam_deleteSite, ztteam_testConnection } = useWordpressStore();
  const { sources, ztteam_fetchSources, ztteam_createSource, ztteam_updateSource, ztteam_deleteSource, ztteam_toggleSource, ztteam_testScrape } = useCrawlerStore();
  const { ztteam_testPost } = useWordpressStore();
  const { ztteam_showToast, ztteam_showConfirm } = useUIStore();

  /** Which site card is expanded */
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);

  /** Site form state */
  const [showSiteForm, setShowSiteForm] = useState(false);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [wpUrl, setWpUrl] = useState('');
  const [wpUsername, setWpUsername] = useState('');
  const [wpAppPassword, setWpAppPassword] = useState('');
  const [ga4PropertyId, setGa4PropertyId] = useState('');
  const [isManual, setIsManual] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  /** Source form state */
  const [showSourceForm, setShowSourceForm] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceCategory, setSourceCategory] = useState('');
  const [frequencyCron, setFrequencyCron] = useState('0 */6 * * *');
  const [batchSize, setBatchSize] = useState<number>(1);
  const [maxScanPages, setMaxScanPages] = useState<number>(20);
  const [keepContentImages, setKeepContentImages] = useState(false);
  const [scanningSourceId, setScanningSourceId] = useState<string | null>(null);

  /** Fanpages state */
  const [pages, setPages] = useState<any[]>([]);

  useEffect(() => {
    ztteam_fetchSites();
    api.get('/facebook/pages').then((res) => {
      setPages(Array.isArray(res.data) ? res.data : []);
    }).catch(() => {});
  }, []);

  /** 1-Click Auto Pipeline state */
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [autoUrl, setAutoUrl] = useState('');
  const [autoSiteId, setAutoSiteId] = useState('');
  const [autoPageId, setAutoPageId] = useState('');
  const [autoCategory, setAutoCategory] = useState('');
  const [autoAddComment, setAutoAddComment] = useState(true);
  const [autoKeepContentImages, setAutoKeepContentImages] = useState(false);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [autoStepText, setAutoStepText] = useState('');
  const [autoResult, setAutoResult] = useState<any>(null);
  const [autoError, setAutoError] = useState('');

  /** Test scrape state */
  const [testScrapeUrl, setTestScrapeUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<any>(null);
  const [scrapeError, setScrapeError] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [testPostSiteId, setTestPostSiteId] = useState<string | null>(null);

  /** History state */
  const [historyModalSourceId, setHistoryModalSourceId] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const ztteam_handleOpenHistory = async (sourceId: string) => {
    setHistoryModalSourceId(sourceId);
    setIsLoadingHistory(true);
    try {
      const data = await useCrawlerStore.getState().ztteam_fetchHistory(sourceId);
      setHistoryData(data);
    } catch (e) {
      ztteam_showToast('Lỗi khi tải lịch sử', 'error');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const ztteam_handleDeleteHistory = async () => {
    if (!historyModalSourceId) return;
    const confirmed = await ztteam_showConfirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử cào bài của nguồn này?');
    if (!confirmed) return;
    
    try {
      await api.delete(`/crawler/sources/${historyModalSourceId}/history`);
      ztteam_showToast('Đã xóa lịch sử thành công', 'success');
      setHistoryData([]);
    } catch (e) {
      ztteam_showToast('Lỗi khi xóa lịch sử', 'error');
    }
  };

  useEffect(() => {
    ztteam_fetchSites();
    api.get('facebook/pages').then(res => {
      if (res.data && Array.isArray(res.data)) {
        setPages(res.data);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (expandedSiteId) {
      ztteam_fetchSources(expandedSiteId);
    }
  }, [expandedSiteId]);

  /** ──── Site form handlers ──── */
  const ztteam_resetSiteForm = () => {
    setShowSiteForm(false);
    setEditingSiteId(null);
    setWpUrl('');
    setWpUsername('');
    setWpAppPassword('');
    setGa4PropertyId('');
    setIsManual(false);
    setTestResult(null);
  };

  const ztteam_handleEditSite = (site: any) => {
    setEditingSiteId(site.id);
    setWpUrl(site.wp_url);
    setWpUsername(site.wp_username);
    setWpAppPassword('');
    setGa4PropertyId(site.ga4_property_id || '');
    setIsManual(site.is_manual || false);
    setShowSiteForm(true);
    setTestResult(null);
  };

  const ztteam_handleToggleSiteManual = async (siteId: string, currentVal: boolean) => {
    try {
      await useWordpressStore.getState().ztteam_toggleSiteManual(siteId, !currentVal);
      ztteam_showToast(!currentVal ? 'Đã bật Chế độ Đăng Thủ Công cho Website' : 'Đã chuyển Website sang Chế độ Tự Động Fanpage', 'success');
    } catch {
      ztteam_showToast('Lỗi cập nhật chế độ website', 'error');
    }
  };

  const ztteam_handleTestConnection = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!wpUrl || !wpUsername || (!wpAppPassword && !editingSiteId)) {
      setTestResult({ success: false, message: 'Vui lòng nhập đầy đủ thông tin' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      if (editingSiteId && !wpAppPassword) {
        setTestResult({ success: false, message: 'Vui lòng nhập mật khẩu mới để test kết nối' });
        setIsTesting(false);
        return;
      }
      await ztteam_testConnection({ wpUrl, wpUsername, wpAppPassword });
      setTestResult({ success: true, message: 'Kết nối thành công!' });
    } catch (err: any) {
      setTestResult({ success: false, message: err.response?.data?.message || 'Kết nối thất bại.' });
    } finally {
      setIsTesting(false);
    }
  };

  const ztteam_handleSubmitSite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSiteId) {
        await ztteam_updateSite(editingSiteId, { wpUrl, wpUsername, wpAppPassword: wpAppPassword || undefined, isManual, ga4PropertyId: ga4PropertyId.trim() || undefined });
        ztteam_showToast('Cập nhật website thành công', 'success');
      } else {
        await ztteam_createSite({ wpUrl, wpUsername, wpAppPassword, isManual, ga4PropertyId: ga4PropertyId.trim() || undefined });
        ztteam_showToast('Thêm website thành công', 'success');
      }
      ztteam_resetSiteForm();
    } catch (err: any) {
      ztteam_showToast(err.message || 'Lỗi khi lưu website', 'error');
    }
  };

  /** ──── Source form handlers ──── */
  const ztteam_resetSourceForm = () => {
    setShowSourceForm(null);
    setEditingSourceId(null);
    setSourceUrl('');
    setSourceCategory('');
    setFrequencyCron('0 */6 * * *');
    setBatchSize(1);
    setMaxScanPages(20);
    setKeepContentImages(false);
  };

  const ztteam_handleEditSource = (source: CrawlSource) => {
    setShowSourceForm(source.target_site_id);
    setEditingSourceId(source.id);
    setSourceUrl(source.source_url);
    setSourceCategory(source.source_category || '');
    setFrequencyCron(source.frequency_cron);
    try {
      const rules = JSON.parse(source.extract_rules_json || '{}');
      setBatchSize(rules.batchSize ? Number(rules.batchSize) : 1);
      setMaxScanPages(rules.maxScanPages ? Number(rules.maxScanPages) : 20);
      setKeepContentImages(Boolean(rules.keepContentImages));
    } catch (e) {
      setBatchSize(1);
      setMaxScanPages(20);
      setKeepContentImages(false);
    }
  };

  const ztteam_handleSubmitSource = async (e: React.FormEvent, siteId: string) => {
    e.preventDefault();
    try {
      if (editingSourceId) {
        await ztteam_updateSource(editingSourceId, { sourceUrl, sourceCategory, frequencyCron, batchSize, keepContentImages, maxScanPages });
        ztteam_showToast('Cập nhật website nguồn thành công', 'success');
      } else {
        const urls = sourceUrl.split('\n').map(u => u.trim()).filter(u => u);
        let successCount = 0;
        for (const url of urls) {
          try {
            await ztteam_createSource(siteId, { sourceUrl: url, sourceCategory, frequencyCron, batchSize, keepContentImages, maxScanPages });
            successCount++;
          } catch (e) {
            console.error(`Failed to add source ${url}`, e);
          }
        }
        ztteam_showToast(`Đã thêm thành công ${successCount} website nguồn`, 'success');
        ztteam_fetchSites();
      }
      ztteam_resetSourceForm();
      ztteam_fetchSources(siteId);
    } catch (err: any) {
      ztteam_showToast(err.message || 'Lỗi kết nối.', 'error');
    }
  };

  const ztteam_handleScanSourceNow = async (sourceId: string, siteId: string) => {
    setScanningSourceId(sourceId);
    ztteam_showToast('Đang quét sâu phân trang & Load More...', 'info');
    try {
      const res = await useCrawlerStore.getState().ztteam_scanSourceNow(sourceId);
      ztteam_showToast(res.message || 'Quét sâu bài viết hoàn tất!', 'success');
      ztteam_fetchSources(siteId);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Lỗi khi quét nguồn';
      ztteam_showToast(msg, 'error');
    } finally {
      setScanningSourceId(null);
    }
  };

  /** ──── 1-Click Auto Pipeline handlers ──── */
  const ztteam_handleOpenAutoPipeline = (defaultSiteId?: string) => {
    setAutoUrl('');
    setAutoSiteId(defaultSiteId || (sites.length > 0 ? sites[0].id : ''));
    setAutoPageId('');
    setAutoCategory('');
    setAutoAddComment(true);
    setAutoKeepContentImages(false);
    setAutoResult(null);
    setAutoError('');
    setAutoStepText('');
    setShowAutoModal(true);
  };

  const ztteam_handleRunAutoPipeline = async () => {
    if (!autoUrl.trim()) {
      ztteam_showToast('Vui lòng nhập link bài viết nguồn', 'error');
      return;
    }
    if (!autoSiteId) {
      ztteam_showToast('Vui lòng chọn Website WordPress đích', 'error');
      return;
    }

    setIsAutoRunning(true);
    setAutoError('');
    setAutoResult(null);
    setAutoStepText('1/4: Đang cào sạch câu chuyện & vượt tường lửa Cloudflare...');

    const timer1 = setTimeout(() => {
      setAutoStepText('2/4: AI đang phân tích bối cảnh & vẽ ảnh 2K...');
    }, 4000);

    const timer2 = setTimeout(() => {
      setAutoStepText('3/4: Đang đăng bài viết + Featured Image 2K lên WordPress...');
    }, 14000);

    const timer3 = setTimeout(() => {
      setAutoStepText('4/4: Đang chuẩn bị bài Fanpage (Title VIẾT HOA + Part 1/Hook)...');
    }, 22000);

    try {
      const res = await useCrawlerStore.getState().ztteam_crawlAndProcess({
        sourceUrl: autoUrl.trim(),
        targetSiteId: autoSiteId,
        pageId: autoPageId || undefined,
        addLinkToComment: autoAddComment,
        sourceCategory: autoCategory || undefined,
        keepContentImages: autoKeepContentImages,
      });

      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      setAutoResult(res);
      ztteam_showToast('Đã cào & đăng bài tự động toàn trình thành công!', 'success');
    } catch (err: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      const msg = err.response?.data?.message || err.message || 'Lỗi xử lý tự động';
      setAutoError(msg);
      ztteam_showToast(msg, 'error');
    } finally {
      setIsAutoRunning(false);
      setAutoStepText('');
    }
  };

  /** ──── Test scrape handlers ──── */
  const ztteam_handleTestScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testScrapeUrl) return;
    setIsScraping(true);
    setScrapeError('');
    setScrapeResult(null);
    try {
      const result = await ztteam_testScrape(testScrapeUrl);
      setScrapeResult(result);
    } catch (err: any) {
      setScrapeError(err.response?.data?.message || err.message || 'Lỗi khi cào bài');
    } finally {
      setIsScraping(false);
    }
  };

  const ztteam_handleTestPost = async (siteId: string) => {
    if (!scrapeResult) return;
    setIsPosting(true);
    setTestPostSiteId(siteId);
    try {
      const response = await ztteam_testPost(siteId, {
        title: scrapeResult.title,
        content: scrapeResult.contentHtml,
        excerpt: scrapeResult.excerpt,
        imageUrl: scrapeResult.image || undefined
      });
      ztteam_showToast(`Đăng bài thành công! URL: ${response.url}`, 'success');
    } catch (err: any) {
      ztteam_showToast(err.message || 'Lỗi khi đăng bài lên WordPress', 'error');
    } finally {
      setIsPosting(false);
      setTestPostSiteId(null);
    }
  };

  const ztteam_getSourcesForSite = (siteId: string): CrawlSource[] => {
    return sources.filter(s => s.target_site_id === siteId);
  };

  return (
    <div className="w-full space-y-6">
      {/* Page Header Banner (Dark Theme Style) */}
      <div className="bg-fb-surface rounded-2xl shadow-lg p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-fb-text tracking-tight">Cấu hình WordPress &amp; Website Nguồn</h2>
          <p className="text-xs sm:text-sm font-medium text-fb-text-muted mt-1">Quản lý mạng lưới website đích và các website nguồn bài viết tự động.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center sm:gap-2.5">
          <button
            onClick={() => ztteam_handleOpenAutoPipeline()}
            className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-3 sm:px-4 py-2 rounded-full text-xs font-black shadow-md hover:opacity-95 transition-all shrink-0 whitespace-nowrap shadow-emerald-500/20"
          >
            <span className="material-symbols-outlined text-base">bolt</span>
            <span>Cào &amp; Đăng Tự Động (1-Click)</span>
          </button>
          <button
            onClick={() => ztteam_fetchSites()}
            className="flex items-center justify-center gap-1.5 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text px-2.5 sm:px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm shrink-0 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base">sync</span>
            <span>Kiểm tra Toàn bộ</span>
          </button>
          <button
            onClick={() => { setShowSiteForm(true); setEditingSiteId(null); setWpUrl(''); setWpUsername(''); setWpAppPassword(''); setGa4PropertyId(''); setTestResult(null); }}
            className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-fb-blue to-cyan-500 text-white px-2.5 sm:px-4 py-2 rounded-full text-xs font-bold shadow-md hover:opacity-95 transition-all shrink-0 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base">add</span>
            <span>Thêm Website Đích</span>
          </button>
        </div>
      </div>

      {/* ──── Site Form (Add/Edit) ──── */}
      {showSiteForm && (
        <div className="bg-fb-surface p-5 sm:p-6 rounded-2xl shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-black text-fb-text">
              {editingSiteId ? 'Chỉnh sửa Website Đích' : 'Thêm Website Đích (WordPress)'}
            </h3>
            <button onClick={ztteam_resetSiteForm} className="w-8 h-8 rounded-full bg-fb-surface-hover text-fb-text-muted hover:text-white flex items-center justify-center p-0 transition-colors">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
          <form onSubmit={ztteam_handleSubmitSite} className="space-y-4 max-w-2xl">
            <div>
              <label className="text-xs font-bold text-fb-text-muted mb-1.5 block uppercase tracking-wider">URL Website</label>
              <input type="url" value={wpUrl} onChange={(e) => setWpUrl(e.target.value)}
                placeholder="https://mysite.com"
                className="w-full py-2.5 px-4 rounded-full bg-fb-surface-hover text-fb-text text-sm placeholder:text-fb-text-muted/60 focus:outline-none focus:ring-2 focus:ring-fb-blue" required />
              <p className="mt-1 text-[11px] text-fb-text-muted">Địa chỉ trang chủ Website WordPress của bạn (Nơi bot sẽ đăng bài lên).</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-fb-text-muted mb-1.5 block uppercase tracking-wider">Username (Admin)</label>
                <input type="text" value={wpUsername} onChange={(e) => setWpUsername(e.target.value)}
                  placeholder="admin_mysite"
                  className="w-full py-2.5 px-4 rounded-full bg-fb-surface-hover text-fb-text text-sm placeholder:text-fb-text-muted/60 focus:outline-none focus:ring-2 focus:ring-fb-blue" required />
                <p className="mt-1 text-[11px] text-fb-text-muted">Tên đăng nhập tài khoản Quản trị.</p>
              </div>
              <div>
                <label className="text-xs font-bold text-fb-text-muted mb-1.5 block uppercase tracking-wider">Application Password</label>
                <input type="password" value={wpAppPassword} onChange={(e) => setWpAppPassword(e.target.value)}
                  placeholder={editingSiteId ? '(Bỏ trống để giữ nguyên)' : 'xxxx xxxx xxxx xxxx'}
                  className="w-full py-2.5 px-4 rounded-full bg-fb-surface-hover text-fb-text text-sm placeholder:text-fb-text-muted/60 focus:outline-none focus:ring-2 focus:ring-fb-blue" required={!editingSiteId} />
                <p className="mt-1 text-[11px] text-fb-text-muted">Tạo trong WP Admin &gt; Users &gt; Profile &gt; Application Passwords.</p>
              </div>
            </div>

            {/** Cấu hình Google Analytics 4 Property ID */}
            <div>
              <label className="text-xs font-bold text-fb-text-muted mb-1.5 block uppercase tracking-wider">
                Google Analytics 4 Property ID (Tùy chọn)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={ga4PropertyId}
                  onChange={(e) => setGa4PropertyId(e.target.value)}
                  placeholder="Ví dụ: 485123456 (Dãy số Property ID trong GA4)"
                  className="w-full py-2.5 px-4 pr-10 rounded-full bg-fb-surface-hover text-fb-text text-sm placeholder:text-fb-text-muted/60 focus:outline-none focus:ring-2 focus:ring-fb-blue"
                />
                <span className="material-symbols-outlined absolute right-3.5 top-2.5 text-fb-text-muted text-lg pointer-events-none">
                  analytics
                </span>
              </div>
              <p className="mt-1 text-[11px] text-fb-text-muted">
                Dùng để đo lường độc giả online thời gian thực và nguồn traffic về riêng cho website này.
              </p>
            </div>

            {/** Cấu hình Chế độ Đăng Thủ Công (Manual Studio) */}
            <div className="p-3.5 rounded-xl bg-fb-surface-hover/70 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-fb-text flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-emerald-400">edit_document</span>
                  <span>Chế độ Đăng Thủ Công (Manual Studio)</span>
                </span>
                <p className="text-[11px] text-fb-text-muted mt-0.5">
                  Khi bật, 100% bài cào của website này sẽ được đưa thẳng vào Kho Đăng Thủ Công (chuẩn bị sẵn Caption, Ảnh 2K, Link comment), không tự động gán vào Fanpage.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsManual(!isManual)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isManual ? 'bg-emerald-500' : 'bg-black/40 shadow-inner'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isManual ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {testResult && (
              <div className={`p-3.5 rounded-xl flex items-center gap-2 text-xs font-bold ${testResult.success ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                <span className="material-symbols-outlined text-base">{testResult.success ? 'check_circle' : 'error'}</span>
                <span>{testResult.message}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={ztteam_resetSiteForm}
                className="px-4 py-2 text-xs font-bold bg-fb-surface-hover text-fb-text-muted hover:text-white rounded-full transition-colors">Hủy bỏ</button>
              <button type="button" onClick={ztteam_handleTestConnection} disabled={isTesting}
                className="border border-fb-blue text-blue-400 px-4 py-2 rounded-full text-xs font-bold transition hover:bg-blue-500/10 disabled:opacity-50">
                {isTesting ? 'Đang test...' : 'Test Kết Nối'}
              </button>
              <button type="submit" disabled={isLoading || isTesting}
                className="bg-gradient-to-r from-fb-blue to-cyan-500 text-white px-5 py-2 rounded-full text-xs font-bold shadow-md hover:opacity-90 disabled:opacity-50">
                {editingSiteId ? 'Cập nhật' : 'Lưu cấu hình'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ──── Error ──── */}
      {error && (
        <div className="p-4 bg-red-500/15 text-red-400 rounded-2xl flex items-center gap-3 text-xs font-bold">
          <span className="material-symbols-outlined text-base">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* ──── Loading ──── */}
      {isLoading && sites.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <>
          {/* ──── Website Cards Grid ──── */}
          <div className="grid grid-cols-1 gap-5">
            {sites.map(site => {
              const isExpanded = expandedSiteId === site.id;
              const siteSources = ztteam_getSourcesForSite(site.id);

              return (
                <div key={site.id} className="bg-fb-surface-hover/30 rounded-2xl overflow-hidden shadow-lg transition-all duration-300">
                  {/* ── Website Header (bg-fb-surface-hover/70) ── */}
                  <div className="p-4 sm:p-5 bg-fb-surface-hover/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white flex items-center justify-center shrink-0 shadow-md">
                        <span className="material-symbols-outlined text-2xl">language</span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-black text-base text-fb-text truncate">{site.wp_url}</h4>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-fb-text-muted">
                          <span>User: <b className="text-blue-400">{site.wp_username}</b></span>
                          <span>•</span>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400">
                            {site.status === 'connected' ? 'REST API Connected' : site.status}
                          </span>
                          <span>•</span>
                          {site.is_manual ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">edit_document</span>
                              <span>Đăng Thủ Công</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/15 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">dynamic_feed</span>
                              <span>Tự Động Fanpage</span>
                            </span>
                          )}
                          {site.ga4_property_id && (
                            <>
                              <span>•</span>
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 flex items-center gap-1" title={`GA4 Property ID: ${site.ga4_property_id}`}>
                                <span className="material-symbols-outlined text-[12px]">analytics</span>
                                <span>GA4: {site.ga4_property_id}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-auto w-full sm:w-auto pt-2 sm:pt-0">
                      {!isExpanded && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-fb-text-muted font-bold">{site._count?.crawl_sources || 0} Website</span>
                          <button
                            onClick={() => setExpandedSiteId(site.id)}
                            className="flex items-center gap-1 bg-fb-surface text-fb-text px-3.5 py-1.5 rounded-full text-xs font-bold shadow-sm hover:bg-fb-surface-hover transition-all"
                          >
                            <span>Danh sách</span>
                            <span className="material-symbols-outlined text-base">expand_more</span>
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => ztteam_handleToggleSiteManual(site.id, !!site.is_manual)}
                          className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                            site.is_manual
                              ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500 hover:text-white'
                              : 'bg-blue-500/15 text-blue-400 hover:bg-blue-500 hover:text-white'
                          }`}
                          title={site.is_manual ? 'Đang ở chế độ Đăng Thủ Công (Click để chuyển Tự động)' : 'Đang ở chế độ Tự Động Fanpage (Click để chuyển Thủ công)'}
                        >
                          <span className="material-symbols-outlined text-base">
                            {site.is_manual ? 'edit_document' : 'dynamic_feed'}
                          </span>
                        </button>
                        <button onClick={() => ztteam_handleOpenAutoPipeline(site.id)}
                          className="w-8 h-8 flex items-center justify-center text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500 hover:text-white rounded-full transition-colors" title="Cào & Đăng Tự Động (1-Click)">
                          <span className="material-symbols-outlined text-base">bolt</span>
                        </button>
                        <button onClick={() => ztteam_handleEditSite(site)}
                          className="w-8 h-8 flex items-center justify-center text-fb-text-muted bg-fb-surface hover:text-white rounded-full transition-colors" title="Sửa cấu hình">
                          <span className="material-symbols-outlined text-base">settings</span>
                        </button>
                        <button
                          onClick={async () => {
                            const confirmed = await ztteam_showConfirm('Bạn có chắc chắn muốn xóa website này không?');
                            if (confirmed) {
                              ztteam_deleteSite(site.id);
                              ztteam_showToast('Đã xóa website', 'success');
                            }
                          }}
                          className="w-8 h-8 flex items-center justify-center text-red-400 bg-red-500/15 hover:bg-red-500 hover:text-white rounded-full transition-colors" title="Xóa website">
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ── Scraper List (expanded) (bg-fb-surface) ── */}
                  {isExpanded && (
                    <div className="p-4 sm:p-5 bg-fb-surface space-y-4">
                      <div className="flex justify-between items-center pb-1">
                        <h5 className="text-xs font-black text-fb-text-muted uppercase tracking-wider">
                          Web nguồn ({siteSources.length})
                        </h5>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => { setShowSourceForm(site.id); setEditingSourceId(null); setSourceUrl(''); setSourceCategory(''); setFrequencyCron('0 */6 * * *'); setBatchSize(1); setMaxScanPages(20); }}
                            className="text-cyan-400 hover:text-cyan-300 text-xs font-bold flex items-center gap-1 uppercase tracking-wide"
                          >
                            <span className="material-symbols-outlined text-base">add_circle</span>
                            THÊM WEBSITE
                          </button>
                          <button
                            onClick={() => setExpandedSiteId(null)}
                            className="text-fb-text-muted hover:text-fb-text text-xs font-medium flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-base">expand_less</span>
                            Thu gọn
                          </button>
                        </div>
                      </div>

                      {/* Source Form (inline) */}
                      {showSourceForm === site.id && (
                        <div className="rounded-2xl bg-fb-surface-hover/50 p-4 shadow-lg space-y-4">
                          <form onSubmit={(e) => ztteam_handleSubmitSource(e, site.id)} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                              <div>
                                <label className="text-xs font-bold text-fb-text-muted mb-1.5 block uppercase tracking-wider">URL Website Nguồn</label>
                                <textarea value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
                                  placeholder="https://vnexpress.net/so-hoa&#10;https://cafebiz.vn/kinh-doanh"
                                  className="w-full py-2.5 px-4 rounded-2xl bg-fb-surface text-fb-text text-xs placeholder:text-fb-text-muted/60 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-fb-blue" required />
                                <p className="mt-1.5 text-[11px] text-fb-text-muted">Link RSS hoặc trang chủ tin tức. Bot sẽ tự động cập nhật bài mới từ đây (Có thể điền nhiều link).</p>
                              </div>
                              <div>
                                <label className="text-xs font-bold text-fb-text-muted mb-1.5 block uppercase tracking-wider">Chuyên mục WP (ID)</label>
                                <input type="text" value={sourceCategory} onChange={(e) => setSourceCategory(e.target.value)}
                                  placeholder="Ví dụ: 12"
                                  className="w-full py-2.5 px-4 rounded-full bg-fb-surface text-fb-text text-xs placeholder:text-fb-text-muted/60 focus:outline-none focus:ring-2 focus:ring-fb-blue" />
                                <p className="mt-1.5 text-[11px] text-fb-text-muted">ID Chuyên mục trên Website WordPress của bạn. Bài viết sẽ tự động gán vào chuyên mục này.</p>
                              </div>
                              <div>
                                <label className="text-xs font-bold text-fb-text-muted mb-1.5 block uppercase tracking-wider">Tần suất lấy bài</label>
                                <CustomDropdown
                                  value={frequencyCron}
                                  onChange={(val) => setFrequencyCron(val)}
                                  options={[
                                    { value: '0 */5 * * * *', label: '5 phút' },
                                    { value: '0 */15 * * * *', label: '15 phút' },
                                    { value: '0 */30 * * * *', label: '30 phút' },
                                    { value: '0 */1 * * *', label: '1 tiếng (Cho 4-5 Page)' },
                                    { value: '0 */2 * * *', label: '2 tiếng (Cho 2 Page)' },
                                    { value: '0 */3 * * *', label: '3 tiếng' },
                                    { value: '0 */4 * * *', label: '4 tiếng (Tối ưu 1 Page - 5 bài/ngày)' },
                                    { value: '0 */6 * * *', label: '6 tiếng' },
                                    { value: '0 */12 * * *', label: '12 tiếng' },
                                    { value: '0 0 * * *', label: 'Mỗi ngày' }
                                  ]}
                                  className="w-full"
                                />
                                <p className="mt-1.5 text-[11px] text-fb-text-muted">Khoảng cách giữa các lần kiểm tra bài viết mới.</p>
                              </div>
                              <div>
                                <label className="text-xs font-bold text-fb-text-muted mb-1.5 block uppercase tracking-wider">Số bài / chu kỳ</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={batchSize}
                                  onChange={(e) => setBatchSize(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                                  className="w-full py-2.5 px-4 rounded-full bg-fb-surface text-fb-text text-xs placeholder:text-fb-text-muted/60 focus:outline-none focus:ring-2 focus:ring-fb-blue"
                                  required
                                />
                                <p className="mt-1.5 text-[11px] text-fb-text-muted">Khuyên dùng 1 bài để tiết kiệm API AI và tránh quá tải.</p>
                              </div>

                              <div className="md:col-span-2">
                                <label className="flex items-center justify-between p-3.5 bg-fb-surface rounded-2xl cursor-pointer border border-white/5">
                                  <div>
                                    <span className="text-xs font-bold text-fb-text block">Lấy ảnh trong nội dung bài viết</span>
                                    <span className="text-[11px] text-fb-text-muted block mt-0.5">Tải toàn bộ hình ảnh trong thân bài về hosting WordPress của bạn và giữ nguyên vị trí trong bài.</span>
                                  </div>
                                  <div className="relative inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={keepContentImages}
                                      onChange={(e) => setKeepContentImages(e.target.checked)}
                                      className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-fb-surface-hover peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                  </div>
                                </label>
                              </div>

                              <div className="md:col-span-2">
                                <div className="flex items-center justify-between p-3.5 bg-fb-surface rounded-2xl border border-white/5">
                                  <div>
                                    <span className="text-xs font-bold text-fb-text block">Độ sâu phân trang & Load More</span>
                                    <span className="text-[11px] text-fb-text-muted block mt-0.5">Số trang tối đa bot sẽ quét sâu qua phân trang hoặc nút Load More để vét sạch bài cũ.</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <input
                                      type="number"
                                      min={1}
                                      max={50}
                                      value={maxScanPages}
                                      onChange={(e) => setMaxScanPages(Math.max(1, Math.min(50, parseInt(e.target.value) || 20)))}
                                      className="w-16 py-1 px-2.5 rounded-full bg-fb-surface-hover text-fb-text text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-fb-blue border border-white/10"
                                      required
                                    />
                                    <span className="text-xs text-fb-text-muted font-bold">trang</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/** Gợi ý trực tiếp cấu hình theo số lượng Fanpage */}
                            <div className="bg-fb-blue/10 border border-fb-blue/20 rounded-2xl p-3.5 space-y-2">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400">
                                <span className="material-symbols-outlined text-[16px]">tips_and_updates</span>
                                <span>Gợi ý chuẩn: Mục tiêu 5 bài / ngày / Fanpage (Tiết kiệm tối đa API AI)</span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                                  <span className="text-white/60 block text-[10px]">1 Fanpage:</span>
                                  <strong className="text-fb-text block mt-0.5">Mỗi 4 tiếng</strong>
                                  <span className="text-[10px] text-emerald-400 font-medium">Batch: 1 bài</span>
                                </div>
                                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                                  <span className="text-white/60 block text-[10px]">2 Fanpage:</span>
                                  <strong className="text-fb-text block mt-0.5">Mỗi 2 tiếng</strong>
                                  <span className="text-[10px] text-emerald-400 font-medium">Batch: 1 bài</span>
                                </div>
                                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                                  <span className="text-white/60 block text-[10px]">3 Fanpage:</span>
                                  <strong className="text-fb-text block mt-0.5">Mỗi 1.5 tiếng</strong>
                                  <span className="text-[10px] text-emerald-400 font-medium">Batch: 1 bài</span>
                                </div>
                                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                                  <span className="text-white/60 block text-[10px]">4 - 5 Fanpage:</span>
                                  <strong className="text-fb-text block mt-0.5">Mỗi 1 tiếng</strong>
                                  <span className="text-[10px] text-emerald-400 font-medium">Batch: 1 bài</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                              <button type="button" onClick={ztteam_resetSourceForm}
                                className="px-4 py-2 text-xs font-bold bg-fb-surface text-fb-text-muted hover:text-white rounded-full transition-colors">Hủy bỏ</button>
                              <button type="submit"
                                className="bg-gradient-to-r from-fb-blue to-cyan-500 text-white px-5 py-2 rounded-full text-xs font-bold shadow-md hover:opacity-90">
                                {editingSourceId ? 'Cập nhật' : 'Lưu cấu hình'}
                              </button>
                            </div>
                          </form>
                        </div>
                      )}

                      {/* Source Items List */}
                      <div className="space-y-3">
                        {siteSources.map(source => (
                          <div
                            key={source.id}
                            className={`p-3.5 sm:p-4 rounded-2xl bg-fb-surface-hover/40 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-fb-surface-hover/70 transition-all ${!source.enabled ? 'opacity-50' : ''}`}
                          >
                            <div className="flex flex-col gap-2 flex-1 min-w-0">
                              <span className="text-xs font-bold text-fb-text truncate block">{source.source_url}</span>
                              
                              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-4 text-[10px] sm:text-[11px] text-fb-text-muted">
                                <div>
                                  <span className="text-[9px] text-fb-text-muted uppercase tracking-wider font-extrabold block">CHUYÊN MỤC</span>
                                  <span className="font-bold text-blue-400 truncate block">{source.source_category || 'Mặc định'}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-fb-text-muted uppercase tracking-wider font-extrabold block">TẦN SUẤT</span>
                                  <span className="font-bold text-cyan-400 truncate block">{ztteam_cronToLabel(source.frequency_cron)}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-fb-text-muted uppercase tracking-wider font-extrabold block">SỐ BÀI / LẦN</span>
                                  <span className="font-bold text-amber-400 truncate block">
                                    {(() => {
                                      try {
                                        const r = JSON.parse(source.extract_rules_json || '{}');
                                        return r.batchSize || 1;
                                      } catch (e) { return 1; }
                                    })()} bài
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-fb-text-muted uppercase tracking-wider font-extrabold block">QUÉT SÂU</span>
                                  <span className="font-bold text-sky-400 truncate block">
                                    {(() => {
                                      try {
                                        const r = JSON.parse(source.extract_rules_json || '{}');
                                        return r.maxScanPages || 20;
                                      } catch (e) { return 20; }
                                    })()} trang
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-fb-text-muted uppercase tracking-wider font-extrabold block">LẦN TRƯỚC</span>
                                  <span className="font-bold text-fb-text truncate block">{source.last_crawled_at ? new Date(source.last_crawled_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Chưa chạy'}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-fb-text-muted uppercase tracking-wider font-extrabold block">LẦN TỚI</span>
                                  <span className="font-bold text-emerald-400 truncate block">
                                    {source.next_crawl_at && new Date(source.next_crawl_at).getTime() > Date.now() ? new Date(source.next_crawl_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : (source.enabled ? 'Đang chờ...' : '-')}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t border-white/5 md:border-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${source.enabled ? 'text-emerald-400' : 'text-fb-text-muted'}`}>
                                  {source.enabled ? 'Bật' : 'Tắt'}
                                </span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" className="sr-only peer"
                                    checked={source.enabled}
                                    onChange={() => ztteam_toggleSource(source.id, !source.enabled)} />
                                  <div className="w-9 h-5 bg-fb-surface-hover peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                </label>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => ztteam_handleScanSourceNow(source.id, site.id)}
                                  disabled={scanningSourceId === source.id}
                                  className="w-8 h-8 flex items-center justify-center text-fb-text-muted hover:bg-cyan-500/15 hover:text-cyan-400 rounded-full transition-colors disabled:opacity-50"
                                  title="Quét ngay lập tức (Quét sâu phân trang & Load More)"
                                >
                                  <span className={`material-symbols-outlined text-base ${scanningSourceId === source.id ? 'animate-spin text-cyan-400' : ''}`}>
                                    {scanningSourceId === source.id ? 'sync' : 'bolt'}
                                  </span>
                                </button>
                                <button onClick={() => ztteam_handleOpenHistory(source.id)}
                                  className="w-8 h-8 flex items-center justify-center text-fb-text-muted hover:bg-emerald-500/15 hover:text-emerald-400 rounded-full transition-colors" title="Lịch sử lấy bài">
                                  <span className="material-symbols-outlined text-base">history</span>
                                </button>
                                <button onClick={() => ztteam_handleEditSource(source)}
                                  className="w-8 h-8 flex items-center justify-center text-fb-text-muted hover:bg-blue-500/15 hover:text-blue-400 rounded-full transition-colors" title="Chỉnh sửa">
                                  <span className="material-symbols-outlined text-base">edit</span>
                                </button>
                                <button
                                  onClick={async () => {
                                    const confirmed = await ztteam_showConfirm('Bạn có chắc chắn muốn xóa website nguồn này không?');
                                    if (confirmed) {
                                      await ztteam_deleteSource(source.id);
                                      ztteam_showToast('Đã xóa website nguồn', 'success');
                                      ztteam_fetchSources(site.id);
                                      ztteam_fetchSites();
                                    }
                                  }}
                                  className="w-8 h-8 flex items-center justify-center text-fb-text-muted hover:bg-red-500/15 hover:text-red-400 rounded-full transition-colors" title="Xóa">
                                  <span className="material-symbols-outlined text-base">delete</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}

                        {siteSources.length === 0 && (
                          <div className="py-8 text-center text-fb-text-muted text-xs italic">
                            Chưa có website nguồn nào. Bấm "THÊM WEBSITE" để bắt đầu.
                          </div>
                        )}
                      </div>

                      {/* ── Test Scrape ── */}
                      <div className="pt-4 space-y-3">
                        <h5 className="text-xs font-black text-fb-text-muted uppercase tracking-wider">TEST LẤY BÀI VIẾT TỰ ĐỘNG</h5>
                        <form onSubmit={ztteam_handleTestScrape} className="flex gap-2">
                          <input type="url" value={testScrapeUrl} onChange={(e) => setTestScrapeUrl(e.target.value)}
                            placeholder="Nhập link bài viết (VD: https://vnexpress.net/...)"
                            className="flex-1 py-2 px-4 rounded-full bg-fb-surface-hover text-fb-text text-xs placeholder:text-fb-text-muted/60 focus:outline-none focus:ring-2 focus:ring-fb-blue" required />
                          <button type="submit" disabled={isScraping}
                            className="flex items-center gap-1.5 bg-blue-500/15 text-blue-400 hover:bg-blue-500 hover:text-white px-4 py-2 rounded-full text-xs font-bold transition-all disabled:opacity-50 shrink-0">
                            {isScraping ? (
                              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <span className="material-symbols-outlined text-base">search</span>
                            )}
                            Test
                          </button>
                        </form>

                        {scrapeError && (
                          <div className="p-3 bg-red-500/15 text-red-400 rounded-xl flex items-center gap-2 text-xs font-bold">
                            <span className="material-symbols-outlined text-base">error</span>
                            <span>{scrapeError}</span>
                          </div>
                        )}

                        {scrapeResult && (
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 bg-fb-surface-hover/40 p-4 rounded-2xl">
                            <div className="lg:col-span-2 space-y-2">
                              <h4 className="font-extrabold text-sm text-fb-text">{ztteam_decodeHtmlEntity(scrapeResult.title)}</h4>
                              <div className="prose prose-invert max-w-none text-fb-text-muted text-xs overflow-y-auto max-h-[260px] p-3 bg-fb-surface rounded-xl custom-scrollbar">
                                <div dangerouslySetInnerHTML={{ __html: scrapeResult.contentHtml }} />
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <p className="text-xs font-bold text-fb-text-muted uppercase tracking-wider">Ảnh Đại Diện</p>
                              {scrapeResult.image ? (
                                <img src={scrapeResult.image} alt="OG Image" className="w-full rounded-xl object-cover shadow-md aspect-video" />
                              ) : (
                                <div className="w-full aspect-video bg-fb-surface rounded-xl flex items-center justify-center text-fb-text-muted text-xs">Không tìm thấy ảnh</div>
                              )}
                              <div className="mt-auto pt-2">
                                <button
                                  onClick={() => ztteam_handleTestPost(site.id)}
                                  disabled={isPosting && testPostSiteId === site.id}
                                  className="w-full flex justify-center items-center gap-2 bg-gradient-to-r from-fb-blue to-cyan-500 text-white px-4 py-2 rounded-full font-bold text-xs shadow-md hover:opacity-90 disabled:opacity-50">
                                  <span className="material-symbols-outlined text-base">publish</span>
                                  {isPosting && testPostSiteId === site.id ? 'Đang đẩy lên WP...' : 'Đăng thử lên Website'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ──── Empty State ──── */}
          {sites.length === 0 && !isLoading && (
            <div className="py-16 text-center text-fb-text-muted space-y-3 bg-fb-surface rounded-3xl p-8">
              <span className="material-symbols-outlined text-5xl opacity-40">language</span>
              <h4 className="text-base font-extrabold text-fb-text">Thêm website vệ tinh mới?</h4>
              <p className="text-xs text-fb-text-muted max-w-md mx-auto">
                Tự động hóa hoàn toàn nội dung cho hệ thống của bạn bằng cách kết nối thêm nhiều website đích WordPress.
              </p>
              <button
                onClick={() => { setShowSiteForm(true); setEditingSiteId(null); }}
                className="bg-gradient-to-r from-fb-blue to-cyan-500 text-white px-6 py-2.5 rounded-full text-xs font-bold shadow-md hover:opacity-90 transition-all inline-flex items-center gap-2">
                <span className="material-symbols-outlined text-base">add</span>
                Kết nối ngay
              </button>
            </div>
          )}
        </>
      )}

      {/* ──── History Modal ──── */}
      {historyModalSourceId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-fb-surface rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shadow-md">
                  <span className="material-symbols-outlined text-xl">history</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-fb-text">Lịch sử Lấy Bài</h3>
                  <p className="text-xs text-fb-text-muted">50 bài viết gần nhất từ website này</p>
                </div>
              </div>
              <button onClick={() => setHistoryModalSourceId(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-fb-surface-hover text-fb-text-muted hover:text-white transition-colors">
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
              {isLoadingHistory ? (
                <div className="flex flex-col items-center justify-center py-16 text-fb-text-muted">
                  <span className="material-symbols-outlined animate-spin text-3xl mb-2">sync</span>
                  <p className="text-xs font-medium">Đang tải lịch sử...</p>
                </div>
              ) : historyData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-fb-text-muted">
                  <span className="material-symbols-outlined text-4xl mb-2 opacity-40">hourglass_empty</span>
                  <p className="text-xs font-medium">Chưa có bài viết nào được lấy từ website này.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-fb-text-muted uppercase text-[10px] font-black">
                      <tr>
                        <th className="py-2.5 px-3">Bài viết</th>
                        <th className="py-2.5 px-3 text-center">Trạng thái</th>
                        <th className="py-2.5 px-3 text-right">Thời gian</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.map(item => (
                        <tr key={item.id} className="hover:bg-fb-surface-hover/50 transition-colors rounded-xl">
                          <td className="py-3 px-3">
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-bold text-fb-text hover:text-blue-400 transition-colors flex flex-col gap-0.5">
                              <span>{ztteam_decodeHtmlEntity(item.title) || 'Đang lấy tiêu đề...'}</span>
                              <span className="text-[11px] text-fb-text-muted font-normal truncate max-w-md">{item.url}</span>
                            </a>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                              item.status === 'SUCCESS' ? 'text-emerald-400 bg-emerald-500/15' : 'text-red-400 bg-red-500/15'
                            }`}>
                              <span className="material-symbols-outlined text-xs">
                                {item.status === 'SUCCESS' ? 'check_circle' : 'error'}
                              </span>
                              {item.status === 'SUCCESS' ? 'Thành công' : 'Thất bại'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right text-fb-text-muted text-xs">
                            {new Date(item.created_at).toLocaleString('vi-VN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-4 pt-3 flex items-center justify-between text-xs font-bold">
              <button onClick={ztteam_handleDeleteHistory} className="px-4 py-2 bg-red-500/15 text-red-400 hover:bg-red-500 hover:text-white rounded-full transition-colors">
                Xóa lịch sử
              </button>
              <button onClick={() => setHistoryModalSourceId(null)} className="px-5 py-2 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text rounded-full transition-colors">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──── 1-Click Auto Pipeline Modal ──── */}
      {showAutoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-fb-surface rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 pb-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shadow-md">
                  <span className="material-symbols-outlined text-xl">bolt</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-fb-text"><span className="material-symbols-outlined text-[20px] text-amber-400 align-middle mr-1">bolt</span>Cào &amp; Đăng Tự Động (1-Click Pipeline)</h3>
                  <p className="text-xs text-fb-text-muted">Cào sạch truyện &rarr; AI tạo ảnh 2K &rarr; Đăng WP &rarr; Chuẩn bị bài Fanpage</p>
                </div>
              </div>
              <button
                onClick={() => { if (!isAutoRunning) setShowAutoModal(false); }}
                disabled={isAutoRunning}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-fb-surface-hover text-fb-text-muted hover:text-white transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1 custom-scrollbar space-y-4">
              {autoResult ? (
                /* Result View */
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center gap-3">
                    <span className="material-symbols-outlined text-emerald-400 text-2xl">check_circle</span>
                    <div>
                      <h4 className="font-black text-sm text-emerald-400">Đã Hoàn Thành Toàn Bộ Quy Trình!</h4>
                      <p className="text-xs text-fb-text-muted mt-0.5">
                        Bài viết đã được đăng lên WordPress kèm ảnh 2K, và tài nguyên Fanpage đã sẵn sàng trong hàng đợi.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left Col: 2K Image */}
                    <div className="space-y-2">
                      <div className="relative rounded-2xl overflow-hidden shadow-lg border border-white/10 group">
                        <img src={autoResult.image2kUrl} alt="2K Scene" className="w-full aspect-[4/5] object-cover" />
                        <div className="absolute top-2 left-2 bg-slate-950/70 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-black text-emerald-400 tracking-wider">
                          ẢNH 2K AI
                        </div>
                        <a
                          href={autoResult.image2kUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-bold text-xs"
                        >
                          <span className="material-symbols-outlined text-base">open_in_new</span>
                          <span>Xem ảnh gốc</span>
                        </a>
                      </div>
                      <a
                        href={autoResult.wpPostUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-blue-500/15 text-blue-400 hover:bg-blue-500 hover:text-white rounded-full font-bold text-xs transition-colors"
                      >
                        <span className="material-symbols-outlined text-base">public</span>
                        <span>Xem bài viết trên WordPress</span>
                      </a>
                    </div>

                    {/* Right Col: Title & Fanpage Post details */}
                    <div className="space-y-3 flex flex-col justify-between">
                      <div className="space-y-3">
                        <div>
                          <span className="text-[10px] font-black text-fb-text-muted uppercase tracking-wider block">Tiêu đề bài viết</span>
                          <h4 className="font-black text-sm text-fb-text mt-0.5">{autoResult.title}</h4>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-fb-text-muted uppercase tracking-wider block">Nội dung bài đăng Fanpage (Title VIẾT HOA + Part 1)</span>
                          <pre className="bg-fb-surface-hover/50 p-3 rounded-xl text-xs text-fb-text font-sans whitespace-pre-wrap max-h-[180px] overflow-y-auto custom-scrollbar border border-white/5">
                            {autoResult.fanpageCaption}
                          </pre>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-fb-text-muted uppercase tracking-wider block">Bình luận đầu tiên (First Comment)</span>
                          {autoResult.firstComment ? (
                            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2 font-medium">
                              <span className="material-symbols-outlined text-sm">chat_bubble</span>
                              <span className="truncate">{autoResult.firstComment}</span>
                            </div>
                          ) : (
                            <div className="p-2.5 bg-fb-surface-hover/30 text-fb-text-muted text-xs rounded-xl italic">
                              (Đã tắt theo tuỳ chọn — Không tạo link ở bình luận)
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="p-3 bg-fb-surface-hover/30 rounded-xl flex items-center justify-between text-xs mt-2">
                        <span className="text-fb-text-muted">Hàng đợi Fanpage:</span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">schedule</span>
                          Sẵn sàng đăng (COMPLETED)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Pipeline Input Form */
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-fb-text-muted mb-1.5 block uppercase tracking-wider">
                      Link Bài Viết / Câu Chuyện Nguồn
                    </label>
                    <input
                      type="url"
                      value={autoUrl}
                      onChange={(e) => setAutoUrl(e.target.value)}
                      placeholder="https://daytodayusa88.nabeifengshui.com/xyz000002/your-father-cant-give-you-my-house-i-said-and-the-entire-wedding-table-went-silent/"
                      className="w-full py-2.5 px-4 rounded-full bg-fb-surface-hover text-fb-text text-xs placeholder:text-fb-text-muted/60 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                    <p className="mt-1.5 text-[11px] text-fb-text-muted">
                      Hệ thống tự động sử dụng Smart Proxy vượt tường lửa Cloudflare/chặn IP Việt Nam, và lọc sạch 100% nội dung chính (không dính quảng cáo hay text spam).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-fb-text-muted mb-1.5 block uppercase tracking-wider">
                        Website WordPress Đích
                      </label>
                      <CustomDropdown
                        value={autoSiteId}
                        onChange={(val) => setAutoSiteId(val)}
                        options={sites.map(s => ({ value: s.id, label: s.wp_url }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-fb-text-muted mb-1.5 block uppercase tracking-wider">
                        Fanpage Đích (Tùy chọn)
                      </label>
                      <CustomDropdown
                        value={autoPageId}
                        onChange={(val) => setAutoPageId(val)}
                        options={[
                          { value: '', label: 'Tự động chọn Fanpage liên kết' },
                          ...pages.map(p => ({ value: p.id, label: p.name || `Page ${p.fb_page_id}` }))
                        ]}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-fb-text-muted mb-1.5 block uppercase tracking-wider">
                      ID Chuyên Mục WordPress (Tùy chọn)
                    </label>
                    <input
                      type="text"
                      value={autoCategory}
                      onChange={(e) => setAutoCategory(e.target.value)}
                      placeholder="Ví dụ: 12"
                      className="w-full py-2.5 px-4 rounded-full bg-fb-surface-hover text-fb-text text-xs placeholder:text-fb-text-muted/60 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Option: First comment toggle */}
                  <div className="flex items-center justify-between p-3.5 bg-fb-surface-hover/40 rounded-2xl border border-white/5">
                    <div>
                      <span className="text-xs font-bold text-fb-text block">
                        Thêm link bài viết vào Bình luận (First Comment)
                      </span>
                      <span className="text-[11px] text-fb-text-muted">
                        Tự động comment link đọc bài viết trọn bộ khi bot đăng bài lên Fanpage
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoAddComment}
                        onChange={(e) => setAutoAddComment(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-fb-surface-hover peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  {/* Option: Keep content images toggle */}
                  <div className="flex items-center justify-between p-3.5 bg-fb-surface-hover/40 rounded-2xl border border-white/5">
                    <div>
                      <span className="text-xs font-bold text-fb-text block">
                        Lấy ảnh trong nội dung bài viết
                      </span>
                      <span className="text-[11px] text-fb-text-muted">
                        Tải toàn bộ hình ảnh trong thân bài về hosting WordPress của bạn và giữ nguyên vị trí trong bài
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoKeepContentImages}
                        onChange={(e) => setAutoKeepContentImages(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-fb-surface-hover peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  {/* Progress Indicator */}
                  {isAutoRunning && (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
                      <div>
                        <p className="text-xs font-extrabold text-emerald-400">{autoStepText || 'Đang thực hiện quy trình tự động...'}</p>
                        <p className="text-[10px] text-fb-text-muted mt-0.5">Vui lòng chờ giây lát: Hệ thống đang cào dữ liệu, tạo ảnh AI 2K và đăng lên hệ thống.</p>
                      </div>
                    </div>
                  )}

                  {/* Error display */}
                  {autoError && (
                    <div className="p-3 bg-red-500/15 text-red-400 rounded-xl flex items-center gap-2 text-xs font-bold">
                      <span className="material-symbols-outlined text-base">error</span>
                      <span>{autoError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 pt-3 flex items-center justify-between border-t border-white/5 text-xs font-bold">
              {autoResult ? (
                <>
                  <button
                    onClick={() => { setAutoResult(null); setAutoUrl(''); }}
                    className="px-4 py-2 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text rounded-full transition-colors"
                  >
                    Cào bài viết khác
                  </button>
                  <button
                    onClick={() => setShowAutoModal(false)}
                    className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full transition-all shadow-md"
                  >
                    Hoàn tất &amp; Đóng
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setShowAutoModal(false)}
                    disabled={isAutoRunning}
                    className="px-4 py-2 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text-muted hover:text-white rounded-full transition-colors disabled:opacity-50"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    onClick={ztteam_handleRunAutoPipeline}
                    disabled={isAutoRunning || !autoUrl.trim() || !autoSiteId}
                    className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full shadow-md hover:opacity-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isAutoRunning ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Đang xử lý...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">bolt</span>
                        <span>Bắt đầu Cào &amp; Đăng Tự Động</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
