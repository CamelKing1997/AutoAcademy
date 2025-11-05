#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
完整网站资源下载工具
使用Selenium模拟浏览器,下载网站的所有资源(HTML, CSS, JS, 图片等)
"""

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
import requests
import os
import time
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote
import hashlib


class WebsiteDownloader:
    def __init__(self, url, output_dir="downloaded_website"):
        self.url = url
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.downloaded_urls = set()
        self.driver = None
        
    def setup_driver(self):
        """设置Chrome驱动"""
        print("正在设置Chrome浏览器...")
        
        chrome_options = Options()
        # chrome_options.add_argument('--headless')  # 取消注释以无头模式运行
        chrome_options.add_argument('--disable-gpu')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-blink-features=AutomationControlled')
        chrome_options.add_argument('--window-size=1920,1080')
        
        # 模拟真实用户
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        
        # 启用性能日志
        chrome_options.set_capability('goog:loggingPrefs', {'performance': 'ALL'})
        
        try:
            self.driver = webdriver.Chrome(
                service=Service(ChromeDriverManager().install()),
                options=chrome_options
            )
            
            # 设置User-Agent
            self.driver.execute_cdp_cmd('Network.setUserAgentOverride', {
                "userAgent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            })
            
            # 隐藏webdriver特征
            self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            
            print("✓ Chrome浏览器已启动")
        except Exception as e:
            print(f"错误: 无法启动Chrome浏览器: {e}")
            print("\n请确保已安装Chrome浏览器")
            raise
    
    def download_resource(self, url, resource_type='other'):
        """下载单个资源文件"""
        if url in self.downloaded_urls:
            return None
        
        try:
            # 清理URL
            url = url.split('?')[0] if '?' in url else url
            url = url.split('#')[0] if '#' in url else url
            
            if not url.startswith('http'):
                url = urljoin(self.url, url)
            
            # 生成本地文件路径
            parsed = urlparse(url)
            path_parts = parsed.path.strip('/').split('/')
            
            # 确定文件类型和目录
            if resource_type == 'javascript':
                save_dir = self.output_dir / 'js'
            elif resource_type == 'css':
                save_dir = self.output_dir / 'css'
            elif resource_type == 'image':
                save_dir = self.output_dir / 'images'
            elif resource_type == 'font':
                save_dir = self.output_dir / 'fonts'
            else:
                save_dir = self.output_dir / 'other'
            
            save_dir.mkdir(parents=True, exist_ok=True)
            
            # 生成文件名
            if path_parts:
                filename = path_parts[-1]
                if not filename or '.' not in filename:
                    # 使用URL的hash作为文件名
                    url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
                    ext = self._get_extension(resource_type)
                    filename = f"{url_hash}{ext}"
            else:
                url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
                ext = self._get_extension(resource_type)
                filename = f"{url_hash}{ext}"
            
            filepath = save_dir / filename
            
            # 下载文件
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            
            # 保存文件
            with open(filepath, 'wb') as f:
                f.write(response.content)
            
            self.downloaded_urls.add(url)
            print(f"  ✓ 已下载: {resource_type:12} - {filename}")
            
            return str(filepath.relative_to(self.output_dir))
            
        except Exception as e:
            print(f"  ✗ 下载失败 [{url}]: {e}")
            return None
    
    def _get_extension(self, resource_type):
        """根据资源类型获取文件扩展名"""
        ext_map = {
            'javascript': '.js',
            'css': '.css',
            'image': '.png',
            'font': '.woff2',
            'other': '.bin'
        }
        return ext_map.get(resource_type, '.bin')
    
    def extract_resources_from_dom(self):
        """从DOM中提取所有资源链接"""
        print("\n正在从DOM中提取资源...")
        resources = {
            'javascript': [],
            'css': [],
            'images': [],
            'fonts': [],
            'videos': []
        }
        
        try:
            # 提取JavaScript文件
            scripts = self.driver.find_elements(By.TAG_NAME, 'script')
            for script in scripts:
                src = script.get_attribute('src')
                if src:
                    resources['javascript'].append(src)
            
            # 提取CSS文件
            links = self.driver.find_elements(By.TAG_NAME, 'link')
            for link in links:
                rel = link.get_attribute('rel')
                href = link.get_attribute('href')
                if rel == 'stylesheet' and href:
                    resources['css'].append(href)
                elif rel == 'preload' and href:
                    # 预加载的资源
                    as_attr = link.get_attribute('as')
                    if as_attr == 'script':
                        resources['javascript'].append(href)
                    elif as_attr == 'style':
                        resources['css'].append(href)
                    elif as_attr == 'font':
                        resources['fonts'].append(href)
            
            # 提取图片
            images = self.driver.find_elements(By.TAG_NAME, 'img')
            for img in images:
                src = img.get_attribute('src')
                if src:
                    resources['images'].append(src)
                # 提取srcset中的图片
                srcset = img.get_attribute('srcset')
                if srcset:
                    for src_part in srcset.split(','):
                        src = src_part.strip().split()[0]
                        if src:
                            resources['images'].append(src)
            
            # 提取视频
            videos = self.driver.find_elements(By.TAG_NAME, 'video')
            for video in videos:
                src = video.get_attribute('src')
                if src:
                    resources['videos'].append(src)
                # 提取source标签
                sources = video.find_elements(By.TAG_NAME, 'source')
                for source in sources:
                    src = source.get_attribute('src')
                    if src:
                        resources['videos'].append(src)
            
            # 提取背景图片（通过style属性）
            elements = self.driver.find_elements(By.XPATH, "//*[@style]")
            for elem in elements:
                style = elem.get_attribute('style')
                if style and 'background' in style:
                    # 提取url()中的链接
                    urls = re.findall(r'url\(["\']?([^"\')]+)["\']?\)', style)
                    resources['images'].extend(urls)
            
            print(f"  发现 {len(resources['javascript'])} 个JavaScript文件")
            print(f"  发现 {len(resources['css'])} 个CSS文件")
            print(f"  发现 {len(resources['images'])} 个图片文件")
            print(f"  发现 {len(resources['videos'])} 个视频文件")
            
        except Exception as e:
            print(f"  错误: {e}")
            import traceback
            traceback.print_exc()
        
        return resources
    
    def extract_resources_from_network(self):
        """从Chrome性能日志中提取网络请求的资源"""
        print("\n正在从网络日志中提取资源...")
        resources = {
            'javascript': [],
            'css': [],
            'images': [],
            'fonts': [],
            'other': []
        }
        
        try:
            # 获取性能日志
            logs = self.driver.get_log('performance')
            
            for log in logs:
                message = json.loads(log['message'])
                method = message.get('message', {}).get('method', '')
                
                # 只处理网络响应
                if method == 'Network.responseReceived':
                    response = message['message']['params']['response']
                    url = response.get('url', '')
                    mime_type = response.get('mimeType', '')
                    
                    # 根据MIME类型分类
                    if 'javascript' in mime_type or url.endswith('.js'):
                        resources['javascript'].append(url)
                    elif 'css' in mime_type or url.endswith('.css'):
                        resources['css'].append(url)
                    elif 'image' in mime_type or any(url.endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']):
                        resources['images'].append(url)
                    elif 'font' in mime_type or any(url.endswith(ext) for ext in ['.woff', '.woff2', '.ttf', '.otf']):
                        resources['fonts'].append(url)
                    elif url.startswith('http'):
                        resources['other'].append(url)
            
            # 去重
            for key in resources:
                resources[key] = list(set(resources[key]))
            
            print(f"  从网络日志中发现:")
            print(f"    JavaScript: {len(resources['javascript'])} 个")
            print(f"    CSS: {len(resources['css'])} 个")
            print(f"    图片: {len(resources['images'])} 个")
            print(f"    字体: {len(resources['fonts'])} 个")
            print(f"    其他: {len(resources['other'])} 个")
            
        except Exception as e:
            print(f"  错误: {e}")
        
        return resources
    
    def save_page_html(self):
        """保存页面的HTML（包括动态渲染的内容）"""
        print("\n正在保存页面HTML...")
        try:
            # 等待Vue/React应用完全渲染
            print("  等待动态内容渲染...")
            time.sleep(3)
            
            # 获取完整的页面源代码（包括JavaScript渲染的内容）
            html = self.driver.page_source
            
            # 保存原始HTML
            html_file = self.output_dir / 'index.html'
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(html)
            print(f"  ✓ 原始HTML已保存: {html_file}")
            
            # 保存完整渲染后的HTML（通过JavaScript获取）
            rendered_html = self.driver.execute_script("return document.documentElement.outerHTML")
            rendered_file = self.output_dir / 'index_rendered.html'
            with open(rendered_file, 'w', encoding='utf-8') as f:
                f.write(rendered_html)
            print(f"  ✓ 渲染后的HTML已保存: {rendered_file}")
            
            # 保存body内容（主要的应用内容）
            body_html = self.driver.execute_script("return document.body.outerHTML")
            body_file = self.output_dir / 'body.html'
            with open(body_file, 'w', encoding='utf-8') as f:
                f.write(body_html)
            print(f"  ✓ Body内容已保存: {body_file}")
            
            # 提取并保存所有可见文本
            text_content = self.driver.execute_script("return document.body.innerText")
            text_file = self.output_dir / 'page_text.txt'
            with open(text_file, 'w', encoding='utf-8') as f:
                f.write(text_content)
            print(f"  ✓ 页面文本已保存: {text_file}")
            
            # 保存Vue/React应用的数据（如果存在）
            self.save_app_data()
            
        except Exception as e:
            print(f"  错误: {e}")
            import traceback
            traceback.print_exc()
    
    def save_app_data(self):
        """保存前端应用的数据状态"""
        print("\n  正在提取应用数据...")
        app_data = {}
        
        try:
            # 尝试提取Vue应用数据
            try:
                vue_data = self.driver.execute_script("""
                    // 查找Vue实例
                    if (window.__VUE_DEVTOOLS_GLOBAL_HOOK__ && window.__VUE_DEVTOOLS_GLOBAL_HOOK__.apps) {
                        const apps = Array.from(window.__VUE_DEVTOOLS_GLOBAL_HOOK__.apps);
                        return apps.map(app => ({
                            data: app._instance?.data || null,
                            props: app._instance?.props || null
                        }));
                    }
                    return null;
                """)
                if vue_data:
                    app_data['vue'] = vue_data
                    print("    ✓ 提取到Vue应用数据")
            except:
                pass
            
            # 提取window对象中的关键数据
            try:
                window_data = self.driver.execute_script("""
                    const data = {};
                    
                    // 提取常见的全局变量
                    const keys = ['config', 'appConfig', 'pageData', 'userData', 'courseData'];
                    keys.forEach(key => {
                        if (window[key]) {
                            data[key] = window[key];
                        }
                    });
                    
                    return data;
                """)
                if window_data:
                    app_data['window'] = window_data
                    print("    ✓ 提取到Window全局数据")
            except:
                pass
            
            # 提取localStorage
            try:
                local_storage = self.driver.execute_script("""
                    const storage = {};
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        try {
                            storage[key] = JSON.parse(localStorage.getItem(key));
                        } catch {
                            storage[key] = localStorage.getItem(key);
                        }
                    }
                    return storage;
                """)
                if local_storage:
                    app_data['localStorage'] = local_storage
                    print("    ✓ 提取到localStorage数据")
            except:
                pass
            
            # 提取sessionStorage
            try:
                session_storage = self.driver.execute_script("""
                    const storage = {};
                    for (let i = 0; i < sessionStorage.length; i++) {
                        const key = sessionStorage.key(i);
                        try {
                            storage[key] = JSON.parse(sessionStorage.getItem(key));
                        } catch {
                            storage[key] = sessionStorage.getItem(key);
                        }
                    }
                    return storage;
                """)
                if session_storage:
                    app_data['sessionStorage'] = session_storage
                    print("    ✓ 提取到sessionStorage数据")
            except:
                pass
            
            # 保存应用数据
            if app_data:
                app_data_file = self.output_dir / 'app_data.json'
                with open(app_data_file, 'w', encoding='utf-8') as f:
                    json.dump(app_data, f, indent=2, ensure_ascii=False, default=str)
                print(f"    ✓ 应用数据已保存: {app_data_file}")
            
        except Exception as e:
            print(f"    提取应用数据时出错: {e}")
    
    def download_all(self):
        """下载所有资源"""
        print(f"\n{'='*60}")
        print(f"开始下载网站: {self.url}")
        print(f"保存目录: {self.output_dir.absolute()}")
        print(f"{'='*60}")
        
        try:
            # 设置浏览器
            self.setup_driver()
            
            # 访问网页
            print(f"\n正在加载页面: {self.url}")
            self.driver.get(self.url)
            
            # 等待页面加载
            print("等待页面完全加载...")
            time.sleep(5)  # 给JavaScript时间执行
            
            # 等待特定元素（可以根据实际页面调整）
            try:
                WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.TAG_NAME, "body"))
                )
            except:
                pass
            
            # 滚动页面以触发懒加载
            print("滚动页面以加载所有资源...")
            last_height = self.driver.execute_script("return document.body.scrollHeight")
            while True:
                self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(2)
                new_height = self.driver.execute_script("return document.body.scrollHeight")
                if new_height == last_height:
                    break
                last_height = new_height
            
            # 回到顶部
            self.driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(2)
            
            # 提取资源
            dom_resources = self.extract_resources_from_dom()
            network_resources = self.extract_resources_from_network()
            
            # 合并资源列表
            all_resources = {}
            for res_type in ['javascript', 'css', 'images', 'fonts', 'videos']:
                all_resources[res_type] = list(set(
                    dom_resources.get(res_type, []) + 
                    network_resources.get(res_type, [])
                ))
            
            # 添加其他网络资源
            if 'other' in network_resources:
                all_resources['other'] = network_resources['other']
            
            # 下载所有资源
            print(f"\n{'='*60}")
            print("开始下载资源文件...")
            print(f"{'='*60}")
            
            stats = {}
            for res_type, urls in all_resources.items():
                if urls:
                    print(f"\n下载 {res_type} ({len(urls)} 个):")
                    success = 0
                    for url in urls:
                        if self.download_resource(url, res_type):
                            success += 1
                    stats[res_type] = {'total': len(urls), 'success': success}
            
            # 保存HTML和页面结构
            self.save_page_html()
            self.save_dom_structure()
            
            # 保存资源清单
            manifest_file = self.output_dir / 'manifest.json'
            manifest = {
                'url': self.url,
                'download_time': time.strftime('%Y-%m-%d %H:%M:%S'),
                'resources': all_resources,
                'statistics': stats
            }
            
            with open(manifest_file, 'w', encoding='utf-8') as f:
                json.dump(manifest, f, indent=2, ensure_ascii=False)
            
            print(f"\n{'='*60}")
            print("下载完成！统计信息:")
            print(f"{'='*60}")
            for res_type, stat in stats.items():
                print(f"{res_type:12}: {stat['success']}/{stat['total']} 成功")
            print(f"\n所有文件已保存到: {self.output_dir.absolute()}")
            print(f"资源清单: {manifest_file}")
            
        except Exception as e:
            print(f"\n错误: {e}")
            import traceback
            traceback.print_exc()
        
        finally:
            if self.driver:
                print("\n关闭浏览器...")
                self.driver.quit()


    def save_dom_structure(self):
        """保存DOM结构分析"""
        print("\n正在分析DOM结构...")
        try:
            dom_info = self.driver.execute_script("""
                function analyzeDom() {
                    const result = {
                        buttons: [],
                        forms: [],
                        inputs: [],
                        links: [],
                        videos: [],
                        iframes: []
                    };
                    
                    // 提取所有按钮
                    document.querySelectorAll('button, [role="button"], .btn').forEach(btn => {
                        result.buttons.push({
                            text: btn.textContent.trim(),
                            class: btn.className,
                            id: btn.id,
                            type: btn.type || 'button'
                        });
                    });
                    
                    // 提取所有表单
                    document.querySelectorAll('form').forEach(form => {
                        result.forms.push({
                            action: form.action,
                            method: form.method,
                            id: form.id,
                            class: form.className
                        });
                    });
                    
                    // 提取所有输入框
                    document.querySelectorAll('input, textarea, select').forEach(input => {
                        result.inputs.push({
                            type: input.type || 'text',
                            name: input.name,
                            id: input.id,
                            placeholder: input.placeholder,
                            value: input.value
                        });
                    });
                    
                    // 提取所有链接
                    document.querySelectorAll('a').forEach(link => {
                        if (link.href) {
                            result.links.push({
                                text: link.textContent.trim(),
                                href: link.href,
                                class: link.className
                            });
                        }
                    });
                    
                    // 提取视频信息
                    document.querySelectorAll('video').forEach(video => {
                        result.videos.push({
                            src: video.src,
                            currentSrc: video.currentSrc,
                            duration: video.duration,
                            controls: video.controls,
                            autoplay: video.autoplay
                        });
                    });
                    
                    // 提取iframe
                    document.querySelectorAll('iframe').forEach(iframe => {
                        result.iframes.push({
                            src: iframe.src,
                            id: iframe.id,
                            class: iframe.className
                        });
                    });
                    
                    return result;
                }
                
                return analyzeDom();
            """)
            
            dom_file = self.output_dir / 'dom_structure.json'
            with open(dom_file, 'w', encoding='utf-8') as f:
                json.dump(dom_info, f, indent=2, ensure_ascii=False)
            
            print(f"  ✓ DOM结构已保存: {dom_file}")
            print(f"    - 按钮: {len(dom_info.get('buttons', []))} 个")
            print(f"    - 表单: {len(dom_info.get('forms', []))} 个")
            print(f"    - 输入框: {len(dom_info.get('inputs', []))} 个")
            print(f"    - 链接: {len(dom_info.get('links', []))} 个")
            print(f"    - 视频: {len(dom_info.get('videos', []))} 个")
            
        except Exception as e:
            print(f"  分析DOM结构时出错: {e}")

def main():
    """主函数"""
    # 配置要下载的网站
    url = "https://academy.famsungroup.com/kng/#/video/play?kngId=3c510a2e-b33e-42fb-8191-c61d8ea0ddfd"
    output_dir = "webpage/downloaded_site_full"
    
    print("""
╔══════════════════════════════════════════════════════════════╗
║          网站完整资源下载工具 v1.0                           ║
╚══════════════════════════════════════════════════════════════╝

功能:
  ✓ 自动下载网站的所有JavaScript文件
  ✓ 下载CSS样式表
  ✓ 下载图片资源
  ✓ 下载字体文件
  ✓ 保存页面HTML
  ✓ 生成资源清单

要求:
  1. 已安装Chrome浏览器
  2. 已安装Python包: selenium, webdriver-manager, requests
  
安装命令:
  pip install selenium webdriver-manager requests

""")
    
    input("按回车键开始下载...")
    
    downloader = WebsiteDownloader(url, output_dir)
    downloader.download_all()


if __name__ == "__main__":
    main()
