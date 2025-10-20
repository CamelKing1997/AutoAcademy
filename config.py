"""
配置文件 - V2.0
"""

# ====================
# 登录配置
# ====================
USERNAME = "60012932"
PASSWORD = "F.smm970406"
LOGIN_URL = "https://academy.famsungroup.com/login.html"
MAIN_URL = "https://academy.famsungroup.com/main/#/index"

# ====================
# 学习配置
# ====================
# 视频播放速度（1.0 = 正常，2.0 = 2倍速）
VIDEO_PLAYBACK_RATE = 2.0

# 视频是否跳转到结尾（True = 直接跳到结尾，False = 正常播放）
VIDEO_SKIP_TO_END = True

# 视频跳转时留多少秒（从结尾往前算）
VIDEO_END_BUFFER_SECONDS = 5

# 文档每页停留时间（秒）
DOCUMENT_PAGE_DELAY_MIN = 0.5
DOCUMENT_PAGE_DELAY_MAX = 1.0

# 文档最多翻页数（防止无限翻页）
DOCUMENT_MAX_PAGES = 50

# 每完成几个课程休息一次
COURSES_PER_REST = 5

# 休息时长范围（秒）
REST_TIME_MIN = 10
REST_TIME_MAX = 20

# ====================
# 浏览器配置
# ====================
# 是否使用无头模式（后台运行）
HEADLESS_MODE = False

# 是否静音
MUTE_AUDIO = True

# 浏览器窗口大小
WINDOW_WIDTH = 1920
WINDOW_HEIGHT = 1080

# ====================
# 延迟配置（模拟人类操作）
# ====================
# 页面加载后等待时间范围（秒）
PAGE_LOAD_DELAY_MIN = 2
PAGE_LOAD_DELAY_MAX = 4

# 操作间隔时间范围（秒）
ACTION_DELAY_MIN = 1
ACTION_DELAY_MAX = 3

# 输入字符间隔时间范围（秒）
TYPING_DELAY_MIN = 0.05
TYPING_DELAY_MAX = 0.15

# ====================
# 进度记录配置
# ====================
# 进度文件名
PROGRESS_FILE = "learning_progress.json"

# 日志文件名
LOG_FILE = "auto_academy.log"

# 日志级别（DEBUG, INFO, WARNING, ERROR）
LOG_LEVEL = "INFO"

# ====================
# 高级配置
# ====================
# 页面等待超时时间（秒）
PAGE_TIMEOUT = 20

# 滚动加载课程列表最大次数
MAX_SCROLL_ATTEMPTS = 10

# 是否在课程间随机打乱顺序（防止模式检测）
RANDOMIZE_COURSE_ORDER = False

# ====================
# 反检测配置
# ====================
# 自定义 User-Agent
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# 是否移除 webdriver 特征
REMOVE_WEBDRIVER_FLAG = True

# 是否禁用图片加载（加速）
DISABLE_IMAGES = False

# 是否禁用CSS（加速，可能影响元素查找）
DISABLE_CSS = False
