"""
FAMSUN Academy 全自动学习程序 V2.1
新增功能：
- 检测并等待课程倒计时结束
- 自动设置视频倍速播放
- 智能等待学习时长要求
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import (
    TimeoutException, 
    NoSuchElementException, 
    ElementClickInterceptedException,
    StaleElementReferenceException
)
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
import time
import logging
import random
import json
from datetime import datetime
import os
import re

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('auto_academy.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)

class FamsunAcademy:
    def __init__(self):
        # 登录信息
        self.login_url = "https://academy.famsungroup.com/login.html"
        self.main_url = "https://academy.famsungroup.com/main/#/index"
        self.credit_url = "https://academy.famsungroup.com/ssp/#/credit/userdetail"
        self.username = "60012932"
        self.password = "F.smm970406"
        
        # 浏览器驱动
        self.driver = None
        self.wait = None
        
        # 进度记录
        self.progress_file = "learning_progress.json"
        self.completed_courses = self.load_progress()
        
        # 倍速设置
        self.playback_rate = 2.0  # 默认2倍速
        
        # 积分信息
        self.current_credit = 0
        self.target_credit = 60
        self.earned_credit = 0
        
    def load_progress(self):
        """加载学习进度"""
        if os.path.exists(self.progress_file):
            try:
                with open(self.progress_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return []
        return []
    
    def save_progress(self, course_info):
        """保存学习进度"""
        if course_info not in self.completed_courses:
            self.completed_courses.append(course_info)
            with open(self.progress_file, 'w', encoding='utf-8') as f:
                json.dump(self.completed_courses, f, ensure_ascii=False, indent=2)
            logging.info(f"已保存进度: {course_info}")
    
    def setup_driver(self, headless=False):
        """初始化浏览器"""
        try:
            chrome_options = Options()
            
            if headless:
                chrome_options.add_argument('--headless')
            
            # 基础配置
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            chrome_options.add_argument('--disable-blink-features=AutomationControlled')
            chrome_options.add_argument('--disable-gpu')
            chrome_options.add_argument('--window-size=1920,1080')
            chrome_options.add_argument('--mute-audio')  # 静音
            
            # 反检测设置
            chrome_options.add_experimental_option('excludeSwitches', ['enable-automation'])
            chrome_options.add_experimental_option('useAutomationExtension', False)
            chrome_options.add_argument('--disable-blink-features=AutomationControlled')
            
            # 用户代理
            chrome_options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
            
            self.driver = webdriver.Chrome(options=chrome_options)
            
            # 移除webdriver特征
            self.driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
                'source': '''
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined
                    })
                '''
            })
            
            self.driver.maximize_window()
            self.wait = WebDriverWait(self.driver, 20)
            
            logging.info("浏览器初始化成功")
            return True
            
        except Exception as e:
            logging.error(f"浏览器初始化失败: {e}")
            return False
    
    def random_sleep(self, min_sec=1, max_sec=3):
        """随机延迟，模拟人类操作"""
        time.sleep(random.uniform(min_sec, max_sec))
    
    def slow_type(self, element, text):
        """模拟人类输入，逐字符输入"""
        for char in text:
            element.send_keys(char)
            time.sleep(random.uniform(0.05, 0.15))
    
    def login(self):
        """自动登录"""
        try:
            logging.info("开始登录流程...")
            self.driver.get(self.login_url)
            self.random_sleep(2, 4)
            
            # 切换到账号密码登录（如果需要）
            try:
                account_login_btn = self.driver.find_element(By.XPATH, 
                    "//div[contains(text(), '账号密码登录')] | //span[contains(text(), '账号密码登录')]")
                account_login_btn.click()
                logging.info("切换到账号密码登录")
                self.random_sleep(1, 2)
            except:
                logging.info("已经是账号密码登录模式")
            
            # 输入账号
            username_selectors = [
                (By.XPATH, "//input[@placeholder='请输入账号' or @placeholder='请输入手机号' or @placeholder='账号']"),
                (By.CSS_SELECTOR, "input[type='text']"),
                (By.NAME, "username"),
                (By.ID, "username")
            ]
            
            username_input = None
            for selector_type, selector_value in username_selectors:
                try:
                    username_input = self.wait.until(
                        EC.presence_of_element_located((selector_type, selector_value))
                    )
                    break
                except:
                    continue
            
            if username_input:
                username_input.clear()
                self.slow_type(username_input, self.username)
                logging.info("已输入账号")
                self.random_sleep(0.5, 1)
            else:
                logging.error("找不到账号输入框")
                return False
            
            # 输入密码
            password_selectors = [
                (By.XPATH, "//input[@type='password' or @placeholder='请输入密码' or @placeholder='密码']"),
                (By.CSS_SELECTOR, "input[type='password']"),
                (By.NAME, "password"),
                (By.ID, "password")
            ]
            
            password_input = None
            for selector_type, selector_value in password_selectors:
                try:
                    password_input = self.driver.find_element(selector_type, selector_value)
                    break
                except:
                    continue
            
            if password_input:
                password_input.clear()
                self.slow_type(password_input, self.password)
                logging.info("已输入密码")
                self.random_sleep(0.5, 1)
            else:
                logging.error("找不到密码输入框")
                return False
            
            # 点击登录按钮
            login_btn_selectors = [
                (By.XPATH, "//button[contains(text(), '登') and contains(text(), '录')]"),
                (By.XPATH, "//button[@type='submit' or @type='button']"),
                (By.CSS_SELECTOR, "button.yxtf-button--primary")
            ]
            
            login_btn = None
            for selector_type, selector_value in login_btn_selectors:
                try:
                    login_btn = self.driver.find_element(selector_type, selector_value)
                    if login_btn.is_enabled():
                        break
                except:
                    continue
            
            if login_btn:
                login_btn.click()
                logging.info("已点击登录按钮")
                self.random_sleep(3, 5)
            else:
                logging.error("找不到登录按钮")
                return False
            
            # 验证登录成功
            current_url = self.driver.current_url
            logging.info(f"当前URL: {current_url}")
            
            if "main" in current_url or "index" in current_url:
                logging.info("✓ 登录成功！")
                return True
            else:
                logging.warning("登录可能失败，请检查")
                return False
                
        except Exception as e:
            logging.error(f"登录过程出错: {e}")
            return False
    
    def check_current_credit(self):
        """检查当前积分"""
        try:
            logging.info("正在查询当前积分...")
            self.driver.get(self.credit_url)
            self.random_sleep(3, 5)
            
            # 查找积分信息
            credit_selectors = [
                "//div[contains(text(), '本年累计') or contains(text(), '累计学分')]//following-sibling::*",
                "//*[contains(text(), '学分') or contains(text(), '积分')]",
                "//span[contains(@class, 'credit') or contains(@class, 'score')]"
            ]
            
            for selector in credit_selectors:
                try:
                    elements = self.driver.find_elements(By.XPATH, selector)
                    for elem in elements:
                        text = elem.text
                        # 提取数字
                        numbers = re.findall(r'\d+\.?\d*', text)
                        if numbers:
                            credit = float(numbers[0])
                            if 0 <= credit <= 1000:  # 合理范围
                                self.current_credit = credit
                                logging.info(f"📊 当前学分: {self.current_credit} / 目标: {self.target_credit}")
                                
                                if self.current_credit >= self.target_credit:
                                    logging.info(f"🎉 恭喜！已达到目标学分 ({self.current_credit}/{self.target_credit})")
                                    return True, True  # (成功, 已达标)
                                else:
                                    remaining = self.target_credit - self.current_credit
                                    logging.info(f"📈 还需学习: {remaining} 学分")
                                    return True, False  # (成功, 未达标)
                except:
                    continue
            
            logging.warning("无法获取积分信息，将继续学习所有课程")
            return False, False
            
        except Exception as e:
            logging.error(f"查询积分失败: {e}")
            return False, False
    
    def goto_course_list(self):
        """进入在线课程列表"""
        try:
            logging.info("正在进入课程列表...")
            
            # 直接访问课程列表URL
            course_list_url = "https://academy.famsungroup.com/kng/#/square/list?mid=1912343925140942852&mcid=1912343925153525762&mn=%E5%88%86%E7%B1%BB%E8%AF%BE%E7%A8%8B"
            self.driver.get(course_list_url)
            self.random_sleep(3, 5)
            
            logging.info("✓ 已进入课程列表")
            return True
            
        except Exception as e:
            logging.error(f"进入课程列表失败: {e}")
            return False
    
    def get_course_credit(self, course_element):
        """获取课程积分"""
        try:
            # 在课程卡片中查找积分信息
            parent = course_element.find_element(By.XPATH, "./ancestor::div[contains(@class, 'card') or contains(@class, 'course')]")
            text = parent.text
            
            # 查找积分相关文本: "2学分", "积分: 3", "3分"等
            credit_patterns = [
                r'(\d+\.?\d*)\s*学分',
                r'(\d+\.?\d*)\s*积分',
                r'积分[:：]\s*(\d+\.?\d*)',
                r'学分[:：]\s*(\d+\.?\d*)',
                r'(\d+\.?\d*)\s*分'
            ]
            
            for pattern in credit_patterns:
                match = re.search(pattern, text)
                if match:
                    credit = float(match.group(1))
                    if 0 < credit <= 50:  # 合理的课程积分范围
                        return credit
            
            return 0  # 未找到积分信息
            
        except:
            return 0
    
    def get_all_courses(self):
        """获取所有课程链接（包含积分信息）"""
        try:
            logging.info("正在获取课程列表...")
            self.random_sleep(2, 3)
            
            courses = []
            
            # 滚动页面加载所有课程
            last_height = self.driver.execute_script("return document.body.scrollHeight")
            scroll_attempts = 0
            max_scrolls = 10
            
            while scroll_attempts < max_scrolls:
                self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                self.random_sleep(1, 2)
                
                new_height = self.driver.execute_script("return document.body.scrollHeight")
                if new_height == last_height:
                    break
                last_height = new_height
                scroll_attempts += 1
            
            # 查找所有课程卡片
            course_selectors = [
                "//div[contains(@class, 'course-card') or contains(@class, 'kng-card')]//a",
                "//div[contains(@class, 'list')]//a[contains(@href, 'course') or contains(@href, 'kng')]",
                "//a[contains(@href, '/course/') or contains(@href, '/kng/')]"
            ]
            
            course_elements = []
            for selector in course_selectors:
                try:
                    elements = self.driver.find_elements(By.XPATH, selector)
                    if elements:
                        course_elements = elements
                        logging.info(f"使用选择器找到 {len(elements)} 个课程元素")
                        break
                except:
                    continue
            
            # 提取课程信息（包括积分）
            for element in course_elements:
                try:
                    course_url = element.get_attribute('href')
                    if course_url and course_url not in [c['url'] for c in courses]:
                        try:
                            course_title = element.text or element.get_attribute('title') or "未命名课程"
                        except:
                            course_title = "未命名课程"
                        
                        # 获取课程积分
                        credit = self.get_course_credit(element)
                        
                        courses.append({
                            'title': course_title,
                            'url': course_url,
                            'credit': credit
                        })
                except:
                    continue
            
            # 按积分从高到低排序（优先学习高积分课程）
            courses.sort(key=lambda x: x['credit'], reverse=True)
            
            logging.info(f"✓ 共找到 {len(courses)} 个课程")
            
            total_available_credit = sum(c['credit'] for c in courses)
            logging.info(f"📊 可获得总积分: {total_available_credit}")
            
            for i, course in enumerate(courses, 1):
                credit_info = f" [{course['credit']}分]" if course['credit'] > 0 else ""
                logging.info(f"  {i}. {course['title']}{credit_info}")
            
            return courses
            
        except Exception as e:
            logging.error(f"获取课程列表失败: {e}")
            return []
    
    def get_countdown_time(self):
        """获取倒计时剩余时间（秒）"""
        try:
            # 查找倒计时元素
            countdown_selectors = [
                "//div[contains(@class, 'countdown')]",
                "//div[contains(@class, 'count-down')]",
                "//span[contains(@class, 'countdown')]",
                "//*[contains(text(), '剩余') or contains(text(), '还需')]"
            ]
            
            for selector in countdown_selectors:
                try:
                    countdown_elem = self.driver.find_element(By.XPATH, selector)
                    text = countdown_elem.text
                    
                    # 尝试解析时间格式
                    # 格式可能：00:05:30, 5分30秒, 还需5分钟等
                    
                    # 解析 HH:MM:SS 或 MM:SS 格式
                    time_pattern = re.search(r'(\d+):(\d+):(\d+)', text)
                    if time_pattern:
                        hours = int(time_pattern.group(1))
                        minutes = int(time_pattern.group(2))
                        seconds = int(time_pattern.group(3))
                        total_seconds = hours * 3600 + minutes * 60 + seconds
                        logging.info(f"检测到倒计时: {hours:02d}:{minutes:02d}:{seconds:02d} ({total_seconds}秒)")
                        return total_seconds
                    
                    # 解析 MM:SS 格式
                    time_pattern = re.search(r'(\d+):(\d+)', text)
                    if time_pattern:
                        minutes = int(time_pattern.group(1))
                        seconds = int(time_pattern.group(2))
                        total_seconds = minutes * 60 + seconds
                        logging.info(f"检测到倒计时: {minutes:02d}:{seconds:02d} ({total_seconds}秒)")
                        return total_seconds
                    
                    # 解析中文格式：5分30秒
                    minutes_match = re.search(r'(\d+)\s*分', text)
                    seconds_match = re.search(r'(\d+)\s*秒', text)
                    
                    total_seconds = 0
                    if minutes_match:
                        total_seconds += int(minutes_match.group(1)) * 60
                    if seconds_match:
                        total_seconds += int(seconds_match.group(1))
                    
                    if total_seconds > 0:
                        logging.info(f"检测到倒计时: {total_seconds}秒")
                        return total_seconds
                    
                except:
                    continue
            
            # 没找到倒计时
            return 0
            
        except Exception as e:
            logging.debug(f"获取倒计时失败: {e}")
            return 0
    
    def wait_for_countdown(self, check_interval=10):
        """等待倒计时结束"""
        try:
            logging.info("⏱️  检查课程倒计时...")
            
            initial_countdown = self.get_countdown_time()
            
            if initial_countdown == 0:
                logging.info("未检测到倒计时限制")
                return True
            
            logging.info(f"🔔 检测到学习时长要求: 需等待 {initial_countdown} 秒")
            logging.info(f"⚡ 策略: 开启{self.playback_rate}倍速播放，倒计时会按正常速度倒数")
            
            # 计算预计等待时间（倒计时按正常速度，不受倍速影响）
            estimated_wait = initial_countdown
            logging.info(f"⏰ 预计需要等待: {estimated_wait//60}分{estimated_wait%60}秒")
            
            start_time = time.time()
            last_check = time.time()
            last_remaining = initial_countdown
            
            while True:
                current_time = time.time()
                elapsed = int(current_time - start_time)
                
                # 每隔一段时间检查一次
                if current_time - last_check >= check_interval:
                    remaining = self.get_countdown_time()
                    
                    if remaining == 0:
                        logging.info("✅ 倒计时已结束！")
                        return True
                    
                    if remaining != last_remaining:
                        progress = ((initial_countdown - remaining) / initial_countdown) * 100
                        logging.info(f"⏳ 倒计时进度: {progress:.1f}% | 还需 {remaining//60}分{remaining%60}秒 | 已等待 {elapsed//60}分{elapsed%60}秒")
                        last_remaining = remaining
                    
                    last_check = current_time
                
                # 如果已经等待超过预期时间还没结束，再检查一次
                if elapsed > estimated_wait + 30:
                    final_check = self.get_countdown_time()
                    if final_check == 0:
                        logging.info("✅ 倒计时已结束！")
                        return True
                    else:
                        logging.warning(f"倒计时仍在继续，还剩 {final_check} 秒")
                        estimated_wait = final_check + 30
                
                time.sleep(2)  # 每2秒检查一次
                
        except Exception as e:
            logging.error(f"等待倒计时时出错: {e}")
            return False
    
    def set_playback_speed(self, video_element):
        """设置视频播放速度"""
        try:
            self.driver.execute_script(f"arguments[0].playbackRate = {self.playback_rate};", video_element)
            logging.info(f"✓ 已设置 {self.playback_rate} 倍速播放")
            return True
        except Exception as e:
            logging.warning(f"设置倍速失败: {e}")
            
            # 尝试通过点击倍速按钮设置
            try:
                speed_btn_selectors = [
                    "//div[contains(@class, 'speed') or contains(@class, 'rate')]",
                    "//button[contains(@class, 'speed')]",
                    "//*[contains(text(), '倍速')]"
                ]
                
                for selector in speed_btn_selectors:
                    try:
                        speed_btn = self.driver.find_element(By.XPATH, selector)
                        speed_btn.click()
                        self.random_sleep(0.5, 1)
                        
                        # 选择2倍速
                        speed_option = self.driver.find_element(By.XPATH, f"//*[contains(text(), '2') or contains(text(), '2.0')]")
                        speed_option.click()
                        logging.info("✓ 通过点击按钮设置了倍速")
                        return True
                    except:
                        continue
            except:
                pass
            
            return False
    
    def play_video_course(self):
        """播放视频课程"""
        try:
            logging.info("处理视频课程...")
            self.random_sleep(2, 3)
            
            # 查找视频元素
            video = None
            try:
                video = self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "video")))
                logging.info("找到视频元素")
            except:
                logging.warning("未找到视频元素")
                return False
            
            # 播放视频
            try:
                self.driver.execute_script("arguments[0].play();", video)
                logging.info("视频已开始播放")
            except:
                try:
                    play_btn = self.driver.find_element(By.CLASS_NAME, "vjs-big-play-button")
                    play_btn.click()
                    logging.info("点击播放按钮")
                except:
                    pass
            
            # 设置倍速
            self.set_playback_speed(video)
            
            # 等待倒计时结束
            self.wait_for_countdown()
            
            # 检查是否有下一节课按钮
            try:
                next_btn = self.driver.find_element(By.XPATH, 
                    "//button[contains(text(), '下一节') or contains(text(), '下一章') or contains(text(), '继续')]")
                next_btn.click()
                logging.info("已点击下一节")
                self.random_sleep(2, 3)
            except:
                pass
            
            return True
            
        except Exception as e:
            logging.error(f"播放视频失败: {e}")
            return False
    
    def play_document_course(self):
        """播放文档课程"""
        try:
            logging.info("处理文档课程...")
            self.random_sleep(2, 3)
            
            # 查找文档播放器
            try:
                doc_player = self.driver.find_element(By.CLASS_NAME, "yxtbiz-doc-player")
                logging.info("找到文档播放器")
            except:
                logging.warning("未找到文档播放器")
                return False
            
            # 获取总页数
            try:
                page_info = self.driver.find_element(By.CLASS_NAME, "yxtbiz-doc-player__toolbar-page")
                page_text = page_info.text
                total_pages = int(page_text.split('/')[-1].strip())
                logging.info(f"文档总页数: {total_pages}")
            except:
                total_pages = 20
                logging.info(f"无法获取页数，使用默认值: {total_pages}")
            
            # 快速翻页
            for page in range(min(total_pages, 50)):
                try:
                    self.driver.execute_script("window.scrollBy(0, 500);")
                    self.random_sleep(0.5, 1)
                    
                    if page % 5 == 0:
                        try:
                            next_page_btn = self.driver.find_element(By.XPATH,
                                "//div[contains(@class, 'doc-player')]//button[contains(@class, 'next') or contains(text(), '下一页')]")
                            next_page_btn.click()
                            self.random_sleep(0.3, 0.6)
                        except:
                            pass
                except:
                    pass
            
            logging.info("文档已浏览完成")
            
            # 等待倒计时结束
            self.wait_for_countdown()
            
            # 检查是否有下一节课按钮
            try:
                next_btn = self.driver.find_element(By.XPATH,
                    "//button[contains(text(), '下一节') or contains(text(), '下一章') or contains(text(), '继续')]")
                next_btn.click()
                logging.info("已点击下一节")
                self.random_sleep(2, 3)
            except:
                pass
            
            return True
            
        except Exception as e:
            logging.error(f"播放文档失败: {e}")
            return False
    
    def detect_course_type(self):
        """检测课程类型"""
        try:
            # 检查是否有视频元素
            try:
                self.driver.find_element(By.TAG_NAME, "video")
                return 'video'
            except:
                pass
            
            # 检查是否有文档播放器
            try:
                self.driver.find_element(By.CLASS_NAME, "yxtbiz-doc-player")
                return 'document'
            except:
                pass
            
            # 检查页面源码
            page_source = self.driver.page_source.lower()
            if 'video' in page_source or 'media-player' in page_source:
                return 'video'
            elif 'doc-player' in page_source or 'document' in page_source:
                return 'document'
            
            return 'unknown'
            
        except:
            return 'unknown'
    
    def play_course(self, course_url, course_title, course_credit=0):
        """播放单个课程"""
        try:
            credit_info = f" (+{course_credit}分)" if course_credit > 0 else ""
            logging.info(f"\n{'='*60}")
            logging.info(f"开始学习: {course_title}{credit_info}")
            logging.info(f"{'='*60}")
            
            # 检查是否已完成
            if course_url in self.completed_courses:
                logging.info(f"⊙ 课程已完成，跳过")
                return True, 0
            
            # 打开课程页面
            self.driver.get(course_url)
            self.random_sleep(3, 5)
            
            # 检测课程类型
            course_type = self.detect_course_type()
            logging.info(f"课程类型: {course_type}")
            
            if course_type == 'video':
                success = self.play_video_course()
            elif course_type == 'document':
                success = self.play_document_course()
            else:
                logging.warning("未知课程类型，等待倒计时")
                self.random_sleep(5, 10)
                success = self.wait_for_countdown()
            
            if success:
                self.save_progress(course_url)
                self.earned_credit += course_credit
                logging.info(f"✓ 课程完成: {course_title}")
                if course_credit > 0:
                    logging.info(f"🎯 获得积分: +{course_credit} | 累计已获得: {self.earned_credit}")
                return True, course_credit
            
            return False, 0
            
        except Exception as e:
            logging.error(f"播放课程失败: {e}")
            return False, 0
    
    def auto_learn_all(self):
        """自动学习所有课程（智能积分模式）"""
        try:
            logging.info("\n" + "="*60)
            logging.info("开始全自动学习模式（智能积分优先）")
            logging.info("="*60 + "\n")
            
            # 检查当前积分
            credit_check_success, credit_reached = self.check_current_credit()
            
            if credit_reached:
                logging.info("\n" + "="*60)
                logging.info("🎉 已达到学分目标，无需继续学习！")
                logging.info("="*60)
                return
            
            # 进入课程列表
            if not self.goto_course_list():
                logging.error("无法进入课程列表")
                return
            
            # 获取所有课程（已按积分排序）
            courses = self.get_all_courses()
            
            if not courses:
                logging.warning("未找到任何课程")
                return
            
            # 逐个学习课程
            total = len(courses)
            completed = 0
            total_earned = 0
            
            for i, course in enumerate(courses, 1):
                # 检查是否已达到目标积分
                if credit_check_success and self.current_credit > 0:
                    estimated_current = self.current_credit + total_earned
                    if estimated_current >= self.target_credit:
                        logging.info("\n" + "="*60)
                        logging.info(f"🎉 已达到目标学分 ({estimated_current:.1f}/{self.target_credit})！")
                        logging.info("="*60)
                        break
                
                logging.info(f"\n[进度: {i}/{total}]")
                
                success, earned = self.play_course(
                    course['url'], 
                    course['title'],
                    course.get('credit', 0)
                )
                
                if success:
                    completed += 1
                    total_earned += earned
                    
                    # 显示积分进度
                    if credit_check_success and self.current_credit > 0:
                        estimated_current = self.current_credit + total_earned
                        remaining = max(0, self.target_credit - estimated_current)
                        logging.info(f"📊 积分进度: {estimated_current:.1f}/{self.target_credit} (还需{remaining:.1f})")
                
                # 每学5个课程休息一下
                if i % 5 == 0:
                    rest_time = random.randint(10, 20)
                    logging.info(f"已完成 {i} 个课程，休息 {rest_time} 秒...")
                    time.sleep(rest_time)
            
            logging.info("\n" + "="*60)
            logging.info(f"学习完成！共完成 {completed}/{total} 个课程")
            logging.info(f"本次获得积分: {total_earned}")
            if credit_check_success and self.current_credit > 0:
                final_credit = self.current_credit + total_earned
                logging.info(f"预计总积分: {final_credit}/{self.target_credit}")
            logging.info("="*60)
            
        except KeyboardInterrupt:
            logging.info("\n用户中断学习")
        except Exception as e:
            logging.error(f"自动学习出错: {e}")
    
    def run(self):
        """主运行函数"""
        try:
            print("\n" + "="*60)
            print("  FAMSUN Academy 全自动学习程序 V2.1")
            print("="*60)
            print("\n核心功能:")
            print("  ✅ 智能检测课程倒计时，自动等待学习时长")
            print("  ✅ 视频自动设置2倍速播放")
            print("  ✅ 自动检测当前学分，优先学习高分课程")
            print("  ✅ 达到目标学分(60分)后自动停止")
            print("  ✅ 实时显示积分进度")
            print("\n工作原理:")
            print("  - 视频以2倍速播放，但倒计时按正常速度")
            print("  - 课程按积分从高到低排序学习")
            print("  - 达到60分目标后自动结束")
            print("\n提示:")
            print("  - 按 Ctrl+C 可随时停止")
            print("  - 学习进度会自动保存")
            print("="*60 + "\n")
            
            # 询问是否使用无头模式
            print("是否使用后台模式运行？(不显示浏览器窗口)")
            print("  1 - 显示浏览器（推荐，方便观察）")
            print("  2 - 后台运行（无窗口）")
            choice = input("请选择 (1/2，默认1): ").strip()
            
            headless = (choice == '2')
            
            # 初始化浏览器
            if not self.setup_driver(headless=headless):
                return
            
            # 登录
            if not self.login():
                logging.error("登录失败，程序退出")
                input("\n按回车键退出...")
                return
            
            logging.info("登录成功！等待3秒后开始学习...")
            time.sleep(3)
            
            # 开始自动学习
            self.auto_learn_all()
            
            print("\n" + "="*60)
            print("程序已完成所有任务！")
            print("="*60)
            
        except KeyboardInterrupt:
            logging.info("\n用户中断程序")
        except Exception as e:
            logging.error(f"程序运行出错: {e}")
            import traceback
            traceback.print_exc()
        finally:
            if self.driver:
                print("\n是否关闭浏览器？(y/n，默认y): ", end='')
                try:
                    choice = input().lower().strip()
                    if choice != 'n':
                        self.driver.quit()
                        logging.info("浏览器已关闭")
                    else:
                        logging.info("浏览器保持打开")
                except:
                    self.driver.quit()

if __name__ == "__main__":
    academy = FamsunAcademy()
    academy.run()
