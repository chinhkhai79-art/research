/**
 * English UI layer for YouTube Niche & Analyze Pro.
 *
 * This file only translates static interface text in the browser.
 * It does not change API logic, payment logic, saved data, analysis data,
 * YouTube IDs, URLs, or user-entered content.
 */

type Dict = Record<string, string>;

const EXACT: Dict = {
  // App / header
  'YouTube Niche & Analyze Pro (Văn Thế Web)': 'YouTube Niche & Analyze Pro (Van The Web)',
  'ĐĂNG XUẤT': 'LOG OUT',
  'Đăng xuất': 'Log out',
  'NÂNG CẤP THÊM': 'UPGRADE',
  'Nâng cấp thêm': 'Upgrade',
  'Nâng cấp': 'Upgrade',
  'LÀM MỚI': 'REFRESH',
  'Làm mới': 'Refresh',
  'Tài khoản & hạn sử dụng': 'Account & subscription',
  'Tài khoản': 'Account',
  'Hạn sử dụng': 'Subscription',
  'Đóng': 'Close',
  'Cài đặt': 'Settings',
  'CÀI ĐẶT': 'SETTINGS',
  'Lịch sử': 'History',
  'LỊCH SỬ': 'HISTORY',
  'PRO': 'PRO',

  // Top tabs
  'TÌM KÊNH & ĐÁNH GIÁ TỪ KHÓA': 'FIND CHANNELS & SCORE KEYWORDS',
  'PHÂN TÍCH ĐỐI THỦ (SPY)': 'COMPETITOR ANALYSIS (SPY)',
  'KIỂM TRA LINK VIDEO': 'CHECK VIDEO LINK',
  'THEO DÕI ĐỐI THỦ (TRACKING)': 'COMPETITOR TRACKING',
  'TÌM NGÁCH YOUTUBE': 'YOUTUBE NICHE RESEARCH',

  // API
  'HỆ THỐNG API': 'API SYSTEM',
  'YouTube V3:': 'YouTube V3:',
  'Gemini AI:': 'Gemini AI:',
  'Lịch sử YouTube API Key': 'YouTube API Key History',
  'Lịch sử Gemini Key': 'Gemini Key History',
  'Chọn nhiều key để dùng lại nhanh': 'Select multiple keys to reuse quickly',
  'Chọn nhiều key để xoay vòng': 'Select multiple keys for rotation',
  'Dùng 1 key': 'Use 1 key',
  'Dùng tất cả': 'Use all',
  'Tích chọn hết': 'Select all',
  'Bỏ chọn hết': 'Unselect all',
  'Xóa lịch sử': 'Clear history',
  'XÓA LỊCH SỬ': 'CLEAR HISTORY',
  'ĐANG SỬ DỤNG': 'IN USE',
  'LỖI / HẾT HẠN': 'ERROR / EXPIRED',
  'Không có dữ liệu lịch sử': 'No history data',
  'Bạn có chắc chắn muốn xóa toàn bộ lịch sử API Key không?': 'Are you sure you want to clear the entire API Key history?',
  'Bạn có chắc chắn muốn xóa toàn bộ lịch sử Gemini API Key không?': 'Are you sure you want to clear the entire Gemini API Key history?',
  'XÁC NHẬN XÓA': 'CONFIRM DELETE',
  'XÁC NHẬN': 'CONFIRM',
  'HỦY BỎ': 'CANCEL',
  'Hủy bỏ': 'Cancel',
  'Thiếu key': 'Missing key',
  'Key hợp lệ': 'Valid key',
  'Không rõ': 'Unknown',
  'Hết quota': 'Quota exhausted',
  'Model không được hỗ trợ': 'Unsupported model',
  'Project chưa có quyền model': 'Project has no model access',
  'Chưa bật Generative Language API': 'Generative Language API is not enabled',
  'Lỗi Gemini API': 'Gemini API error',
  'Cập nhật cấu hình': 'Update configuration',
  'CẬP NHẬT CẤU HÌNH': 'UPDATE CONFIGURATION',
  'Kiểm tra Key': 'Check key',
  'KIỂM TRA KEY': 'CHECK KEY',

  // Search / form
  'Từ khóa:': 'Keyword:',
  'Từ khóa': 'Keyword',
  'TỪ KHÓA': 'KEYWORD',
  'Khu vực:': 'Region:',
  'Khu vực': 'Region',
  'KHU VỰC': 'REGION',
  'Đăng trong:': 'Published within:',
  'Đăng trong': 'Published within',
  'Quốc gia': 'Country',
  'QUỐC GIA': 'COUNTRY',
  'Thời gian': 'Time range',
  'THỜI GIAN': 'TIME RANGE',
  'Số lượng phân tích': 'Analysis count',
  'SỐ LƯỢNG PHÂN TÍCH': 'ANALYSIS COUNT',
  'Hiển thị từ khóa': 'Show keywords',
  'HIỂN THỊ TỪ KHÓA': 'SHOW KEYWORDS',
  'Phạm vi sub': 'Subscriber range',
  'PHẠM VI SUB': 'SUBSCRIBER RANGE',
  'Tự động chuyển từ khóa cho đến khi đủ 10 Kênh': 'Automatically rotate keywords until 10 channels are found',
  'Săn kênh nhỏ / Mới Trend': 'Find small / newly trending channels',
  'Deep Drill: dưới 50.000 sub, 30 ngày': 'Deep Drill: under 50,000 subs, 30 days',
  'BẮT ĐẦU SĂN KÊNH': 'START CHANNEL HUNT',
  'PHÂN TÍCH NGAY': 'ANALYZE NOW',
  'Phân tích ngay': 'Analyze now',

  // Results table / cards
  'DANH SÁCH KÊNH QUÉT ĐƯỢC (TỰ ĐỘNG LỌC THEO ĐIỀU KIỆN)': 'SCANNED CHANNELS (AUTO FILTERED BY CONDITIONS)',
  'TỔNG:': 'TOTAL:',
  'Tải TXT': 'Download TXT',
  'TẢI TXT': 'DOWNLOAD TXT',
  'THEO DÕI TẤT CẢ': 'TRACK ALL',
  'XÓA TẤT CẢ': 'DELETE ALL',
  'STT': 'No.',
  'ICON': 'ICON',
  'TÊN KÊNH': 'CHANNEL NAME',
  'MÃ KÊNH': 'CHANNEL ID',
  'TỪ KHÓA/NGÁCH': 'KEYWORD/NICHE',
  'CHỦ ĐỀ': 'TOPIC',
  'THU NHẬP ($)': 'INCOME ($)',
  'URL': 'URL',
  'NGÀY TẠO': 'CREATED DATE',
  'TUỔI KÊNH': 'CHANNEL AGE',
  'SUB': 'SUBS',
  'VIEWS': 'VIEWS',
  'VIDEOS': 'VIDEOS',
  'ĐIỂM': 'SCORE',
  'THAO TÁC': 'ACTIONS',
  'Thao tác': 'Actions',
  'SPY': 'SPY',
  'CHECK': 'CHECK',
  'PHÂN TÍCH': 'ANALYZE',
  'Phân tích': 'Analyze',
  'Bóc tách kênh này': 'Analyze this channel',
  'BÓC TÁCH KÊNH NÀY': 'ANALYZE THIS CHANNEL',
  'Video Lọt Top Trending': 'Top trending videos',
  'VIDEO LỌT TOP TRENDING': 'TOP TRENDING VIDEOS',

  // Niche research sidebar
  'NICHE RESEARCH': 'NICHE RESEARCH',
  'TỪ KHÓA / NGÁCH RESEARCH': 'KEYWORD / NICHE RESEARCH',
  'XEM GỢI Ý NGÁCH': 'VIEW NICHE IDEAS',
  'CÔNG CỤ PHÂN TÍCH': 'ANALYSIS TOOLS',
  'Top Videos Trending': 'Top Trending Videos',
  'Kênh/Ngách Trending': 'Trending Channels/Niches',
  'Dashboard Tổng quan': 'Overview Dashboard',
  'Khám phá Shorts': 'Shorts Discovery',
  'Mẫu Thumbnail': 'Thumbnail Samples',
  'Lịch sử Nghiên cứu': 'Research History',
  'Tự động theo khu vực': 'Auto by region',
  'Dữ liệu hiện có': 'Existing data',

  // Niche region data
  'DỮ LIỆU NGÁCH THEO KHU VỰC': 'NICHE DATA BY REGION',
  'CHỌN KHU VỰC ĐỂ ĐỔI NGÔN NGỮ CHỦ ĐỀ/KEY. BẤM KÍNH LÚP TỪNG CHỦ ĐỀ ĐỂ TÌM KEY ĐÚNG KHU VỰC; ƯU TIÊN 30 NGÀY, NẾU THIẾU DỮ LIỆU SẼ MỞ RỘNG TOÀN THỜI GIAN.': 'CHOOSE A REGION TO CHANGE TOPIC/KEYWORD LANGUAGE. CLICK THE MAGNIFIER ON EACH TOPIC TO FIND REGION-MATCHED KEYWORDS; PRIORITIZE 30 DAYS, EXPAND TO ALL TIME IF DATA IS LIMITED.',
  'CẬP NHẬT:': 'UPDATED:',
  'LƯU TREND HOT ĐÃ QUÉT': 'SAVE SCANNED HOT TRENDS',
  'Đang lưu...': 'Saving...',
  'Đang cập nhật': 'Updating',
  'Chưa có dữ liệu': 'No data yet',

  // Channel/topic suggestions
  'GỢI Ý NGÁCH & CHỦ ĐỀ KÊNH': 'NICHE & CHANNEL TOPIC SUGGESTIONS',
  'Lấy chủ đề hiện tại, khu vực, ngôn ngữ và video liên quan theo dữ liệu thật.': 'Uses the current topic, region, language, and related videos from real data.',
  'Chủ đề': 'Topic',
  'Ngôn ngữ': 'Language',
  'NGÔN NGỮ': 'LANGUAGE',
  'Số ngách': 'Niches',
  'SỐ NGÁCH': 'NICHES',
  'VPH cao nhất': 'Highest VPH',
  'VPH CAO NHẤT': 'HIGHEST VPH',
  'Tổng view mẫu': 'Sample total views',
  'TỔNG VIEW MẪU': 'SAMPLE TOTAL VIEWS',
  'Video liên quan': 'Related videos',
  'VIDEO LIÊN QUAN': 'RELATED VIDEOS',
  'Ngách lấy ưu tiên từ kênh khác cùng chủ đề.': 'Niche prioritized from other channels in the same topic.',
  'Nguồn:': 'Source:',
  'Tiềm năng:': 'Potential:',
  'Cạnh tranh:': 'Competition:',
  'Điểm': 'Score',
  'VPH TB': 'Avg VPH',
  'Tổng view': 'Total views',
  'Video trend': 'Trending videos',
  'Hiển thị tối đa 6 video': 'Showing up to 6 videos',
  'Xem': 'Watch',
  'Phân tích video này': 'Analyze this video',
  'Chưa có dữ liệu gợi ý ngách phù hợp. Hãy thử tăng số lượng phân tích hoặc đổi từ khóa.': 'No suitable niche suggestion data yet. Try increasing the analysis count or changing the keyword.',
  'Rất cao': 'Very high',
  'Cao': 'High',
  'Trung bình': 'Medium',
  'Thấp': 'Low',

  // Trending videos
  'VIDEO TRENDING:': 'TRENDING VIDEO:',
  'DANH SÁCH CÁC VIDEO CÓ TREND SCORE > 60 CHỨA TỪ KHÓA NÀY': 'VIDEOS WITH TREND SCORE > 60 CONTAINING THIS KEYWORD',
  'Video mới nhất từ kênh': 'Latest videos from channel',
  'VIDEO MỚI NHẤT TỪ KÊNH': 'LATEST VIDEOS FROM CHANNEL',
  'THUMB': 'THUMB',
  'VIDEO ID': 'VIDEO ID',
  'TIÊU ĐỀ': 'TITLE',
  'NGÀY ĐĂNG': 'PUBLISHED DATE',
  'OUTLIER SCORE': 'OUTLIER SCORE',
  'TĂNG VIEW/NGÀY': 'VIEW GROWTH/DAY',
  'Link': 'Link',

  // Video / audit
  'PHÂN TÍCH VIDEO': 'VIDEO ANALYSIS',
  'Phân tích video': 'Analyze video',
  'Xem video': 'Watch video',
  'Xem video trực tiếp trong app': 'Watch video in app',
  'Phát Shorts': 'Play Shorts',
  'PHÁT SHORTS': 'PLAY SHORTS',
  'Mở video': 'Open video',
  'Xem ảnh gốc': 'View original image',
  'Phân tích chi tiết': 'Detailed analysis',
  'Lượt xem': 'Views',
  'Bình luận': 'Comments',
  'Ngày đăng': 'Published date',
  'Người đăng': 'Publisher',
  'NGƯỜI ĐĂNG': 'PUBLISHER',

  // Tracking / saved
  'LỊCH SỬ NGHIÊN CỨU': 'RESEARCH HISTORY',
  'Lưu': 'Save',
  'LƯU': 'SAVE',
  'Xóa': 'Delete',
  'XÓA': 'DELETE',
  'Xóa sạch': 'Clear',
  'Dọn dẹp kết quả': 'Clear results',
  'Xóa sạch TOÀN BỘ kết quả săn kênh hiện tại?': 'Delete ALL current channel hunt results?',
  'Đã xóa sạch kết quả.': 'Results cleared.',
  'Không tìm thấy video nào.': 'No videos found.',
  'Không có dữ liệu.': 'No data.',

  // Confirm / status
  'CẢNH BÁO LỖI KHI ĐANG QUÉT': 'SCAN ERROR WARNING',
  'Mẹo: Kiểm tra lại API Key xem có bị hết hạn hoặc sai cú pháp không. Hoặc thử đổi vùng quét (Region).': 'Tip: Check whether the API key is expired or malformed. Or try changing the scan region.',
  'Vui lòng thêm ít nhất một API Key trong phần cài đặt.': 'Please add at least one API Key in settings.',
  'Vui lòng nhập API Key YouTube V3 để cập nhật Trending.': 'Please enter a YouTube V3 API Key to update Trending.',
  'Vui lòng nhập API Key YouTube V3 trước khi quét ngách thật.': 'Please enter a YouTube V3 API Key before scanning real niches.',
  'Thiếu Gemini API Key. Vui lòng dán ít nhất 1 key.': 'Missing Gemini API Key. Please paste at least 1 key.',
  'Vui lòng dán ít nhất 1 Gemini API Key, mỗi key một dòng.': 'Please paste at least 1 Gemini API Key, one key per line.',
  'Không lấy được hạn dùng:': 'Could not fetch subscription:',
  'Lỗi kiểm tra hạn dùng:': 'Subscription check error:',
  'Thanh toán thành công!': 'Payment successful!',
  'Sẵn sàng.': 'Ready.',
  'Đang lấy dữ liệu thật từ YouTube API V3...': 'Fetching real data...',
  'Đang nghiên cứu ngách': 'Researching niche',
  'Tự động chọn ngách theo khu vực/thời gian': 'Auto-selecting niche by region/time',
  'Không tìm thấy dữ liệu thật từ YouTube API cho từ khóa này.': 'No real data found for this keyword.',
  'Không lấy được thông tin chi tiết video.': 'Could not fetch detailed video information.',
  'Đang tạo Gợi ý ngách & chủ đề kênh từ dữ liệu 3 tháng gần nhất...': 'Generating niche & channel topic suggestions from the last 3 months of data...',
  '3 tháng gần nhất chưa có dữ liệu phù hợp. Đang quét mở rộng toàn thời gian...': 'No suitable data in the last 3 months. Expanding scan to all time...',
  'Đang lưu các chủ đề đã quét key thật bằng YouTube Data API V3...': 'Saving topics scanned with real data...',
  'Chưa có chủ đề nào được quét bằng nút kính lúp. Hãy bấm icon kính lúp ở từng chủ đề trước, sau đó mới bấm Lưu trend hot đã quét để lưu.': 'No topic has been scanned with the magnifier yet. Click the magnifier for each topic first, then save scanned hot trends.',
  'Không lưu được danh sách trend hot đã quét. Vui lòng thử lại.': 'Could not save scanned hot trends. Please try again.',

  // Dates / filters
  '24 giờ qua': 'Last 24 hours',
  '7 ngày qua': 'Last 7 days',
  '14 ngày qua': 'Last 14 days',
  '30 ngày qua': 'Last 30 days',
  '90 ngày qua': 'Last 90 days',
  '1 năm qua': 'Last year',
  'Tuần này': 'This week',
  'Tháng này': 'This month',
  '3 tháng gần nhất': 'Last 3 months',
  'Toàn thời gian': 'All time',
  'Toàn cầu': 'Global',

  // Regions
  'Việt Nam': 'Vietnam',
  'Hoa Kỳ (Mỹ)': 'United States',
  'Hoa Kỳ': 'United States',
  'Vương quốc Anh': 'United Kingdom',
  'Ấn Độ': 'India',
  'Nhật Bản': 'Japan',
  'Hàn Quốc': 'South Korea',
  'Thái Lan': 'Thailand',
  'Indonesia': 'Indonesia',
  'Philippines': 'Philippines',
  'Malaysia': 'Malaysia',
  'Singapore': 'Singapore',
  'Đức': 'Germany',
  'Pháp': 'France',
  'Nga': 'Russia',
  'Brazil': 'Brazil',
  'Mexico': 'Mexico',
  'Úc': 'Australia',
  'Canada': 'Canada',
  'Tây Ban Nha': 'Spain',
  'Tiếng Việt': 'Vietnamese',
  'tiếng Việt': 'Vietnamese',
  'Tiếng Anh': 'English',
  'Tự động': 'Auto',

  // Suggested categories
  'PHÁT TRIỂN BẢN THÂN': 'SELF IMPROVEMENT',
  'SỨC KHỎE & LÀM ĐẸP': 'HEALTH & BEAUTY',
  'CÔNG NGHỆ & AI': 'TECHNOLOGY & AI',
  'GIÁO DỤC & HỌC TẬP': 'EDUCATION & LEARNING',
  'ẨM THỰC & NẤU ĂN': 'FOOD & COOKING',
  'DU LỊCH & KHÁM PHÁ': 'TRAVEL & DISCOVERY',
  'GIẢI TRÍ & HÀI HƯỚC': 'ENTERTAINMENT & COMEDY',
  'THỂ THAO & BÓNG ĐÁ': 'SPORTS & FOOTBALL',
  'PETS & ĐỘNG VẬT': 'PETS & ANIMALS',
  'GIA ĐÌNH & ĐỜI SỐNG': 'FAMILY & LIFESTYLE',
  'NGHỆ THUẬT & SÁNG TẠO': 'ART & CREATIVITY',
  'XE & CÔNG NGHỆ Ô TÔ': 'CARS & AUTO TECH',
  'TÀI CHÍNH & KIẾM TIỀN': 'FINANCE & MAKE MONEY',
  'REVIEW SẢN PHẨM': 'PRODUCT REVIEWS',
  'MARKETING & TRUYỀN THÔNG': 'MARKETING & MEDIA',

  // Common keywords shown as UI suggestions
  'vượt qua trì hoãn': 'overcome procrastination',
  'kỷ luật bản thân': 'self discipline',
  'thói quen thành công': 'success habits',
  'quản lý thời gian': 'time management',
  'tư duy tích cực': 'positive mindset',
  'năng suất cá nhân': 'personal productivity',
  'giảm cân tại nhà': 'weight loss at home',
  'yoga tại nhà': 'yoga at home',
  'skincare cơ bản': 'basic skincare',
  'ăn sạch sống khỏe': 'clean eating healthy living',
  'bài tập giảm mỡ': 'fat loss workout',
  'chăm sóc tóc': 'hair care',
  'công cụ AI mới': 'new AI tools',
  'hướng dẫn ChatGPT': 'ChatGPT tutorial',
  'ứng dụng AI': 'AI apps',
  'review điện thoại': 'phone review',
  'mẹo iPhone': 'iPhone tips',
  'tự động hóa AI': 'AI automation',
  'học tiếng Anh': 'learn English',
  'mẹo học nhanh': 'fast learning tips',
  'từ vựng IELTS': 'IELTS vocabulary',
  'tự học lập trình': 'learn coding',
  'ôn thi hiệu quả': 'effective exam prep',
  'kỹ năng ghi nhớ': 'memory skills',
  'món ngon dễ làm': 'easy delicious recipes',
  'nấu ăn gia đình': 'family cooking',
  'công thức món chay': 'vegetarian recipes',
  'bữa sáng nhanh': 'quick breakfast',
  'món ăn healthy': 'healthy dishes',
  'du lịch tự túc': 'self-guided travel',
  'địa điểm đẹp': 'beautiful places',
  'du lịch tiết kiệm': 'budget travel',
  'ẩm thực địa phương': 'local food',
  'cắm trại cuối tuần': 'weekend camping',
  'phim hài ngắn': 'short comedy films',
  'tóm tắt phim': 'movie recap',
  'meme hài hước': 'funny memes',
  'thử thách vui': 'fun challenges',
  'câu chuyện lạ': 'strange stories',
  'bóng đá hôm nay': 'football today',
  'highlight bóng đá': 'football highlights',
  'lịch thi đấu bóng đá': 'football schedule',
  'tin thể thao': 'sports news',
  'bài tập thể lực': 'fitness workout',
  'huấn luyện chó': 'dog training',
  'chăm sóc mèo': 'cat care',
  'thú cưng đáng yêu': 'cute pets',
  'thức ăn cho mèo': 'cat food',
  'vlog chó mèo': 'dog and cat vlog',
  'mẹo dọn nhà': 'cleaning hacks',
  'nuôi dạy con': 'parenting tips',
  'tài chính gia đình': 'family finance',
  'trang trí nhà nhỏ': 'small home decor',
  'mẹo nhà bếp': 'kitchen tips',
  'đời sống tối giản': 'minimalist lifestyle',
  'vẽ tranh dễ': 'easy drawing',
  'thiết kế Canva': 'Canva design',
  'chụp ảnh điện thoại': 'mobile photography',
  'guitar cơ bản': 'basic guitar',
  'ý tưởng sáng tạo': 'creative ideas',
  'review xe máy': 'motorbike review',
  'ô tô điện': 'electric cars',
  'kinh nghiệm mua xe': 'car buying tips',
  'phụ kiện ô tô': 'car accessories',
  'bảo dưỡng xe': 'car maintenance',
  'xe tiết kiệm xăng': 'fuel efficient cars',
  'kiếm tiền online': 'make money online',
  'quản lý tài chính': 'personal finance management',
  'đầu tư cho người mới': 'investing for beginners',
  'tiết kiệm tiền': 'save money',
  'unboxing sản phẩm': 'product unboxing',
  'review đồ công nghệ': 'tech product review',
  'review mỹ phẩm': 'cosmetic review',
  'đồ gia dụng thông minh': 'smart home gadgets',
  'sản phẩm viral': 'viral products',
  'mua gì đáng tiền': 'best value products',
  'xây kênh YouTube': 'build a YouTube channel',
  'SEO cơ bản': 'SEO basics',
  'chạy quảng cáo': 'run ads',
  'tăng trưởng TikTok': 'TikTok growth',
  'chiến lược nội dung': 'content strategy',
};

