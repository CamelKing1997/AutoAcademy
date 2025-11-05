#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从resources.json批量下载文件
使用方法: 
  python batch_download.py                    # 自动扫描webpage目录
  python batch_download.py resources.json     # 下载指定文件
  python batch_download.py --all              # 下载webpage目录所有资源
"""

import json
import requests
import sys
from pathlib import Path
from urllib.parse import urlparse, unquote
import time
import glob


def download_file(url, save_dir, category):
    """下载单个文件"""
    try:
        # 解析URL获取文件名
        parsed = urlparse(url)
        path = unquote(parsed.path)
        filename = path.split('/')[-1]
        
        # 如果没有文件名或文件名无效，使用hash
        if not filename or '.' not in filename:
            import hashlib
            url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
            ext = {
                'javascript': '.js',
                'css': '.css',
                'images': '.png'
            }.get(category, '.bin')
            filename = f"{url_hash}{ext}"
        
        # 清理文件名
        filename = filename.split('?')[0]  # 移除查询参数
        
        filepath = Path(save_dir) / filename
        
        # 如果文件已存在，跳过
        if filepath.exists():
            print(f"  跳过(已存在): {filename}")
            return True
        
        # 下载文件
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        # 保存文件
        with open(filepath, 'wb') as f:
            f.write(response.content)
        
        size = len(response.content)
        print(f"  ✓ {filename} ({size:,} bytes)")
        return True
        
    except Exception as e:
        print(f"  ✗ 失败: {url}")
        print(f"     原因: {e}")
        return False


def find_resource_files():
    """自动查找webpage目录下的所有*_resources.json文件"""
    webpage_dir = Path('webpage')
    if not webpage_dir.exists():
        return []
    
    # 查找所有以_resources.json结尾的文件
    resource_files = list(webpage_dir.glob('*_resources.json'))
    return sorted(resource_files)


def extract_page_name(json_path):
    """从文件名提取页面名称"""
    filename = json_path.stem  # 去掉.json
    # 移除_resources后缀
    if filename.endswith('_resources'):
        page_name = filename[:-len('_resources')]
    else:
        page_name = filename
    return page_name


def download_from_json(json_file, output_prefix=None):
    """从单个JSON文件下载资源"""
    json_path = Path(json_file)
    
    if not json_path.exists():
        print(f"❌ 错误: 文件不存在 {json_file}")
        return False
    
    # 提取页面名称用于输出目录
    page_name = extract_page_name(json_path)
    if output_prefix:
        output_dir = f"downloaded/{output_prefix}"
    else:
        output_dir = f"downloaded/{page_name}"
    
    print(f"\n{'='*70}")
    print(f"📄 处理资源文件: {json_path.name}")
    print(f"📂 输出目录: {output_dir}")
    print(f"{'='*70}")
    
    # 读取资源清单
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            resources = json.load(f)
    except Exception as e:
        print(f"❌ 读取JSON失败: {e}")
        return False
    
    # 创建目录
    dirs = {
        'javascript': f'{output_dir}/js',
        'css': f'{output_dir}/css'
    }
    
    for dir_path in dirs.values():
        Path(dir_path).mkdir(parents=True, exist_ok=True)
    
    # 保存HTML文件(如果有)
    if 'html' in resources and isinstance(resources['html'], dict):
        html_path = Path(f'{output_dir}/page.html')
        html_path.parent.mkdir(parents=True, exist_ok=True)
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(resources['html'].get('original', ''))
        print(f"✓ HTML已保存: {html_path}")
    
    # 统计
    stats = {
        'javascript': {'total': 0, 'success': 0},
        'css': {'total': 0, 'success': 0}
    }
    
    # 下载所有资源(跳过html和图片)
    print("\n开始批量下载...")
    
    for category, urls in resources.items():
        # 跳过html和images
        if category in ['html', 'images', 'other']:
            continue
            
        if not urls:
            continue
        
        print(f"\n📦 下载 {category} ({len(urls)} 个文件):")
        save_dir = dirs.get(category, output_dir)
        
        stats[category]['total'] = len(urls)
        
        for i, url in enumerate(urls, 1):
            print(f"  [{i}/{len(urls)}]", end=" ")
            if download_file(url, save_dir, category):
                stats[category]['success'] += 1
            time.sleep(0.3)  # 避免请求过快
    
    # 输出统计
    print(f"\n{'='*70}")
    print("📊 下载统计:")
    print(f"{'='*70}")
    
    total_files = 0
    total_success = 0
    
    for category, stat in stats.items():
        if stat['total'] > 0:
            total_files += stat['total']
            total_success += stat['success']
            success_rate = (stat['success'] / stat['total']) * 100
            print(f"  {category:12} {stat['success']:3}/{stat['total']:3} ({success_rate:.1f}%)")
    
    if total_files > 0:
        print(f"  {'总计':12} {total_success:3}/{total_files:3} ({(total_success/total_files)*100:.1f}%)")
        print(f"\n✅ 文件已保存到: {Path(output_dir).absolute()}")
        return True
    else:
        print("  ⚠️  没有需要下载的文件")
        return False


def main():
    """主函数"""
    # 解析命令行参数
    if len(sys.argv) < 2:
        # 没有参数,自动扫描webpage目录
        print("🔍 自动扫描 webpage 目录...")
        resource_files = find_resource_files()
        
        if not resource_files:
            print("❌ 未找到任何 *_resources.json 文件")
            print("💡 提示:")
            print("  - 确保文件在 webpage 目录下")
            print("  - 文件名应以 _resources.json 结尾")
            print("  - 或指定文件: python batch_download.py <文件路径>")
            sys.exit(1)
        
        print(f"📋 找到 {len(resource_files)} 个资源文件:\n")
        for i, f in enumerate(resource_files, 1):
            print(f"  {i}. {f.name}")
        
        # 询问用户选择
        print(f"\n{'='*70}")
        choice = input("请选择操作:\n  [A] 下载所有\n  [数字] 下载指定文件\n  [Q] 退出\n\n请输入: ").strip().upper()
        
        if choice == 'Q':
            print("👋 已取消")
            sys.exit(0)
        elif choice == 'A':
            # 下载所有
            print(f"\n{'='*70}")
            print("🚀 开始下载所有资源文件...")
            print(f"{'='*70}")
            success_count = 0
            for json_file in resource_files:
                if download_from_json(json_file):
                    success_count += 1
            print(f"\n{'='*70}")
            print(f"🎉 完成! 成功处理 {success_count}/{len(resource_files)} 个文件")
            print(f"{'='*70}")
        else:
            # 下载指定文件
            try:
                index = int(choice) - 1
                if 0 <= index < len(resource_files):
                    download_from_json(resource_files[index])
                else:
                    print(f"❌ 无效的选择: {choice}")
                    sys.exit(1)
            except ValueError:
                print(f"❌ 无效的输入: {choice}")
                sys.exit(1)
    
    elif sys.argv[1] == '--all':
        # 下载所有,不询问
        resource_files = find_resource_files()
        if not resource_files:
            print("❌ 未找到任何 *_resources.json 文件")
            sys.exit(1)
        
        print(f"🚀 批量下载 {len(resource_files)} 个资源文件...")
        success_count = 0
        for json_file in resource_files:
            if download_from_json(json_file):
                success_count += 1
        print(f"\n🎉 完成! 成功处理 {success_count}/{len(resource_files)} 个文件")
    
    else:
        # 下载指定文件
        json_file = sys.argv[1]
        download_from_json(json_file)


if __name__ == "__main__":
    main()
