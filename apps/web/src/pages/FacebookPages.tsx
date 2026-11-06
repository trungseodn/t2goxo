import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useZTTeamFacebookStore } from '../stores/facebookStore';
import { useUIStore } from '../stores/uiStore';
import { LineChart, Line, AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { ztteam_decodeHtmlEntity } from '../utils/stringUtils';
import api from '../services/api';
import CustomDropdown from '../components/CustomDropdown';
import { useWordpressStore } from '../stores/wordpressStore';

/** Component FanpageCard chuẩn Grid Card tích hợp 3 biểu đồ xu hướng sparkline mini */
function FanpageCard({ page, isExpired, testingPageId, handleTestPost, handleToggleActive, isSelected, onToggleSelect }: any) {
  const navigate = useNavigate();
  const { ztteam_getPageReport, ztteam_deletePage } = useZTTeamFacebookStore();
  const { ztteam_showToast, ztteam_showConfirm } = useUIStore();
  const [insights, setInsights] = useState<any>(null);

  const isCurrentlyActive = page.isActive !== false;

  const handleToggleActiveClick = async () => {
    const confirm = await ztteam_showConfirm(
      isCurrentlyActive ? 'Tắt Fanpage' : 'Bật lại Fanpage',
      isCurrentlyActive
        ? `Bạn có chắc muốn tắt Fanpage "${page.name}"? Fanpage sẽ được chuyển sang Tab "Fanpage Đã Tắt" và ẩn khỏi menu sidebar, thống kê & 100% quy trình tự động.`
        : `Bạn muốn bật lại Fanpage "${page.name}"? Fanpage sẽ khôi phục về Tab "Fanpage Đang Hoạt Động" và xuất hiện lại trên menu & thống kê.`
    );
    if (confirm && handleToggleActive) {
      handleToggleActive(page.id, !isCurrentlyActive);
    }
  };

  useEffect(() => {
    if (!isExpired) {
      ztteam_getPageReport(page.id).then(data => setInsights(data));
    }
  }, [page.id, isExpired]);

  /** Xử lý dữ liệu chuỗi 28 ngày cho 3 mini sparklines */
  let viewsChartData: any[] = [];
  let followsChartData: any[] = [];
  let engChartData: any[] = [];

  if (insights && Array.isArray(insights)) {
    const viewMetric = insights.find((m: any) => m.name === 'page_media_view');
    if (viewMetric?.values) {
      viewsChartData = viewMetric.values.map((v: any) => ({ value: v.value || 0 }));
    }
    const followMetric = insights.find((m: any) => m.name === 'page_daily_follows');
    if (followMetric?.values) {
      followsChartData = followMetric.values.map((v: any) => ({ value: v.value || 0 }));
    }
    const engMetric = insights.find((m: any) => m.name === 'page_post_engagements');
    if (engMetric?.values) {
      engChartData = engMetric.values.map((v: any) => ({ value: v.value || 0 }));
    }
  }

  const handleDeletePage = async () => {
    const confirm = await ztteam_showConfirm(
      'Xóa Fanpage',
      `Bạn có chắc muốn xóa Fanpage "${page.name}"? Tất cả bài đã đăng sẽ bị xóa. Các bài chưa đăng sẽ được tự động chia đều cho các Fanpage còn lại.`
    );
    if (confirm) {
      try {
        const result = await ztteam_deletePage(page.id);
        ztteam_showToast(result?.message || `Đã xóa Fanpage ${page.name} thành công`, 'success');
      } catch (error: any) {
        ztteam_showToast(error.message, 'error');
      }
    }
  };

  /** ZTTeam: Kiểm tra trạng thái cấu hình đầy đủ hay còn thiếu */
  const missingConfigs: string[] = [];
  const sourcesCount = page.sourcesCount ?? 0;
  const pendingImages = page.pendingImagesCount ?? 0;
  const pendingReels = page.pendingReelsCount ?? 0;
  const totalPending = page.totalPendingCount ?? (pendingImages + pendingReels);
  const fixedTimes = page.scheduleFixedTimes || [];

  if (sourcesCount === 0) {
    missingConfigs.push('Chưa có nguồn cào');
  }
  if (page.scheduleMode === 'fixed' && fixedTimes.length === 0) {
    missingConfigs.push('Chưa cài khung giờ');
  }
  if (page.autoPublishEnabled === false) {
    missingConfigs.push('Đang tắt tự động đăng');
  }
  if (totalPending === 0) {
    missingConfigs.push('Hàng đợi rỗng (0 bài)');
  }
  const isConfigComplete = missingConfigs.length === 0;

  /** ZTTeam: Định dạng nhãn hiển thị định dạng đăng */
  const postFormatLabel =
    page.postFormat === 'reel' ? 'Video Reel' :
      page.postFormat === 'mixed' ? 'Ảnh 2K & Reel' : 'Bài viết Ảnh 2K';

  /** ZTTeam: Định dạng nhãn hiển thị lịch đăng */
  const scheduleLabel =
    page.scheduleMode === 'immediate'
      ? `Cách quãng ${page.scheduleImmediateGapMinutes || 60}p`
      : `${fixedTimes.length} khung giờ/ngày`;

  /** ZTTeam: Format thời gian đăng tiếp theo */
  const ztteam_formatNextPublish = (dateStr?: string | null) => {
    if (!dateStr) return 'Đang chờ khung giờ';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const today = new Date();
      const isToday = d.toDateString() === today.toDateString();
      const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      return isToday ? `${timeStr} (Hôm nay)` : `${timeStr} (${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })})`;
    } catch {
      return dateStr;
    }
  };

  /** ZTTeam: Format thời gian bài vừa đăng */
  const ztteam_formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const mon = String(d.getMonth() + 1).padStart(2, '0');
      return `${h}:${m} ${day}/${mon}`;
    } catch {
      return dateStr;
    }
  };

  const postUrl = `https://facebook.com/${page.fb_page_id || page.id}`;

  return (
    <div className={`bg-fb-surface-hover/30 rounded-2xl overflow-hidden transition-all duration-300 shadow-lg hover:shadow-2xl group flex flex-col justify-between ${
      isSelected ? 'ring-2 ring-fb-blue bg-blue-950/25 shadow-blue-500/20' : ''
    }`}>
      {/** 1. Header Card Section: Nền đồng màu với Footer (bg-fb-surface-hover/70) */}
      <div className="p-4 bg-fb-surface-hover/70 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {onToggleSelect && (
            <div
              onClick={(e) => { e.stopPropagation(); onToggleSelect(page.id); }}
              className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all shrink-0 mt-2 ${
                isSelected
                  ? 'bg-fb-blue border-fb-blue text-white shadow-md shadow-blue-500/30'
                  : 'border-slate-600 bg-slate-900/60 hover:border-blue-400 text-transparent'
              }`}
              title={isSelected ? 'Bỏ chọn Fanpage này' : 'Chọn Fanpage này'}
            >
              <span className="material-symbols-outlined text-[16px] font-black">check</span>
            </div>
          )}
          {page.avatar ? (
            <img
              src={page.avatar}
              alt={page.name}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.dataset.fallback) {
                  target.dataset.fallback = 'true';
                  target.src = `https://graph.facebook.com/${page.fb_page_id || page.id}/picture?type=large`;
                }
              }}
              className="w-11 h-11 rounded-2xl object-cover bg-slate-900 shadow-md shrink-0 mt-0.5"
            />
          ) : (
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white font-black flex items-center justify-center shadow-md shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-xl">pages</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <p className="font-bold text-base text-fb-text truncate leading-snug">{page.name}</p>
              {page.isCheckpointBlocked && (
                <div className="relative group/cpBadge shrink-0 cursor-help">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm animate-pulse">
                    <span className="material-symbols-outlined text-[13px] text-amber-400">shield_lock</span>
                    <span>Cần xác minh danh tính</span>
                  </span>

                  {/** Tooltip giải thích chi tiết khi hover */}
                  <div className="absolute left-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 w-80 p-3.5 bg-[#0b1329] rounded-xl border border-amber-500/30 shadow-2xl z-50 invisible group-hover/cpBadge:visible opacity-0 group-hover/cpBadge:opacity-100 transition-all pointer-events-none text-left">
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
                      <div>2. Chuyển sang Trang <b>{page.name}</b></div>
                      <div>3. Đăng thử 1 bài viết bất kỳ (ví dụ: "Test") và làm theo thông báo xác nhận danh tính trên điện thoại</div>
                      <div>4. Sau khi đăng được, vào Cài đặt Page trên web và bật lại nút tự động đăng</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2 mt-1 text-[11px] font-medium text-fb-text-muted">
              <span className="truncate block">Nick: <b className="text-blue-400">{page.ownerName || 'Admin'}</b></span>
              <span className="hidden sm:inline">•</span>
              <span className="inline-flex items-center gap-1 text-slate-300 font-semibold truncate">
                <span className="material-symbols-outlined text-[13px] text-blue-400">group</span>
                {(page.followersCount ?? 0).toLocaleString()} <span className="text-[10px] text-fb-text-muted font-normal">sub</span>
              </span>
              <span className="hidden sm:inline">•</span>
              <span className="text-fb-text-muted text-[10px] sm:text-[11px] truncate block">ID: {page.id}</span>
            </div>

            {/** Badges phân loại Doanh Nghiệp (BM) hoặc Tài Khoản Cá Nhân, Meta App & Thời hạn Token */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span
                onClick={(e) => { e.stopPropagation(); navigate('/facebook/business-hub'); }}
                className={`cursor-pointer px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 transition-colors ${
                  page.accountType === 'PERSONAL' || !page.businessId
                    ? 'bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 border-slate-600/30'
                    : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/20'
                }`}
                title={page.accountType === 'PERSONAL' || !page.businessId ? 'Tài Khoản Facebook Cá Nhân' : 'Bấm để mở Hub Quản Lý Doanh Nghiệp'}
              >
                <span className="material-symbols-outlined text-[12px]">
                  {page.accountType === 'PERSONAL' || !page.businessId ? 'person' : 'corporate_fare'}
                </span>
                <span className="truncate max-w-[120px]">
                  {page.businessName || (page.accountType === 'PERSONAL' ? 'Tài Khoản Cá Nhân' : 'Doanh Nghiệp BM')}
                </span>
              </span>

              {page.appName && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">apps</span>
                  <span className="truncate max-w-[100px]">{page.appName}</span>
                </span>
              )}

              {page.category && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1" title={`Hạng mục: ${page.category}`}>
                  <span className="material-symbols-outlined text-[12px]">category</span>
                  <span className="truncate max-w-[130px]">{page.category}</span>
                </span>
              )}

              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 ${
                (page.tokenExpiry === 'NEVER' || page.accountType === 'SYSTEM_USER') && page.businessId
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-slate-700/50 text-slate-300 border-slate-600/40'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  (page.tokenExpiry === 'NEVER' || page.accountType === 'SYSTEM_USER') && page.businessId
                    ? 'bg-emerald-400'
                    : 'bg-blue-400'
                }`}></span>
                <span>
                  {(page.tokenExpiry === 'NEVER' || page.accountType === 'SYSTEM_USER') && page.businessId ? 'Vĩnh Viễn' : 'Token User'}
                </span>
              </span>
            </div>
          </div>
        </div>

        {isExpired ? (
          <span className="px-2.5 py-1 bg-red-500/20 text-red-400 rounded-full text-[10px] font-extrabold shrink-0 flex items-center gap-1 shadow-sm">
            <span className="material-symbols-outlined text-xs">error</span> Lỗi Token
          </span>
        ) : page.isCheckpointBlocked ? (
          <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 rounded-full text-[10px] font-extrabold shrink-0 flex items-center gap-1 shadow-sm border border-amber-500/30">
            <span className="material-symbols-outlined text-xs text-amber-400">shield_lock</span> Chờ xác minh
          </span>
        ) : (
          <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-extrabold shrink-0 flex items-center gap-1 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse"></span> Active
          </span>
        )}
      </div>

      {/** 2. Content Section: Nền khác biệt với Header & Footer (bg-fb-surface) */}
      <div className="p-4 space-y-3 flex-1 bg-fb-surface">
        {/** Badges Cấu hình Auto & Template */}
        <div className="flex flex-wrap items-center gap-2">
          {page.autoPublishEnabled !== false ? (
            <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-extrabold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">play_circle</span> ĐĂNG: BẬT
            </span>
          ) : (
            <span className="px-2.5 py-1 bg-red-500/10 text-red-400 rounded-full text-[10px] font-extrabold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">pause_circle</span> ĐĂNG: TẮT
            </span>
          )}

          {sourcesCount > 0 ? (
            page.postFormat === 'reel' || page.postFormat === 'mixed' ? (
              <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-extrabold flex items-center gap-1 shadow-xs">
                <span className="material-symbols-outlined text-[13px]">movie</span> TẠO REEL: BẬT
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-extrabold flex items-center gap-1 shadow-xs">
                <span className="material-symbols-outlined text-[13px]">auto_stories</span> TẠO BÀI: BẬT
              </span>
            )
          ) : (
            <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-full text-[10px] font-extrabold flex items-center gap-1 shadow-xs" title="Chưa liên kết website nguồn cào bài">
              <span className="material-symbols-outlined text-[13px]">link_off</span> CHƯA CÓ NGUỒN
            </span>
          )}
        </div>

        {/** ZTTeam: Khối Tóm Tắt & Đánh Giá Cấu Hình - Sử dụng Shadow & Elevation thay vì Border */}
        <div className="p-3 rounded-xl bg-slate-900/80 shadow-md shadow-black/40 flex flex-col gap-2.5 text-xs">
          {/** Tiêu đề & Badge Đầy đủ / Cần cấu hình (Shadow thay cho Border) */}
          <div className="flex items-center justify-between gap-2 pb-1.5">
            <span className="text-[11px] font-bold text-fb-text uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-cyan-400">tune</span>
              Cấu hình hoạt động
            </span>
            {isConfigComplete ? (
              <span className="px-2.5 py-0.5 bg-emerald-500/15 text-emerald-400 shadow-sm shadow-emerald-500/25 rounded-full text-[10px] font-black flex items-center gap-1 shrink-0">
                <span className="material-symbols-outlined text-xs">check_circle</span> Đầy đủ
              </span>
            ) : (
              <span className="px-2.5 py-0.5 bg-amber-500/15 text-amber-400 shadow-sm shadow-amber-500/25 rounded-full text-[10px] font-black flex items-center gap-1 shrink-0">
                <span className="material-symbols-outlined text-xs">warning</span> Cần cấu hình
              </span>
            )}
          </div>

          {/** Lưới 2 Cột x 2 Hàng thông số - Mỗi ô có shadow nhẹ làm nổi bật */}
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {/** 1. Nguồn cào */}
            <div
              className="flex items-center gap-1.5 min-w-0 bg-slate-800/40 p-2 rounded-lg shadow-sm shadow-black/25"
              title={page.sourceWebs && page.sourceWebs.length > 0 ? `Nguồn web: ${page.sourceWebs.join(', ')}` : 'Chưa liên kết nguồn cào'}
            >
              <span className="material-symbols-outlined text-sm text-cyan-400 shrink-0">language</span>
              <div className="truncate">
                <span className="text-fb-text-muted">Nguồn: </span>
                {page.sourceWebs && page.sourceWebs.length > 0 ? (
                  <strong className="text-cyan-400 font-bold" title={page.sourceWebs.join(', ')}>
                    {page.sourceWebs[0]}
                    {page.sourceWebs.length > 1 ? ` (+${page.sourceWebs.length - 1})` : ''}
                  </strong>
                ) : sourcesCount > 0 ? (
                  <strong className="text-emerald-400 font-semibold">{sourcesCount} web</strong>
                ) : (
                  <strong className="text-amber-400 font-semibold">Chưa có</strong>
                )}
              </div>
            </div>

            {/** 2. Định dạng đăng */}
            <div className="flex items-center gap-1.5 min-w-0 bg-slate-800/40 p-2 rounded-lg shadow-sm shadow-black/25">
              <span className="material-symbols-outlined text-sm text-slate-400 shrink-0">
                {page.postFormat === 'reel' ? 'movie' : page.postFormat === 'mixed' ? 'auto_awesome_motion' : 'photo_library'}
              </span>
              <div className="truncate">
                <span className="text-fb-text-muted">Dạng: </span>
                <strong className="text-fb-text font-semibold">{postFormatLabel}</strong>
              </div>
            </div>

            {/** 3. Lịch đăng */}
            <div className="flex items-center gap-1.5 min-w-0 bg-slate-800/40 p-2 rounded-lg shadow-sm shadow-black/25">
              <span className="material-symbols-outlined text-sm text-slate-400 shrink-0">schedule</span>
              <div className="truncate">
                <span className="text-fb-text-muted">Lịch: </span>
                <strong className={`font-semibold ${fixedTimes.length > 0 || page.scheduleMode === 'immediate' ? 'text-fb-text' : 'text-amber-400'}`}>
                  {scheduleLabel}
                </strong>
              </div>
            </div>

            {/** 4. Hàng đợi bài chờ */}
            <div className="flex items-center gap-1.5 min-w-0 bg-slate-800/40 p-2 rounded-lg shadow-sm shadow-black/25">
              <span className="material-symbols-outlined text-sm text-slate-400 shrink-0">hourglass_top</span>
              <div className="truncate">
                <span className="text-fb-text-muted">Hàng đợi: </span>
                {totalPending > 0 ? (
                  <strong className="text-emerald-400 font-semibold">{totalPending} bài chờ</strong>
                ) : (
                  <strong className="text-amber-400 font-semibold">0 bài chờ</strong>
                )}
              </div>
            </div>
          </div>

          {/** Dòng Đăng tiếp theo & Khung giờ chi tiết */}
          <div className="pt-2 flex flex-col gap-1.5 text-[10px]">
            <div className="flex items-center justify-between gap-1 bg-slate-800/30 px-2 py-1.5 rounded-lg shadow-sm shadow-black/20">
              <span className="text-fb-text-muted flex items-center gap-1">
                <span className="material-symbols-outlined text-xs text-emerald-400">timer</span>
                Đăng tiếp theo:
              </span>
              <span className="font-bold text-emerald-400">
                {ztteam_formatNextPublish(page.nextPublishTime)}
              </span>
            </div>
            {page.scheduleMode === 'fixed' && fixedTimes.length > 0 && (
              <div className="flex items-center gap-1 overflow-hidden text-slate-400 px-1">
                <span className="shrink-0 text-[10px] text-fb-text-muted">Khung giờ:</span>
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                  {fixedTimes.map((t: string, idx: number) => (
                    <span key={idx} className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[9px] font-mono shrink-0 shadow-sm shadow-black/20">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/** ZTTeam: Bài viết vừa đăng gần nhất */}
          <div className="p-2 rounded-lg bg-slate-800/30 border border-slate-700/40 flex items-start gap-2 text-[10px] shadow-sm shadow-black/20">
            <span className="material-symbols-outlined text-[13px] text-emerald-400 shrink-0 mt-0.5">verified</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-fb-text-muted font-medium">Vừa đăng gần nhất:</span>
                {page.lastPublishTime ? (
                  <span className="font-mono text-[9px] text-emerald-400 font-bold shrink-0">
                    {ztteam_formatDateTime(page.lastPublishTime)}
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-500 italic">Chưa có</span>
                )}
              </div>
              <p className="text-fb-text font-bold text-[11px] truncate mt-0.5" title={page.lastPostTitle || 'Chưa có bài đăng'}>
                {page.lastPostTitle ? ztteam_decodeHtmlEntity(page.lastPostTitle) : 'Chưa có bài đăng nào'}
              </p>
            </div>
          </div>

          {/** Cảnh báo nếu chưa hoàn thiện cấu hình */}
          {!isConfigComplete && (
            <div className="mt-0.5 p-2 bg-amber-500/10 text-amber-300 rounded-lg text-[10px] flex items-start gap-1.5 shadow-sm shadow-amber-500/10">
              <span className="material-symbols-outlined text-xs shrink-0 mt-0.5 text-amber-400">info</span>
              <span className="truncate">
                Cần: <strong className="font-semibold">{missingConfigs.join(' • ')}</strong>
              </span>
            </div>
          )}
        </div>

        {/** Khối Biểu Đồ Sparkline Xu Hướng (3 Mini Charts: Lượt xem, Theo dõi, Tương tác) */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {/** Mini Chart 1: Lượt Xem */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Lượt xem
            </span>
            <div className="h-9 w-full">
              {viewsChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={viewsChartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                    <defs>
                      <linearGradient id={`grad-views-${page.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                    <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={1.5} fillOpacity={1} fill={`url(#grad-views-${page.id})`} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[9px] text-fb-text-muted italic">---</div>
              )}
            </div>
          </div>

          {/** Mini Chart 2: Theo Dõi */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-black text-cyan-400 uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> Theo dõi
            </span>
            <div className="h-9 w-full">
              {followsChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={followsChartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                    <defs>
                      <linearGradient id={`grad-follows-${page.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                    <Area type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={1.5} fillOpacity={1} fill={`url(#grad-follows-${page.id})`} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[9px] text-fb-text-muted italic">---</div>
              )}
            </div>
          </div>

          {/** Mini Chart 3: Tương Tác */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Tương tác
            </span>
            <div className="h-9 w-full">
              {engChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={engChartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                    <defs>
                      <linearGradient id={`grad-eng-${page.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                    <Area type="monotone" dataKey="value" stroke="#fbbf24" strokeWidth={1.5} fillOpacity={1} fill={`url(#grad-eng-${page.id})`} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[9px] text-fb-text-muted italic">---</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/** 3. Footer Action Bar Section: Nền đồng màu với Header (bg-fb-surface-hover/70) */}
      <div className="p-4 bg-fb-surface-hover/70 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigate(`/facebook/pages/${page.id}/report`)}
            className="w-8 h-8 sm:w-auto sm:h-9 px-0 sm:px-3.5 bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500 hover:text-white rounded-full font-bold text-xs flex items-center justify-center gap-0 sm:gap-1.5 transition-all shadow-sm shrink-0 aspect-square sm:aspect-auto"
            title="Báo cáo Fanpage"
          >
            <span className="material-symbols-outlined text-base sm:text-sm">query_stats</span>
            <span className="hidden sm:inline">Báo cáo</span>
          </button>
          <button
            onClick={() => navigate(`/facebook/pages/${page.id}/settings`)}
            className="w-8 h-8 sm:w-auto sm:h-9 px-0 sm:px-3.5 bg-blue-500/15 text-blue-400 hover:bg-blue-500 hover:text-white rounded-full font-bold text-xs flex items-center justify-center gap-0 sm:gap-1.5 transition-all shadow-sm shrink-0 aspect-square sm:aspect-auto"
            title="Cài đặt Fanpage"
          >
            <span className="material-symbols-outlined text-base sm:text-sm">settings</span>
            <span className="hidden sm:inline">Cài đặt</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {/** Tạm ẩn nút Test đăng bài theo yêu cầu */}
          <a
            href={postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 flex items-center justify-center text-fb-text-muted bg-fb-surface-hover hover:bg-fb-surface-hover/80 hover:text-white rounded-full transition-all shadow-sm"
            title="Xem Fanpage trên Facebook"
          >
            <span className="material-symbols-outlined text-sm">open_in_new</span>
          </a>

          <button
            onClick={handleToggleActiveClick}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-all shadow-sm ${isCurrentlyActive
              ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500 hover:text-white'
              : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500 hover:text-white'
              }`}
            title={isCurrentlyActive ? 'Tắt Fanpage' : 'Bật lại Fanpage'}
          >
            <span className="material-symbols-outlined text-sm">power_settings_new</span>
          </button>

          <button
            onClick={handleDeletePage}
            className="w-8 h-8 flex items-center justify-center text-red-400 bg-red-500/15 hover:bg-red-500 hover:text-white rounded-full transition-all shadow-sm"
            title="Xóa Fanpage"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FacebookPages() {
  const {
    isConnected,
    pages,
    accounts = [],
    isLoading,
    error,
    ztteam_checkLoginStatus,
    ztteam_loginWithFacebook,
    ztteam_fetchPages,
    ztteam_fetchPagesFromDB,
    ztteam_fetchAccounts,
    ztteam_deleteAccount,
    ztteam_testPost
  } = useZTTeamFacebookStore();
  const { ztteam_showToast, ztteam_showConfirm } = useUIStore();
  const navigate = useNavigate();

  const [testingPageId, setTestingPageId] = useState<string | null>(null);
  const [pageTab, setPageTab] = useState<'active' | 'deactivated'>('active');
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isAccountsModalOpen, setIsAccountsModalOpen] = useState(false);

  /** Lọc dữ liệu */
  const [filterOwner, setFilterOwner] = useState('');
  const [filterBusiness, setFilterBusiness] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  /** State quản lý chọn hàng loạt */
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const { sites, ztteam_fetchSites, ztteam_fetchCategories } = useWordpressStore();

  /** State Modal Gán Nguồn Hàng Loạt */
  const [isBulkSourceModalOpen, setIsBulkSourceModalOpen] = useState(false);
  const [bulkTargetSiteId, setBulkTargetSiteId] = useState('');
  const [bulkTargetCategoryId, setBulkTargetCategoryId] = useState('');
  const [bulkCategories, setBulkCategories] = useState<any[]>([]);
  const [bulkSourceMode, setBulkSourceMode] = useState<'replace' | 'append'>('replace');
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isSubmittingBulkSource, setIsSubmittingBulkSource] = useState(false);

  /** State Modal Áp Dụng Lịch Đăng & Cấu Hình Video Hàng Loạt */
  const [isBulkScheduleModalOpen, setIsBulkScheduleModalOpen] = useState(false);
  const [isSubmittingBulkSchedule, setIsSubmittingBulkSchedule] = useState(false);
  const [bulkPostFormat, setBulkPostFormat] = useState<'reel' | 'image' | 'mixed'>('reel');
  const [bulkVideoEngine, setBulkVideoEngine] = useState<'hook_image' | 'text_story' | 'muse'>('text_story');
  const [bulkDefaultBgm, setBulkDefaultBgm] = useState<string>('');
  const [bulkReelTemplateId, setBulkReelTemplateId] = useState<string>('random');
  const [bulkTextStoryTemplates, setBulkTextStoryTemplates] = useState<any[]>([]);
  const [bulkPostsPerDay, setBulkPostsPerDay] = useState<number>(4);
  const [bulkAutoPublish, setBulkAutoPublish] = useState<boolean>(true);
  const [bulkBgmList, setBulkBgmList] = useState<any[]>([]);
  const [bulkLinkMode, setBulkLinkMode] = useState<'view_threshold' | 'delayed_2step' | 'immediate' | 'none'>('view_threshold');
  const [bulkLinkViewThreshold, setBulkLinkViewThreshold] = useState<number>(1000);
  const [bulkLinkTargetPosition, setBulkLinkTargetPosition] = useState<'comment' | 'caption' | 'both'>('comment');
  const [bulkLinkFallbackHours, setBulkLinkFallbackHours] = useState<number>(24);
  const [bulkLinkFallbackAction, setBulkLinkFallbackAction] = useState<'inject' | 'skip'>('inject');

  /** State Modal Bộ Nhận Diện AI & Hạng Mục Hàng Loạt (Theo BM / Đã chọn) */
  const [isBulkBrandingModalOpen, setIsBulkBrandingModalOpen] = useState(false);
  const [bulkBrandingTargetScope, setBulkBrandingTargetScope] = useState<'selected' | 'bm'>('selected');
  const [bulkBrandingBM, setBulkBrandingBM] = useState<string>('');
  const [bulkBrandingCategory, setBulkBrandingCategory] = useState<string>('');
  const [bulkBrandingOverwrite, setBulkBrandingOverwrite] = useState<boolean>(false);
  const [isSubmittingBulkCategory, setIsSubmittingBulkCategory] = useState<boolean>(false);
  const [isSubmittingBulkGenerate, setIsSubmittingBulkGenerate] = useState<boolean>(false);
  const [isSubmittingBulkApply, setIsSubmittingBulkApply] = useState<boolean>(false);
  const [bulkBrandingProgressMsg, setBulkBrandingProgressMsg] = useState<string | null>(null);

  const uniqueOwners = Array.from(new Set(pages.map(p => p.ownerName).filter(Boolean)));
  const uniqueBusinesses = Array.from(new Set(pages.map(p => p.businessName).filter(Boolean)));
  const uniqueTags = Array.from(new Set(pages.flatMap(p => p.tags || [])));

  const filteredPages = pages.filter(p => {
    let match = true;
    if (filterOwner && p.ownerName !== filterOwner) match = false;
    if (filterBusiness && p.businessName !== filterBusiness) match = false;
    if (filterTag && (!p.tags || !p.tags.includes(filterTag))) match = false;
    if (filterSearch && filterSearch.trim().length > 0) {
      const q = filterSearch.toLowerCase().trim();
      const nameMatch = (p.name || '').toLowerCase().includes(q);
      const idMatch = (p.fb_page_id || p.id || '').toLowerCase().includes(q);
      if (!nameMatch && !idMatch) match = false;
    }
    return match;
  });

  const activePages = filteredPages.filter(p => p.isActive !== false);
  const deactivatedPages = filteredPages.filter(p => p.isActive === false);
  const currentTabPages = pageTab === 'active' ? activePages : deactivatedPages;

  /** Chọn / Bỏ chọn Fanpage */
  const handleToggleSelectPage = (pageId: string) => {
    setSelectedPageIds(prev =>
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    );
  };

  /** Chọn tất cả Page trong tab đang hiển thị */
  const handleSelectAllCurrentTab = () => {
    const currentIds = currentTabPages.map(p => p.id);
    const allSelected = currentIds.length > 0 && currentIds.every(id => selectedPageIds.includes(id));
    if (allSelected) {
      setSelectedPageIds(prev => prev.filter(id => !currentIds.includes(id)));
    } else {
      setSelectedPageIds(prev => Array.from(new Set([...prev, ...currentIds])));
    }
  };

  /** Chọn nhanh theo BM */
  const handleSelectByBM = (bmName: string) => {
    const bmPages = pages.filter(p => p.businessName === bmName && p.isActive !== false);
    const bmIds = bmPages.map(p => p.id);
    setSelectedPageIds(prev => Array.from(new Set([...prev, ...bmIds])));
    ztteam_showToast(`Đã chọn toàn bộ ${bmIds.length} Page thuộc BM "${bmName}"`, 'info');
  };

  /** Chọn nhanh theo Nick cá nhân */
  const handleSelectByOwner = (ownerName: string) => {
    const ownerPages = pages.filter(p => p.ownerName === ownerName && p.isActive !== false);
    const ownerIds = ownerPages.map(p => p.id);
    setSelectedPageIds(prev => Array.from(new Set([...prev, ...ownerIds])));
    ztteam_showToast(`Đã chọn toàn bộ ${ownerIds.length} Page thuộc Nick "${ownerName}"`, 'info');
  };

  /** Tự động tải danh mục khi đổi Website WordPress trong Modal gán nguồn */
  useEffect(() => {
    if (bulkTargetSiteId) {
      setIsLoadingCategories(true);
      ztteam_fetchCategories(bulkTargetSiteId)
        .then(cats => setBulkCategories(cats || []))
        .catch(() => setBulkCategories([]))
        .finally(() => setIsLoadingCategories(false));
    } else {
      setBulkCategories([]);
    }
    setBulkTargetCategoryId('');
  }, [bulkTargetSiteId]);

  /** Xử lý Gán Nguồn Cào Hàng Loạt */
  const handleBulkAssignSourcesSubmit = async () => {
    if (selectedPageIds.length === 0) {
      ztteam_showToast('Vui lòng chọn ít nhất 1 Fanpage', 'error');
      return;
    }
    if (!bulkTargetSiteId) {
      ztteam_showToast('Vui lòng chọn Website WordPress đích', 'error');
      return;
    }
    try {
      setIsSubmittingBulkSource(true);
      /** Phân giải danh sách ID sang Database UUID nếu có để tối ưu tốc độ */
      const resolvedPageIds = selectedPageIds.map(selId => {
        const found = pages.find(p => p.id === selId || (p as any).internalId === selId);
        return (found as any)?.internalId || selId;
      });

      const res = await api.post('/facebook/pages/bulk-assign-sources', {
        pageIds: resolvedPageIds,
        targetSiteId: bulkTargetSiteId,
        targetCategoryId: bulkTargetCategoryId || null,
        mode: bulkSourceMode,
      });
      if (res.data?.success) {
        ztteam_showToast(res.data.message || 'Gán nguồn cào hàng loạt thành công!', 'success');
        setIsBulkSourceModalOpen(false);
        await ztteam_fetchPagesFromDB();
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi khi gán nguồn', 'error');
    } finally {
      setIsSubmittingBulkSource(false);
    }
  };

  /** Tải danh sách BGM & Mẫu Text Story khi mở Modal cài đặt hàng loạt */
  useEffect(() => {
    if (isBulkScheduleModalOpen) {
      if (bulkBgmList.length === 0) {
        api.get('media/bgm')
          .then(res => {
            if (res.data?.success && Array.isArray(res.data?.data)) {
              setBulkBgmList(res.data.data);
            }
          })
          .catch(() => {});
      }
      if (bulkTextStoryTemplates.length === 0) {
        api.get('templates?format=video')
          .then(res => {
            if (Array.isArray(res.data)) {
              const stories = res.data.filter((t: any) => t.content_type === 'text_story');
              setBulkTextStoryTemplates(stories);
            }
          })
          .catch(() => {});
      }
    }
  }, [isBulkScheduleModalOpen]);

  /** Xử lý Áp Dụng Cài Đặt Kiểu Video & Lịch Đăng Hàng Loạt */
  const handleBulkApplyScheduleSubmit = async () => {
    if (selectedPageIds.length === 0) {
      ztteam_showToast('Vui lòng chọn ít nhất 1 Fanpage', 'error');
      return;
    }
    try {
      setIsSubmittingBulkSchedule(true);
      /** Phân giải danh sách ID sang Database UUID nếu có để tối ưu tốc độ */
      const resolvedPageIds = selectedPageIds.map(selId => {
        const found = pages.find(p => p.id === selId || (p as any).internalId === selId);
        return (found as any)?.internalId || selId;
      });

      const res = await api.post('/facebook/pages/bulk-apply-schedule', {
        pageIds: resolvedPageIds,
        postsPerDay: bulkPostsPerDay,
        postFormat: bulkPostFormat,
        videoEngine: bulkVideoEngine,
        defaultReelTemplateId: bulkReelTemplateId,
        defaultBgm: bulkDefaultBgm || undefined,
        autoPublishEnabled: bulkAutoPublish,
        linkMode: bulkLinkMode,
        linkViewThreshold: bulkLinkViewThreshold,
        linkTargetPosition: bulkLinkTargetPosition,
        linkFallbackHours: bulkLinkFallbackHours,
        linkFallbackAction: bulkLinkFallbackAction,
      });
      if (res.data?.success) {
        ztteam_showToast(res.data.message || 'Áp dụng cài đặt hàng loạt thành công!', 'success');
        setIsBulkScheduleModalOpen(false);
        await ztteam_fetchPagesFromDB();
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi khi áp dụng cấu hình', 'error');
    } finally {
      setIsSubmittingBulkSchedule(false);
    }
  };

  /** Danh sách Fanpage mục tiêu áp dụng cho Bộ Nhận Diện AI */
  const bulkBrandingTargetPages = useMemo(() => {
    if (bulkBrandingTargetScope === 'bm') {
      if (!bulkBrandingBM) return [];
      return pages.filter(p => p.businessName === bulkBrandingBM && p.isActive !== false);
    }
    return pages.filter(p => selectedPageIds.includes(p.id) && p.isActive !== false);
  }, [bulkBrandingTargetScope, bulkBrandingBM, pages, selectedPageIds]);

  const bulkBrandingTargetIds = useMemo(() => {
    return bulkBrandingTargetPages.map(p => (p as any).internalId || p.id);
  }, [bulkBrandingTargetPages]);

  /** Xử lý cập nhật Hạng mục hàng loạt (theo BM hoặc Page đã chọn) */
  const handleBulkUpdateCategorySubmit = async () => {
    if (bulkBrandingTargetIds.length === 0) {
      ztteam_showToast('Vui lòng chọn ít nhất 1 Fanpage hoặc chọn Doanh Nghiệp (BM)', 'error');
      return;
    }
    if (!bulkBrandingCategory.trim()) {
      ztteam_showToast('Vui lòng chọn hoặc nhập Hạng mục cần áp dụng', 'error');
      return;
    }
    try {
      setIsSubmittingBulkCategory(true);
      setBulkBrandingProgressMsg('Đang lưu hạng mục và đồng bộ Facebook...');
      const res = await api.post('/facebook/pages/bulk-update-category', {
        pageIds: bulkBrandingTargetIds,
        category: bulkBrandingCategory.trim(),
      });
      if (res.data?.success) {
        ztteam_showToast(res.data.message || `Đã cập nhật hạng mục cho ${res.data.updatedCount || bulkBrandingTargetIds.length} Page!`, 'success');
        setBulkBrandingProgressMsg(`Đã cập nhật xong hạng mục "${bulkBrandingCategory.trim()}"`);
        await ztteam_fetchPagesFromDB();
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi cập nhật hạng mục', 'error');
      setBulkBrandingProgressMsg(null);
    } finally {
      setIsSubmittingBulkCategory(false);
    }
  };

  /** Xử lý tạo Bộ nhận diện AI hàng loạt bằng Gemini */
  const handleBulkGenerateBrandingSubmit = async () => {
    if (bulkBrandingTargetIds.length === 0) {
      ztteam_showToast('Vui lòng chọn ít nhất 1 Fanpage hoặc chọn Doanh Nghiệp (BM)', 'error');
      return;
    }
    try {
      setIsSubmittingBulkGenerate(true);
      setBulkBrandingProgressMsg(`Gemini đang tạo Avatar & Ảnh bìa 2K cho ${bulkBrandingTargetIds.length} Fanpage... Vui lòng đợi trong giây lát.`);
      const res = await api.post('/facebook/pages/branding/batch-generate', {
        pageIds: bulkBrandingTargetIds,
        overwriteExisting: bulkBrandingOverwrite,
      });
      if (res.data?.success) {
        ztteam_showToast(res.data.message || `Gemini đã tạo xong bộ nhận diện cho ${res.data.count || 0} Page!`, 'success');
        setBulkBrandingProgressMsg(`Hoàn tất: Gemini đã tạo thành công ảnh nhận diện 2K.`);
        await ztteam_fetchPagesFromDB();
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi khi tạo bộ nhận diện Gemini', 'error');
      setBulkBrandingProgressMsg(null);
    } finally {
      setIsSubmittingBulkGenerate(false);
    }
  };

  /** Xử lý gắn bộ nhận diện lên Facebook hàng loạt */
  const handleBulkApplyBrandingSubmit = async () => {
    if (bulkBrandingTargetIds.length === 0) {
      ztteam_showToast('Vui lòng chọn ít nhất 1 Fanpage hoặc chọn Doanh Nghiệp (BM)', 'error');
      return;
    }
    const confirm = await ztteam_showConfirm(
      'Gắn Bộ Nhận Diện Lên Facebook',
      `Bạn có chắc chắn muốn gắn Avatar & Ảnh bìa AI lên ${bulkBrandingTargetPages.length} Fanpage Facebook thật? Ảnh bìa sẽ được tải vào kho ẩn không tạo bài viết rác.`
    );
    if (!confirm) return;

    try {
      setIsSubmittingBulkApply(true);
      setBulkBrandingProgressMsg(`Đang gắn Avatar & Ảnh bìa lên ${bulkBrandingTargetIds.length} Fanpage Facebook thật...`);
      const res = await api.post('/facebook/pages/branding/batch-apply', {
        pageIds: bulkBrandingTargetIds,
      });
      if (res.data?.success) {
        ztteam_showToast(res.data.message || `Đã gắn thành công lên ${res.data.appliedCount || 0} Fanpage!`, 'success');
        setBulkBrandingProgressMsg(`Hoàn tất gắn lên Facebook (${res.data.appliedCount || 0} thành công)`);
        await ztteam_fetchPagesFromDB();
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi gắn lên Facebook', 'error');
      setBulkBrandingProgressMsg(null);
    } finally {
      setIsSubmittingBulkApply(false);
    }
  };

  useEffect(() => {
    const handleSDKLoad = () => {
      ztteam_checkLoginStatus();
    };

    if (window.FB) {
      ztteam_checkLoginStatus();
    } else {
      window.addEventListener('fbSDKLoaded', handleSDKLoad);
      return () => window.removeEventListener('fbSDKLoaded', handleSDKLoad);
    }
  }, []);

  useEffect(() => {
    ztteam_fetchPagesFromDB();
    ztteam_fetchAccounts();
    ztteam_fetchSites();
    api.get('templates?format=video')
      .then(res => {
        if (Array.isArray(res.data)) {
          const stories = res.data.filter((t: any) => t.content_type === 'text_story');
          setBulkTextStoryTemplates(stories);
        }
      })
      .catch(() => {});
  }, []);

  const handleTestPost = async (pageId: string) => {
    if (testingPageId) return;
    setTestingPageId(pageId);
    try {
      await ztteam_testPost(pageId, "Bài đăng thử nghiệm hệ thống AutoContent AI");
      ztteam_showToast("Đăng bài thành công!", 'success');
    } catch (error: any) {
      ztteam_showToast(error.message || "Lỗi khi đăng bài", 'error');
    } finally {
      setTestingPageId(null);
    }
  };

  const handleCheckHealth = async () => {
    try {
      setIsCheckingHealth(true);
      const res = await api.post('/facebook/accounts/check-health');
      if (res.data?.success) {
        ztteam_showToast('Đã kiểm tra xong sức khỏe Token Nick FB & Fanpage!', 'success');
        await ztteam_fetchPagesFromDB();
        await ztteam_fetchAccounts();
      }
    } catch (e: any) {
      ztteam_showToast('Lỗi kiểm tra Token Nick FB', 'error');
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleTogglePageActive = async (pageId: string, isActive: boolean) => {
    try {
      const res = await api.put(`/facebook/pages/${pageId}/toggle-active`, { isActive });
      if (res.data?.success) {
        ztteam_showToast(res.data.message || 'Cập nhật trạng thái Fanpage thành công', 'success');
        await ztteam_fetchPagesFromDB();
      }
    } catch (e: any) {
      ztteam_showToast(e.response?.data?.message || 'Có lỗi xảy ra', 'error');
    }
  };

  const handleDeleteAccount = async (accountId: string, accountName: string) => {
    const confirm = await ztteam_showConfirm(
      'Xóa Nick Facebook',
      `Bạn có chắc chắn muốn xóa Nick Facebook "${accountName}" khỏi hệ thống?`
    );
    if (!confirm) return;

    try {
      await ztteam_deleteAccount(accountId);
      ztteam_showToast(`Đã xóa Nick Facebook ${accountName} thành công`, 'success');
    } catch (e: any) {
      ztteam_showToast(e.message || 'Lỗi khi xóa Nick Facebook', 'error');
    }
  };

  const expiredPages = pages.filter(p => p.isActive !== false && p.status === 'expired');
  const expiredPagesCount = expiredPages.length;
  const totalFollowers = activePages.reduce((acc, p) => acc + (p.followersCount || 0), 0);
  const formattedFollowers = totalFollowers > 1000000 ? (totalFollowers / 1000000).toFixed(1) + 'M' :
    totalFollowers > 1000 ? (totalFollowers / 1000).toFixed(1) + 'k' : totalFollowers;

  return (
    <div className="w-full space-y-6">

      {/* Header Banner */}
      <div className="bg-fb-surface rounded-2xl shadow-lg p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-fb-text tracking-tight">Quản Lý Fanpage</h2>
          <p className="text-sm font-medium text-fb-text-muted mt-1">Theo dõi trạng thái, cấu hình tự động đăng bài &amp; tạo Reels AI.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full sm:w-auto">
          {/** Hàng 1 trên Mobile: 2 nút Quản lý nick & Quét lỗi */}
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
            <button
              onClick={() => {
                ztteam_fetchAccounts();
                setIsAccountsModalOpen(true);
              }}
              className="px-3.5 py-2 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text rounded-full text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors w-full"
            >
              <span className="material-symbols-outlined text-base">manage_accounts</span>
              <span className="truncate">Quản Lý Nick ({accounts.length})</span>
            </button>

            <button
              onClick={handleCheckHealth}
              disabled={isCheckingHealth}
              className="px-3.5 py-2 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text rounded-full text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 w-full"
            >
              <span className={`material-symbols-outlined text-base text-emerald-400 ${isCheckingHealth ? 'animate-spin' : ''}`}>health_and_safety</span>
              <span className="truncate">Quét Lỗi Token</span>
            </button>

            <button
              onClick={() => navigate('/facebook/business-hub')}
              className="px-3.5 py-2 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 rounded-full text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors border border-blue-500/30 col-span-2 sm:col-span-1"
              title="Mở Quản Lý Doanh Nghiệp (BM) & Token Vĩnh Viễn"
            >
              <span className="material-symbols-outlined text-base">domain</span>
              <span className="truncate">Quản Lý BM &amp; App</span>
            </button>
          </div>

          {/** Hàng 2 trên Mobile: Nút Kết nối thêm */}
          <button
            onClick={ztteam_loginWithFacebook}
            disabled={isLoading}
            className="w-full sm:w-auto justify-center bg-gradient-to-r from-fb-blue to-cyan-500 hover:opacity-90 text-white px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
          >
            {isLoading ? (
              <span className="material-symbols-outlined text-lg animate-spin">sync</span>
            ) : (
              <span className="material-symbols-outlined text-lg [font-variation-settings:'FILL'_1]">qr_code_2</span>
            )}
            <span>{isConnected ? 'Kết Nối Thêm FB' : 'Kết Nối Facebook'}</span>
          </button>
        </div>
      </div>

      {/* Early Warning Banner */}
      {expiredPagesCount > 0 && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">error</span>
            </div>
            <div>
              <p className="font-extrabold text-sm text-red-400"><span className="material-symbols-outlined text-[18px] text-rose-400 align-middle mr-1">warning</span>CẢNH BÁO: Phát hiện {expiredPagesCount} Fanpage bị lỗi Token!</p>
              <p className="text-xs text-red-300 mt-0.5">Token hết hạn hoặc Nick bị checkpoint. Vui lòng "Quét Lỗi Token" &amp; Kết nối lại ngay để không làm gián đoạn tự động hóa.</p>
              {expiredPages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                  <span className="text-[11px] text-red-300/80 font-medium">Trang lỗi:</span>
                  {expiredPages.map(p => (
                    <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/20 text-red-300 text-xs font-bold border border-red-500/30">
                      <span className="material-symbols-outlined text-[13px]">flag</span>
                      {p.name} {p.businessName ? `(${p.businessName})` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleCheckHealth}
            disabled={isCheckingHealth}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold text-xs shrink-0 flex items-center gap-1.5 transition-colors shadow-lg shadow-red-500/20 disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-sm ${isCheckingHealth ? 'animate-spin' : ''}`}>sync</span>
            Xử Lý Lỗi
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
          <span className="material-symbols-outlined text-red-500 [font-variation-settings:'FILL'_1]">warning</span>
          <p className="text-red-400 text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Summary Cards Grid (2 cột trên Mobile, 4 cột trên Desktop) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/** Card 1: Tổng Fanpage */}
        <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-blue-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] sm:text-xs font-black text-blue-400 uppercase tracking-wider">Tổng Fanpage</p>
              <h3 className="text-2xl sm:text-3xl font-black text-fb-text mt-1 group-hover:text-blue-300 transition-colors">
                {pages.length}
              </h3>
            </div>
            <div className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-blue-500 to-fb-blue text-white rounded-xl shadow-lg shadow-blue-500/30 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-xl sm:text-2xl">pages</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-fb-text-muted pt-1">
            <span>Đã kết nối: <b className="text-blue-400 font-bold">{pages.length} page</b></span>
            <span className="text-blue-400 font-bold hidden sm:inline">System</span>
          </div>
        </div>

        {/** Card 2: Đang Hoạt Động */}
        <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-emerald-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] sm:text-xs font-black text-emerald-400 uppercase tracking-wider">Đang Hoạt Động</p>
              <h3 className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1 group-hover:text-emerald-300 transition-colors">
                {activePages.length}
              </h3>
            </div>
            <div className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-emerald-400 to-teal-600 text-white rounded-xl shadow-lg shadow-emerald-500/30 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-xl sm:text-2xl">check_circle</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-fb-text-muted pt-1">
            <span>Active: <b className="text-emerald-300 font-bold">{pages.length > 0 ? Math.round((activePages.length / pages.length) * 100) : 0}%</b></span>
            <span className="text-emerald-400 font-bold hidden sm:inline">Auto Ready</span>
          </div>
        </div>

        {/** Card 3: Token Hết Hạn */}
        <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-red-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] sm:text-xs font-black text-red-400 uppercase tracking-wider">Token Hết Hạn</p>
              <h3 className={`text-2xl sm:text-3xl font-black mt-1 transition-colors ${expiredPagesCount > 0 ? 'text-red-400 group-hover:text-red-300' : 'text-fb-text'}`}>
                {expiredPagesCount}
              </h3>
            </div>
            <div className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-red-500 to-rose-600 text-white rounded-xl shadow-lg shadow-red-500/30 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-xl sm:text-2xl">warning</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-fb-text-muted pt-1">
            <span>Trạng thái: <b className={expiredPagesCount > 0 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>{expiredPagesCount > 0 ? 'Cần gia hạn' : 'An toàn'}</b></span>
            <span className="text-red-400 font-bold hidden sm:inline">Token Check</span>
          </div>
        </div>

        {/** Card 4: Tổng Follower Active */}
        <div className="bg-gradient-to-br from-fb-surface via-fb-surface to-amber-950/30 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col justify-between group">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] sm:text-xs font-black text-amber-400 uppercase tracking-wider">Tổng Follower</p>
              <h3 className="text-2xl sm:text-3xl font-black text-amber-400 mt-1 group-hover:text-amber-300 transition-colors">
                {formattedFollowers}
              </h3>
            </div>
            <div className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-xl shadow-lg shadow-amber-500/30 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-xl sm:text-2xl">groups</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-fb-text-muted pt-1">
            <span>Followers: <b className="text-amber-300 font-bold">{formattedFollowers}</b></span>
            <span className="text-amber-400 font-bold hidden sm:inline">Audience</span>
          </div>
        </div>
      </div>

      {/* Filter Bar & Table Container */}
      <div className="bg-fb-surface rounded-2xl shadow-lg overflow-hidden border border-white/5">

        {/* Filter Tabs (Cân đối đầy đặn trên Mobile) */}
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 border-b border-fb-surface-hover/50">
          <div className="flex items-center gap-1.5 bg-fb-surface-hover p-1 rounded-full w-full sm:w-auto">
            <button
              onClick={() => setPageTab('active')}
              className={`flex-1 sm:flex-initial px-3.5 sm:px-4 py-1.5 rounded-full text-xs text-center transition-colors ${pageTab === 'active'
                ? 'bg-gradient-to-r from-fb-blue to-cyan-500 text-white font-bold shadow-md shadow-blue-500/20'
                : 'font-semibold text-fb-text-muted hover:text-fb-text hover:bg-white/5'
                }`}
            >
              Đang Hoạt Động ({activePages.length})
            </button>
            <button
              onClick={() => setPageTab('deactivated')}
              className={`flex-1 sm:flex-initial px-3.5 sm:px-4 py-1.5 rounded-full text-xs text-center transition-colors ${pageTab === 'deactivated'
                ? 'bg-amber-500/20 text-amber-400 font-bold shadow-md'
                : 'font-semibold text-fb-text-muted hover:text-fb-text hover:bg-white/5'
                }`}
            >
              Đã Tắt ({deactivatedPages.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <div className="relative flex-1 sm:w-56">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-fb-text-muted text-sm">search</span>
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Tìm tên hoặc ID Page..."
                className="w-full pl-9 pr-3 py-1.5 bg-fb-surface-hover/80 border border-slate-700/60 rounded-full text-xs text-fb-text placeholder-fb-text-muted focus:outline-none focus:border-fb-blue transition-colors"
              />
              {filterSearch && (
                <button onClick={() => setFilterSearch('')} className="absolute right-2.5 top-2 text-fb-text-muted hover:text-white">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>

            {uniqueBusinesses.length > 0 && (
              <CustomDropdown
                value={filterBusiness}
                onChange={(val) => setFilterBusiness(val)}
                options={[
                  { value: '', label: 'Tất cả Doanh Nghiệp (BM)' },
                  ...uniqueBusinesses.map((bName: any) => ({ value: bName, label: bName }))
                ]}
                className="flex-1 sm:w-48"
              />
            )}
            {uniqueOwners.length > 0 && (
              <CustomDropdown
                value={filterOwner}
                onChange={(val) => setFilterOwner(val)}
                options={[
                  { value: '', label: 'Tất cả Nick' },
                  ...uniqueOwners.map((owner: any) => ({ value: owner, label: owner }))
                ]}
                className="flex-1 sm:w-40"
              />
            )}
            <button onClick={() => ztteam_fetchPagesFromDB()} disabled={isLoading} className="px-3 py-2 rounded-full bg-fb-surface-hover text-fb-text-muted hover:text-fb-text text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors shrink-0">
              <span className={`material-symbols-outlined text-base shrink-0 ${isLoading ? 'animate-spin' : ''}`}>refresh</span>
            </button>
          </div>
        </div>

        {/** Thanh Thao Tác Chọn Hàng Loạt Nhanh */}
        <div className="px-4 sm:px-5 py-2.5 bg-fb-surface-hover/20 border-b border-fb-surface-hover/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSelectAllCurrentTab}
              className="px-3 py-1 rounded-lg bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text font-bold flex items-center gap-1.5 transition-colors border border-slate-700/50"
            >
              <span className="material-symbols-outlined text-base text-blue-400">
                {currentTabPages.length > 0 && currentTabPages.every(p => selectedPageIds.includes(p.id)) ? 'check_box' : 'check_box_outline_blank'}
              </span>
              <span>
                {currentTabPages.length > 0 && currentTabPages.every(p => selectedPageIds.includes(p.id))
                  ? 'Bỏ chọn tất cả'
                  : `Chọn tất cả (${currentTabPages.length} Page)`}
              </span>
            </button>

            {filterBusiness && (
              <button
                onClick={() => handleSelectByBM(filterBusiness)}
                className="px-3 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 font-bold flex items-center gap-1.5 transition-colors border border-blue-500/30"
              >
                <span className="material-symbols-outlined text-sm">corporate_fare</span>
                <span>Chọn cả BM: {filterBusiness}</span>
              </button>
            )}

            {filterOwner && (
              <button
                onClick={() => handleSelectByOwner(filterOwner)}
                className="px-3 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 font-bold flex items-center gap-1.5 transition-colors border border-cyan-500/30"
              >
                <span className="material-symbols-outlined text-sm">person</span>
                <span>Chọn cả Nick: {filterOwner}</span>
              </button>
            )}

            {/** Phím tắt Thao Tác Hàng Loạt Nhanh */}
            <div className="flex items-center gap-1.5 pl-1 border-l border-slate-700/60">
              <button
                onClick={() => {
                  if (selectedPageIds.length === 0) {
                    handleSelectAllCurrentTab();
                  }
                  setBulkVideoEngine('text_story');
                  setIsBulkScheduleModalOpen(true);
                }}
                className="px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-bold flex items-center gap-1.5 transition-colors border border-emerald-500/40"
                title="Áp dụng lịch 4 bài/ngày rải lệch 2 phút cho các Page đã chọn hoặc toàn bộ Page"
              >
                <span className="material-symbols-outlined text-sm">schedule</span>
                <span>Lịch Đăng Chuẩn (Lệch 2p)</span>
              </button>

              <button
                onClick={() => {
                  if (selectedPageIds.length === 0) {
                    handleSelectAllCurrentTab();
                  }
                  setIsBulkSourceModalOpen(true);
                }}
                className="px-3 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 font-bold flex items-center gap-1.5 transition-colors border border-blue-500/40"
                title="Gán website WordPress nguồn cho các Page đã chọn hoặc toàn bộ Page"
              >
                <span className="material-symbols-outlined text-sm">rss_feed</span>
                <span>Gán Nguồn Cào</span>
              </button>

              <button
                onClick={() => {
                  if (selectedPageIds.length === 0 && filterBusiness) {
                    setBulkBrandingTargetScope('bm');
                    setBulkBrandingBM(filterBusiness);
                  } else if (selectedPageIds.length === 0) {
                    setBulkBrandingTargetScope('selected');
                    handleSelectAllCurrentTab();
                  } else {
                    setBulkBrandingTargetScope('selected');
                  }
                  setIsBulkBrandingModalOpen(true);
                }}
                className="px-3 py-1 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 font-bold flex items-center gap-1.5 transition-colors border border-cyan-500/40"
                title="Thay đổi Hạng mục & Sáng tạo bộ nhận diện AI bằng Gemini cho từng BM hoặc Page đã chọn"
              >
                <span className="material-symbols-outlined text-sm">palette</span>
                <span>Bộ Nhận Diện AI (Gemini)</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-fb-text-muted">
            <span>Đang chọn: <b className="text-white font-bold">{selectedPageIds.length}</b> / {pages.length} Fanpage</span>
            {selectedPageIds.length > 0 && (
              <button
                onClick={() => setSelectedPageIds([])}
                className="text-red-400 hover:text-red-300 font-medium underline ml-1"
              >
                Xóa chọn
              </button>
            )}
          </div>
        </div>

        {/** Bố cục Grid Card đa cột (Desktop & Mobile) */}
        <div className="p-4 sm:p-5">
          {currentTabPages.length === 0 ? (
            <div className="py-16 text-center text-fb-text-muted">
              <span className="material-symbols-outlined text-5xl mb-2 opacity-40">inbox</span>
              <p className="font-bold text-base text-fb-text">Không có Fanpage nào</p>
              <p className="text-xs text-fb-text-muted mt-1">Fanpage được kết nối sẽ hiển thị tại đây.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {currentTabPages.map(page => (
                <FanpageCard
                  key={page.id}
                  page={page}
                  isExpired={page.status === 'expired'}
                  testingPageId={testingPageId}
                  handleTestPost={handleTestPost}
                  handleToggleActive={handleTogglePageActive}
                  isSelected={selectedPageIds.includes(page.id)}
                  onToggleSelect={handleToggleSelectPage}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Health Alerts Section */}
      {(expiredPagesCount > 0) && (
        <div className="mt-8 grid grid-cols-1 gap-5">
          <div className="p-5 bg-red-500/10 rounded-2xl flex gap-4 items-start">
            <div className="w-11 h-11 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-400 shrink-0 shadow-md">
              <span className="material-symbols-outlined text-2xl">report</span>
            </div>
            <div>
              <h4 className="font-extrabold text-base text-fb-text">Cảnh báo Token hết hạn</h4>
              <p className="text-xs text-fb-text-muted mt-1">
                {expiredPagesCount} Fanpage của bạn cần được kết nối lại để tiếp tục quy trình tự động hóa Reels:
                {' '}
                <span className="text-red-300 font-semibold">
                  {expiredPages.map(p => `${p.name} (${p.businessName || 'Cá nhân'})`).join(', ')}
                </span>
              </p>
              <button onClick={ztteam_loginWithFacebook} className="mt-3 text-red-400 hover:text-red-300 font-bold text-xs flex items-center gap-1">
                <span>Gia hạn tất cả ngay</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/** ACCOUNTS MANAGEMENT MODAL: Quản Lý Danh Sách Nick Facebook */}
      {isAccountsModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-fb-surface w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-5 max-h-[85vh] flex flex-col">
            {/** Header Modal */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center shadow-md">
                  <span className="material-symbols-outlined text-2xl">account_circle</span>
                </div>
                <div>
                  <h4 className="text-lg font-black text-fb-text tracking-tight">Quản Lý Danh Sách Nick FB</h4>
                  <p className="text-xs text-fb-text-muted mt-0.5">Xem và hủy kết nối các tài khoản Facebook cá nhân đã liên kết</p>
                </div>
              </div>
              <button
                onClick={() => setIsAccountsModalOpen(false)}
                className="w-9 h-9 rounded-full bg-fb-surface-hover text-fb-text-muted hover:text-white hover:bg-fb-surface-hover/80 flex items-center justify-center p-0 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/** Content List */}
            <div className="overflow-y-auto space-y-3 flex-1 pr-1 custom-scrollbar">
              {accounts.length === 0 ? (
                <div className="py-12 text-center text-fb-text-muted">
                  <span className="material-symbols-outlined text-5xl mb-2 opacity-40">person_off</span>
                  <p className="font-bold text-sm text-fb-text">Chưa có tài khoản Facebook nào kết nối</p>
                </div>
              ) : (
                accounts.map(acc => {
                  const isExpired = acc.status === 'expired';
                  return (
                    <div key={acc.id} className="p-4 rounded-2xl bg-fb-surface-hover/40 flex items-center justify-between gap-3 hover:bg-fb-surface-hover/80 transition-colors">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white flex items-center justify-center shrink-0 font-black text-base shadow-md">
                          {acc.name ? acc.name[0].toUpperCase() : 'FB'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-extrabold text-sm text-fb-text truncate">{acc.name || 'Nick Facebook'}</p>
                          <div className="flex items-center gap-2 text-xs text-fb-text-muted mt-0.5 font-medium">
                            <span className="font-bold text-blue-400">
                              {acc.pagesCount > 0 ? `${acc.pagesCount} Fanpage` : '0 Fanpage (Rỗng)'}
                            </span>
                            <span>•</span>
                            <span>ID: {acc.fbUserId || acc.id.substring(0, 8)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        {isExpired ? (
                          <span className="px-3 py-1 bg-red-500/15 text-red-400 rounded-full text-xs font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            Token Lỗi
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-emerald-500/15 text-emerald-400 rounded-full text-xs font-bold flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            Connected
                          </span>
                        )}
                        <button
                          onClick={() => handleDeleteAccount(acc.id, acc.name)}
                          className="px-3.5 py-1.5 bg-red-500/15 text-red-400 hover:bg-red-500 hover:text-white rounded-full font-bold text-xs flex items-center gap-1 transition-colors"
                          title="Xóa / Hủy kết nối Nick FB này"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                          Xóa Nick
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/** Footer Modal */}
            <div className="pt-2 flex items-center justify-between text-xs text-fb-text-muted font-medium">
              <span>Tổng cộng: <b className="text-fb-text font-bold">{accounts.length} Nick FB</b></span>
              <button
                onClick={() => setIsAccountsModalOpen(false)}
                className="px-5 py-2 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text font-bold rounded-full transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/** FLOATING BULK ACTION BAR KHI CÓ CHỌN PAGE */}
      {selectedPageIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 sm:gap-5 max-w-[95vw] sm:max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2 pr-2 border-r border-slate-700/60 shrink-0">
            <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-fb-blue to-cyan-500 text-white text-xs font-black flex items-center justify-center shadow-md shadow-blue-500/20">
              {selectedPageIds.length}
            </span>
            <span className="text-xs sm:text-sm font-bold text-white whitespace-nowrap">
              Đã chọn {selectedPageIds.length} Page
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsBulkSourceModalOpen(true)}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:opacity-90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-base">rss_feed</span>
              <span>Gán Nguồn Cào</span>
            </button>

            <button
              onClick={() => {
                setBulkVideoEngine('text_story');
                setIsBulkScheduleModalOpen(true);
              }}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-base">tune</span>
              <span>Cài Đặt Lịch & Kiểu Video</span>
            </button>

            <button
              onClick={() => {
                setBulkBrandingTargetScope('selected');
                setIsBulkBrandingModalOpen(true);
              }}
              className="px-4 py-2 bg-gradient-to-r from-blue-700 via-cyan-600 to-blue-600 hover:opacity-90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-base">palette</span>
              <span>Bộ Nhận Diện AI (Gemini)</span>
            </button>

            <button
              onClick={() => setSelectedPageIds([])}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium flex items-center justify-center transition-colors border border-slate-700"
              title="Bỏ chọn tất cả"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>
      )}

      {/** MODAL GÁN NGUỒN CÀO HÀNG LOẠT */}
      {isBulkSourceModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-fb-surface w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-5 border border-slate-700/60 flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-fb-surface-hover/50">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shadow-md">
                  <span className="material-symbols-outlined text-xl">rss_feed</span>
                </div>
                <div>
                  <h3 className="font-black text-lg text-fb-text">Gán Nguồn Cào Hàng Loạt</h3>
                  <p className="text-xs text-fb-text-muted">Áp dụng cho <b className="text-blue-400">{selectedPageIds.length} Fanpage</b> đã chọn</p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkSourceModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-fb-surface-hover flex items-center justify-center text-fb-text-muted hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <div className="space-y-4">
              {/** Chọn Website WordPress đích */}
              <div>
                <label className="block text-xs font-bold text-fb-text mb-1.5">
                  1. Chọn Website WordPress Đích <span className="text-red-400">*</span>
                </label>
                <CustomDropdown
                  value={bulkTargetSiteId}
                  onChange={(val) => setBulkTargetSiteId(val)}
                  options={[
                    { value: '', label: '-- Chọn Website WordPress --' },
                    ...sites.map(s => ({
                      value: s.id,
                      label: `${s.wp_url} (${s.wp_username})`
                    }))
                  ]}
                  className="w-full"
                />
              </div>

              {/** Chọn Chuyên Mục WordPress */}
              <div>
                <label className="block text-xs font-bold text-fb-text mb-1.5 flex items-center justify-between">
                  <span>2. Chọn Chuyên Mục Nhận Bài</span>
                  {isLoadingCategories && <span className="text-[10px] text-cyan-400 animate-pulse">Đang tải danh mục...</span>}
                </label>
                <CustomDropdown
                  value={bulkTargetCategoryId}
                  onChange={(val) => setBulkTargetCategoryId(val)}
                  options={[
                    { value: '', label: 'Tất cả chuyên mục (Nhận toàn bộ bài cào)' },
                    ...bulkCategories.map(c => ({
                      value: String(c.id),
                      label: `${c.name} (${c.count || 0} bài)`
                    }))
                  ]}
                  disabled={!bulkTargetSiteId || isLoadingCategories}
                  className="w-full"
                />
                <p className="text-[11px] text-fb-text-muted mt-1 italic">
                  * Nếu chọn "Tất cả chuyên mục", hệ thống Round-Robin sẽ phân phối mọi bài viết từ website này sang các Page đã chọn.
                </p>
              </div>

              {/** Chế độ gán nguồn */}
              <div>
                <label className="block text-xs font-bold text-fb-text mb-1.5">
                  3. Chế Độ Gán Nguồn
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div
                    onClick={() => setBulkSourceMode('replace')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      bulkSourceMode === 'replace'
                        ? 'bg-blue-500/15 border-blue-500/50 text-white font-bold'
                        : 'bg-slate-800/40 border-slate-700/60 text-fb-text-muted hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="material-symbols-outlined text-sm text-blue-400">sync</span>
                      <span>Thay thế nguồn cũ</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-normal leading-tight">
                      Xóa các nguồn cũ, chỉ nhận bài từ Website vừa chọn (Khuyên dùng để đồng bộ 100%).
                    </p>
                  </div>

                  <div
                    onClick={() => setBulkSourceMode('append')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      bulkSourceMode === 'append'
                        ? 'bg-blue-500/15 border-blue-500/50 text-white font-bold'
                        : 'bg-slate-800/40 border-slate-700/60 text-fb-text-muted hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="material-symbols-outlined text-sm text-cyan-400">add_circle</span>
                      <span>Gán thêm nguồn</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-normal leading-tight">
                      Giữ nguyên các nguồn cũ đã cài và bổ sung thêm Website này vào danh sách.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-fb-surface-hover/50 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setIsBulkSourceModalOpen(false)}
                disabled={isSubmittingBulkSource}
                className="px-4 py-2 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text font-bold rounded-xl text-xs transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleBulkAssignSourcesSubmit}
                disabled={isSubmittingBulkSource || !bulkTargetSiteId}
                className="px-5 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:opacity-90 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50"
              >
                {isSubmittingBulkSource ? (
                  <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                ) : (
                  <span className="material-symbols-outlined text-sm">done_all</span>
                )}
                <span>Xác nhận gán cho {selectedPageIds.length} Page</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/** MODAL ÁP DỤNG CÀI ĐẶT KIỂU VIDEO & LỊCH ĐĂNG HÀNG LOẠT (RẢI LỆCH 2 PHÚT TỪNG PAGE) */}
      {isBulkScheduleModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-fb-surface w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-5 border border-slate-700/60 flex flex-col max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-fb-surface-hover/50">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-md">
                  <span className="material-symbols-outlined text-xl">tune</span>
                </div>
                <div>
                  <h3 className="font-black text-lg text-fb-text">Cài Đặt Hàng Loạt: Kiểu Video & Lịch Đăng</h3>
                  <p className="text-xs text-fb-text-muted">Áp dụng cho <b className="text-emerald-400">{selectedPageIds.length} Fanpage</b> đã chọn</p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkScheduleModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-fb-surface-hover flex items-center justify-center text-fb-text-muted hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/** PHẦN 1: ĐỊNH DẠNG BÀI ĐĂNG & KIỂU TẠO VIDEO */}
              <div className="bg-fb-surface-hover/20 p-4 rounded-2xl border border-fb-surface-hover/40 space-y-3.5">
                <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase tracking-wider text-[11px]">
                  <span className="material-symbols-outlined text-base">movie_filter</span>
                  <span>1. Định Dạng Bài Đăng & Kiểu Tạo Video</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-fb-text mb-1.5">
                      Định Dạng Bài Đăng Chính
                    </label>
                    <CustomDropdown
                      value={bulkPostFormat}
                      onChange={(val) => setBulkPostFormat(val as any)}
                      options={[
                        { value: 'reel', label: 'Đăng Video (Reels Facebook)' },
                        { value: 'image', label: 'Đăng Ảnh 2K (Bài viết kèm ảnh AI 2K)' },
                        { value: 'mixed', label: 'Xen kẽ (Luân phiên Ảnh 2K & Reel)' },
                      ]}
                      className="w-full"
                    />
                  </div>

                  {(bulkPostFormat === 'reel' || bulkPostFormat === 'mixed') && (
                    <div>
                      <label className="block text-xs font-bold text-fb-text mb-1.5">
                        Nhạc Nền Video Reel (BGM)
                      </label>
                      <CustomDropdown
                        value={bulkDefaultBgm}
                        onChange={(val) => setBulkDefaultBgm(val)}
                        options={[
                          { value: '', label: '🎵 Ngẫu nhiên từ Thư Viện Âm Thanh (Khuyên dùng)' },
                          ...bulkBgmList.map(b => ({
                            value: b.filename,
                            label: `🎵 ${b.name} (${b.size_formatted})`
                          }))
                        ]}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/** Công Nghệ Tạo Video Reel & Mẫu Giao Diện (Tích hợp trọn gói trong 1 ô chọn) */}
                  {(bulkPostFormat === 'reel' || bulkPostFormat === 'mixed') && (
                    <div className="sm:col-span-2 bg-slate-900/60 p-3.5 rounded-xl border border-amber-500/25 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-amber-400 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px]">movie_filter</span>
                          <span>Công Nghệ Tạo Video Reel</span>
                        </label>
                        <span className="text-[10px] text-emerald-300 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          {bulkTextStoryTemplates.length} Mẫu Text Story Reel Sẵn Sàng
                        </span>
                      </div>
                      <CustomDropdown
                        value={
                          bulkVideoEngine === 'text_story'
                            ? (bulkReelTemplateId && bulkReelTemplateId !== 'random' ? `text_story:${bulkReelTemplateId}` : 'text_story:random')
                            : bulkVideoEngine
                        }
                        onChange={(val: string) => {
                          if (val.startsWith('text_story:')) {
                            setBulkVideoEngine('text_story');
                            const tplId = val.replace('text_story:', '');
                            setBulkReelTemplateId(tplId);
                          } else if (val === 'hook_image') {
                            setBulkVideoEngine('hook_image');
                            setBulkReelTemplateId('random');
                          } else if (val === 'muse') {
                            setBulkVideoEngine('muse');
                            setBulkReelTemplateId('random');
                          }
                        }}
                        options={[
                          {
                            value: 'text_story:random',
                            label: '🎲 Tự Động Phân Bổ Mẫu & Khóa Cứng Riêng Từng Page (Khuyên dùng)'
                          },
                          ...bulkTextStoryTemplates.map(t => ({
                            value: `text_story:${t.id}`,
                            label: `🔒 Text Story: ${t.name}`
                          })),
                          {
                            value: 'hook_image',
                            label: '🖼️ Tạo từ Ảnh Hook & Âm Nhạc (Sắc nét 1080x1920 10s - Cổ điển)'
                          },
                          {
                            value: 'muse',
                            label: '🤖 Tạo bằng Motion AI (Muse Motion Reel)'
                          }
                        ]}
                        className="w-full"
                      />
                      <p className="text-[11px] text-fb-text-muted leading-relaxed">
                        {bulkVideoEngine === 'text_story' && (bulkReelTemplateId === 'random' || !bulkReelTemplateId) && (
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">auto_awesome</span>
                            <span><b>Tự động phân bổ & Khóa cứng:</b> Hệ thống sẽ tự động phân bổ đều các mẫu Text Story riêng biệt cho từng Fanpage và <b>khóa cứng vĩnh viễn</b> cho Page đó cho đến khi bạn đổi lại.</span>
                          </span>
                        )}
                        {bulkVideoEngine === 'text_story' && bulkReelTemplateId && bulkReelTemplateId !== 'random' && (
                          <span className="text-cyan-400 font-medium">
                            🔒 <b>Khóa chung 1 mẫu:</b> Toàn bộ các Fanpage được chọn sẽ cùng khóa cứng duy nhất mẫu giao diện này.
                          </span>
                        )}
                        {bulkVideoEngine === 'hook_image' && (
                          <span>Tự động dùng ảnh 2K kết hợp kịch bản Hook 3 đoạn do AI tạo và hòa âm nhạc nền 10s cực nét.</span>
                        )}
                        {bulkVideoEngine === 'muse' && (
                          <span>Đưa bài viết vào hàng đợi để Worker Motion AI ngoài xử lý chuyển động.</span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/** PHẦN 2: CHỌN SỐ LƯỢNG BÀI ĐĂNG 1 NGÀY */}
              <div className="bg-fb-surface-hover/20 p-4 rounded-2xl border border-fb-surface-hover/40 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-wider text-[11px]">
                    <span className="material-symbols-outlined text-base">schedule</span>
                    <span>2. Chọn Số Lượng Bài Đăng 1 Ngày (Rải Lệch 2 Phút/Page)</span>
                  </div>
                  <span className="text-[10px] text-emerald-300 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Thuật toán chống spam 100%
                  </span>
                </div>

                {/** Bộ chọn nhanh số bài/ngày */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { count: 2, label: '2 bài / ngày', desc: '11:30, 20:00' },
                    { count: 3, label: '3 bài / ngày', desc: '08:00, 13:00, 19:30' },
                    { count: 4, label: '4 bài / ngày', desc: '05:00, 11:30, 16:30, 20:00' },
                    { count: 5, label: '5 bài / ngày', desc: '05:00, 09:30, 13:30, 17:30, 21:00' },
                    { count: 6, label: '6 bài / ngày', desc: '05:00, 08:30, 11:30, 14:30...' },
                  ].map(pkg => (
                    <button
                      key={pkg.count}
                      type="button"
                      onClick={() => setBulkPostsPerDay(pkg.count)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        bulkPostsPerDay === pkg.count
                          ? 'bg-emerald-500/20 border-emerald-500/60 text-white font-bold shadow-md shadow-emerald-500/10'
                          : 'bg-slate-800/40 border-slate-700/60 text-fb-text-muted hover:border-slate-500'
                      }`}
                    >
                      <span className={`block text-xs font-black ${bulkPostsPerDay === pkg.count ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {pkg.label}
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-0.5 truncate">
                        {pkg.desc}
                      </span>
                    </button>
                  ))}
                </div>

                {/** Bảng xem trước preview các mốc giờ rải lệch */}
                <div className="border border-slate-700/60 rounded-2xl overflow-hidden mt-3">
                  <div className="p-2.5 bg-slate-800/60 font-bold text-slate-300 text-[11px] border-b border-slate-700/60 flex items-center justify-between">
                    <span>Xem Trước Phân Bổ Giờ Cho {selectedPageIds.length} Page Đang Chọn:</span>
                    <span className="text-[10px] text-cyan-400 font-mono">Gói {bulkPostsPerDay} bài/ngày (+2p/page)</span>
                  </div>
                  <div className="divide-y divide-slate-800/70 text-[11px] max-h-48 overflow-y-auto">
                    {(() => {
                      const getTimes = (cnt: number) => {
                        switch (cnt) {
                          case 2: return ['11:30', '20:00'];
                          case 3: return ['08:00', '13:00', '19:30'];
                          case 5: return ['05:00', '09:30', '13:30', '17:30', '21:00'];
                          case 6: return ['05:00', '08:30', '11:30', '14:30', '17:30', '20:30'];
                          case 4:
                          default: return ['05:00', '11:30', '16:30', '20:00'];
                        }
                      };
                      const base = getTimes(bulkPostsPerDay);
                      const addMins = (t: string, m: number) => {
                        const [hh, mm] = t.split(':').map(Number);
                        const tot = hh * 60 + mm + m;
                        const nH = Math.floor(tot / 60) % 24;
                        const nM = tot % 60;
                        return `${String(nH).padStart(2, '0')}:${String(nM).padStart(2, '0')}`;
                      };

                      return selectedPageIds.slice(0, 6).map((selId, idx) => {
                        const pageObj = pages.find(p => p.id === selId || (p as any).internalId === selId);
                        const pName = pageObj?.name || `Page ${idx + 1}`;
                        const offset = idx * 2;
                        const stagTimes = base.map(t => addMins(t, offset));

                        return (
                          <div key={selId} className="p-2 bg-slate-900/40 flex items-center justify-between gap-2">
                            <span className="font-bold text-blue-400 truncate max-w-[160px]">
                              {pName} <span className="text-slate-500 font-mono text-[10px]">(+{offset}p)</span>
                            </span>
                            <div className="flex items-center gap-1.5 font-mono text-[11px] flex-wrap justify-end">
                              {stagTimes.map((tm, tIdx) => (
                                <span key={tIdx} className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400 font-bold border border-emerald-500/20">
                                  {tm}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      });
                    })()}
                    {selectedPageIds.length > 6 && (
                      <div className="p-2 bg-slate-900/20 text-center text-slate-400 text-[10px] italic">
                        ...và {selectedPageIds.length - 6} Fanpage còn lại tiếp tục được cộng dồn lệch +2 phút mỗi page.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/** PHẦN 3: TÙY CHỌN TỰ ĐỘNG ĐĂNG BÀI */}
              <div className="bg-fb-surface-hover/20 p-3.5 rounded-2xl border border-fb-surface-hover/40 flex items-center justify-between">
                <div>
                  <span className="font-bold text-fb-text block">Tự Động Xuất Bản (Auto Publish)</span>
                  <span className="text-[11px] text-fb-text-muted">
                    {bulkAutoPublish ? 'Bật: Bài viết hoàn thành sẽ tự động đăng lên Page theo đúng lịch giờ ở trên' : 'Tắt: Bài viết sẽ chờ trong hàng đợi để duyệt thủ công'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setBulkAutoPublish(!bulkAutoPublish)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    bulkAutoPublish ? 'bg-emerald-500' : 'bg-black/30 shadow-inner border border-white/5'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${bulkAutoPublish ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/** PHẦN 4: CƠ CHẾ ĐIỀU HƯỚNG LINK WEBSITE */}
              <div className="bg-fb-surface-hover/20 p-4 rounded-2xl border border-fb-surface-hover/40 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-cyan-400 text-[18px]">alt_route</span>
                    <span className="text-xs font-bold text-fb-text uppercase tracking-wider">Cơ chế điều hướng Link Website</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Áp dụng cho {selectedPageIds.length} Page
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-1">Phương thức điều hướng</label>
                  <CustomDropdown
                    value={bulkLinkMode}
                    onChange={(v: any) => setBulkLinkMode(v)}
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

                {/** Khi chọn Không thêm link */}
                {bulkLinkMode === 'none' && (
                  <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-[11px] text-emerald-200/90 leading-relaxed flex items-start gap-2.5 animate-in fade-in duration-150">
                    <span className="material-symbols-outlined text-emerald-400 text-[18px] mt-0.5 shrink-0">verified_user</span>
                    <div>
                      <strong className="text-emerald-300 block mb-0.5 font-bold">Chế độ không thêm link (100% Clean Video):</strong>
                      <span>Toàn bộ {selectedPageIds.length} Fanpage được chọn sẽ <b>hoàn toàn không chèn bất kỳ đường link nào</b> vào Mô tả (Caption) hay Bình luận (Comment). Giúp video đạt mức phân phối đề xuất cao nhất.</span>
                    </div>
                  </div>
                )}

                {/** Khi chọn Gắn link theo view */}
                {bulkLinkMode === 'view_threshold' && (
                  <div className="space-y-3 pt-2 border-t border-white/5 animate-in fade-in duration-150">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[10px] font-bold text-fb-text-muted uppercase">
                          Ngưỡng lượt xem kích hoạt (Views Threshold)
                        </label>
                        <span className="text-[11px] text-cyan-400 font-black">
                          {Number(bulkLinkViewThreshold).toLocaleString()} views
                        </span>
                      </div>
                      <input
                        type="number"
                        min="100"
                        step="100"
                        value={bulkLinkViewThreshold}
                        onChange={e => setBulkLinkViewThreshold(Math.max(100, parseInt(e.target.value, 10) || 100))}
                        className="w-full bg-fb-surface border border-fb-surface-hover/80 rounded-lg px-3 py-1.5 text-xs text-fb-text font-bold focus:border-fb-blue focus:outline-none"
                        placeholder="Nhập số view..."
                      />
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {[500, 1000, 2000, 5000, 10000].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setBulkLinkViewThreshold(v)}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${
                              bulkLinkViewThreshold === v
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
                          value={bulkLinkTargetPosition}
                          onChange={(v: any) => setBulkLinkTargetPosition(v)}
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
                          value={bulkLinkFallbackHours}
                          onChange={(v: any) => setBulkLinkFallbackHours(Number(v))}
                          options={[
                            { value: 12, label: 'Sau 12 giờ nếu chưa đủ view' },
                            { value: 24, label: 'Sau 24 giờ nếu chưa đủ view (Chuẩn)' },
                            { value: 48, label: 'Sau 48 giờ nếu chưa đủ view' },
                            { value: 0, label: 'Không giới hạn (Chỉ gắn khi đủ view)' }
                          ]}
                        />
                      </div>
                    </div>

                    {bulkLinkFallbackHours > 0 && (
                      <div>
                        <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-1">
                          Hành động khi hết thời gian Fallback
                        </label>
                        <CustomDropdown
                          value={bulkLinkFallbackAction}
                          onChange={(v: any) => setBulkLinkFallbackAction(v)}
                          options={[
                            { value: 'inject', label: '⚡ Tự động gắn link (Đảm bảo bài luôn có link điều hướng)' },
                            { value: 'skip', label: '🛡️ Bỏ qua, không gắn link (Giữ video sạch 100%)' }
                          ]}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/** Khi chọn Tương tác 2 bước */}
                {bulkLinkMode === 'delayed_2step' && (
                  <div className="space-y-2 text-[11px] text-fb-text-muted leading-relaxed animate-in fade-in duration-150">
                    <div className="flex items-start gap-2 bg-black/20 p-2.5 rounded-xl border border-white/5">
                      <span className="material-symbols-outlined text-cyan-400 text-[16px] mt-0.5 shrink-0">check_circle</span>
                      <div>
                        <strong className="text-fb-text block">Caption sạch — Tránh bị Facebook bóp tương tác:</strong>
                        <span>Không chèn link trực tiếp vào Caption. Tự động mồi bình luận "YES" sau 60p và Reply link sau 15p.</span>
                      </div>
                    </div>
                  </div>
                )}

                {/** Khi chọn Gắn ngay */}
                {bulkLinkMode === 'immediate' && (
                  <div className="space-y-3 pt-2 border-t border-white/5 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-[10px] font-bold text-fb-text-muted uppercase mb-1">
                        Vị trí gắn Link ngay khi đăng
                      </label>
                      <CustomDropdown
                        value={bulkLinkTargetPosition}
                        onChange={(v: any) => setBulkLinkTargetPosition(v)}
                        options={[
                          { value: 'comment', label: '💬 Bình luận (Đăng comment kèm link ngay sau khi video lên)' },
                          { value: 'caption', label: '📝 Chèn trực tiếp vào Caption mô tả video' },
                          { value: 'both', label: '🔥 Cả Bình luận & Caption' }
                        ]}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-fb-surface-hover/50 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setIsBulkScheduleModalOpen(false)}
                disabled={isSubmittingBulkSchedule}
                className="px-4 py-2 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text font-bold rounded-xl text-xs transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleBulkApplyScheduleSubmit}
                disabled={isSubmittingBulkSchedule}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingBulkSchedule ? (
                  <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                ) : (
                  <span className="material-symbols-outlined text-sm">done_all</span>
                )}
                <span>Xác nhận áp dụng cho {selectedPageIds.length} Page</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/** MODAL BỘ NHẬN DIỆN AI & HẠNG MỤC HÀNG LOẠT (THEO BM / ĐÃ CHỌN) */}
      {isBulkBrandingModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-fb-surface w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl space-y-5 border border-slate-700/60 flex flex-col">
            
            {/** Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-fb-surface-hover/50">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shadow-lg">
                  <span className="material-symbols-outlined text-2xl">palette</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-lg text-fb-text">Bộ Nhận Diện AI & Hạng Mục Fanpage</h3>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      Google Gemini 2K
                    </span>
                  </div>
                  <p className="text-xs text-fb-text-muted mt-0.5">
                    Đổi hạng mục hàng loạt, tự động tạo Avatar (1:1) & Ảnh bìa (16:9) bằng Gemini AI và gắn lên Facebook theo BM
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsBulkBrandingModalOpen(false);
                  setBulkBrandingProgressMsg(null);
                }}
                className="w-8 h-8 rounded-full hover:bg-fb-surface-hover flex items-center justify-center text-fb-text-muted hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/** Progress Notification Banner */}
            {bulkBrandingProgressMsg && (
              <div className="p-3 bg-blue-950/50 rounded-xl border border-blue-500/30 text-xs text-cyan-300 flex items-center gap-2.5 animate-pulse">
                <span className="material-symbols-outlined text-base shrink-0">info</span>
                <span>{bulkBrandingProgressMsg}</span>
              </div>
            )}

            <div className="space-y-5">
              {/** PHẦN 1: PHẠM VI ÁP DỤNG (THEO BM HOẶC PAGE ĐÃ CHỌN) */}
              <div className="p-4 bg-fb-surface-hover/30 rounded-2xl border border-fb-surface-hover/50 space-y-3">
                <label className="block text-xs font-bold text-fb-text uppercase tracking-wider">
                  1. Chọn Phạm Vi Áp Dụng
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkBrandingTargetScope('bm')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      bulkBrandingTargetScope === 'bm'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-md'
                        : 'bg-fb-surface-hover/40 border-transparent text-fb-text-muted hover:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">corporate_fare</span>
                    <span>Theo Doanh Nghiệp (BM)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBulkBrandingTargetScope('selected')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      bulkBrandingTargetScope === 'selected'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-md'
                        : 'bg-fb-surface-hover/40 border-transparent text-fb-text-muted hover:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">check_box</span>
                    <span>Các Page Đã Chọn ({selectedPageIds.length})</span>
                  </button>
                </div>

                {bulkBrandingTargetScope === 'bm' ? (
                  <div>
                    <label className="block text-[11px] font-bold text-fb-text-muted mb-1.5">
                      Chọn Doanh Nghiệp (BM) cần thao tác:
                    </label>
                    <CustomDropdown
                      value={bulkBrandingBM}
                      onChange={(val) => setBulkBrandingBM(String(val))}
                      options={[
                        { value: '', label: '-- Chọn Doanh Nghiệp (BM) --' },
                        ...uniqueBusinesses.map(bName => ({
                          value: bName,
                          label: `${bName} (${pages.filter(p => p.businessName === bName && p.isActive !== false).length} Fanpage)`
                        }))
                      ]}
                      className="w-full"
                    />
                  </div>
                ) : (
                  selectedPageIds.length === 0 && (
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-300 flex items-center justify-between">
                      <span>Bạn chưa tích chọn Fanpage nào ngoài danh sách.</span>
                      <button
                        type="button"
                        onClick={handleSelectAllCurrentTab}
                        className="font-bold underline hover:text-amber-200 ml-2"
                      >
                        Chọn tất cả ({currentTabPages.length} Page)
                      </button>
                    </div>
                  )
                )}

                <div className="flex items-center justify-between text-xs text-fb-text-muted pt-1">
                  <span>Số lượng Fanpage sẽ áp dụng:</span>
                  <span className="font-extrabold text-cyan-400 text-sm">
                    {bulkBrandingTargetPages.length} Fanpage
                  </span>
                </div>
              </div>

              {/** PHẦN 2: THAY ĐỔI HẠNG MỤC (CATEGORY) HÀNG LOẠT */}
              <div className="p-4 bg-fb-surface-hover/30 rounded-2xl border border-fb-surface-hover/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold flex items-center justify-center">1</span>
                    <span className="text-xs font-bold text-fb-text uppercase tracking-wider">Đổi Hạng Mục Page Hàng Loạt</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleBulkUpdateCategorySubmit}
                    disabled={isSubmittingBulkCategory || bulkBrandingTargetPages.length === 0}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50 shrink-0"
                  >
                    {isSubmittingBulkCategory ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                        <span>Đang Cập Nhật...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">save</span>
                        <span>Cập Nhật Hạng Mục</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-fb-text-muted leading-relaxed">
                  Lưu hạng mục mới vào cơ sở dữ liệu và gửi cập nhật Graph API lên Fanpage Facebook. Hạng mục này cũng sẽ được AI Gemini sử dụng trực tiếp để phác thảo ảnh Avatar và Bìa đúng chủ đề.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-fb-text mb-1">
                      Hạng mục mẫu phổ biến
                    </label>
                    <CustomDropdown
                      value={bulkBrandingCategory}
                      onChange={(val) => setBulkBrandingCategory(String(val))}
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
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-fb-text mb-1">
                      Hoặc nhập tùy chỉnh hạng mục / ID
                    </label>
                    <input
                      type="text"
                      value={bulkBrandingCategory}
                      onChange={(e) => setBulkBrandingCategory(e.target.value)}
                      placeholder="Ví dụ: Người sáng tạo nội dung số, Thẩm mỹ viện..."
                      className="w-full bg-fb-surface-hover/80 border border-fb-surface-hover focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-fb-text focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/** PHẦN 3: TỰ ĐỘNG TẠO BỘ NHẬN DIỆN BẰNG GEMINI 2K */}
              <div className="p-4 bg-fb-surface-hover/30 rounded-2xl border border-fb-surface-hover/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center">2</span>
                    <span className="text-xs font-bold text-fb-text uppercase tracking-wider">Tạo Lại Cả Bộ Nhận Diện (Gemini AI)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleBulkGenerateBrandingSubmit}
                    disabled={isSubmittingBulkGenerate || bulkBrandingTargetPages.length === 0}
                    className="px-4 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-90 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-95 transition-all disabled:opacity-50 shrink-0"
                  >
                    {isSubmittingBulkGenerate ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                        <span>Gemini Đang Tạo...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">auto_awesome</span>
                        <span>Tạo Lại Cả Bộ (Gemini)</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-fb-text-muted leading-relaxed">
                  Gemini sẽ quét ngữ cảnh từ Hạng mục, website nguồn WordPress và 3 bài viết gần nhất của từng Fanpage để tự động vẽ Avatar (1:1) và Ảnh bìa (16:9) đạt chuẩn độ phân giải 2K.
                </p>

                <label className="flex items-center gap-2.5 text-xs text-fb-text cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={bulkBrandingOverwrite}
                    onChange={(e) => setBulkBrandingOverwrite(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-0 focus:ring-offset-0 bg-slate-900 cursor-pointer"
                  />
                  <span>Vẽ lại cả những Fanpage đã từng có ảnh nhận diện (Ghi đè ảnh cũ)</span>
                </label>
              </div>

              {/** PHẦN 4: GẮN LÊN FACEBOOK HÀNG LOẠT */}
              <div className="p-4 bg-fb-surface-hover/30 rounded-2xl border border-fb-surface-hover/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">3</span>
                    <span className="text-xs font-bold text-fb-text uppercase tracking-wider">Gắn Lên Facebook Hàng Loạt</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleBulkApplyBrandingSubmit}
                    disabled={isSubmittingBulkApply || bulkBrandingTargetPages.length === 0}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50 shrink-0"
                  >
                    {isSubmittingBulkApply ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                        <span>Đang Gắn Lên FB...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">cloud_upload</span>
                        <span>Gắn Lên Fanpage Thật</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-fb-text-muted leading-relaxed">
                  Hệ thống sẽ tải ảnh bìa vào kho ảnh ẩn (<code className="text-cyan-400">published=false</code>) hoàn toàn <b>không tạo bài viết rác</b> trên bảng tin người theo dõi, đồng thời cập nhật ảnh đại diện Page.
                </p>
              </div>
            </div>

            {/** Modal Footer */}
            <div className="pt-3 border-t border-fb-surface-hover/50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsBulkBrandingModalOpen(false);
                  setBulkBrandingProgressMsg(null);
                }}
                className="px-5 py-2 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text font-bold rounded-xl text-xs transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
