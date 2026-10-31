import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useWordpressStore } from '../stores/wordpressStore';
import { useUIStore } from '../stores/uiStore';
import { useZTTeamFacebookStore } from '../stores/facebookStore';
import CustomDropdown from '../components/CustomDropdown';
import ZTTeamAIPostCard from '../components/AIPostCard';

export default function FacebookPageSettings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { ztteam_showToast, ztteam_showConfirm } = useUIStore();
  const { sites, ztteam_fetchSites, ztteam_fetchCategories, ztteam_fetchTags } = useWordpressStore();
  const { pages, ztteam_fetchPagesFromDB } = useZTTeamFacebookStore();

  /** Main 2-Tab Navigation State */
  const [activeTab, setActiveTab] = useState<number>(() => {
    const hashMatch = window.location.hash.match(/tab=(\d+)/);
    return hashMatch ? parseInt(hashMatch[1], 10) : 1;
  });

  useEffect(() => {
    window.history.replaceState(null, '', `#tab=${activeTab}`);
  }, [activeTab]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  /** Fanpage Info State */
  const [pageName, setPageName] = useState('');
  const [fbPageId, setFbPageId] = useState('');
  const [pageAvatar, setPageAvatar] = useState<string | null>(null);
  const [isCheckpointBlocked, setIsCheckpointBlocked] = useState<boolean>(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  /** Publishing & Schedule Config State */
  const [postFormat, setPostFormat] = useState('image');
  const [videoEngine, setVideoEngine] = useState('hook_image');
  const [defaultReelTemplateId, setDefaultReelTemplateId] = useState<string>('random');
  const [textStoryTemplates, setTextStoryTemplates] = useState<any[]>([]);
  const [defaultBgm, setDefaultBgm] = useState<string>('');
  const [bgmList, setBgmList] = useState<any[]>([]);
  const [currentPlayingBgm, setCurrentPlayingBgm] = useState<string | null>(null);
  const [bgmAudio, setBgmAudio] = useState<HTMLAudioElement | null>(null);
  const [isUploadingBgm, setIsUploadingBgm] = useState(false);
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(true);
  const [addLinkToCaption, setAddLinkToCaption] = useState(false);
  const [addLinkToComment, setAddLinkToComment] = useState(false);
  const [linkMode, setLinkMode] = useState<'view_threshold' | 'delayed_2step' | 'immediate' | 'none'>('view_threshold');
  const [linkViewThreshold, setLinkViewThreshold] = useState<number>(1000);
  const [linkTargetPosition, setLinkTargetPosition] = useState<'comment' | 'caption' | 'both'>('comment');
  const [linkFallbackHours, setLinkFallbackHours] = useState<number>(24);
  const [linkFallbackAction, setLinkFallbackAction] = useState<'inject' | 'skip'>('inject');
  const [scheduleMode, setScheduleMode] = useState('fixed');
  const [scheduleFixedTimes, setScheduleFixedTimes] = useState<string[]>([]);
  const [timeInput, setTimeInput] = useState('');
  const [scheduleImmediateGap, setScheduleImmediateGap] = useState(60);

  /** Auto Crawl & AI Generation Config State */
  const [autoCreateEnabled, setAutoCreateEnabled] = useState(false);
  const [autoScanInterval, setAutoScanInterval] = useState(2);
  const [autoScanBatchSize, setAutoScanBatchSize] = useState(1);
  const [autoQueueLimit, setAutoQueueLimit] = useState(3);
  const [autoMaxPostAgeDays, setAutoMaxPostAgeDays] = useState(1);

  /** Sources State */
  const [sources, setSources] = useState<any[]>([]);
  const [sourceCategoriesCache, setSourceCategoriesCache] = useState<Record<string, any[]>>({});
  const [sourceTagsCache, setSourceTagsCache] = useState<Record<string, any[]>>({});

  /** Scheduler Timers */
  const [lastRenderTime, setLastRenderTime] = useState<string | null>(null);
  const [nextRenderTime, setNextRenderTime] = useState<string | null>(null);
  const [lastPublishTime, setLastPublishTime] = useState<string | null>(null);
  const [nextPublishTime, setNextPublishTime] = useState<string | null>(null);

  /** Queue & History State */
  const [imagesQueue, setImagesQueue] = useState<any[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [isPosting, setIsPosting] = useState<Record<string, boolean>>({});

  /** AI Branding State */
  const [isGeneratingBranding, setIsGeneratingBranding] = useState(false);
  const [isRegeneratingAvatar, setIsRegeneratingAvatar] = useState(false);
  const [isRegeneratingCover, setIsRegeneratingCover] = useState(false);
  const [isApplyingBranding, setIsApplyingBranding] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [pageCategory, setPageCategory] = useState<string>('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [brandingData, setBrandingData] = useState<{
    avatarUrl?: string;
    avatarLocalPath?: string;
    avatarPrompt?: string;
    coverUrl?: string;
    coverLocalPath?: string;
    coverPrompt?: string;
  } | null>(null);

  /** Filter items for Queue and History tabs */
  const queueItems = useMemo(() => {
    return imagesQueue.filter(item => !item.is_posted && item.status !== 'POSTED');
  }, [imagesQueue]);

  const historyItems = useMemo(() => {
    return imagesQueue.filter(item => item.is_posted || item.status === 'POSTED');
  }, [imagesQueue]);

  /** Initial Fetch */
  useEffect(() => {
    ztteam_fetchSites();
    ztteam_fetchSettings();
    api.get('facebook/pages').then(res => {
      const allTags = new Set<string>();
      if (res.data && Array.isArray(res.data)) {
        res.data.forEach((p: any) => {
          if (p.tags && Array.isArray(p.tags)) {
            p.tags.forEach((t: string) => allTags.add(t));
          }
        });
      }
      setAvailableTags(Array.from(allTags));
    }).catch(console.error);

    if (pages.length === 0) {
      ztteam_fetchPagesFromDB();
    }
    ztteam_loadBgmList();
    ztteam_loadTextStoryTemplates();
  }, [id]);

  /** Tải danh sách mẫu Text Story Reel */
  const ztteam_loadTextStoryTemplates = async () => {
    try {
      const res = await api.get('templates?format=video');
      if (Array.isArray(res.data)) {
        const stories = res.data.filter((t: any) => t.content_type === 'text_story');
        setTextStoryTemplates(stories);
      }
    } catch (e) {
      /** Bỏ qua nếu lỗi */
    }
  };

  /** Tải danh sách file nhạc BGM */
  const ztteam_loadBgmList = async () => {
    try {
      const res = await api.get('media/bgm');
      if (res.data?.success && Array.isArray(res.data?.data)) {
        setBgmList(res.data.data);
      }
    } catch (e) {
      /** Bỏ qua nếu lỗi */
    }
  };

  /** Nghe thử / Dừng phát bài hát */
  const ztteam_togglePlayBgm = (url: string, filename: string) => {
    if (currentPlayingBgm === filename && bgmAudio) {
      bgmAudio.pause();
      setCurrentPlayingBgm(null);
      setBgmAudio(null);
      return;
    }

    if (bgmAudio) {
      bgmAudio.pause();
    }

    const audio = new Audio(url);
    audio.play();
    audio.onended = () => {
      setCurrentPlayingBgm(null);
      setBgmAudio(null);
    };
    setBgmAudio(audio);
    setCurrentPlayingBgm(filename);
  };

  /** Tải file âm thanh mới nhanh */
  const ztteam_uploadQuickBgm = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingBgm(true);
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('media/bgm/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.success) {
        ztteam_showToast('Tải bài nhạc mới lên thành công!', 'success');
        await ztteam_loadBgmList();
        if (res.data.data?.filename) {
          setDefaultBgm(res.data.data.filename);
        }
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || 'Lỗi tải file âm thanh', 'error');
    } finally {
      setIsUploadingBgm(false);
      e.target.value = '';
    }
  };

  /** Load Queue on Tab 2 (Hàng Đợi) or Tab 3 (Lịch Sử) */
  useEffect(() => {
    if (activeTab === 2 || activeTab === 3) {
      ztteam_loadQueue();
    }
  }, [activeTab, id]);

  /** SSE Live Updates for Tab 2 & Tab 3 */
  useEffect(() => {
    if (activeTab !== 2 && activeTab !== 3) return;

    const sseImage = new EventSource('/api/image/events');
    sseImage.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        setImagesQueue(prev => {
          const exists = prev.find(r => r.id === payload.id);
          if (exists) {
            return prev.map(r => r.id === payload.id ? { ...r, ...payload } : r);
          }
          return [payload, ...prev];
        });
      } catch (err) { }
    };

    const sseReel = new EventSource('/api/render/events');
    sseReel.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        setReels(prev => {
          const exists = prev.find(r => r.id === payload.id);
          if (exists) {
            return prev.map(r => r.id === payload.id ? { ...r, ...payload } : r);
          }
          return [payload, ...prev];
        });
      } catch (err) { }
    };

    const pollInterval = setInterval(() => {
      if (activeTab === 2) {
        ztteam_loadQueue(true);
      }
    }, 4000);

    return () => {
      sseImage.close();
      sseReel.close();
      clearInterval(pollInterval);
    };
  }, [activeTab]);

  /** Fetch Page Settings */
  const ztteam_fetchSettings = async () => {
    try {
      setIsLoading(true);
      const res = await api.get(`facebook/pages/${id}/settings?_t=${Date.now()}`);
      const data = res.data;
      setPageName(data.name || 'Fanpage Settings');
      setFbPageId(data.fb_page_id || '');
      setPageAvatar(data.avatar || null);
      setIsCheckpointBlocked(Boolean(data.isCheckpointBlocked));
      setTags(data.tags || []);
      setPostFormat(data.post_format || 'image');
      setVideoEngine(data.video_engine || 'hook_image');
      setDefaultReelTemplateId(data.default_reel_template_id || 'random');
      setDefaultBgm(data.default_bgm || '');
      setAutoPublishEnabled(data.auto_publish_enabled !== undefined ? data.auto_publish_enabled : true);
      setAddLinkToCaption(data.add_link_to_caption || false);
      setAddLinkToComment(data.add_link_to_comment || false);
      setLinkMode(data.link_mode || 'delayed_2step');
      setLinkViewThreshold(data.link_view_threshold !== undefined ? data.link_view_threshold : 1000);
      setLinkTargetPosition(data.link_target_position || 'comment');
      setLinkFallbackHours(data.link_fallback_hours !== undefined ? data.link_fallback_hours : 24);
      setLinkFallbackAction(data.link_fallback_action || 'inject');
      setScheduleMode(data.schedule_mode || 'fixed');
      setScheduleFixedTimes(data.schedule_fixed_times || []);
      setScheduleImmediateGap(data.schedule_immediate_gap_minutes || 60);

      setAutoCreateEnabled(data.auto_create_enabled || false);
      setAutoScanInterval(data.auto_scan_interval_hours || 2);
      setAutoScanBatchSize(data.auto_scan_batch_size || 1);
      setAutoQueueLimit(data.auto_queue_limit || 3);
      setAutoMaxPostAgeDays(data.auto_max_post_age_days || 1);

      setLastRenderTime(data.last_render_time || null);
      setNextRenderTime(data.next_render_time || null);
      setLastPublishTime(data.last_publish_time || null);
      setNextPublishTime(data.next_publish_time || null);

      setSources(data.sources || []);
      setPageCategory(data.category || '');

      /** ZTTeam: Nạp dữ liệu nhận diện Avatar & Cover đã lưu trong Database để F5 không bị mất */
      if (data.branding && (data.branding.avatarUrl || data.branding.coverUrl)) {
        setBrandingData(data.branding);
      } else if (data.avatar || data.cover_url) {
        setBrandingData({
          avatarUrl: data.avatar || null,
          coverUrl: data.cover_url || null,
          avatarPrompt: null,
          coverPrompt: null,
        });
      }

      if (data.sources) {
        data.sources.forEach((s: any) => {
          if (s.target_site_id && !sourceCategoriesCache[s.target_site_id]) {
            ztteam_loadCategories(s.target_site_id);
          }
          if (s.target_site_id && !sourceTagsCache[s.target_site_id]) {
            ztteam_loadTags(s.target_site_id);
          }
        });
      }
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi tải cấu hình', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const ztteam_loadCategories = async (siteId: string) => {
    try {
      const cats = await ztteam_fetchCategories(siteId);
      setSourceCategoriesCache(prev => ({ ...prev, [siteId]: cats }));
    } catch (e) {
      console.error(e);
    }
  };

  const ztteam_loadTags = async (siteId: string) => {
    try {
      const tagsData = await ztteam_fetchTags(siteId);
      setSourceTagsCache(prev => ({ ...prev, [siteId]: tagsData }));
    } catch (e) {
      console.error(e);
    }
  };

  /** Fetch Queue Data */
  const ztteam_loadQueue = async (isSilent = false) => {
    try {
      if (!isSilent) setIsLoadingQueue(true);
      const imgRes = await api.get(`image/list?fbPageId=${id}&limit=50&_t=${Date.now()}`);
      setImagesQueue(imgRes.data?.data || []);
    } catch (error: any) {
      if (!isSilent) ztteam_showToast('Lỗi tải danh sách bài viết', 'error');
    } finally {
      if (!isSilent) setIsLoadingQueue(false);
    }
  };

  /** Save Settings */
  const ztteam_handleResolveCheckpoint = async () => {
    try {
      setIsSaving(true);
      setAutoPublishEnabled(true);
      setIsCheckpointBlocked(false);
      await api.put(`facebook/pages/${id}/settings`, {
        tags,
        post_format: postFormat,
        video_engine: videoEngine,
        default_reel_template_id: defaultReelTemplateId || 'random',
        default_bgm: defaultBgm || null,
        auto_publish_enabled: true,
        add_link_to_caption: linkMode === 'immediate' && (linkTargetPosition === 'caption' || linkTargetPosition === 'both'),
        add_link_to_comment: linkMode === 'immediate' && (linkTargetPosition === 'comment' || linkTargetPosition === 'both'),
        link_mode: linkMode,
        link_view_threshold: linkViewThreshold,
        link_target_position: linkTargetPosition,
        link_fallback_hours: linkFallbackHours,
        link_fallback_action: linkFallbackAction,
        schedule_mode: scheduleMode,
        schedule_fixed_times: scheduleFixedTimes,
        schedule_immediate_gap_minutes: scheduleImmediateGap,
        auto_create_enabled: false,
        sources
      });
      ztteam_showToast('Đã gỡ cảnh báo và bật lại tự động đăng thành công!', 'success');
      ztteam_fetchPageSettings();
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi lưu cấu hình', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const ztteam_handleSave = async () => {
    try {
      setIsSaving(true);
      await api.put(`facebook/pages/${id}/settings`, {
        tags,
        post_format: postFormat,
        video_engine: videoEngine,
        default_reel_template_id: defaultReelTemplateId || 'random',
        default_bgm: defaultBgm || null,
        auto_publish_enabled: autoPublishEnabled,
        add_link_to_caption: linkMode === 'immediate' && (linkTargetPosition === 'caption' || linkTargetPosition === 'both'),
        add_link_to_comment: linkMode === 'immediate' && (linkTargetPosition === 'comment' || linkTargetPosition === 'both'),
        link_mode: linkMode,
        link_view_threshold: linkViewThreshold,
        link_target_position: linkTargetPosition,
        link_fallback_hours: linkFallbackHours,
        link_fallback_action: linkFallbackAction,
        schedule_mode: scheduleMode,
        schedule_fixed_times: scheduleFixedTimes,
        schedule_immediate_gap_minutes: scheduleImmediateGap,
        auto_create_enabled: false,
        sources
      });
      ztteam_showToast('Đã lưu cấu hình thành công', 'success');
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi lưu cấu hình', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  /** Tag & Time Handlers */
  const ztteam_addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const ztteam_addTime = () => {
    if (timeInput.trim() && !scheduleFixedTimes.includes(timeInput.trim())) {
      setScheduleFixedTimes([...scheduleFixedTimes, timeInput.trim()]);
      setTimeInput('');
    }
  };

  /** Cross-page fixed time duplicate detection */
  const usedTimes = new Set<string>();
  pages.forEach(p => {
    if (p.id !== id && p.scheduleFixedTimes) {
      p.scheduleFixedTimes.forEach((t: string) => usedTimes.add(t));
    }
  });

  const predefinedSchedules = [
    { label: 'Khung 1 (08h, 16h, 00h)', times: ['08:00', '16:00', '00:00'] },
    { label: 'Khung 2 (09h, 17h, 01h)', times: ['09:00', '17:00', '01:00'] },
    { label: 'Khung 3 (10h, 18h, 02h)', times: ['10:00', '18:00', '02:00'] },
    { label: 'Khung 4 (11h, 19h, 03h)', times: ['11:00', '19:00', '03:00'] },
    { label: 'Khung 5 (06h, 14h, 22h)', times: ['06:00', '14:00', '22:00'] },
    { label: 'Khung 6 (07h, 15h, 23h)', times: ['07:00', '15:00', '23:00'] },
  ];

  const predefined5PostsSchedules = [
    { label: 'Gói Vàng 5 Bài (07h30, 11h30, 15h30, 19h30, 22h30)', times: ['07:30', '11:30', '15:30', '19:30', '22:30'] },
    { label: 'Gói Trải Đều (08h, 12h, 16h, 20h, 23h30)', times: ['08:00', '12:00', '16:00', '20:00', '23:30'] },
    { label: 'Gói Cao Điểm (07h, 11h, 15h, 19h, 23h)', times: ['07:00', '11:00', '15:00', '19:00', '23:00'] },
  ];

  /** Publish Item Immediately */
  const ztteam_publishNow = async (item: any) => {
    const confirmed = await ztteam_showConfirm('Xác nhận đăng bài', `Đăng ngay nội dung "${item.wp_post_title || 'bài viết'}" lên Fanpage?`);
    if (!confirmed) return;
    try {
      setIsPosting(prev => ({ ...prev, [item.id]: true }));
      await api.post(`image/${item.id}/post-to-fb`);
      ztteam_showToast('Đã đăng bài lên Fanpage thành công!', 'success');
      ztteam_loadQueue(true);
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || error.message || 'Lỗi đăng bài lên Fanpage', 'error');
    } finally {
      setIsPosting(prev => ({ ...prev, [item.id]: false }));
    }
  };

  /** Retry Item / Làm mới khung giờ xuất bản */
  const ztteam_retryQueueItem = async (item: any) => {
    try {
      const res = await api.post(`image/retry/${item.id}`);
      ztteam_showToast(res.data?.message || 'Đã làm mới lại khung giờ xuất bản (giữ nguyên ảnh)', 'success');
      ztteam_loadQueue();
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi thử lại', 'error');
    }
  };

  /** Delete Item */
  const ztteam_deleteQueueItem = async (item: any) => {
    const confirmed = await ztteam_showConfirm('Xác nhận xóa', 'Xóa mục này khỏi hàng đợi? Hành động không thể hoàn tác.');
    if (!confirmed) return;
    try {
      await api.delete(`image/${item.id}`);
      ztteam_showToast('Đã xóa thành công', 'success');
      ztteam_loadQueue();
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi xóa', 'error');
    }
  };

  /** Lấy ảnh gốc từ website làm chuẩn để tạo Video Reel */
  const ztteam_useOriginalImage = async (item: any) => {
    try {
      const res = await api.post(`image/${item.id}/use-original-image`);
      ztteam_showToast(res.data?.message || 'Đã lấy ảnh gốc thành công và đưa vào hàng đợi tạo Video Reel', 'success');
      ztteam_loadQueue(true);
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi lấy ảnh gốc', 'error');
    }
  };

  /** Đưa bài viết vào hàng đợi tạo Video Reel qua Muse Worker */
  const ztteam_queueVideoReel = async (item: any) => {
    try {
      const res = await api.post(`image/${item.id}/queue-video`);
      ztteam_showToast(res.data?.message || 'Đã đưa vào hàng đợi tạo Video Reel cho Worker', 'success');
      ztteam_loadQueue(true);
    } catch (error: any) {
      ztteam_showToast(error.response?.data?.message || 'Lỗi đưa vào hàng đợi tạo Reel', 'error');
    }
  };

  /** Status Badge Helper */
  const ztteam_getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; border: string; label: string; pulse?: boolean }> = {
      QUEUED: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/20', label: 'Đang chờ' },
      RENDERING: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/20', label: 'Đang xử lý AI', pulse: true },
      PROCESSING: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/20', label: 'Đang tạo ảnh', pulse: true },
      COMPLETED: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'Sẵn sàng đăng' },
      FAILED: { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/20', label: 'Thất bại' },
      POSTED: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/20', label: 'Đã xuất bản' },
    };
    const s = map[status] || { bg: 'bg-fb-surface-hover', text: 'text-fb-text-muted', border: 'border-white/5', label: status };
    return (
      <span className={`${s.bg} ${s.text} ${s.border} border text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0 whitespace-nowrap shadow-xs`}>
        {s.pulse && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0"></span>}
        {s.label}
      </span>
    );
  };

  const ztteam_formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  /** ZTTeam: Lưu Hạng mục Fanpage (Category) */
  const ztteam_handleSaveCategory = async (newCat?: string) => {
    if (!id) return;
    const catToSave = newCat !== undefined ? newCat : pageCategory;
    setIsSavingCategory(true);
    try {
      const res = await api.patch(`/facebook/pages/${id}/category`, { category: catToSave });
      ztteam_showToast(res.data?.message || 'Đã lưu Hạng mục Fanpage!', 'success');
      setPageCategory(catToSave);
      ztteam_fetchPagesFromDB();
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi khi lưu Hạng mục', 'error');
    } finally {
      setIsSavingCategory(false);
    }
  };

  /** ZTTeam: Upload ảnh Avatar hoặc Cover thủ công từ máy tính */
  const ztteam_handleUploadBranding = async (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'cover') => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    if (type === 'avatar') setIsUploadingAvatar(true);
    else setIsUploadingCover(true);

    try {
      const res = await api.post(`/facebook/pages/${id}/branding/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success) {
        ztteam_showToast(res.data.message || 'Tải ảnh lên thành công!', 'success');
        setBrandingData((prev: any) => ({
          ...prev,
          [type === 'avatar' ? 'avatarUrl' : 'coverUrl']: res.data.imageUrl,
          [type === 'avatar' ? 'avatarLocalPath' : 'coverLocalPath']: res.data.localPath,
          [type === 'avatar' ? 'avatarPrompt' : 'coverPrompt']: `Ảnh tải lên thủ công: ${file.name}`,
        }));
        if (type === 'avatar') {
          setPageAvatar(res.data.imageUrl);
        }
        ztteam_fetchPagesFromDB();
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi khi tải ảnh lên', 'error');
    } finally {
      if (type === 'avatar') setIsUploadingAvatar(false);
      else setIsUploadingCover(false);
      e.target.value = '';
    }
  };

  /** ZTTeam: Tạo bộ nhận diện AI cho Fanpage (Avatar 1:1 + Cover 16:9) */
  const ztteam_handleGenerateBranding = async () => {
    if (!id) return;
    setIsGeneratingBranding(true);
    try {
      ztteam_showToast('Đang phân tích chủ đề và sinh ảnh nhận diện qua Google Gemini AI, vui lòng đợi 15-30 giây...', 'info');
      const res = await api.post(`/facebook/pages/${id}/branding/generate`);
      if (res.data?.success) {
        setBrandingData(res.data);
        ztteam_showToast('Đã tạo thành công bộ nhận diện Avatar và Ảnh bìa qua Gemini! Hãy kiểm tra bản xem trước.', 'success');
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi khi tạo bộ nhận diện AI', 'error');
    } finally {
      setIsGeneratingBranding(false);
    }
  };

  /** ZTTeam: Tạo lại riêng Avatar hoặc Cover */
  const ztteam_handleRegenerateItem = async (type: 'avatar' | 'cover') => {
    if (!id) return;
    if (type === 'avatar') setIsRegeneratingAvatar(true);
    else setIsRegeneratingCover(true);

    try {
      ztteam_showToast(`Đang vẽ lại ${type === 'avatar' ? 'Avatar (1:1)' : 'Ảnh bìa (16:9)'} qua Google Gemini AI...`, 'info');
      const res = await api.post(`/facebook/pages/${id}/branding/regenerate-item`, { type });
      if (res.data?.success) {
        setBrandingData((prev: any) => ({
          ...prev,
          ...(type === 'avatar' ? {
            avatarUrl: res.data.imageUrl,
            avatarLocalPath: res.data.localPath,
            avatarPrompt: res.data.prompt,
          } : {
            coverUrl: res.data.imageUrl,
            coverLocalPath: res.data.localPath,
            coverPrompt: res.data.prompt,
          })
        }));
        ztteam_showToast(`Đã vẽ lại ${type === 'avatar' ? 'Avatar' : 'Ảnh bìa'} thành công qua Gemini!`, 'success');
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi khi vẽ lại ảnh AI', 'error');
    } finally {
      if (type === 'avatar') setIsRegeneratingAvatar(false);
      else setIsRegeneratingCover(false);
    }
  };

  /** ZTTeam: Gắn Avatar và Cover lên Facebook qua Graph API */
  const ztteam_handleApplyBranding = async () => {
    if (!id || !brandingData) return;
    const confirmed = await ztteam_showConfirm(
      'Xác nhận gắn bộ nhận diện lên Facebook',
      `Hệ thống sẽ cập nhật trực tiếp Avatar và Ảnh bìa mới lên Fanpage "${pageName}". Quá trình này sẽ sử dụng cờ ẩn để không làm spam bảng tin. Bạn có chắc chắn muốn áp dụng?`
    );
    if (!confirmed) return;

    setIsApplyingBranding(true);
    try {
      const res = await api.post(`/facebook/pages/${id}/branding/apply`, {
        avatarUrl: brandingData.avatarUrl,
        avatarLocalPath: brandingData.avatarLocalPath,
        coverUrl: brandingData.coverUrl,
        coverLocalPath: brandingData.coverLocalPath,
      });
      if (res.data?.success) {
        ztteam_showToast(res.data.message || 'Đã cập nhật Avatar & Ảnh bìa lên Fanpage Facebook thành công!', 'success');
        if (res.data.newAvatarUrl) {
          setPageAvatar(res.data.newAvatarUrl);
        }
        setBrandingData((prev: any) => ({
          ...prev,
          avatarUrl: res.data.newAvatarUrl || prev?.avatarUrl,
          coverUrl: res.data.newCoverUrl || prev?.coverUrl,
        }));
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi khi gắn lên Facebook', 'error');
    } finally {
      setIsApplyingBranding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center flex flex-col items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-fb-blue mb-3">sync</span>
        <span className="text-sm font-bold text-fb-text-muted">Đang tải cấu hình Fanpage...</span>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/** Top Header Banner */}
      <div className="bg-fb-surface rounded-2xl shadow-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-fb-surface-hover/50">
        <div className="flex items-center gap-4">
          {pageAvatar ? (
            <img src={pageAvatar} alt={pageName} className="w-14 h-14 rounded-full object-cover shadow-lg shadow-blue-500/20 shrink-0 border-2 border-fb-blue" />
          ) : (
            <div className="w-14 h-14 bg-gradient-to-br from-fb-blue to-cyan-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-black text-2xl shrink-0">
              {pageName ? pageName.charAt(0) : 'F'}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => navigate('/facebook')} className="text-fb-text-muted hover:text-fb-blue flex items-center gap-1 text-xs font-bold transition-colors">
                <span className="material-symbols-outlined text-[14px]">arrow_back</span> Quay lại danh sách
              </button>
            </div>
            <h3 className="text-2xl font-black text-fb-text tracking-tight flex items-center gap-3 flex-wrap">
              <span>{pageName}</span>
              {isCheckpointBlocked && (
                <div className="relative group/cpBadge shrink-0 cursor-help">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm animate-pulse">
                    <span className="material-symbols-outlined text-sm text-amber-400">shield_lock</span>
                    <span>Cần xác minh danh tính</span>
                  </span>

                  {/** Tooltip giải thích chi tiết khi hover */}
                  <div className="absolute left-0 top-full mt-2 w-80 p-3.5 bg-[#0b1329] rounded-xl border border-amber-500/30 shadow-2xl z-50 invisible group-hover/cpBadge:visible opacity-0 group-hover/cpBadge:opacity-100 transition-all pointer-events-none text-left">
                    <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs mb-1.5">
                      <span className="material-symbols-outlined text-sm">warning</span>
                      <span>Facebook Yêu Cầu Xác Minh Danh Tính</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Facebook tạm khóa quyền đăng bài của Trang này (Mã 368 / Subcode 4854002) do nghi ngờ spam hoặc thao tác nhanh. Hệ thống đã tự động dừng xuất bản để bảo vệ BM và các Page khác.
                    </p>
                    <div className="mt-2.5 pt-2 border-t border-white/10 text-[10px] text-emerald-400 font-medium space-y-1">
                      <div className="font-bold text-slate-200">👉 Hướng dẫn mở khóa:</div>
                      <div>1. Mở ứng dụng Facebook trên điện thoại của Admin</div>
                      <div>2. Chuyển sang Trang <b>{pageName}</b></div>
                      <div>3. Đăng thử 1 bài viết bất kỳ (ví dụ: "Test") và làm theo thông báo xác nhận danh tính trên điện thoại</div>
                      <div>4. Sau khi đăng được, bật lại nút "Tự động đăng" bên dưới và bấm Lưu cài đặt</div>
                    </div>
                  </div>
                </div>
              )}
              {fbPageId && (
                <a href={`https://facebook.com/${fbPageId}`} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1 bg-fb-blue/10 text-fb-blue border border-fb-blue/20 rounded-full hover:bg-fb-blue/20 flex items-center gap-1 font-semibold transition-colors">
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span> Xem Fanpage
                </a>
              )}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-xs text-fb-text-muted">ID: {fbPageId}</span>
              {pages.find(p => p.id === id || p.internalId === id)?.businessName && (
                <span 
                  onClick={() => navigate('/facebook/business-hub')}
                  className="cursor-pointer px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1 hover:bg-blue-500/25 transition-colors"
                  title="Bấm để xem chi tiết Doanh Nghiệp trong Hub"
                >
                  <span className="material-symbols-outlined text-xs">domain</span>
                  <span>Thuộc BM: {pages.find(p => p.id === id || p.internalId === id)?.businessName}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 self-start md:self-auto w-full md:w-auto">
          {/** Tags */}
          <div className="flex items-center gap-2 bg-fb-surface-hover/30 px-3 py-1.5 rounded-xl border border-fb-surface-hover/50 w-full sm:w-auto">
            <span className="material-symbols-outlined text-[16px] text-fb-text-muted">label</span>
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ztteam_addTag()}
              placeholder="Thêm tag..."
              list="available-tags"
              className="w-24 bg-transparent border-none focus:ring-0 text-xs outline-none text-fb-text"
            />
            <datalist id="available-tags">{availableTags.map(t => <option key={t} value={t} />)}</datalist>
            <div className="flex flex-wrap gap-1 ml-2">
              {tags.map(t => (
                <span key={t} className="px-2 py-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded-full text-[10px] font-bold flex items-center gap-1">
                  {t}
                  <span onClick={() => setTags(tags.filter(x => x !== t))} className="material-symbols-outlined text-[12px] cursor-pointer hover:text-rose-400">close</span>
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={ztteam_handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 bg-gradient-to-r from-fb-blue to-cyan-500 hover:opacity-90 text-white font-bold rounded-full shadow-lg shadow-blue-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm whitespace-nowrap w-full sm:w-auto"
          >
            {isSaving ? <span className="material-symbols-outlined animate-spin text-[20px]">sync</span> : <span className="material-symbols-outlined text-[20px]">save</span>}
            Lưu Thay Đổi
          </button>
        </div>
      </div>

      {/** Clean 2-Tab Navigation Bar */}
      <div className="flex border-b border-fb-surface-hover/60 bg-fb-surface px-4 pt-2 rounded-2xl shadow-sm gap-2">
        <button
          onClick={() => setActiveTab(1)}
          className={`px-6 py-3.5 font-black text-sm flex items-center gap-2.5 border-b-2 rounded-t-xl transition-all ${
            activeTab === 1
              ? 'border-fb-blue text-fb-blue bg-fb-blue/5 shadow-xs'
              : 'border-transparent text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover/40'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">tune</span>
          1. Cấu Hình Lịch & Đăng Bài
        </button>

        <button
          onClick={() => setActiveTab(2)}
          className={`px-6 py-3.5 font-black text-sm flex items-center gap-2.5 border-b-2 rounded-t-xl transition-all cursor-pointer ${
            activeTab === 2
              ? 'border-amber-400 text-amber-400 bg-amber-400/5 shadow-xs'
              : 'border-transparent text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover/40'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">pending_actions</span>
          2. Hàng Đợi Xuất Bản
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            activeTab === 2 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-fb-surface-hover text-fb-text border-white/5'
          }`}>
            {queueItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab(3)}
          className={`px-6 py-3.5 font-black text-sm flex items-center gap-2.5 border-b-2 rounded-t-xl transition-all cursor-pointer ${
            activeTab === 3
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 shadow-xs'
              : 'border-transparent text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover/40'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">history</span>
          3. Lịch Sử Đã Đăng
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            activeTab === 3 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-fb-surface-hover text-fb-text border-white/5'
          }`}>
            {historyItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab(4)}
          className={`px-6 py-3.5 font-black text-sm flex items-center gap-2.5 border-b-2 rounded-t-xl transition-all cursor-pointer ${
            activeTab === 4
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5 shadow-xs'
              : 'border-transparent text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover/40'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">palette</span>
          4. Bộ Nhận Diện AI
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            activeTab === 4 ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'bg-fb-surface-hover text-fb-text border-white/5'
          }`}>
            SangTao 2K
          </span>
        </button>
      </div>

      {/** TAB 1: CẤU HÌNH LỊCH & ĐĂNG BÀI */}
      {activeTab === 1 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

            {/** Card 1: Kiểu bài & Tùy chọn */}
            <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-fb-surface-hover/50">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-fb-blue text-[22px]">category</span>
                  <div>
                    <h4 className="text-base font-black text-fb-text">Định Dạng & Tùy Chọn Xuất Bản</h4>
                    <p className="text-[11px] text-fb-text-muted mt-0.5">Thiết lập cách bài viết được hiển thị và xuất bản lên Fanpage</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-fb-surface-hover/40 px-3 py-1.5 rounded-xl border border-fb-surface-hover/50 shrink-0">
                  <span className="text-xs font-bold text-fb-text">Tự động đăng:</span>
                  <button
                    onClick={() => setAutoPublishEnabled(!autoPublishEnabled)}
                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                      autoPublishEnabled ? 'bg-emerald-500' : 'bg-black/30 shadow-inner border border-white/5'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${autoPublishEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              {isCheckpointBlocked && (
                <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/30 text-xs text-amber-200 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-amber-400 text-sm">
                    <span className="material-symbols-outlined text-[20px]">shield_lock</span>
                    <span>Fanpage đang có cảnh báo xác minh danh tính (Subcode 4854002)</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Facebook từng tạm khóa do yêu cầu xác nhận danh tính trên điện thoại. Nếu bạn đã hoàn tất xác nhận trên điện thoại (hoặc Page đã đăng bài bình thường), hãy bấm nút bên dưới để gỡ ngay thông báo cảnh báo này và bật lại chế độ tự động đăng.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={ztteam_handleResolveCheckpoint}
                      disabled={isSaving}
                      className="px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[16px]">verified</span>
                      <span>Tôi đã xác minh xong — Gỡ cảnh báo &amp; Bật tự động đăng</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-fb-surface-hover/20 p-3 rounded-xl border border-fb-surface-hover/40 text-[11px] text-fb-text-muted">
                <strong className="text-fb-text font-bold">Chế độ tự động đăng: </strong>
                {autoPublishEnabled 
                  ? 'BẬT — Các bài viết trong hàng đợi sẽ được tự động xuất bản lên Facebook đúng theo lịch trình ở cột bên phải.'
                  : 'TẮT — Bài viết hoàn thành sẽ ở trạng thái Sẵn sàng trong hàng đợi để bạn kiểm tra và duyệt đăng thủ công.'
                }
              </div>

              <div>
                <label className="block text-xs font-bold text-fb-text-muted uppercase mb-2">Kiểu bài đăng chính trên Fanpage</label>
                <CustomDropdown
                  value={postFormat}
                  onChange={setPostFormat}
                  options={[
                    { value: 'image', label: 'Đăng Ảnh 2K (Bài viết Facebook kèm ảnh AI 2K)' },
                    { value: 'reel', label: 'Đăng Video (Reels Facebook)' },
                    { value: 'mixed', label: 'Xen kẽ (Tự động luân phiên Ảnh 2K & Reel)' }
                  ]}
                />
                <p className="text-[11px] text-fb-text-muted mt-2">
                  {postFormat === 'image' && 'Chuẩn định dạng: Tiêu đề VIẾT HOA + Hook Part 1 kịch tính + Ảnh AI 2K tỉ lệ 4:5 chân thực, sắc nét.'}
                  {postFormat === 'reel' && 'Tạo video ngắn Reel 9:16 sắc nét kèm âm nhạc và đăng lên Reels tab.'}
                  {postFormat === 'mixed' && 'Tự động luân phiên giữa bài viết ảnh 2K và video Reel theo lịch đăng.'}
                </p>
              </div>

              {/** Tùy chọn Công nghệ Video Reel & Nhạc nền BGM (Hiển thị khi đăng Reel hoặc Xen kẽ) */}
              {(postFormat === 'reel' || postFormat === 'mixed') && (
                <div className="bg-fb-surface-hover/30 p-4 rounded-2xl border border-amber-500/20 space-y-4 animate-in fade-in duration-200">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px]">movie_filter</span>
                        Công nghệ tạo Video Reel
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate('/reel-templates')}
                          className="text-[11px] font-bold text-fb-blue hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>Kho Giao Diện ({textStoryTemplates.length} mẫu)</span>
                          <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                        </button>
                      </div>
                    </div>
                    <CustomDropdown
                      value={
                        videoEngine === 'text_story'
                          ? (defaultReelTemplateId && defaultReelTemplateId !== 'random' ? `text_story:${defaultReelTemplateId}` : 'text_story:random')
                          : videoEngine
                      }
                      onChange={(val: string) => {
                        if (val.startsWith('text_story:')) {
                          setVideoEngine('text_story');
                          const tplId = val.replace('text_story:', '');
                          setDefaultReelTemplateId(tplId);
                        } else if (val === 'hook_image') {
                          setVideoEngine('hook_image');
                          setDefaultReelTemplateId('random');
                        } else if (val === 'muse') {
                          setVideoEngine('muse');
                          setDefaultReelTemplateId('random');
                        }
                      }}
                      options={[
                        {
                          value: 'text_story:random',
                          label: '🎲 Tự Động Chọn Mẫu & Khóa Cứng (Tự phân bổ mẫu riêng cho Page và khóa cố định)'
                        },
                        ...textStoryTemplates.map((t: any) => ({
                          value: `text_story:${t.id}`,
                          label: `🔒 Text Story: ${t.name}`
                        })),
                        {
                          value: 'hook_image',
                          label: '🖼️ Tạo từ Ảnh Hook & Âm Nhạc (Sắc nét 1080x1920 10s - Mặc định)'
                        },
                        {
                          value: 'muse',
                          label: '🤖 Tạo bằng Motion AI (Muse Motion Reel)'
                        }
                      ]}
                    />
                    <p className="text-[11px] text-fb-text-muted mt-1.5 leading-relaxed">
                      {videoEngine === 'text_story' && (defaultReelTemplateId === 'random' || !defaultReelTemplateId) && (
                        <span className="text-emerald-400 font-medium flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">auto_awesome</span>
                          <span><b>Tự động chọn & Khóa cứng:</b> Hệ thống sẽ tự động gán một mẫu Text Story chưa dùng cho Fanpage này và <b>khóa cứng mẫu đó vĩnh viễn</b> cho mọi video cho đến khi bạn tự chọn lại.</span>
                        </span>
                      )}
                      {videoEngine === 'text_story' && defaultReelTemplateId && defaultReelTemplateId !== 'random' && (
                        <span className="text-cyan-400 font-medium">
                          🔒 <b>Đang khóa cứng mẫu:</b> Fanpage này đang sử dụng cố định mẫu giao diện này cho tất cả video, đảm bảo đồng bộ nhận diện thương hiệu.
                        </span>
                      )}
                      {videoEngine === 'hook_image' && (
                        <span>Tự động sử dụng ảnh 2K kết hợp kịch bản Hook 3 đoạn kịch tính do AI tạo bám sát bài viết gốc, font Montserrat và hòa âm nhạc nền 10s cực nét.</span>
                      )}
                      {videoEngine === 'muse' && (
                        <span>Đưa bài viết vào hàng đợi để Worker ngoài xử lý chuyển động bằng Muse Motion AI.</span>
                      )}
                    </p>
                  </div>

                  {/** Nhạc nền Reel (BGM) */}
                  <div className="pt-2 border-t border-fb-surface-hover/50">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-fb-text uppercase tracking-wide flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-cyan-400">library_music</span>
                        Nhạc Nền Video Reel (BGM)
                      </label>
                      <label className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">{isUploadingBgm ? 'sync' : 'upload_file'}</span>
                        <span>{isUploadingBgm ? 'Đang tải...' : '+ Tải nhạc mới'}</span>
                        <input
                          type="file"
                          accept="audio/mp3,audio/wav,audio/m4a,audio/aac"
                          className="hidden"
                          onChange={ztteam_uploadQuickBgm}
                          disabled={isUploadingBgm}
                        />
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <CustomDropdown
                          value={defaultBgm}
                          onChange={setDefaultBgm}
                          options={[
                            { value: '', label: '🎵 Ngẫu nhiên từ Thư Viện Âm Thanh (Khuyên dùng)' },
                            ...bgmList.map(b => ({
                              value: b.filename,
                              label: `🎵 ${b.name} (${b.size_formatted})`
                            }))
                          ]}
                        />
                      </div>

                      {defaultBgm && (
                        <button
                          type="button"
                          onClick={() => {
                            const found = bgmList.find(b => b.filename === defaultBgm);
                            if (found) ztteam_togglePlayBgm(found.url, found.filename);
                          }}
                          className={`p-2.5 rounded-xl border transition-all shrink-0 flex items-center justify-center ${
                            currentPlayingBgm === defaultBgm
                              ? 'bg-amber-400 text-black border-amber-400 shadow-md shadow-amber-400/20'
                              : 'bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text border-white/5'
                          }`}
                          title={currentPlayingBgm === defaultBgm ? 'Dừng nghe thử' : 'Nghe thử bản nhạc này'}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {currentPlayingBgm === defaultBgm ? 'pause' : 'play_arrow'}
                          </span>
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-fb-text-muted mt-1.5">
                      Bản nhạc được chọn sẽ tự động phối âm vào Video Hook 10s với hiệu ứng fade-in mở đầu và fade-out kết thúc chuẩn điện ảnh.
                    </p>
                  </div>
                </div>
              )}

              {/** Cơ chế điều hướng Link & Tương tác thông minh */}
              <div className="pt-2">
                <div className="bg-fb-surface-hover/30 p-4 rounded-2xl border border-fb-blue/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-cyan-400 text-[18px]">alt_route</span>
                      <span className="text-xs font-bold text-fb-text uppercase tracking-wider">Cơ chế điều hướng Link Website</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Tự động hóa
                    </span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-1">Phương thức điều hướng</label>
                    <CustomDropdown
                      value={linkMode}
                      onChange={v => setLinkMode(v)}
                      options={[
                        {
                          value: 'view_threshold',
                          label: '🎯 Gắn Link theo Lượt xem Video (Nuôi View -> Đạt mốc mới tự gắn link - Khuyên dùng)'
                        },
                        {
                          value: 'none',
                          label: '🚫 Không Thêm Link (Video & Bài viết hoàn toàn sạch 100%, không chèn link)'
                        },
                        {
                          value: 'delayed_2step',
                          label: '⚡ Tương tác thông minh 2 bước (Mồi YES sau 60p -> Reply Link sau 15p)'
                        },
                        {
                          value: 'immediate',
                          label: '🚀 Gắn Link ngay khi xuất bản (Cổ điển)'
                        }
                      ]}
                    />
                  </div>

                  {/** Tùy chọn cho chế độ Không thêm link */}
                  {linkMode === 'none' && (
                    <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-[11px] text-emerald-200/90 leading-relaxed flex items-start gap-2.5 animate-in fade-in duration-150">
                      <span className="material-symbols-outlined text-emerald-400 text-[18px] mt-0.5 shrink-0">verified_user</span>
                      <div>
                        <strong className="text-emerald-300 block mb-0.5 font-bold">Chế độ không thêm link (100% Clean Video):</strong>
                        <span>Hệ thống sẽ <b>hoàn toàn không chèn bất kỳ đường link nào</b> vào Mô tả (Caption) hay Bình luận (Comment). Bài viết sẽ được xuất bản thuần túy như nhà sáng tạo nội dung tự nhiên để tối ưu hóa phân phối Reach và tăng trưởng lượt theo dõi.</span>
                      </div>
                    </div>
                  )}

                  {/** Tùy chọn cho chế độ View Threshold */}
                  {linkMode === 'view_threshold' && (
                    <div className="space-y-3 pt-2 border-t border-white/5 animate-in fade-in duration-150">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-[10px] font-bold text-fb-text-muted uppercase">
                            Ngưỡng lượt xem kích hoạt (Views Threshold)
                          </label>
                          <span className="text-[11px] text-cyan-400 font-black">
                            {Number(linkViewThreshold).toLocaleString()} views
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="100"
                            step="100"
                            value={linkViewThreshold}
                            onChange={e => setLinkViewThreshold(Math.max(100, parseInt(e.target.value, 10) || 100))}
                            className="w-full bg-fb-surface border border-fb-surface-hover/80 rounded-lg px-3 py-1.5 text-xs text-fb-text font-bold focus:border-fb-blue focus:outline-none"
                            placeholder="Nhập số view..."
                          />
                        </div>
                        {/** Quick Select Badges */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {[500, 1000, 2000, 5000, 10000].map(v => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setLinkViewThreshold(v)}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${
                                linkViewThreshold === v
                                  ? 'bg-fb-blue text-white border-fb-blue shadow-xs'
                                  : 'bg-black/20 hover:bg-black/30 text-fb-text-muted border-white/5'
                              }`}
                            >
                              {v.toLocaleString()} views
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-1">
                            Vị trí gắn Link
                          </label>
                          <CustomDropdown
                            value={linkTargetPosition}
                            onChange={v => setLinkTargetPosition(v)}
                            options={[
                              { value: 'comment', label: '💬 Tự động gắn link vào Bình luận (Comment - An toàn nhất)' },
                              { value: 'caption', label: '📝 Tự động sửa thêm link vào Mô tả video (Caption)' },
                              { value: 'both', label: '🔥 Cả Bình luận & Mô tả video' }
                            ]}
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-1">
                            Thời gian Fallback (Dự phòng)
                          </label>
                          <CustomDropdown
                            value={linkFallbackHours}
                            onChange={v => setLinkFallbackHours(Number(v))}
                            options={[
                              { value: 12, label: 'Sau 12 giờ nếu chưa đủ view' },
                              { value: 24, label: 'Sau 24 giờ nếu chưa đủ view (Chuẩn)' },
                              { value: 48, label: 'Sau 48 giờ nếu chưa đủ view' },
                              { value: 0, label: 'Không giới hạn (Chỉ gắn khi đủ view)' }
                            ]}
                          />
                        </div>
                      </div>

                      {linkFallbackHours > 0 && (
                        <div>
                          <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-1">
                            Hành động khi hết thời gian Fallback
                          </label>
                          <CustomDropdown
                            value={linkFallbackAction}
                            onChange={v => setLinkFallbackAction(v)}
                            options={[
                              { value: 'inject', label: '⚡ Tự động gắn link (Đảm bảo bài luôn có link điều hướng)' },
                              { value: 'skip', label: '🛡️ Bỏ qua, không gắn link (Giữ video sạch 100%)' }
                            ]}
                          />
                        </div>
                      )}

                      <div className="bg-black/20 p-2.5 rounded-xl border border-white/5 text-[11px] text-fb-text-muted leading-relaxed flex items-start gap-2">
                        <span className="material-symbols-outlined text-cyan-400 text-[16px] mt-0.5 shrink-0">insights</span>
                        <div>
                          <strong className="text-fb-text block">Chiến lược tối ưu Reach của Facebook:</strong>
                          <span>Khi vừa đăng, video hoàn toàn sạch không có link để thuật toán Meta thoải mái cắn đề xuất. Khi view chạm mốc <b>{Number(linkViewThreshold).toLocaleString()}</b>, hệ thống sẽ tự động gắn link vào <b>{linkTargetPosition === 'comment' ? 'Bình luận' : linkTargetPosition === 'caption' ? 'Mô tả video' : 'Bình luận & Mô tả'}</b>!</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/** Tùy chọn cho chế độ 2 bước */}
                  {linkMode === 'delayed_2step' && (
                    <div className="space-y-2 text-[11px] text-fb-text-muted leading-relaxed animate-in fade-in duration-150">
                      <div className="flex items-start gap-2 bg-black/20 p-2.5 rounded-xl border border-white/5">
                        <span className="material-symbols-outlined text-cyan-400 text-[16px] mt-0.5 shrink-0">check_circle</span>
                        <div>
                          <strong className="text-fb-text block">Caption sạch — Tránh bị Facebook bóp tương tác:</strong>
                          <span>Không chèn link trực tiếp vào Caption. Hệ thống tự động gắn câu kết chuẩn: <code>...FULL STORY IN THE COMMENT 👇👇👇</code></span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 bg-black/20 p-2.5 rounded-xl border border-white/5">
                        <span className="material-symbols-outlined text-emerald-400 text-[16px] mt-0.5 shrink-0">mark_chat_read</span>
                        <div>
                          <strong className="text-fb-text block">Quy trình Bình luận 2 bước tối ưu Reach:</strong>
                          <span><strong>Sau 60 phút:</strong> Tự động thả bình luận mồi câu "YES" kích hoạt thuật toán; <strong>Sau 15 phút tiếp theo:</strong> Tự động reply vào bình luận mồi kèm Part 2 và link website WordPress.</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/** Tùy chọn cho chế độ Immediate */}
                  {linkMode === 'immediate' && (
                    <div className="space-y-3 pt-2 border-t border-white/5 animate-in fade-in duration-150">
                      <div>
                        <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-1">
                          Vị trí gắn Link ngay khi đăng
                        </label>
                        <CustomDropdown
                          value={linkTargetPosition}
                          onChange={v => setLinkTargetPosition(v)}
                          options={[
                            { value: 'comment', label: '💬 Bình luận (Đăng comment kèm link ngay sau khi video lên)' },
                            { value: 'caption', label: '📝 Chèn trực tiếp vào Caption mô tả video' },
                            { value: 'both', label: '🔥 Cả Bình luận & Caption' }
                          ]}
                        />
                      </div>
                      <div className="bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 text-[11px] text-amber-200/90 leading-relaxed flex items-start gap-2">
                        <span className="material-symbols-outlined text-amber-400 text-[16px] mt-0.5 shrink-0">warning</span>
                        <span><b>Lưu ý:</b> Gắn link ngay khi xuất bản có thể khiến Facebook hạn chế mức độ phân phối ban đầu của Video Reel. Nếu muốn tối đa hóa lượt xem, hãy chọn chế độ <b>Gắn link theo Lượt xem</b> hoặc <b>Tương tác 2 bước</b>.</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/** Card 2: Nguồn Website WordPress Liên Kết */}
            <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-fb-surface-hover/50">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500 text-[22px]">language</span>
                  <div>
                    <h4 className="text-base font-black text-fb-text">Nguồn Website WordPress & Chuyên Mục</h4>
                    <p className="text-[11px] text-fb-text-muted mt-0.5">Liên kết Fanpage với Website WP và Chuyên mục bài viết tương ứng</p>
                  </div>
                </div>
                <button
                  onClick={() => setSources([...sources, { target_site_id: '', target_category_id: '', target_tags: '', is_active: true }])}
                  className="px-3 py-1.5 bg-fb-blue/15 text-fb-blue hover:bg-fb-blue/25 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shrink-0"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span> Thêm nguồn
                </button>
              </div>

              <div className="bg-fb-surface-hover/20 p-3 rounded-xl border border-fb-surface-hover/40 text-[11px] text-fb-text-muted leading-relaxed">
                <span className="material-symbols-outlined text-[14px] text-amber-400 align-middle mr-1">info</span>
                Khi bot cào bài viết mới từ menu <strong>Website (/crawl-sources)</strong> vào Website và Chuyên mục này, bài viết kèm ảnh AI 2K sẽ tự động đưa vào hàng đợi của Fanpage này để xuất bản. Một Website có thể dùng cho nhiều Fanpage khác nhau theo từng chuyên mục riêng.
              </div>

              <div className="space-y-3">
                {sources.map((src, index) => (
                  <div key={index} className="bg-fb-surface-hover/40 p-4 rounded-xl border border-fb-surface-hover/50 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                      <div className="flex-1 w-full sm:max-w-xs">
                        <CustomDropdown
                          value={src.target_site_id}
                          onChange={v => {
                            const newSites = [...sources];
                            newSites[index].target_site_id = v;
                            newSites[index].target_category_id = '';
                            newSites[index].target_tags = '';
                            setSources(newSites);
                            if (v && !sourceCategoriesCache[v]) ztteam_loadCategories(v);
                            if (v && !sourceTagsCache[v]) ztteam_loadTags(v);
                          }}
                          options={[{ value: '', label: '-- Chọn Website WP --' }, ...sites.map(s => ({ value: s.id, label: s.wp_url }))]}
                        />
                      </div>
                      <div className="flex items-center gap-3 ml-auto shrink-0">
                        <button
                          onClick={() => {
                            const newSites = [...sources];
                            newSites[index].is_active = !newSites[index].is_active;
                            setSources(newSites);
                          }}
                          className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                            src.is_active ? 'bg-emerald-500' : 'bg-black/30 shadow-inner border border-white/5'
                          }`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${src.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                        <button
                          onClick={() => setSources(sources.filter((_, i) => i !== index))}
                          className="w-8 h-8 flex items-center justify-center rounded-full text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-1">Chuyên mục WordPress liên kết</label>
                        <CustomDropdown
                          value={src.target_category_id ? String(src.target_category_id) : ''}
                          onChange={v => {
                            const newSites = [...sources];
                            newSites[index].target_category_id = v ? String(v) : '';
                            setSources(newSites);
                          }}
                          options={[{ value: '', label: 'Tất cả chuyên mục (Nhận toàn bộ bài)' }, ...(sourceCategoriesCache[src.target_site_id] || []).map(c => ({ value: String(c.id), label: c.name }))]}
                          disabled={!src.target_site_id}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-1">Thẻ (Tag) lọc bài viết (tùy chọn)</label>
                        <CustomDropdown
                          value={src.target_tags ? String(src.target_tags) : ''}
                          onChange={v => {
                            const newSites = [...sources];
                            newSites[index].target_tags = v ? String(v) : '';
                            setSources(newSites);
                          }}
                          options={[{ value: '', label: 'Tất cả Thẻ (Tag)' }, ...(sourceTagsCache[src.target_site_id] || []).map(t => ({ value: String(t.id), label: t.name }))]}
                          disabled={!src.target_site_id}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {sources.length === 0 && (
                  <p className="text-xs text-fb-text-muted italic text-center py-4 bg-fb-surface-hover/20 rounded-xl border border-dashed border-fb-surface-hover/50">
                    Chưa cấu hình nguồn Website WordPress. Vui lòng bấm "Thêm nguồn" ở trên để chọn Website và Chuyên mục cho Fanpage.
                  </p>
                )}
              </div>
            </div>

            {/** Card 3: Lịch Trình Xuất Bản */}
            <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-fb-surface-hover/50">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-400 text-[22px]">schedule</span>
                  <h4 className="text-base font-black text-fb-text">Lịch Trình Xuất Bản Bài Đăng</h4>
                </div>
                <span className="text-xs text-fb-text-muted font-bold">Lên lịch tự động</span>
              </div>

              {/** Schedule Mode Tabs */}
              <div className="flex gap-2 bg-fb-surface-hover/30 rounded-xl p-1 border border-fb-surface-hover/50">
                <button
                  onClick={() => setScheduleMode('fixed')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    scheduleMode === 'fixed'
                      ? 'bg-fb-surface text-fb-text shadow-sm border border-fb-surface-hover'
                      : 'text-fb-text-muted hover:text-fb-text'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">schedule</span>
                  Giờ cố định trong ngày
                </button>
                <button
                  onClick={() => setScheduleMode('immediate')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    scheduleMode === 'immediate'
                      ? 'bg-fb-surface text-fb-text shadow-sm border border-fb-surface-hover'
                      : 'text-fb-text-muted hover:text-fb-text'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">hourglass_empty</span>
                  Đăng nối tiếp (giãn cách)
                </button>
              </div>

              {scheduleMode === 'fixed' ? (
                <div className="space-y-4">
                  {/** Quick Predefined Schedules: 5 bài/ngày (Khuyên dùng) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[15px]">auto_awesome</span>
                        <span>Khuyên dùng: Gói 5 bài / ngày (Tối ưu tương tác & Tiết kiệm API AI)</span>
                      </label>
                      <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Cách nhau ~4h</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {predefined5PostsSchedules.map((ps, idx) => (
                        <button
                          key={`5p-${idx}`}
                          type="button"
                          onClick={() => {
                            const hasConflict = ps.times.some(t => usedTimes.has(t));
                            if (hasConflict) {
                              ztteam_showToast('Có khung giờ trong gói này trùng với Fanpage khác!', 'error');
                            }
                            setScheduleFixedTimes(ps.times);
                            ztteam_showToast(`Đã áp dụng ${ps.label}`, 'success');
                          }}
                          className="px-3 py-2.5 bg-gradient-to-r from-fb-blue/15 to-cyan-500/15 hover:from-fb-blue/25 hover:to-cyan-500/25 text-fb-text rounded-xl border border-cyan-500/30 text-[11px] font-bold transition-all text-left shadow-sm cursor-pointer"
                        >
                          <span className="block text-[10px] text-cyan-300 font-bold">{ps.label}</span>
                          <span className="text-white font-black block mt-0.5">{ps.times.join(' - ')}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/** Quick Predefined Schedules: 3 bài/ngày */}
                  <div>
                    <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-2">Hoặc chọn gói 3 bài / ngày:</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {predefinedSchedules.map((ps, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            const hasConflict = ps.times.some(t => usedTimes.has(t));
                            if (hasConflict) {
                              ztteam_showToast('Có khung giờ trong gói này trùng với Fanpage khác!', 'error');
                            }
                            setScheduleFixedTimes(ps.times);
                          }}
                          className="px-2.5 py-2 bg-fb-surface-hover/40 hover:bg-fb-blue/15 hover:text-fb-blue text-fb-text rounded-xl border border-fb-surface-hover/60 text-[11px] font-bold transition-colors text-left"
                        >
                          <span className="block text-[10px] text-fb-text-muted">{ps.label}</span>
                          <span className="text-fb-text font-black">{ps.times.join(' - ')}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/** Custom Time Input */}
                  <div>
                    <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-1.5">Hoặc thêm giờ thủ công:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={timeInput}
                        onChange={e => setTimeInput(e.target.value)}
                        className="w-32 bg-fb-surface border border-fb-surface-hover/60 focus:ring-1 focus:ring-fb-blue rounded-xl px-3 py-2 text-xs outline-none text-fb-text font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (timeInput.trim() && usedTimes.has(timeInput.trim())) {
                            ztteam_showToast(`Giờ ${timeInput} đã được dùng ở Fanpage khác!`, 'error');
                            return;
                          }
                          ztteam_addTime();
                        }}
                        className="px-4 py-2 bg-fb-blue/15 text-fb-blue font-bold rounded-xl text-xs hover:bg-fb-blue/25 transition-colors flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[16px]">add_circle</span> Thêm Giờ
                      </button>
                    </div>
                  </div>

                  {/** Active Times Badges */}
                  <div>
                    <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-2">Các khung giờ đang thiết lập ({scheduleFixedTimes.length}):</label>
                    <div className="flex flex-wrap gap-2">
                      {scheduleFixedTimes.map(t => (
                        <span
                          key={t}
                          className={`px-3 py-1.5 text-xs font-black flex items-center gap-2 rounded-xl border ${
                            usedTimes.has(t)
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              : 'bg-fb-blue/10 text-fb-blue border-fb-blue/25 shadow-xs'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[14px]">alarm</span>
                          {t} {usedTimes.has(t) && '(Trùng FP khác)'}
                          <span
                            onClick={() => setScheduleFixedTimes(scheduleFixedTimes.filter(x => x !== t))}
                            className="material-symbols-outlined text-[14px] cursor-pointer hover:text-rose-400"
                          >
                            close
                          </span>
                        </span>
                      ))}
                    </div>

                    {scheduleFixedTimes.length === 0 && (
                      <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-xl flex items-center gap-2.5 text-amber-400 text-xs mt-2">
                        <span className="material-symbols-outlined text-[20px] shrink-0">warning</span>
                        <span>Chưa thiết lập khung giờ nào! Bài viết hoàn thành sẽ ở hàng đợi và không tự xuất bản lên Facebook. Hãy chọn khung giờ nhanh ở trên.</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-fb-text-muted uppercase mb-2">Khoảng cách giữa 2 bài xuất bản (Phút)</label>
                    <input
                      type="number"
                      min="10"
                      value={scheduleImmediateGap}
                      onChange={e => setScheduleImmediateGap(parseInt(e.target.value) || 60)}
                      className="w-full max-w-[240px] bg-fb-surface border border-fb-surface-hover/60 focus:ring-1 focus:ring-fb-blue rounded-xl px-4 py-2.5 text-sm outline-none text-fb-text font-bold"
                    />
                    <p className="text-[11px] text-fb-text-muted mt-2">Ví dụ đặt 60 phút: Sau khi bài trước được đăng, bài tiếp theo trong hàng đợi sẽ tự động đăng sau 60 phút.</p>
                  </div>
                </div>
              )}

              {/** Publishing Timers Status */}
              <div className="pt-4 border-t border-fb-surface-hover/50 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-fb-text-muted">Lần xuất bản gần nhất:</span>
                  <strong className="text-fb-text font-bold">{lastPublishTime ? ztteam_formatDate(lastPublishTime) : 'Chưa có bài đăng'}</strong>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-fb-text-muted">Dự kiến xuất bản tiếp theo:</span>
                  <strong className="text-emerald-400 font-bold">{nextPublishTime ? ztteam_formatDate(nextPublishTime) : 'Đang chờ khung giờ...'}</strong>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/** TAB 2: HÀNG ĐỢI XUẤT BẢN */}
      {activeTab === 2 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 overflow-hidden flex flex-col">

            {/** Header */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-fb-surface-hover/50 bg-fb-surface-hover/10">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-amber-400 text-[26px]">pending_actions</span>
                <div>
                  <h3 className="text-base font-black text-fb-text">Hàng Đợi Xuất Bản Bài Viết Ảnh 2K</h3>
                  <p className="text-[11px] text-fb-text-muted mt-0.5">
                    Các bài viết đã tạo ảnh AI 2K thành công và đang chờ đến khung giờ xuất bản tự động ({queueItems.length} bài)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <button
                  onClick={() => ztteam_loadQueue()}
                  disabled={isLoadingQueue}
                  className="px-4 py-2 bg-fb-surface-hover text-fb-text-muted hover:text-fb-text rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 border border-fb-surface-hover/50 cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-[16px] ${isLoadingQueue ? 'animate-spin' : ''}`}>refresh</span>
                  Làm mới
                </button>
              </div>
            </div>

            {/** Queue List */}
            <div className="p-6">
              {isLoadingQueue ? (
                <div className="py-20 text-center text-fb-text-muted flex flex-col items-center justify-center">
                  <span className="material-symbols-outlined animate-spin text-4xl text-fb-blue mb-3">refresh</span>
                  <span className="text-sm font-bold">Đang tải danh sách bài viết trong hàng đợi...</span>
                </div>
              ) : queueItems.length === 0 ? (
                <div className="py-16 text-center text-fb-text-muted flex flex-col items-center justify-center bg-fb-surface-hover/20 rounded-2xl border border-dashed border-fb-surface-hover/50">
                  <span className="material-symbols-outlined text-5xl mb-3 text-fb-text-muted/40">schedule</span>
                  <p className="text-base font-bold text-fb-text">Hàng đợi xuất bản hiện đang trống</p>
                  <p className="text-xs text-fb-text-muted mt-1 max-w-md">
                    Khi hệ thống tự động cào bài từ nguồn Website WordPress, các bài viết kèm ảnh AI 2K sẽ xuất hiện ở đây và tự động đăng lên Fanpage theo lịch đã thiết lập.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {queueItems.map((item) => (
                    <ZTTeamAIPostCard
                      key={item.id}
                      item={item}
                      pageName={pageName}
                      pageAvatar={pageAvatar}
                      fbPageId={fbPageId}
                      isPosting={isPosting[item.id] || false}
                      onPostNow={(it) => ztteam_publishNow(it)}
                      onRetry={(it) => ztteam_retryQueueItem(it)}
                      onDelete={(it) => ztteam_deleteQueueItem(it)}
                      onQueueVideo={(it) => ztteam_queueVideoReel(it)}
                      onUseOriginalImage={(it) => ztteam_useOriginalImage(it)}
                    />
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/** TAB 3: LỊCH SỬ ĐÃ ĐĂNG BÀI */}
      {activeTab === 3 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 overflow-hidden flex flex-col">

            {/** Header */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-fb-surface-hover/50 bg-fb-surface-hover/10">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-emerald-400 text-[26px]">history</span>
                <div>
                  <h3 className="text-base font-black text-fb-text">Lịch Sử Bài Viết Đã Đăng Fanpage</h3>
                  <p className="text-[11px] text-fb-text-muted mt-0.5">
                    Tổng số {historyItems.length} bài viết đã xuất bản thành công lên Facebook kèm tiến trình bình luận 2 bước
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <button
                  onClick={() => ztteam_loadQueue()}
                  disabled={isLoadingQueue}
                  className="px-4 py-2 bg-fb-surface-hover text-fb-text-muted hover:text-fb-text rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 border border-fb-surface-hover/50 cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-[16px] ${isLoadingQueue ? 'animate-spin' : ''}`}>refresh</span>
                  Làm mới
                </button>
              </div>
            </div>

            {/** History List */}
            <div className="p-6">
              {isLoadingQueue ? (
                <div className="py-20 text-center text-fb-text-muted flex flex-col items-center justify-center">
                  <span className="material-symbols-outlined animate-spin text-4xl text-fb-blue mb-3">refresh</span>
                  <span className="text-sm font-bold">Đang tải lịch sử đăng bài...</span>
                </div>
              ) : historyItems.length === 0 ? (
                <div className="py-16 text-center text-fb-text-muted flex flex-col items-center justify-center bg-fb-surface-hover/20 rounded-2xl border border-dashed border-fb-surface-hover/50">
                  <span className="material-symbols-outlined text-5xl mb-3 text-fb-text-muted/40">history_toggle_off</span>
                  <p className="text-base font-bold text-fb-text">Chưa có bài viết nào được đăng</p>
                  <p className="text-xs text-fb-text-muted mt-1 max-w-md">
                    Các bài viết sau khi được xuất bản tự động theo lịch hoặc khi bạn bấm "Đăng ngay" sẽ được lưu trữ tại đây.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {historyItems.map((item) => (
                    <ZTTeamAIPostCard
                      key={item.id}
                      item={item}
                      pageName={pageName}
                      pageAvatar={pageAvatar}
                      fbPageId={fbPageId}
                      isPosting={isPosting[item.id] || false}
                      onPostNow={(it) => ztteam_publishNow(it)}
                      onRetry={(it) => ztteam_retryQueueItem(it)}
                      onDelete={(it) => ztteam_deleteQueueItem(it)}
                    />
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/** TAB 4: BỘ NHẬN DIỆN AI (AVATAR & ẢNH BÌA) */}
      {activeTab === 4 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/** Category Configuration Card */}
          <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-fb-surface-hover/50">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">category</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-black text-fb-text">Hạng Mục Fanpage (Category)</h4>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Định hình AI & Facebook
                    </span>
                  </div>
                  <p className="text-xs text-fb-text-muted mt-1 max-w-2xl leading-relaxed">
                    Hạng mục này giúp AI Gemini hiểu rõ lĩnh vực hoạt động để vẽ Avatar và Ảnh bìa đồng bộ phong cách, đồng thời đồng bộ lên thông tin Fanpage.
                  </p>
                </div>
              </div>

              <button
                onClick={() => ztteam_handleSaveCategory()}
                disabled={isSavingCategory}
                className="w-full md:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-xs shrink-0"
              >
                {isSavingCategory ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                    <span>Đang Lưu...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">save</span>
                    <span>Lưu Hạng Mục</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-fb-text mb-2">
                  Chọn hạng mục Facebook chuẩn
                </label>
                <CustomDropdown
                  value={pageCategory}
                  onChange={(val) => setPageCategory(String(val))}
                  options={[
                    { value: '', label: '-- Chọn hạng mục Facebook chính xác --' },
                    { value: 'Thẩm mỹ viện', label: 'Thẩm mỹ viện (Beauty Salon)' },
                    { value: 'Trang web tin tức và truyền thông', label: 'Trang web tin tức và truyền thông (News & Media)' },
                    { value: 'Người sáng tạo nội dung số', label: 'Người sáng tạo nội dung số (Digital Creator)' },
                    { value: 'Trang web giải trí', label: 'Trang web giải trí (Entertainment Website)' },
                    { value: 'Giải trí', label: 'Giải trí (Just for Fun)' },
                    { value: 'Cộng đồng', label: 'Cộng đồng (Community)' },
                    { value: 'Làm đẹp, mỹ phẩm & chăm sóc cá nhân', label: 'Làm đẹp, mỹ phẩm & chăm sóc cá nhân (Beauty & Care)' },
                    { value: 'Blog cá nhân', label: 'Blog cá nhân (Personal Blog)' },
                    { value: 'Film', label: 'Film (Phim ảnh)' },
                    { value: 'Doanh nhân', label: 'Doanh nhân / Khởi nghiệp (Entrepreneur)' },
                    { value: 'Nhiếp ảnh gia', label: 'Nhiếp ảnh gia (Photographer)' },
                    { value: 'Nhạc sĩ/Ban nhạc', label: 'Nhạc sĩ / Ban nhạc (Musician/Band)' },
                    { value: 'Doanh nghiệp địa phương', label: 'Doanh nghiệp địa phương (Local Business)' },
                  ]}
                  placeholder="Chọn hạng mục..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-fb-text mb-2">
                  Hoặc nhập tùy chỉnh hạng mục / ID
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={pageCategory}
                    onChange={(e) => setPageCategory(e.target.value)}
                    placeholder="Ví dụ: Người sáng tạo nội dung số, Thẩm mỹ viện..."
                    className="w-full bg-fb-surface-hover/60 border border-fb-surface-hover focus:border-blue-500 rounded-xl px-4 py-2.5 text-xs text-fb-text focus:outline-none transition-colors"
                  />
                  {pageCategory && (
                    <button
                      type="button"
                      onClick={() => setPageCategory('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-fb-text-muted hover:text-fb-text text-xs"
                      title="Xóa"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/** Control Card */}
          <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">auto_awesome</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-black text-fb-text">Sáng Tạo Bộ Nhận Diện Fanpage 2K</h4>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    Google Gemini AI 2K
                  </span>
                </div>
                <p className="text-xs text-fb-text-muted mt-1 max-w-2xl leading-relaxed">
                  Tự động dựa vào Hạng mục ({pageCategory || 'mặc định'}), nguồn website và 3 bài viết gần nhất để Gemini tạo Avatar (1:1) và Ảnh bìa (16:9). Bạn cũng có thể tải ảnh thủ công từ máy tính lên.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
              <button
                onClick={ztteam_handleGenerateBranding}
                disabled={isGeneratingBranding || isApplyingBranding}
                className="w-full md:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-700 hover:opacity-90 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
              >
                {isGeneratingBranding ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
                    <span>Gemini Đang Tạo 2K (15-30s)...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">palette</span>
                    <span>{brandingData ? 'Tạo Lại Cả Bộ Nhận Diện (Gemini)' : 'Tạo Lại Cả Bộ Nhận Diện (Gemini)'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/** Facebook Page Mockup Preview Card */}
          <div className="bg-fb-surface rounded-2xl shadow-xl border border-fb-surface-hover/50 overflow-hidden">
            <div className="p-4 bg-fb-surface-hover/40 border-b border-fb-surface-hover/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-lg">preview</span>
                <span className="text-xs font-bold text-fb-text uppercase tracking-wider">Mô Phỏng Giao Diện Fanpage Facebook</span>
              </div>
              <span className="text-[11px] text-fb-text-muted">
                {brandingData ? 'Bản xem trước trước khi gắn lên Facebook thật' : 'Chưa tạo ảnh AI (Hiển thị ảnh hiện tại)'}
              </span>
            </div>

            <div className="p-6 md:p-8">
              {/** Mockup Frame */}
              <div className="max-w-4xl mx-auto rounded-2xl overflow-hidden border border-slate-700/60 bg-slate-900/90 shadow-2xl">
                
                {/** Cover Section */}
                <div className="relative aspect-[16/7] md:aspect-[16/6] bg-slate-800 overflow-hidden group">
                  {brandingData?.coverUrl ? (
                    <img
                      src={brandingData.coverUrl}
                      alt="Fanpage Cover"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-center">
                      <span className="material-symbols-outlined text-5xl mb-2 text-slate-600">panorama</span>
                      <p className="text-sm font-semibold text-slate-400">Chưa có ảnh bìa</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm">Tạo bằng Gemini AI hoặc tải ảnh bìa trực tiếp từ máy tính của bạn</p>
                      
                      <div className="mt-3 flex items-center gap-2">
                        <label className="cursor-pointer px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md active:scale-95 transition-all">
                          <span className="material-symbols-outlined text-sm text-cyan-400">upload</span>
                          <span>{isUploadingCover ? 'Đang Tải...' : 'Tải Ảnh Bìa Lên'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => ztteam_handleUploadBranding(e, 'cover')}
                            disabled={isUploadingCover}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/** Top Right Action Buttons for Cover */}
                  <div className="absolute top-3 right-3 opacity-90 hover:opacity-100 transition-opacity flex items-center gap-2">
                    <label className="cursor-pointer px-3 py-1.5 bg-slate-900/80 hover:bg-slate-900 backdrop-blur-md border border-slate-700/70 text-slate-200 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-lg active:scale-95 transition-all" title="Tải ảnh bìa tùy chọn từ máy tính">
                      {isUploadingCover ? (
                        <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                      ) : (
                        <span className="material-symbols-outlined text-sm text-blue-400">upload</span>
                      )}
                      <span>Tải Ảnh Bìa</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => ztteam_handleUploadBranding(e, 'cover')}
                        disabled={isUploadingCover}
                      />
                    </label>

                    {brandingData && (
                      <button
                        onClick={() => ztteam_handleRegenerateItem('cover')}
                        disabled={isRegeneratingCover || isGeneratingBranding || isApplyingBranding}
                        className="px-3 py-1.5 bg-slate-900/80 hover:bg-slate-900 backdrop-blur-md border border-slate-700/70 text-slate-200 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-lg active:scale-95 transition-all disabled:opacity-50"
                        title="Vẽ lại riêng ảnh bìa mới bằng Gemini"
                      >
                        {isRegeneratingCover ? (
                          <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                        ) : (
                          <span className="material-symbols-outlined text-sm text-cyan-400">refresh</span>
                        )}
                        <span>Vẽ Lại Bìa (Gemini)</span>
                      </button>
                    )}
                  </div>
                </div>

                {/** Header Profile Row (Avatar + Page Info) */}
                <div className="px-6 md:px-8 pb-6 pt-0 relative bg-slate-900">
                  <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4 -mt-16 sm:-mt-20">
                    
                    {/** Avatar + Info */}
                    <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 text-center sm:text-left">
                      {/** Avatar with Hover Re-generate & Upload */}
                      <div className="relative group/avatar shrink-0">
                        <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full border-4 border-slate-900 shadow-2xl overflow-hidden bg-slate-800 flex items-center justify-center">
                          {brandingData?.avatarUrl ? (
                            <img
                              src={brandingData.avatarUrl}
                              alt="Avatar"
                              className="w-full h-full object-cover"
                            />
                          ) : pageAvatar ? (
                            <img
                              src={pageAvatar}
                              alt="Avatar"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="material-symbols-outlined text-4xl text-slate-600">account_circle</span>
                          )}
                        </div>

                        {/** Avatar Quick Buttons */}
                        <div className="absolute bottom-1 right-1 flex items-center gap-1">
                          <label
                            className="cursor-pointer p-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-full shadow-lg active:scale-95 transition-all flex items-center justify-center"
                            title="Tải ảnh đại diện từ máy tính"
                          >
                            {isUploadingAvatar ? (
                              <span className="material-symbols-outlined animate-spin text-base">sync</span>
                            ) : (
                              <span className="material-symbols-outlined text-base text-blue-400">upload</span>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => ztteam_handleUploadBranding(e, 'avatar')}
                              disabled={isUploadingAvatar}
                            />
                          </label>

                          {brandingData && (
                            <button
                              onClick={() => ztteam_handleRegenerateItem('avatar')}
                              disabled={isRegeneratingAvatar || isGeneratingBranding || isApplyingBranding}
                              className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-full shadow-lg active:scale-95 transition-all disabled:opacity-50"
                              title="Vẽ lại riêng Avatar mới bằng Gemini"
                            >
                              {isRegeneratingAvatar ? (
                                <span className="material-symbols-outlined animate-spin text-base">sync</span>
                              ) : (
                                <span className="material-symbols-outlined text-base text-cyan-400">refresh</span>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/** Page Name & Meta */}
                      <div className="mb-2">
                        <h2 className="text-xl sm:text-2xl font-black text-white flex items-center justify-center sm:justify-start gap-2">
                          <span>{pageName || 'Tên Fanpage'}</span>
                          <span className="material-symbols-outlined text-blue-400 text-lg" title="Trang được xác thực">verified</span>
                        </h2>
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-1 text-xs text-slate-400 font-medium">
                          <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold">
                            {pageCategory || 'Chưa cài hạng mục'}
                          </span>
                          <span>•</span>
                          <span className="text-cyan-400 font-semibold">{tags.length > 0 ? tags.join(', ') : 'Tự động theo bài viết'}</span>
                        </div>
                      </div>
                    </div>

                    {/** Mock Facebook Buttons */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="px-4 py-2 bg-blue-600/30 text-blue-400 border border-blue-500/30 font-bold rounded-lg text-xs flex items-center gap-1.5 opacity-80 cursor-default">
                        <span className="material-symbols-outlined text-sm">thumb_up</span>
                        Đã thích
                      </div>
                      <div className="px-4 py-2 bg-slate-800 text-slate-300 border border-slate-700 font-bold rounded-lg text-xs flex items-center gap-1.5 opacity-80 cursor-default">
                        <span className="material-symbols-outlined text-sm">chat</span>
                        Nhắn tin
                      </div>
                    </div>

                  </div>
                </div>

              </div>

              {/** Action Bar & Prompt Details */}
              {brandingData && (
                <div className="max-w-4xl mx-auto mt-6 pt-6 border-t border-fb-surface-hover/50 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 bg-fb-surface-hover/30 rounded-xl border border-fb-surface-hover/40 text-xs">
                      <div className="font-bold text-fb-text flex items-center gap-1.5 mb-1">
                        <span className="material-symbols-outlined text-cyan-400 text-sm">face</span>
                        Prompt Avatar (1:1):
                      </div>
                      <p className="text-fb-text-muted italic line-clamp-3" title={brandingData.avatarPrompt}>
                        "{brandingData.avatarPrompt}"
                      </p>
                    </div>

                    <div className="p-3 bg-fb-surface-hover/30 rounded-xl border border-fb-surface-hover/40 text-xs">
                      <div className="font-bold text-fb-text flex items-center gap-1.5 mb-1">
                        <span className="material-symbols-outlined text-cyan-400 text-sm">panorama</span>
                        Prompt Ảnh Bìa (16:9):
                      </div>
                      <p className="text-fb-text-muted italic line-clamp-3" title={brandingData.coverPrompt}>
                        "{brandingData.coverPrompt}"
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-gradient-to-r from-blue-950/40 via-cyan-950/30 to-slate-900/60 p-4 rounded-xl border border-blue-500/20">
                    <div className="flex items-center gap-2.5 text-xs text-slate-300">
                      <span className="material-symbols-outlined text-emerald-400 text-lg">verified_user</span>
                      <span>
                        Ảnh bìa sẽ được tải vào kho ẩn (<code className="text-cyan-400">published=false</code>), hoàn toàn <b>không tạo bài viết rác</b> trên bảng tin người theo dõi.
                      </span>
                    </div>

                    <button
                      onClick={ztteam_handleApplyBranding}
                      disabled={isApplyingBranding || isGeneratingBranding}
                      className="w-full sm:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl shadow-lg shadow-blue-600/30 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm whitespace-nowrap shrink-0"
                    >
                      {isApplyingBranding ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
                          <span>Đang Gắn Lên Facebook...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
                          <span>Gắn Lên Fanpage Facebook Ngay</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