const REGEX_RULES: Array<[RegExp, string]> = [
  [/^(\d+)\s*Keys?\s*\((\d+)\s*Lỗi\)$/i, '$1 Keys ($2 Errors)'],
  [/^(\d+)\s*Key\s*\((\d+)\s*Lỗi\)$/i, '$1 Key ($2 Errors)'],
  [/^Cập nhật:\s*(.+)$/i, 'Updated: $1'],
  [/^Tổng:\s*(.+)$/i, 'Total: $1'],
  [/^Đã lưu\s+(.+)\s+chủ đề trend hot đã quét thật tại\s+(.+)\.*/i, 'Saved $1 scanned hot trend topics for $2.'],
  [/^Đã quét xong\s+(.+)\s+tại\s+(.+)\..*/i, 'Finished scanning $1 in $2.'],
  [/^Đang quét\s+(.+)\s+tại\s+(.+):.*/i, 'Scanning $1 in $2...'],
  [/^Đã cập nhật key cho\s+(.+)\..*/i, 'Updated keywords for $1.'],
  [/^Đang nghiên cứu ngách:\s*(.+)$/i, 'Researching niche: $1'],
  [/^Tự động chọn ngách theo khu vực\/thời gian:\s*(.+)$/i, 'Auto-selecting niche by region/time: $1'],
  [/^Thanh toán thành công!\s*Mã đơn:\s*(.+)$/i, 'Payment successful! Order code: $1'],
  [/^Dùng\s+(\d+)\s+key$/i, 'Use $1 key(s)'],
  [/^KEY\s+#(\d+)$/i, 'KEY #$1'],
  [/^SCORE\s+(.+)$/i, 'SCORE $1'],
  [/^Tiềm năng:\s*(.+)$/i, 'Potential: $1'],
  [/^Cạnh tranh:\s*(.+)$/i, 'Competition: $1'],
  [/^Nguồn:\s*(.+)$/i, 'Source: $1'],
  [/^Hiển thị tối đa\s+(\d+)\s+video$/i, 'Showing up to $1 videos'],
  [/^Views:\s*(.+)$/i, 'Views: $1'],
  [/^VPH:\s*(.+)$/i, 'VPH: $1'],
  [/^Score:\s*(.+)$/i, 'Score: $1'],
];

const PLACEHOLDER_EXACT: Dict = {
  'Ví dụ: công cụ AI, ChatGPT, tạo video bằng AI...': 'Example: AI tools, ChatGPT, AI video creation...',
  'Ví dụ: nấu ăn, chăm sóc thú cưng...': 'Example: cooking, pet care...',
  'Dán API Key tại đây': 'Paste API Key here',
  'Dán mỗi key một dòng': 'Paste one key per line',
  'Nhập link video YouTube...': 'Enter YouTube video link...',
  'Nhập ID hoặc URL kênh...': 'Enter channel ID or URL...',
};

function normalizeText(input: string) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function translateText(input: string): string {
  if (!input || !input.trim()) return input;

  const leading = input.match(/^\s*/)?.[0] || '';
  const trailing = input.match(/\s*$/)?.[0] || '';
  const core = input.trim();
  const normalized = normalizeText(core);

  let translated = EXACT[normalized] || EXACT[core];

  if (!translated) {
    for (const [rx, repl] of REGEX_RULES) {
      if (rx.test(normalized)) {
        translated = normalized.replace(rx, repl);
        break;
      }
    }
  }

  if (!translated) return input;
  return `${leading}${translated}${trailing}`;
}

function shouldSkipNode(node: Node) {
  const parent = node.parentElement;
  if (!parent) return true;
  const tag = parent.tagName;
  if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'NOSCRIPT'].includes(tag)) return true;
  if (parent.closest('[data-ui-lang-skip="true"], .notranslate, iframe, video, canvas')) return true;
  return false;
}

