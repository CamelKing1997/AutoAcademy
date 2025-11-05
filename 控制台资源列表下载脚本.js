// 收集所有资源URL和HTML
function collectResources() {
    const resources = {
        javascript: [],
        css: [],
        html: {
            original: document.documentElement.outerHTML,
            url: window.location.href,
            title: document.title
        }
    };
    
    // 收集JavaScript
    document.querySelectorAll('script[src]').forEach(script => {
        resources.javascript.push(script.src);
    });
    
    // 收集CSS
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        resources.css.push(link.href);
    });
    
    // 从Performance API获取所有网络资源
    const perfEntries = performance.getEntriesByType('resource');
    perfEntries.forEach(entry => {
        const url = entry.name;
        if (url.endsWith('.js')) {
            resources.javascript.push(url);
        } else if (url.endsWith('.css')) {
            resources.css.push(url);
        }
    });
    
    // 去重
    resources.javascript = [...new Set(resources.javascript)];
    resources.css = [...new Set(resources.css)];
    
    return resources;
}

// 生成安全的文件名前缀
function generateFilePrefix() {
    // 获取页面标题,清理非法字符
    let title = document.title || 'page';
    title = title
        .replace(/[\\/:*?"<>|]/g, '_')  // 替换Windows非法字符
        .replace(/\s+/g, '_')            // 空格替换为下划线
        .replace(/_{2,}/g, '_')          // 多个下划线合并为一个
        .substring(0, 50);               // 限制长度
    
    // 获取URL路径信息
    const url = new URL(window.location.href);
    let pathname = url.pathname;
    
    // 提取有意义的路径部分
    const pathParts = pathname.split('/').filter(p => p && p !== 'index.html');
    let pathInfo = '';
    if (pathParts.length > 0) {
        // 取最后一个有意义的路径段
        pathInfo = pathParts[pathParts.length - 1]
            .replace(/[\\/:*?"<>|]/g, '_')
            .substring(0, 30);
    }
    
    // 提取查询参数中的ID (如kngId, courseId等)
    const idParams = ['kngId', 'id', 'courseId', 'videoId', 'playId'];
    let idInfo = '';
    for (const param of idParams) {
        if (url.searchParams.has(param)) {
            idInfo = url.searchParams.get(param).substring(0, 20);
            break;
        }
    }
    
    // 组合文件名前缀
    const parts = [title];
    if (pathInfo) parts.push(pathInfo);
    if (idInfo) parts.push(idInfo);
    
    return parts.join('_');
}

// 执行收集
const allResources = collectResources();
const filePrefix = generateFilePrefix();

// 输出结果
console.log('=== 资源统计 ===');
console.log('当前页面:', document.title);
console.log('文件前缀:', filePrefix);
console.log('JavaScript文件:', allResources.javascript.length);
console.log('CSS文件:', allResources.css.length);
console.log('HTML页面: 已收集');

// 下载resources.json (带页面信息前缀)
const blob1 = new Blob([JSON.stringify(allResources, null, 2)], {type: 'application/json'});
const url1 = URL.createObjectURL(blob1);
const a1 = document.createElement('a');
a1.href = url1;
a1.download = `${filePrefix}_resources.json`;
document.body.appendChild(a1);
a1.click();
document.body.removeChild(a1);

// 下载HTML文件 (带页面信息前缀)
const blob2 = new Blob([allResources.html.original], {type: 'text/html'});
const url2 = URL.createObjectURL(blob2);
const a2 = document.createElement('a');
a2.href = url2;
a2.download = `${filePrefix}_page.html`;
document.body.appendChild(a2);
a2.click();
document.body.removeChild(a2);

console.log(`\n✓ ${filePrefix}_resources.json 已下载`);
console.log(`✓ ${filePrefix}_page.html 已下载`);
console.log('\n提示: 图片文件已跳过(不影响脚本运行)');
console.log('文件名包含: 页面标题_路径_ID (如果有)');
