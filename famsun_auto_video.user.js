// ==UserScript==
// @name         FAMSUN Academy 视频自动播放助手
// @namespace    http://tampermonkey.net/
// @version      1.3.5
// @description  自动播放FAMSUN Academy视频并满足观看时长要求 (v1.3.5: 修复UI速度显示同步问题)
// @author       AutoAcademy
// @match        https://academy.famsungroup.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置项 ====================
    const CONFIG = {
        autoStart: GM_getValue('autoStart', true),          // 自动开始
        playbackSpeed: GM_getValue('playbackSpeed', 1.0),   // 播放速度(1.0=正常)
        autoNext: GM_getValue('autoNext', true),            // 自动下一个
        simulateActivity: GM_getValue('simulateActivity', true), // 模拟用户活动
        debugMode: GM_getValue('debugMode', false),         // 调试模式
        minWatchPercent: GM_getValue('minWatchPercent', 95), // 最低观看百分比
        pdfScrollInterval: GM_getValue('pdfScrollInterval', 3000), // PDF滚动间隔(毫秒)
        pdfScrollStep: GM_getValue('pdfScrollStep', 500)    // PDF每次滚动距离(像素)
    };

    // ==================== 日志系统 ====================
    class Logger {
        static log(message, data = null) {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[FAMSUN助手 ${timestamp}] ${message}`, data || '');
        }

        static error(message, error = null) {
            const timestamp = new Date().toLocaleTimeString();
            console.error(`[FAMSUN助手 ${timestamp}] ❌ ${message}`, error || '');
        }

        static success(message) {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[FAMSUN助手 ${timestamp}] ✅ ${message}`);
        }

        static debug(message, data = null) {
            if (CONFIG.debugMode) {
                const timestamp = new Date().toLocaleTimeString();
                console.log(`[FAMSUN助手 DEBUG ${timestamp}] ${message}`, data || '');
            }
        }
    }

    // ==================== 状态管理 ====================
    class StateManager {
        constructor() {
            this.state = {
                isRunning: false,
                currentVideo: null,
                startTime: null,
                requiredDuration: 0,
                watchedDuration: 0,
                lastUpdateTime: Date.now()
            };
        }

        setState(updates) {
            this.state = { ...this.state, ...updates };
            Logger.debug('状态更新', this.state);
        }

        getState() {
            return { ...this.state };
        }
    }

    // ==================== 反检测模块 ====================
    class AntiDetection {
        constructor() {
            this.mouseTimer = null;
            this.keyTimer = null;
            this.init();
        }

        init() {
            // 防止页面焦点丢失检测
            this.preventFocusDetection();
            
            // 防止速度检测
            this.preventSpeedDetection();
            
            // 模拟用户活动
            if (CONFIG.simulateActivity) {
                this.simulateUserActivity();
            }
        }

        // 防止页面焦点丢失检测
        preventFocusDetection() {
            // 劫持 visibilitychange 事件
            const originalAddEventListener = document.addEventListener;
            document.addEventListener = function(type, listener, options) {
                if (type === 'visibilitychange' || type === 'blur') {
                    Logger.debug('拦截焦点检测事件', type);
                    return; // 不添加焦点监听器
                }
                return originalAddEventListener.call(this, type, listener, options);
            };

            // 劫持 visibilityState 属性
            Object.defineProperty(document, 'hidden', {
                get: function() { return false; }
            });

            Object.defineProperty(document, 'visibilityState', {
                get: function() { return 'visible'; }
            });

            Logger.success('已启用焦点检测防护');
        }

        // 防止播放速度检测
        preventSpeedDetection() {
            // 注意: 这个功能可能会影响页面UI显示速度
            // 暂时禁用以保持UI一致性
            // 如果网站有速度检测,可以重新启用
            
            /* 
            const originalPlaybackRate = Object.getOwnPropertyDescriptor(
                HTMLMediaElement.prototype, 
                'playbackRate'
            );

            if (originalPlaybackRate) {
                Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', {
                    get: function() {
                        // 对外始终显示正常速度
                        return 1.0;
                    },
                    set: function(value) {
                        // 内部使用实际速度
                        originalPlaybackRate.set.call(this, CONFIG.playbackSpeed);
                    }
                });
                Logger.success('已启用速度检测防护');
            }
            */
            
            Logger.log('速度检测防护已禁用(保持UI一致性)');
        }

        // 模拟用户活动
        simulateUserActivity() {
            // 定期触发鼠标移动
            this.mouseTimer = setInterval(() => {
                const event = new MouseEvent('mousemove', {
                    bubbles: true,
                    cancelable: true,
                    clientX: Math.random() * window.innerWidth,
                    clientY: Math.random() * window.innerHeight
                });
                document.dispatchEvent(event);
                Logger.debug('模拟鼠标移动');
            }, 30000 + Math.random() * 30000); // 30-60秒随机间隔

            // 定期触发键盘事件
            this.keyTimer = setInterval(() => {
                const event = new KeyboardEvent('keydown', {
                    bubbles: true,
                    cancelable: true,
                    key: 'Shift'
                });
                document.dispatchEvent(event);
                Logger.debug('模拟键盘活动');
            }, 45000 + Math.random() * 45000); // 45-90秒随机间隔

            Logger.success('已启用用户活动模拟');
        }

        destroy() {
            if (this.mouseTimer) clearInterval(this.mouseTimer);
            if (this.keyTimer) clearInterval(this.keyTimer);
        }
    }

    // ==================== 视频控制模块 ====================
    class VideoController {
        constructor(stateManager, autoPlayer = null) {
            this.stateManager = stateManager;
            this.autoPlayer = autoPlayer; // 添加autoPlayer引用用于自动跳转
            this.player = null;
            this.videoElement = null;
            this.updateInterval = null;
        }

        // 查找视频播放器 (基于HTML分析优化)
        findPlayer() {
            // 方法1: 查找 CyberPlayer
            if (unsafeWindow.cyberplayer) {
                this.player = unsafeWindow.cyberplayer;
                Logger.success('找到 CyberPlayer 播放器');
                Logger.debug('CyberPlayer API:', {
                    hasCurrentTime: 'currentTime' in this.player,
                    hasDuration: 'duration' in this.player,
                    hasPlaybackRate: 'playbackRate' in this.player
                });
            }

            // 方法2: 查找 video.js
            if (unsafeWindow.videojs) {
                const players = unsafeWindow.videojs.getPlayers();
                if (players && Object.keys(players).length > 0) {
                    this.player = players[Object.keys(players)[0]];
                    Logger.success('找到 VideoJS 播放器');
                }
            }

            // 方法3: 根据HTML分析查找特定ID的video元素
            const videoSelectors = [
                '#videocontainer-vjs',  // 根据HTML分析添加
                'video',
                '.video-js',
                '.jw-video'
            ];
            
            for (const selector of videoSelectors) {
                this.videoElement = document.querySelector(selector);
                if (this.videoElement) {
                    Logger.success(`找到 video 元素: ${selector}`);
                    break;
                }
            }

            // 只要找到任意一种就算成功
            if (this.player || this.videoElement) {
                return true;
            }

            Logger.error('未找到视频播放器');
            return false;
        }

        // 播放视频
        async play() {
            try {
                if (this.player && this.player.play) {
                    await this.player.play();
                } else if (this.videoElement) {
                    await this.videoElement.play();
                }
                Logger.success('视频开始播放');
                this.startMonitoring();
                return true;
            } catch (error) {
                Logger.error('播放失败', error);
                return false;
            }
        }

        // 暂停视频
        pause() {
            try {
                if (this.player && this.player.pause) {
                    this.player.pause();
                } else if (this.videoElement) {
                    this.videoElement.pause();
                }
                Logger.log('视频已暂停');
            } catch (error) {
                Logger.error('暂停失败', error);
            }
        }

        // 设置播放速度
        setPlaybackSpeed(speed) {
            try {
                let success = false;
                
                // CyberPlayer API (函数调用)
                if (this.player && typeof this.player.playbackRate === 'function') {
                    this.player.playbackRate(speed);
                    Logger.log(`通过CyberPlayer函数设置速度为 ${speed}x`);
                    success = true;
                }
                // CyberPlayer 属性设置
                else if (this.player && 'playbackRate' in this.player) {
                    this.player.playbackRate = speed;
                    Logger.log(`通过CyberPlayer属性设置速度为 ${speed}x`);
                    success = true;
                }
                // 原生 video 元素
                else if (this.videoElement) {
                    this.videoElement.playbackRate = speed;
                    Logger.log(`通过video元素设置速度为 ${speed}x`);
                    success = true;
                }
                // 尝试从 window.cyberplayer 设置
                else if (unsafeWindow.cyberplayer) {
                    if (typeof unsafeWindow.cyberplayer.playbackRate === 'function') {
                        unsafeWindow.cyberplayer.playbackRate(speed);
                        Logger.log(`通过window.cyberplayer函数设置速度为 ${speed}x`);
                        success = true;
                    } else {
                        unsafeWindow.cyberplayer.playbackRate = speed;
                        Logger.log(`通过window.cyberplayer属性设置速度为 ${speed}x`);
                        success = true;
                    }
                }
                
                if (success) {
                    Logger.success(`✅ 播放速度已设置为 ${speed}x`);
                    // 验证设置是否生效
                    setTimeout(() => {
                        const currentSpeed = this.getCurrentSpeed();
                        if (currentSpeed && Math.abs(currentSpeed - speed) < 0.01) {
                            Logger.success(`✅ 速度验证成功: ${currentSpeed}x`);
                        } else if (currentSpeed) {
                            Logger.log(`⚠️ 当前显示速度: ${currentSpeed}x`);
                        }
                    }, 500);
                } else {
                    Logger.error('❌ 无法设置播放速度 - 未找到有效的 API');
                }
            } catch (error) {
                Logger.error('设置速度失败', error);
            }
        }

        // 获取当前播放速度
        getCurrentSpeed() {
            try {
                // CyberPlayer API
                if (this.player && typeof this.player.playbackRate === 'function') {
                    return this.player.playbackRate();
                }
                // CyberPlayer 属性访问
                if (this.player && typeof this.player.playbackRate === 'number') {
                    return this.player.playbackRate;
                }
                // 原生 video 元素
                if (this.videoElement) {
                    return this.videoElement.playbackRate;
                }
                // 尝试从 window.cyberplayer 获取
                if (unsafeWindow.cyberplayer) {
                    const speed = unsafeWindow.cyberplayer.playbackRate;
                    if (typeof speed === 'function') return speed();
                    if (typeof speed === 'number') return speed;
                }
            } catch (error) {
                Logger.debug('获取播放速度失败', error);
            }
            return null;
        }

        // 获取当前播放时间
        getCurrentTime() {
            try {
                // CyberPlayer API
                if (this.player && typeof this.player.currentTime === 'function') {
                    return this.player.currentTime();
                }
                // CyberPlayer 属性访问
                if (this.player && typeof this.player.currentTime === 'number') {
                    return this.player.currentTime;
                }
                // VideoJS API
                if (this.player && this.player.currentTime) {
                    const time = this.player.currentTime();
                    if (typeof time === 'number') return time;
                }
                // 原生 video 元素
                if (this.videoElement) {
                    return this.videoElement.currentTime;
                }
                // 尝试从 window.cyberplayer 获取
                if (unsafeWindow.cyberplayer) {
                    const time = unsafeWindow.cyberplayer.currentTime;
                    if (typeof time === 'function') return time();
                    if (typeof time === 'number') return time;
                }
            } catch (error) {
                Logger.debug('获取当前时间失败', error);
            }
            return 0;
        }

        // 获取视频总时长
        getDuration() {
            try {
                // CyberPlayer API
                if (this.player && typeof this.player.duration === 'function') {
                    return this.player.duration();
                }
                // CyberPlayer 属性访问
                if (this.player && typeof this.player.duration === 'number') {
                    return this.player.duration;
                }
                // VideoJS API
                if (this.player && this.player.duration) {
                    const duration = this.player.duration();
                    if (typeof duration === 'number' && !isNaN(duration)) return duration;
                }
                // 原生 video 元素
                if (this.videoElement) {
                    const duration = this.videoElement.duration;
                    if (typeof duration === 'number' && !isNaN(duration)) return duration;
                }
                // 尝试从 window.cyberplayer 获取
                if (unsafeWindow.cyberplayer) {
                    const duration = unsafeWindow.cyberplayer.duration;
                    if (typeof duration === 'function') {
                        const d = duration();
                        if (typeof d === 'number' && !isNaN(d)) return d;
                    }
                    if (typeof duration === 'number' && !isNaN(duration)) return duration;
                }
            } catch (error) {
                Logger.debug('获取视频时长失败', error);
            }
            return 0;
        }

        // 监控播放进度
        startMonitoring() {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
            }

            let retryCount = 0;
            const maxRetries = 5;

            this.updateInterval = setInterval(() => {
                const currentTime = this.getCurrentTime();
                const duration = this.getDuration();
                
                // 如果无法获取时长,尝试重新查找播放器
                if (duration === 0 || isNaN(duration)) {
                    retryCount++;
                    if (retryCount <= maxRetries) {
                        Logger.debug(`等待视频加载... (${retryCount}/${maxRetries})`);
                        // 尝试重新获取 video 元素
                        if (!this.videoElement) {
                            this.videoElement = document.querySelector('video');
                        }
                        return;
                    } else if (retryCount === maxRetries + 1) {
                        Logger.error('无法获取视频时长,请检查视频是否正常加载');
                    }
                    return;
                }
                
                // 成功获取到时长
                if (retryCount > 0 && retryCount <= maxRetries) {
                    Logger.success(`成功获取视频信息 (时长: ${this.formatTime(duration)})`);
                    retryCount = 0;
                }
                
                const progress = (currentTime / duration * 100).toFixed(1);
                const requiredPercent = CONFIG.minWatchPercent;
                
                this.stateManager.setState({
                    watchedDuration: currentTime,
                    requiredDuration: duration * requiredPercent / 100
                });

                // 更新UI显示
                this.updateProgressUI(currentTime, duration, progress, requiredPercent);

                // 优先检查系统倒计时(更准确)
                if (this.checkSystemCompletion()) {
                    Logger.success('✅ 系统提示已完成学习要求');
                    this.onVideoComplete();
                    return;
                }

                // 备用方案: 检查播放进度
                if (progress >= requiredPercent) {
                    Logger.success(`已完成观看要求 (${progress}% >= ${requiredPercent}%)`);
                    this.onVideoComplete();
                }
            }, 1000);
        }

        // 检查系统倒计时是否完成
        checkSystemCompletion() {
            // 只查找特定的系统倒计时元素
            const selectors = [
                '.yxtbiz-language-slot',
                '.yxtulcdsdk-course-player__countdown'
            ];

            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (!element) continue;

                const text = element.textContent || '';
                
                // 必须先检查倒计时,避免误判
                const match = text.match(/还需\s*.*?(\d+)\s*分钟\s*(\d+)\s*秒/);
                if (match) {
                    const minutes = parseInt(match[1]);
                    const seconds = parseInt(match[2]);
                    const totalSeconds = minutes * 60 + seconds;
                    Logger.debug(`系统倒计时: ${minutes}分${seconds}秒 (剩余${totalSeconds}秒)`);
                    
                    // 如果倒计时小于等于3秒,认为已完成
                    if (totalSeconds <= 3) {
                        Logger.log('倒计时归零,学习完成');
                        return true;
                    }
                    
                    // 找到有效倒计时,但未完成
                    return false;
                }
                
                // 只有在没有找到倒计时数字时,才检查完成文本
                if (text.includes('已完成') || text.includes('恭喜')) {
                    Logger.log('检测到完成提示文本');
                    return true;
                }
            }

            return false;
        }

        // 更新进度UI
        updateProgressUI(currentTime, duration, progress, requiredPercent) {
            const statusDiv = document.getElementById('famsun-auto-status');
            if (!statusDiv) return;
            
            const currentTimeStr = this.formatTime(currentTime);
            const durationStr = this.formatTime(duration);
            
            // 进度条颜色
            let progressColor = '#4CAF50'; // 绿色
            if (progress < 30) {
                progressColor = '#f44336'; // 红色
            } else if (progress < 80) {
                progressColor = '#FF9800'; // 橙色
            }
            
            // 获取系统倒计时信息
            let systemCountdown = '<div style="color: #FFD700;">等待系统倒计时...</div>';
            const countdownElement = document.querySelector('.yxtbiz-language-slot, .yxtulcdsdk-course-player__countdown');
            if (countdownElement) {
                const text = countdownElement.textContent || '';
                const match = text.match(/还需\s*.*?(\d+)\s*分钟\s*(\d+)\s*秒/);
                if (match) {
                    const minutes = match[1];
                    const seconds = match[2];
                    systemCountdown = `<div style="color: #FFD700; font-weight: bold;">⏱ 系统要求: 还需${minutes}分${seconds}秒</div>`;
                } else if (text.includes('已完成') || text.includes('恭喜')) {
                    systemCountdown = `<div style="color: #4CAF50; font-weight: bold;">✅ 已完成学习要求</div>`;
                }
            }
            
            statusDiv.innerHTML = `
                <div style="font-size: 13px; line-height: 1.6;">
                    <div style="margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span style="font-weight: bold;">📹 播放进度</span>
                            <span style="font-weight: bold; color: #FFD700;">${progress}%</span>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 4px;">
                            <div style="background: ${progressColor}; height: 100%; width: ${progress}%; transition: width 0.3s;"></div>
                        </div>
                        <div style="font-size: 12px; opacity: 0.9;">
                            ${currentTimeStr} / ${durationStr}
                        </div>
                    </div>
                    <div style="font-size: 12px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 8px;">
                        ${systemCountdown}
                        <div style="margin-top: 4px;">⚡ 速度: ${CONFIG.playbackSpeed}x ${this.getSpeedStatus()}</div>
                    </div>
                </div>
            `;
        }

        // 获取速度状态显示
        getSpeedStatus() {
            const currentSpeed = this.getCurrentSpeed();
            if (currentSpeed === null) {
                return '✓';  // 无法获取时默认认为正确
            }
            
            if (Math.abs(currentSpeed - CONFIG.playbackSpeed) < 0.01) {
                return '✓';
            } else {
                return `(实际:${currentSpeed}x)`;
            }
        }

        // 格式化时间
        formatTime(seconds) {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            
            if (h > 0) {
                return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
            return `${m}:${s.toString().padStart(2, '0')}`;
        }

        // 视频完成回调
        onVideoComplete() {
            this.stopMonitoring();
            
            if (CONFIG.autoNext) {
                Logger.log('准备播放下一个视频...');
                setTimeout(() => {
                    this.playNextVideo();
                }, 3000);
            }
        }

        // 播放下一个视频
        playNextVideo() {
            Logger.log('尝试播放下一个视频...');
            
            // 优先查找完成对话框中的"继续学习下一章节"按钮
            const completionButton = document.querySelector('.ulcdsdk-nextchapterbutton');
            if (completionButton && completionButton.offsetParent !== null) {
                Logger.success('找到完成对话框按钮,点击继续学习下一章节');
                completionButton.click();
                
                // 等待页面跳转,然后重新启动自动播放
                setTimeout(() => {
                    Logger.log('页面已跳转到下一章节,准备重新启动...');
                    this.autoPlayer.start();
                }, 3000);
                return;
            }
            
            // 优先使用网站原生导航函数
            try {
                if (unsafeWindow.next && typeof unsafeWindow.next === 'function') {
                    Logger.log('使用原生next()函数');
                    unsafeWindow.next();
                    setTimeout(() => this.autoPlayer.start(), 3000);
                    return;
                }
                
                if (unsafeWindow.nextPage && typeof unsafeWindow.nextPage === 'function') {
                    Logger.log('使用原生nextPage()函数');
                    unsafeWindow.nextPage();
                    setTimeout(() => this.autoPlayer.start(), 3000);
                    return;
                }
            } catch (error) {
                Logger.debug('原生函数调用失败', error);
            }
            
            // 查找"继续学习"或"下一个"按钮 (根据HTML分析结果优化)
            const buttonSelectors = [
                // 完成对话框按钮
                'button:has-text("继续学习下一章节")',
                'button:has-text("下一章")',
                // YXT框架的"继续学习"按钮
                '.yxtf-button--primary',
                'button.yxtf-button',
                // 下一个指示器
                '[class*="next"]',
                // 通用选择器
                '.next-button',
                '[class*="continue"]',
                '[class*="下一个"]',
                '[class*="继续"]'
            ];
            
            for (const selector of buttonSelectors) {
                try {
                    const buttons = document.querySelectorAll(selector);
                    for (const btn of buttons) {
                        const text = btn.textContent.trim();
                        // 检查按钮文本是否包含关键词
                        if (btn.offsetParent !== null && 
                            (text.includes('继续学习') || 
                             text.includes('下一章') ||
                             text.includes('下一个') || 
                             text.includes('下一节') ||
                             text.includes('Next') ||
                             text.includes('Continue'))) {
                            Logger.log('点击下一个按钮', {selector, text});
                            btn.click();
                            setTimeout(() => this.autoPlayer.start(), 3000);
                            return;
                        }
                    }
                } catch (error) {
                    Logger.debug(`选择器失败: ${selector}`, error);
                }
            }
            
            // 最后尝试通过文本查找
            const allButtons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
            for (const btn of allButtons) {
                const text = btn.textContent.trim();
                if (btn.offsetParent !== null && 
                    (text === '继续学习' || 
                     text === '下一个' || 
                     text === '下一节' ||
                     text === 'Next')) {
                    Logger.log('通过文本找到按钮', text);
                    btn.click();
                    return;
                }
            }

            Logger.log('未找到下一个按钮，当前课程学习完成');
        }

        // 停止监控
        stopMonitoring() {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
        }
    }

    // ==================== PDF文档控制模块 ====================
    class PDFController {
        constructor(stateManager) {
            this.stateManager = stateManager;
            this.scrollContainer = null;
            this.scrollTimer = null;
            this.currentPage = 0;
            this.totalPages = 0;
            this.startTime = null;
            this.pdfType = null; // 'picture', 'tencent', 'aliyun', etc.
        }

        // 检测PDF阅读器类型
        detectPDFViewer() {
            // 类型1: 图片序列型 (yxtbiz-doc-player--picture)
            const picturePlayer = document.querySelector('.yxtbiz-doc-player--picture');
            if (picturePlayer) {
                this.pdfType = 'picture';
                this.scrollContainer = picturePlayer.querySelector('.yxtbiz-doc-player__scroll');
                const items = picturePlayer.querySelectorAll('.yxtbiz-doc-player__content-item');
                this.totalPages = items.length;
                Logger.success(`检测到图片序列型PDF, 共 ${this.totalPages} 页`);
                return true;
            }

            // 类型2: 腾讯文档查看器
            // 先查找通用的 .yxtbiz-doc-viewer 容器
            const docViewer = document.querySelector('.yxtbiz-doc-viewer, .yxtbiz-doc-viewer--tencent');
            if (docViewer) {
                this.pdfType = 'tencent';
                // 查找iframe
                const iframe = docViewer.querySelector('iframe');
                if (iframe) {
                    this.scrollContainer = iframe;
                    Logger.success('检测到腾讯文档查看器 (iframe)');
                } else {
                    this.scrollContainer = docViewer;
                    Logger.success('检测到腾讯文档查看器 (容器)');
                }
                return true;
            }

            // 类型3: 阿里云文档查看器
            const aliyunViewer = document.querySelector('.aliyun-content');
            if (aliyunViewer) {
                this.pdfType = 'aliyun';
                this.scrollContainer = aliyunViewer.querySelector('iframe') || aliyunViewer;
                Logger.success('检测到阿里云文档查看器');
                return true;
            }

            // 类型4: 直接检测iframe (兜底策略)
            const pdfIframe = document.querySelector('iframe[src*="prvsh.myqcloud.com"], iframe[src*="aliyundoc"]');
            if (pdfIframe) {
                this.pdfType = 'iframe';
                this.scrollContainer = pdfIframe;
                Logger.success('检测到PDF预览iframe');
                return true;
            }

            // 类型5: 通用PDF容器
            const genericPDF = document.querySelector('.yxtbiz-doc-player, .doc-viewer, .pdf-viewer');
            if (genericPDF) {
                this.pdfType = 'generic';
                this.scrollContainer = genericPDF;
                Logger.success('检测到通用PDF查看器');
                return true;
            }

            Logger.log('未检测到PDF阅读器');
            return false;
        }

        // 开始自动浏览PDF
        async startAutoReading() {
            if (!this.detectPDFViewer()) {
                return false;
            }

            this.startTime = Date.now();
            Logger.log('开始自动浏览PDF文档...');

            // 根据PDF类型选择不同的浏览策略
            if (this.pdfType === 'picture') {
                this.startPictureScrolling();
            } else {
                this.startGenericScrolling();
            }

            // 开始进度监控
            this.startMonitoring();
            return true;
        }

        // 图片序列型PDF滚动
        startPictureScrolling() {
            if (!this.scrollContainer) {
                Logger.error('未找到滚动容器');
                return;
            }

            this.scrollTimer = setInterval(() => {
                if (!this.scrollContainer) return;

                // 获取当前滚动位置
                const currentScroll = this.scrollContainer.scrollTop;
                const maxScroll = this.scrollContainer.scrollHeight - this.scrollContainer.clientHeight;

                if (currentScroll >= maxScroll - 50) {
                    // 已滚动到底部
                    Logger.log('PDF已浏览到底部');
                    this.stopScrolling();
                    this.checkCompletion();
                } else {
                    // 继续滚动
                    this.scrollContainer.scrollTop += CONFIG.pdfScrollStep;
                    this.currentPage = Math.floor((currentScroll / maxScroll) * this.totalPages);
                    Logger.debug(`PDF浏览进度: ${this.currentPage}/${this.totalPages} 页`);
                }
            }, CONFIG.pdfScrollInterval);
        }

        // 通用PDF滚动
        startGenericScrolling() {
            this.scrollTimer = setInterval(() => {
                // 尝试向下滚动页面
                const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
                const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

                if (currentScroll >= maxScroll - 50) {
                    Logger.log('PDF已浏览到底部');
                    this.stopScrolling();
                    this.checkCompletion();
                } else {
                    window.scrollBy(0, CONFIG.pdfScrollStep);
                }
            }, CONFIG.pdfScrollInterval);
        }

        // 停止滚动
        stopScrolling() {
            if (this.scrollTimer) {
                clearInterval(this.scrollTimer);
                this.scrollTimer = null;
            }
        }

        // 开始监控
        startMonitoring() {
            this.updateInterval = setInterval(() => {
                const elapsedTime = (Date.now() - this.startTime) / 1000;
                const elapsedMinutes = Math.floor(elapsedTime / 60);
                const elapsedSeconds = Math.floor(elapsedTime % 60);

                Logger.debug(`PDF浏览时长: ${elapsedMinutes}分${elapsedSeconds}秒`);

                // 检查是否需要显示倒计时
                const countdownElement = document.querySelector('.yxtulcdsdk-course-player__countdown');
                if (countdownElement) {
                    const text = countdownElement.textContent;
                    const match = text.match(/还需.*?(\d+)分钟.*?(\d+)秒/);
                    if (match) {
                        const requiredMinutes = parseInt(match[1]);
                        const requiredSeconds = parseInt(match[2]);
                        Logger.log(`还需学习: ${requiredMinutes}分${requiredSeconds}秒`);
                    }
                }
            }, 10000); // 每10秒更新一次
        }

        // 检查完成情况
        checkCompletion() {
            // 检查页面是否显示完成状态
            const countdownElement = document.querySelector('.yxtulcdsdk-course-player__countdown');
            if (countdownElement) {
                const text = countdownElement.textContent;
                if (text.includes('已完成') || text.includes('恭喜')) {
                    Logger.success('✅ PDF文档学习已完成!');
                    this.stopMonitoring();
                    return true;
                }
            }

            return false;
        }

        // 停止监控
        stopMonitoring() {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
        }

        // 清理资源
        destroy() {
            this.stopScrolling();
            this.stopMonitoring();
        }
    }

    // ==================== UI控制面板 ====================
    class ControlPanel {
        constructor(autoPlayer) {
            this.autoPlayer = autoPlayer;
            this.panel = null;
            this.init();
        }

        init() {
            this.createPanel();
            this.attachEvents();
        }

        createPanel() {
            const panel = document.createElement('div');
            panel.id = 'famsun-auto-panel';
            panel.innerHTML = `
                <div style="
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 15px;
                    border-radius: 10px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    z-index: 999999;
                    min-width: 280px;
                    font-family: Arial, sans-serif;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h3 style="margin: 0; font-size: 16px;">🎓 FAMSUN助手</h3>
                        <button id="famsun-toggle-panel" style="
                            background: rgba(255,255,255,0.2);
                            border: none;
                            color: white;
                            cursor: pointer;
                            padding: 5px 10px;
                            border-radius: 5px;
                        ">折叠</button>
                    </div>
                    <div id="famsun-panel-content">
                        <div id="famsun-auto-status" style="
                            background: rgba(255,255,255,0.1);
                            padding: 10px;
                            border-radius: 5px;
                            margin-bottom: 10px;
                            font-size: 12px;
                        ">
                            等待视频加载...
                        </div>
                        <div style="display: flex; gap: 5px; margin-bottom: 10px;">
                            <button id="famsun-start-btn" style="
                                flex: 1;
                                background: #4CAF50;
                                border: none;
                                color: white;
                                padding: 10px;
                                border-radius: 5px;
                                cursor: pointer;
                                font-weight: bold;
                            ">▶ 开始</button>
                            <button id="famsun-stop-btn" style="
                                flex: 1;
                                background: #f44336;
                                border: none;
                                color: white;
                                padding: 10px;
                                border-radius: 5px;
                                cursor: pointer;
                                font-weight: bold;
                            " disabled>⏸ 停止</button>
                        </div>
                        <div style="font-size: 12px;">
                            <label style="display: flex; align-items: center; margin-bottom: 5px;">
                                <span style="flex: 1;">播放速度:</span>
                                <select id="famsun-speed-select" style="
                                    padding: 5px;
                                    border-radius: 3px;
                                    border: none;
                                    background: white;
                                    color: #333;
                                    cursor: pointer;
                                ">
                                    <option value="0.5">x0.5</option>
                                    <option value="0.75">x0.75</option>
                                    <option value="1.0">x1</option>
                                    <option value="1.25">x1.25</option>
                                    <option value="1.5">x1.5</option>
                                    <option value="2.0">x2</option>
                                </select>
                            </label>
                            <label style="display: flex; align-items: center;">
                                <input type="checkbox" id="famsun-auto-next" checked style="margin-right: 5px;">
                                自动播放下一个
                            </label>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(panel);
            this.panel = panel;
        }

        attachEvents() {
            // 设置初始值
            document.getElementById('famsun-speed-select').value = CONFIG.playbackSpeed.toString();
            document.getElementById('famsun-auto-next').checked = CONFIG.autoNext;

            // 开始按钮
            document.getElementById('famsun-start-btn').addEventListener('click', () => {
                this.autoPlayer.start();
                this.updateButtonStates(true);
            });

            // 停止按钮
            document.getElementById('famsun-stop-btn').addEventListener('click', () => {
                this.autoPlayer.stop();
                this.updateButtonStates(false);
            });

            // 折叠按钮
            document.getElementById('famsun-toggle-panel').addEventListener('click', (e) => {
                const content = document.getElementById('famsun-panel-content');
                const btn = e.target;
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    btn.textContent = '折叠';
                } else {
                    content.style.display = 'none';
                    btn.textContent = '展开';
                }
            });

            // 速度选择
            document.getElementById('famsun-speed-select').addEventListener('change', (e) => {
                CONFIG.playbackSpeed = parseFloat(e.target.value);
                GM_setValue('playbackSpeed', CONFIG.playbackSpeed);
                if (this.autoPlayer.videoController) {
                    this.autoPlayer.videoController.setPlaybackSpeed(CONFIG.playbackSpeed);
                }
            });

            // 自动下一个
            document.getElementById('famsun-auto-next').addEventListener('change', (e) => {
                CONFIG.autoNext = e.target.checked;
                GM_setValue('autoNext', CONFIG.autoNext);
            });
        }

        updateButtonStates(isRunning) {
            document.getElementById('famsun-start-btn').disabled = isRunning;
            document.getElementById('famsun-stop-btn').disabled = !isRunning;
        }

        // 同步UI显示
        syncUI() {
            const speedSelect = document.getElementById('famsun-speed-select');
            if (speedSelect) {
                speedSelect.value = CONFIG.playbackSpeed.toString();
            }
            const autoNextCheckbox = document.getElementById('famsun-auto-next');
            if (autoNextCheckbox) {
                autoNextCheckbox.checked = CONFIG.autoNext;
            }
        }
    }

    // ==================== 主控制类 ====================
    class AutoPlayer {
        constructor() {
            this.stateManager = new StateManager();
            this.antiDetection = null;
            this.videoController = null;
            this.pdfController = null;
            this.controlPanel = null;
            this.contentType = null; // 'video' or 'pdf'
        }

        async init() {
            Logger.log('初始化 FAMSUN Academy 自动学习助手...');

            // 等待页面加载
            await this.waitForPageLoad();

            // 检测内容类型
            this.detectContentType();

            // 初始化反检测
            this.antiDetection = new AntiDetection();

            // 根据内容类型初始化控制器
            if (this.contentType === 'video') {
                this.videoController = new VideoController(this.stateManager, this);
            } else if (this.contentType === 'pdf') {
                this.pdfController = new PDFController(this.stateManager);
            }

            // 初始化控制面板
            this.controlPanel = new ControlPanel(this);

            // 注册菜单命令
            this.registerMenuCommands();

            Logger.success('初始化完成');

            // 如果配置自动开始，则自动启动
            if (CONFIG.autoStart) {
                setTimeout(() => this.start(), 2000);
            }
        }

        // 检测内容类型
        detectContentType() {
            // 检测是否为PDF页面
            const pdfIndicators = [
                '.yxtbiz-doc-player',
                '.yxtbiz-doc-viewer--tencent',
                '.yxtbiz-doc-viewer',
                '.aliyun-content',
                '.doc-viewer',
                '.pdf-viewer',
                'iframe[src*="prvsh.myqcloud.com"]',  // 腾讯文档预览
                'iframe[src*="aliyundoc"]'            // 阿里云文档预览
            ];

            for (const selector of pdfIndicators) {
                const element = document.querySelector(selector);
                if (element) {
                    this.contentType = 'pdf';
                    Logger.log(`检测到PDF文档页面 (${selector})`);
                    return;
                }
            }

            // 检测是否为视频页面
            const videoIndicators = [
                'video',
                '.video-js',
                '#videocontainer-vjs'
            ];

            for (const selector of videoIndicators) {
                if (document.querySelector(selector)) {
                    this.contentType = 'video';
                    Logger.log('检测到视频播放页面');
                    return;
                }
            }

            // 默认尝试视频
            this.contentType = 'video';
            Logger.log('未明确识别内容类型，默认为视频');
        }

        async waitForPageLoad() {
            return new Promise((resolve) => {
                if (document.readyState === 'complete') {
                    // 额外等待Vue渲染完成 (YXT框架使用Vue)
                    setTimeout(() => {
                        Logger.log('页面已加载，等待Vue渲染...');
                        this.waitForVueRender().then(resolve);
                    }, 500);
                } else {
                    window.addEventListener('load', () => {
                        setTimeout(() => {
                            Logger.log('页面load完成，等待Vue渲染...');
                            this.waitForVueRender().then(resolve);
                        }, 500);
                    });
                }
            });
        }

        async waitForVueRender() {
            // 等待Vue应用挂载 (YXT框架特征)
            let attempts = 0;
            const maxAttempts = 20;
            
            while (attempts < maxAttempts) {
                // 检查YXT框架的常见元素是否已渲染
                const yxtElements = document.querySelectorAll('[class*="yxt"]');
                if (yxtElements.length > 10) {
                    Logger.log('Vue渲染完成，找到YXT元素');
                    return;
                }
                
                attempts++;
                await this.sleep(200);
            }
            
            Logger.log('Vue渲染等待超时，继续执行');
        }

        async start() {
            // 防止重复启动
            if (this.stateManager.getState().isRunning) {
                Logger.log('⚠️ 自动播放已在运行中,跳过重复启动');
                return;
            }
            
            Logger.log('开始自动学习...');
            
            // 第一步: 尝试点击"开始学习"或"继续学习"按钮
            const startButtonClicked = await this.clickStartButton();
            if (startButtonClicked) {
                Logger.success('已点击开始学习按钮，等待内容加载...');
                await this.sleep(2000); // 等待内容加载
            }
            
            // 重新检测内容类型(因为内容是动态加载的)
            const oldContentType = this.contentType;
            this.detectContentType();
            
            // 如果内容类型改变,重新初始化对应的控制器
            if (this.contentType !== oldContentType) {
                if (this.contentType === 'video' && !this.videoController) {
                    this.videoController = new VideoController(this.stateManager, this);
                } else if (this.contentType === 'pdf' && !this.pdfController) {
                    this.pdfController = new PDFController(this.stateManager);
                }
            }
            
            // 根据内容类型选择不同的处理方式
            if (this.contentType === 'pdf') {
                await this.startPDFReading();
            } else {
                await this.startVideoPlaying();
            }
        }

        // 启动PDF阅读
        async startPDFReading() {
            Logger.log('启动PDF自动浏览...');
            
            const success = await this.pdfController.startAutoReading();
            
            if (success) {
                this.stateManager.setState({
                    isRunning: true,
                    startTime: Date.now()
                });
                Logger.success('PDF自动浏览已启动');
            } else {
                Logger.error('PDF自动浏览启动失败');
            }
        }

        // 启动视频播放
        async startVideoPlaying() {
            Logger.log('启动视频自动播放...');
            
            // 查找播放器
            let attempts = 0;
            const maxAttempts = 15; // 增加尝试次数
            
            while (!this.videoController.findPlayer() && attempts < maxAttempts) {
                Logger.log(`查找播放器... (${attempts + 1}/${maxAttempts})`);
                await this.sleep(1000);
                attempts++;
            }

            if (!this.videoController.player && !this.videoController.videoElement) {
                Logger.error('未找到视频播放器，请检查页面或手动点击开始学习按钮');
                return;
            }

            // 设置播放速度
            this.videoController.setPlaybackSpeed(CONFIG.playbackSpeed);
            
            // 同步UI显示
            if (this.controlPanel) {
                this.controlPanel.syncUI();
            }

            // 开始播放
            const success = await this.videoController.play();
            
            if (success) {
                this.stateManager.setState({
                    isRunning: true,
                    startTime: Date.now()
                });
                Logger.success('视频自动播放已启动');
            }
        }

        async clickStartButton() {
            Logger.log('查找开始学习/继续学习按钮...');
            
            // 定义按钮选择器和关键词
            const buttonSelectors = [
                // YXT框架按钮
                '.yxtf-button--primary',
                '.yxtf-button',
                'button.yxt-button'
            ];
            
            const keywords = [
                '开始学习',
                '继续学习',
                '播放'
            ];
            
            // 尝试查找并点击按钮
            for (const selector of buttonSelectors) {
                try {
                    const buttons = document.querySelectorAll(selector);
                    for (const btn of buttons) {
                        // 排除脚本自己的按钮
                        if (btn.id === 'famsun-start-btn' || btn.id === 'famsun-stop-btn') {
                            continue;
                        }
                        
                        const text = btn.textContent.trim();
                        const isVisible = btn.offsetParent !== null;
                        
                        // 检查按钮是否可见且文本匹配关键词
                        if (isVisible) {
                            for (const keyword of keywords) {
                                if (text.includes(keyword)) {
                                    Logger.log(`找到按钮: "${text}" (选择器: ${selector})`);
                                    btn.click();
                                    return true;
                                }
                            }
                        }
                    }
                } catch (error) {
                    Logger.debug(`选择器失败: ${selector}`, error);
                }
            }
            
            Logger.log('未找到开始学习按钮，可能已经在播放页面');
            return false;
        }

        stop() {
            Logger.log('停止自动播放');
            
            // 停止视频播放
            if (this.videoController) {
                this.videoController.pause();
                this.videoController.stopMonitoring();
            }
            
            // 停止PDF浏览
            if (this.pdfController) {
                this.pdfController.destroy();
            }
            
            this.stateManager.setState({ isRunning: false });
        }

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        registerMenuCommands() {
            GM_registerMenuCommand('⚙️ 切换自动启动', () => {
                CONFIG.autoStart = !CONFIG.autoStart;
                GM_setValue('autoStart', CONFIG.autoStart);
                alert(`自动启动已${CONFIG.autoStart ? '启用' : '禁用'}`);
            });

            GM_registerMenuCommand('🐛 切换调试模式', () => {
                CONFIG.debugMode = !CONFIG.debugMode;
                GM_setValue('debugMode', CONFIG.debugMode);
                alert(`调试模式已${CONFIG.debugMode ? '启用' : '禁用'}`);
            });
        }
    }

    // ==================== 入口 ====================
    const autoPlayer = new AutoPlayer();
    autoPlayer.init().catch(error => {
        Logger.error('初始化失败', error);
    });

    Logger.log('FAMSUN Academy 视频自动播放助手已加载');
})();