function translateTextNode(node: Text) {
  if (shouldSkipNode(node)) return;
  const original = node.nodeValue || '';
  const next = translateText(original);
  if (next !== original) node.nodeValue = next;
}

function translateAttributes(el: Element) {
  if (!(el instanceof HTMLElement)) return;
  if (el.closest('[data-ui-lang-skip="true"], .notranslate')) return;

  const attrs = ['title', 'aria-label', 'placeholder', 'alt'];
  for (const attr of attrs) {
    const value = el.getAttribute(attr);
    if (!value) continue;
    const translated = PLACEHOLDER_EXACT[value] || translateText(value);
    if (translated !== value) el.setAttribute(attr, translated);
  }

  if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type)) {
    const translated = translateText(el.value);
    if (translated !== el.value) el.value = translated;
  }
}

function walk(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT;
      const value = node.nodeValue || '';
      return /[À-ỹĐđ]/.test(value) || EXACT[normalizeText(value)] ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });

  const textNodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) textNodes.push(current as Text);
  textNodes.forEach(translateTextNode);

  if (root instanceof Element) translateAttributes(root);
  root.querySelectorAll?.('[title], [aria-label], [placeholder], [alt], input[type="button"], input[type="submit"], input[type="reset"]').forEach(translateAttributes);
}

let observer: MutationObserver | null = null;
let scheduled = false;

function scheduleWalk() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    walk(document.body);
  });
}

export function enableEnglishUI() {
  try {
    document.documentElement.lang = 'en';
    localStorage.setItem('vtw_ui_language', 'en');

    const start = () => {
      walk(document.body);
      observer?.disconnect();
      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'characterData') {
            translateTextNode(mutation.target as Text);
          } else if (mutation.type === 'childList' || mutation.type === 'attributes') {
            scheduleWalk();
          }
        }
      });

      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['title', 'aria-label', 'placeholder', 'alt', 'value']
      });
    };

    if (document.body) start();
    else window.addEventListener('DOMContentLoaded', start, { once: true });
  } catch (error) {
    console.warn('English UI layer failed:', error);
  }
}

enableEnglishUI();
