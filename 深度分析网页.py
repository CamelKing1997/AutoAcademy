"""
FAMSUN Academy 网页结构深度分析工具
自动登录并分析关键页面元素
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import time
import json
import re
from datetime import datetime

class WebpageAnalyzer:
    def __init__(self):
        self.login_url = "https://academy.famsungroup.com/login.html"
        self.credit_url = "https://academy.famsungroup.com/ssp/#/credit/userdetail"
        self.course_list_url = "https://academy.famsungroup.com/kng/#/square/list"
        self.username = "60012932"
        self.password = "F.smm970406"
        self.driver = None
        self.analysis_result = {
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'pages': {}
        }
    
    def setup_driver(self):
        """初始化浏览器"""
        chrome_options = Options()
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-blink-features=AutomationControlled')
        chrome_options.add_experimental_option('excludeSwitches', ['enable-automation'])
        chrome_options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
        
        self.driver = webdriver.Chrome(options=chrome_options)
        self.driver.maximize_window()
        self.wait = WebDriverWait(self.driver, 20)
        print("✓ 浏览器初始化完成")
    
    def login(self):
        """登录系统"""
        print("\n[步骤1] 登录FAMSUN Academy...")
        self.driver.get(self.login_url)
        time.sleep(5)
        
        # 先保存登录页面源码用于分析
        with open('login_page_source.html', 'w', encoding='utf-8') as f:
            f.write(self.driver.page_source)
        print("✓ 登录页面源码已保存: login_page_source.html")
        
        try:
            # 切换到账号密码登录
            try:
                account_selectors = [
                    "//div[contains(text(), '账号密码登录')]",
                    "//span[contains(text(), '账号密码登录')]",
                    "//*[contains(text(), '账号')]"
                ]
                for selector in account_selectors:
                    try:
                        account_btn = self.driver.find_element(By.XPATH, selector)
                        account_btn.click()
                        print(f"  切换到账号密码登录模式")
                        time.sleep(2)
                        break
                    except:
                        continue
            except:
                print("  已经是账号密码登录模式")
            
            # 查找所有input元素并分析
            print("\n  查找输入框...")
            all_inputs = self.driver.find_elements(By.TAG_NAME, "input")
            print(f"  找到 {len(all_inputs)} 个input元素")
            
            username_input = None
            password_input = None
            
            # 分析每个input
            for i, inp in enumerate(all_inputs):
                try:
                    inp_type = inp.get_attribute('type')
                    inp_placeholder = inp.get_attribute('placeholder')
                    inp_name = inp.get_attribute('name')
                    inp_class = inp.get_attribute('class')
                    
                    print(f"    Input {i+1}: type={inp_type}, placeholder={inp_placeholder}, name={inp_name}")
                    
                    # 识别账号输入框
                    if username_input is None and inp_type in ['text', 'tel', None]:
                        if inp_placeholder and any(k in inp_placeholder for k in ['账号', '手机', '用户']):
                            username_input = inp
                            print(f"      → 识别为账号输入框")
                    
                    # 识别密码输入框
                    if password_input is None and inp_type == 'password':
                        password_input = inp
                        print(f"      → 识别为密码输入框")
                        
                except Exception as e:
                    print(f"    分析Input {i+1}失败: {e}")
            
            # 如果还没找到，使用备用方法
            if username_input is None:
                print("\n  使用备用方法查找账号输入框...")
                try:
                    username_input = self.driver.find_element(By.CSS_SELECTOR, "input[type='text']")
                    print("  ✓ 找到text类型输入框")
                except:
                    username_input = all_inputs[0] if all_inputs else None
                    print("  ✓ 使用第一个输入框")
            
            if password_input is None:
                print("\n  使用备用方法查找密码输入框...")
                try:
                    password_input = self.driver.find_element(By.CSS_SELECTOR, "input[type='password']")
                    print("  ✓ 找到password类型输入框")
                except:
                    pass
            
            # 输入账号
            if username_input:
                username_input.clear()
                for char in self.username:
                    username_input.send_keys(char)
                    time.sleep(0.1)
                print(f"\n✓ 已输入账号: {self.username}")
            else:
                print("\n✗ 未找到账号输入框")
                return False
            
            time.sleep(1)
            
            # 输入密码
            if password_input:
                password_input.clear()
                for char in self.password:
                    password_input.send_keys(char)
                    time.sleep(0.1)
                print("✓ 已输入密码")
            else:
                print("✗ 未找到密码输入框")
                return False
            
            time.sleep(1)
            
            # 查找登录按钮
            print("\n  查找登录按钮...")
            login_btn = None
            login_selectors = [
                "//button[contains(text(), '登录')]",
                "//button[contains(text(), '登') and contains(text(), '录')]",
                "//button[@type='submit']",
                "//button[@type='button' and contains(@class, 'primary')]",
                "//div[contains(@class, 'button') and contains(text(), '登录')]"
            ]
            
            for selector in login_selectors:
                try:
                    login_btn = self.driver.find_element(By.XPATH, selector)
                    print(f"  找到登录按钮: {selector}")
                    break
                except:
                    continue
            
            if not login_btn:
                # 查找所有button
                all_buttons = self.driver.find_elements(By.TAG_NAME, "button")
                print(f"  找到 {len(all_buttons)} 个button元素")
                for i, btn in enumerate(all_buttons):
                    text = btn.text
                    print(f"    Button {i+1}: {text}")
                    if '登' in text or 'login' in text.lower():
                        login_btn = btn
                        print(f"      → 使用此按钮")
                        break
            
            if login_btn:
                login_btn.click()
                print("\n✓ 已点击登录按钮")
                time.sleep(8)
                
                current_url = self.driver.current_url
                print(f"  当前URL: {current_url}")
                
                if "main" in current_url or "index" in current_url:
                    print("✓ 登录成功！")
                    return True
                else:
                    print("⚠ 登录状态未确认，但继续执行")
                    return True
            else:
                print("✗ 未找到登录按钮")
                return False
                
        except Exception as e:
            print(f"✗ 登录过程出错: {e}")
            import traceback
            traceback.print_exc()
            
            # 保存错误时的截图
            try:
                self.driver.save_screenshot('login_error.png')
                print("  已保存错误截图: login_error.png")
            except:
                pass
            
            return False
    
    def analyze_credit_page(self):
        """分析积分页面"""
        print("\n[步骤2] 分析积分页面结构...")
        self.driver.get(self.credit_url)
        time.sleep(5)
        
        page_data = {
            'url': self.credit_url,
            'title': self.driver.title,
            'elements': {}
        }
        
        # 查找所有包含"学分"或"积分"的元素
        print("\n📊 积分相关元素:")
        credit_elements = self.driver.find_elements(By.XPATH, "//*[contains(text(), '学分') or contains(text(), '积分') or contains(text(), '累计')]")
        
        for i, elem in enumerate(credit_elements[:20], 1):  # 限制前20个
            try:
                text = elem.text.strip()
                if text:
                    tag = elem.tag_name
                    classes = elem.get_attribute('class')
                    xpath = self.get_xpath(elem)
                    
                    print(f"\n  元素 {i}:")
                    print(f"    文本: {text}")
                    print(f"    标签: <{tag}>")
                    print(f"    类名: {classes}")
                    print(f"    XPath: {xpath}")
                    
                    # 尝试提取数字
                    numbers = re.findall(r'\d+\.?\d*', text)
                    if numbers:
                        print(f"    数字: {numbers}")
            except:
                continue
        
        # 查找本年累计积分
        print("\n🎯 查找本年累计积分...")
        try:
            year_credit_selectors = [
                "//div[contains(text(), '本年累计')]",
                "//span[contains(text(), '本年累计')]",
                "//*[contains(text(), '本年')]"
            ]
            
            for selector in year_credit_selectors:
                try:
                    elem = self.driver.find_element(By.XPATH, selector)
                    parent = elem.find_element(By.XPATH, "./ancestor::div[contains(@class, 'credit') or contains(@class, 'top')]")
                    text = parent.text
                    print(f"\n  找到区域: {text}")
                    
                    # 查找该区域内的数字
                    numbers = re.findall(r'(\d+\.?\d*)', text)
                    print(f"  提取数字: {numbers}")
                    
                    page_data['elements']['year_credit_area'] = {
                        'selector': selector,
                        'text': text,
                        'numbers': numbers
                    }
                    break
                except:
                    continue
        except Exception as e:
            print(f"  未找到: {e}")
        
        self.analysis_result['pages']['credit'] = page_data
        
        # 保存页面源码
        with open('credit_page_source.html', 'w', encoding='utf-8') as f:
            f.write(self.driver.page_source)
        print("\n✓ 积分页面源码已保存: credit_page_source.html")
    
    def analyze_course_list(self):
        """分析课程列表页面"""
        print("\n[步骤3] 分析课程列表结构...")
        self.driver.get(self.course_list_url)
        time.sleep(5)
        
        page_data = {
            'url': self.course_list_url,
            'title': self.driver.title,
            'courses': []
        }
        
        # 滚动加载所有课程
        print("\n📜 滚动加载课程列表...")
        for i in range(3):
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)
        
        # 查找课程链接
        print("\n🔍 查找课程元素...")
        course_selectors = [
            "//a[contains(@href, 'course')]",
            "//a[contains(@href, 'kng')]",
            "//div[contains(@class, 'card')]//a"
        ]
        
        all_courses = []
        for selector in course_selectors:
            try:
                elements = self.driver.find_elements(By.XPATH, selector)
                if elements:
                    print(f"\n  选择器: {selector}")
                    print(f"  找到 {len(elements)} 个元素")
                    
                    for elem in elements[:5]:  # 分析前5个
                        try:
                            url = elem.get_attribute('href')
                            text = elem.text
                            parent = elem.find_element(By.XPATH, "./ancestor::div[contains(@class, 'card') or contains(@class, 'course')][1]")
                            parent_text = parent.text
                            
                            # 提取学分
                            credit_match = re.search(r'(\d+\.?\d*)\s*学分', parent_text)
                            credit = credit_match.group(1) if credit_match else "未找到"
                            
                            course_info = {
                                'title': text[:50] if text else '无标题',
                                'url': url,
                                'credit': credit,
                                'parent_text': parent_text[:100]
                            }
                            all_courses.append(course_info)
                            
                            print(f"\n    课程: {course_info['title']}")
                            print(f"    学分: {credit}")
                            print(f"    URL: {url[:60]}...")
                        except:
                            continue
                    break
            except:
                continue
        
        page_data['courses'] = all_courses
        self.analysis_result['pages']['course_list'] = page_data
        
        # 保存页面源码
        with open('course_list_page_source.html', 'w', encoding='utf-8') as f:
            f.write(self.driver.page_source)
        print("\n✓ 课程列表页面源码已保存: course_list_page_source.html")
    
    def analyze_course_player(self):
        """分析课程播放页面"""
        print("\n[步骤4] 分析课程播放页面...")
        
        # 获取第一个课程链接
        courses = self.analysis_result['pages'].get('course_list', {}).get('courses', [])
        if not courses:
            print("  跳过：未找到课程")
            return
        
        course_url = courses[0]['url']
        print(f"\n  打开课程: {courses[0]['title']}")
        self.driver.get(course_url)
        time.sleep(8)
        
        page_data = {
            'url': course_url,
            'title': self.driver.title,
            'elements': {}
        }
        
        # 查找倒计时元素
        print("\n⏱️  查找倒计时元素...")
        countdown_selectors = [
            "//div[contains(@class, 'countdown')]",
            "//*[contains(text(), '还需') or contains(text(), '剩余')]",
            "//span[contains(@class, 'countdown')]"
        ]
        
        for selector in countdown_selectors:
            try:
                elements = self.driver.find_elements(By.XPATH, selector)
                for elem in elements:
                    text = elem.text
                    if text:
                        classes = elem.get_attribute('class')
                        print(f"\n  倒计时元素:")
                        print(f"    文本: {text}")
                        print(f"    类名: {classes}")
                        print(f"    选择器: {selector}")
                        
                        # 解析时间
                        time_patterns = {
                            'HH:MM:SS': r'(\d+):(\d+):(\d+)',
                            'MM:SS': r'(\d+):(\d+)',
                            '中文分秒': r'(\d+)\s*分.*?(\d+)\s*秒',
                            '中文分': r'(\d+)\s*分钟'
                        }
                        
                        for pattern_name, pattern in time_patterns.items():
                            match = re.search(pattern, text)
                            if match:
                                print(f"    匹配格式: {pattern_name}")
                                print(f"    提取值: {match.groups()}")
                        
                        page_data['elements']['countdown'] = {
                            'selector': selector,
                            'text': text,
                            'class': classes
                        }
                        break
            except:
                continue
        
        # 查找视频元素
        print("\n🎥 查找视频元素...")
        try:
            video = self.driver.find_element(By.TAG_NAME, "video")
            video_src = video.get_attribute('src')
            video_class = video.get_attribute('class')
            print(f"\n  找到视频:")
            print(f"    源: {video_src[:60]}...")
            print(f"    类名: {video_class}")
            
            page_data['elements']['video'] = {
                'tag': 'video',
                'src': video_src,
                'class': video_class
            }
        except:
            print("  未找到视频元素")
        
        # 查找文档播放器
        print("\n📄 查找文档播放器...")
        try:
            doc_player = self.driver.find_element(By.CLASS_NAME, "yxtbiz-doc-player")
            print("  找到文档播放器: yxtbiz-doc-player")
            page_data['elements']['doc_player'] = {
                'class': 'yxtbiz-doc-player',
                'found': True
            }
        except:
            print("  未找到文档播放器")
        
        self.analysis_result['pages']['course_player'] = page_data
        
        # 保存页面源码
        with open('course_player_page_source.html', 'w', encoding='utf-8') as f:
            f.write(self.driver.page_source)
        print("\n✓ 课程播放页面源码已保存: course_player_page_source.html")
    
    def get_xpath(self, element):
        """获取元素的XPath"""
        try:
            return self.driver.execute_script("""
                function getXPath(element) {
                    if (element.id !== '')
                        return 'id("' + element.id + '")';
                    if (element === document.body)
                        return element.tagName;
                    
                    var ix = 0;
                    var siblings = element.parentNode.childNodes;
                    for (var i = 0; i < siblings.length; i++) {
                        var sibling = siblings[i];
                        if (sibling === element)
                            return getXPath(element.parentNode) + '/' + element.tagName + '[' + (ix + 1) + ']';
                        if (sibling.nodeType === 1 && sibling.tagName === element.tagName)
                            ix++;
                    }
                }
                return getXPath(arguments[0]).toLowerCase();
            """, element)
        except:
            return "无法获取XPath"
    
    def save_results(self):
        """保存分析结果"""
        filename = f"webpage_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(self.analysis_result, f, ensure_ascii=False, indent=2)
        print(f"\n\n{'='*60}")
        print(f"✓ 分析结果已保存: {filename}")
        print(f"{'='*60}")
    
    def run(self):
        """运行完整分析流程"""
        try:
            print("\n" + "="*60)
            print("  FAMSUN Academy 网页结构深度分析工具")
            print("="*60)
            
            self.setup_driver()
            
            if not self.login():
                return
            
            self.analyze_credit_page()
            self.analyze_course_list()
            self.analyze_course_player()
            
            self.save_results()
            
            print("\n分析完成！请查看以下文件:")
            print("  1. webpage_analysis_*.json - 分析结果JSON")
            print("  2. *_page_source.html - 各页面HTML源码")
            print("  3. 深度网页结构分析报告.md - 需求总结文档")
            
        except Exception as e:
            print(f"\n分析过程出错: {e}")
            import traceback
            traceback.print_exc()
        finally:
            input("\n按回车键关闭浏览器...")
            if self.driver:
                self.driver.quit()

if __name__ == "__main__":
    analyzer = WebpageAnalyzer()
    analyzer.run()
