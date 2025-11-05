#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
分析下载的HTML页面,提取关键元素和选择器信息
"""

import json
import re
from pathlib import Path
from bs4 import BeautifulSoup


def analyze_html(html_path):
    """分析HTML页面结构"""
    print(f"\n{'='*60}")
    print(f"分析HTML: {html_path}")
    print(f"{'='*60}")
    
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')
    
    results = {
        'videos': [],
        'buttons': [],
        'links': [],
        'vue_app': {},
        'classes': set(),
        'ids': set()
    }
    
    # 查找视频元素
    print("\n📹 视频元素:")
    videos = soup.find_all('video')
    for i, video in enumerate(videos, 1):
        video_info = {
            'id': video.get('id'),
            'class': video.get('class'),
            'src': video.get('src'),
            'controls': video.has_attr('controls')
        }
        results['videos'].append(video_info)
        print(f"  {i}. ID: {video_info['id']}, Class: {video_info['class']}")
    
    # 查找按钮元素
    print("\n🔘 按钮元素:")
    buttons = soup.find_all(['button', 'a'])
    button_patterns = ['next', 'continue', 'start', '下一个', '下一节', '继续', '开始', '播放']
    
    for btn in buttons:
        text = btn.get_text(strip=True)
        classes = ' '.join(btn.get('class', []))
        btn_id = btn.get('id', '')
        
        # 只记录可能相关的按钮
        if any(pattern in text.lower() or pattern in classes.lower() or pattern in btn_id.lower() 
               for pattern in button_patterns):
            btn_info = {
                'tag': btn.name,
                'id': btn_id,
                'class': classes,
                'text': text[:50],
                'onclick': btn.get('onclick', ''),
                '@click': btn.get('@click', '') or btn.get('v-on:click', '')
            }
            results['buttons'].append(btn_info)
            print(f"  - {btn.name.upper()}: '{text[:30]}...' class={classes[:50]}")
    
    # 查找div中的按钮类元素
    print("\n🎯 可能的按钮DIV:")
    divs_with_click = soup.find_all('div', attrs={'@click': True})
    for div in divs_with_click[:10]:  # 限制输出
        print(f"  - DIV: @click={div.get('@click')}, class={div.get('class')}")
    
    # 收集所有class和id
    for elem in soup.find_all(True):
        if elem.get('class'):
            results['classes'].update(elem.get('class'))
        if elem.get('id'):
            results['ids'].add(elem.get('id'))
    
    # 查找Vue应用挂载点
    print("\n⚛️ Vue应用挂载点:")
    vue_apps = soup.find_all(id='app') + soup.find_all(attrs={'v-cloak': True})
    for app in vue_apps:
        print(f"  - ID: {app.get('id')}, Tag: {app.name}")
        results['vue_app'] = {
            'id': app.get('id'),
            'classes': app.get('class')
        }
    
    # 查找常见的UI框架类
    print("\n🎨 UI框架特征:")
    ui_patterns = ['yxt-', 'el-', 'ivu-', 'ant-', 'mui-']
    found_ui = set()
    for cls in results['classes']:
        for pattern in ui_patterns:
            if cls.startswith(pattern):
                found_ui.add(pattern.rstrip('-'))
                break
    print(f"  发现框架: {', '.join(found_ui) if found_ui else '无'}")
    
    # 转换set为list以便JSON序列化
    results['classes'] = sorted(list(results['classes']))
    results['ids'] = sorted(list(results['ids']))
    
    return results


def analyze_js_for_selectors(js_path):
    """分析JS文件,查找选择器和DOM操作"""
    print(f"\n{'='*60}")
    print(f"分析JS: {js_path.name}")
    print(f"{'='*60}")
    
    with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    results = {
        'selectors': [],
        'event_handlers': [],
        'navigation': []
    }
    
    # 查找querySelector
    selector_patterns = [
        r'querySelector\(["\']([^"\']+)["\']\)',
        r'querySelectorAll\(["\']([^"\']+)["\']\)',
        r'\$\(["\']([^"\']+)["\']\)',
        r'getElementById\(["\']([^"\']+)["\']\)',
        r'getElementsByClassName\(["\']([^"\']+)["\']\)'
    ]
    
    for pattern in selector_patterns:
        matches = re.findall(pattern, content)
        results['selectors'].extend(matches)
    
    # 查找事件处理
    event_patterns = [
        r'addEventListener\(["\']([^"\']+)["\']\s*,',
        r'on([A-Z][a-z]+)\s*=',
        r'@(click|change|input)'
    ]
    
    for pattern in event_patterns:
        matches = re.findall(pattern, content)
        results['event_handlers'].extend(matches)
    
    # 查找导航相关
    nav_keywords = ['next', 'goNext', 'nextPage', 'nextKng', 'nextSection', 'continue']
    for keyword in nav_keywords:
        if keyword in content:
            # 查找函数定义
            func_pattern = rf'(function\s+{keyword}|{keyword}\s*[:=]\s*function|\b{keyword}\s*\([^)]*\)\s*{{)'
            if re.search(func_pattern, content):
                results['navigation'].append(keyword)
    
    # 去重
    results['selectors'] = list(set(results['selectors']))
    results['event_handlers'] = list(set(results['event_handlers']))
    
    return results


def main():
    """主函数"""
    analysis_results = {
        'html_analysis': {},
        'js_analysis': {},
        'recommendations': []
    }
    
    # 分析HTML
    html_files = [
        Path('webpage/page.html'),
        Path('downloaded/page.html')
    ]
    
    for html_file in html_files:
        if html_file.exists():
            analysis_results['html_analysis'][str(html_file)] = analyze_html(html_file)
            break
    
    # 分析关键JS文件
    print(f"\n{'='*60}")
    print("分析关键JS文件")
    print(f"{'='*60}")
    
    js_files = [
        'downloaded/js/kng.js',
        'downloaded/js/base.js',
        'downloaded/js/index.js'
    ]
    
    for js_file in js_files:
        js_path = Path(js_file)
        if js_path.exists():
            print(f"\n📄 {js_path.name}:")
            js_results = analyze_js_for_selectors(js_path)
            
            if js_results['selectors']:
                print(f"  找到 {len(js_results['selectors'])} 个选择器")
                for sel in js_results['selectors'][:10]:
                    print(f"    - {sel}")
            
            if js_results['navigation']:
                print(f"  找到导航函数: {', '.join(js_results['navigation'])}")
            
            analysis_results['js_analysis'][js_file] = js_results
    
    # 生成建议
    print(f"\n{'='*60}")
    print("📋 油猴脚本优化建议")
    print(f"{'='*60}")
    
    recommendations = []
    
    # 视频选择器建议
    html_data = list(analysis_results['html_analysis'].values())[0] if analysis_results['html_analysis'] else {}
    
    if html_data.get('videos'):
        video = html_data['videos'][0]
        if video.get('id'):
            recommendations.append(f"视频选择器: document.getElementById('{video['id']}')")
        elif video.get('class'):
            recommendations.append(f"视频选择器: document.querySelector('.{video['class'][0]}')")
    
    # 按钮选择器建议
    if html_data.get('buttons'):
        print("\n建议的按钮选择器:")
        for btn in html_data['buttons'][:5]:
            if btn.get('id'):
                rec = f"document.getElementById('{btn['id']}')"
            elif btn.get('class'):
                rec = f"document.querySelector('.{btn['class'].split()[0]}')"
            else:
                rec = f"通过文本查找: Array.from(document.querySelectorAll('button, a')).find(el => el.textContent.includes('{btn['text'][:20]}'))"
            
            recommendations.append(rec)
            print(f"  - {rec}")
    
    # UI框架建议
    if 'yxt-' in str(html_data.get('classes', [])):
        recommendations.append("网站使用YXT框架,注意可能有Vue组件")
        print("\n⚠️ 注意: 网站使用YXT框架,可能需要等待Vue渲染完成")
    
    analysis_results['recommendations'] = recommendations
    
    # 保存结果
    output_file = Path('page_analysis_report.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(analysis_results, f, indent=2, ensure_ascii=False)
    
    print(f"\n{'='*60}")
    print(f"✅ 分析完成! 结果已保存到: {output_file}")
    print(f"{'='*60}")
    
    return analysis_results


if __name__ == '__main__':
    main()
