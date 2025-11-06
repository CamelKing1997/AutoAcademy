// ==UserScript==
// @name         FAMSUN Academy 视频自动播放助手
// @namespace    http://tampermonkey.net/
// @version      1.3.28
// @description  自动播放FAMSUN Academy视频并满足观看时长要求 (v1.3.28: 修复重复触发和视频时长获取失败-增加处理锁和等待时间)
// @author       AutoAcademy
// @match        https://academy.famsungroup.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置项 ====================
    const CONFIG = {
        autoStart: GM_getValue('autoStart', true),          // 自动开始
        playbackSpeed: 2.0,                                 // 播放速度固定为2倍速
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

        static warn(message, data = null) {
            const timestamp = new Date().toLocaleTimeString();
            console.warn(`[FAMSUN助手 ${timestamp}] ⚠️ ${message}`, data || '');
        }

        static info(message, data = null) {
            const timestamp = new Date().toLocaleTimeString();
            console.info(`[FAMSUN助手 ${timestamp}] ℹ️ ${message}`, data || '');
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
            this.playerType = null; // 'cyberplayer', 'jwplayer', 'videojs', 'petrel', 'native'
            this.durationFallback = false;
            this.metadataReady = false;
            this.durationWarningShown = false;
            this.metadataListenerBound = false;
            this.lastCountdownSeconds = null;
            this.countdownArmed = false;
            this.countdownEverSeen = false;
            this.keepAliveCooldownUntil = 0;
        }

        // 查找视频播放器 (增强版 - 支持多种播放器类型)
        findPlayer() {
            Logger.log('🔍 开始检测播放器类型...');
            
            // 方法1: 检测 JW Player (优先 - 因为UI控制依赖它)
            const jwContainer = document.querySelector('.jw-wrapper, .jwplayer, [id*="jwplayer"]');
            if (jwContainer) {
                // JW Player通过data-属性或ID关联
                const jwId = jwContainer.id || jwContainer.getAttribute('data-jw-id');
                if (unsafeWindow.jwplayer && jwId) {
                    try {
                        this.player = unsafeWindow.jwplayer(jwId);
                        if (this.player) {
                            this.playerType = 'jwplayer';
                            Logger.success('✅ 找到 JW Player 播放器');
                            Logger.debug('JW Player ID:', jwId);
                        }
                    } catch (e) {
                        Logger.debug('JW Player初始化失败:', e);
                    }
                }
                
                // 即使player对象获取失败,也标记为JW Player类型
                if (!this.player && document.querySelector('.jw-playrate-label')) {
                    this.playerType = 'jwplayer';
                    Logger.log('🎬 检测到JW Player UI控件(未获取到player对象)');
                }
            }
            
            // 方法2: 查找 CyberPlayer (通常是封装层)
            if (unsafeWindow.cyberplayer) {
                this.player = unsafeWindow.cyberplayer;
                // 如果没有检测到JW Player,才设置为CyberPlayer类型
                if (!this.playerType) {
                    this.playerType = 'cyberplayer';
                    Logger.success('✅ 找到 CyberPlayer 播放器');
                }
                
                // 详细检测API
                Logger.debug('CyberPlayer API检测:', {
                    hasCurrentTime: 'currentTime' in this.player,
                    hasDuration: 'duration' in this.player,
                    hasPlaybackRate: 'playbackRate' in this.player,
                    hasSetPlaybackRate: 'setPlaybackRate' in this.player,
                    setPlaybackRateType: typeof this.player.setPlaybackRate,
                    playbackRateType: typeof this.player.playbackRate
                });
            }

            // 方法3: 查找 VideoJS
            if (!this.playerType && unsafeWindow.videojs) {
                const players = typeof unsafeWindow.videojs.getPlayers === 'function'
                    ? unsafeWindow.videojs.getPlayers()
                    : unsafeWindow.videojs.players;
                const playerKeys = players ? Object.keys(players) : [];
                if (playerKeys.length > 0) {
                    this.player = players[playerKeys[0]];
                    this.playerType = 'videojs';
                    Logger.success('✅ 找到 VideoJS 播放器');
                } else {
                    try {
                        const idCandidates = ['videocontainer-vjs', 'videocontainer', 'video-js'];
                        for (const id of idCandidates) {
                            if (!id) continue;
                            const candidate = typeof unsafeWindow.videojs.getPlayer === 'function'
                                ? unsafeWindow.videojs.getPlayer(id)
                                : unsafeWindow.videojs(id);
                            if (candidate) {
                                this.player = candidate;
                                this.playerType = 'videojs';
                                Logger.success(`✅ 通过ID找到 VideoJS 播放器 (${id})`);
                                break;
                            }
                        }
                    } catch (playerError) {
                        Logger.debug('尝试 videojs.getPlayer 失败', playerError);
                    }
                }
            }

            // 方法4: 查找 Petrel播放器 (海燕播放器)
            const petrelVideo = document.querySelector('.petrel-smart-player-m3u8-track video, .petrel-player video');
            if (petrelVideo) {
                this.videoElement = petrelVideo;
                if (!this.playerType) {
                    this.playerType = 'petrel';
                    Logger.success('✅ 找到 Petrel播放器 (海燕播放器)');
                }
            }

            // 方法5: 查找原生video元素 (最后的兜底方案)
            if (!this.videoElement) {
                const videoSelectors = [
                    '#videocontainer-vjs',  // 常见ID
                    'video',                // 通用选择器
                    '.video-js',
                    '.jw-video'
                ];
                
                for (const selector of videoSelectors) {
                    this.videoElement = document.querySelector(selector);
                    if (this.videoElement) {
                        Logger.success(`✅ 找到 video 元素: ${selector}`);
                        if (!this.playerType) {
                            this.playerType = 'native';
                        }
                        break;
                    }
                }
            }

            // 总结检测结果
            if (this.player || this.videoElement) {
                Logger.success(`🎯 播放器类型: ${this.playerType || 'unknown'}`);
                Logger.log(`📊 检测结果: player对象=${!!this.player}, video元素=${!!this.videoElement}`);
                return true;
            }

            Logger.error('❌ 未找到任何视频播放器');
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
                
                // 自动设置2倍速
                await this.sleep(500); // 等待播放器初始化完成
                this.setPlaybackSpeed(CONFIG.playbackSpeed);
                
                this.startMonitoring();
                return true;
            } catch (error) {
                Logger.error('播放失败', error);
                return false;
            }
        }

        // 延迟函数
        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
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

        // 点击播放器UI的速度按钮 (增强版 - 支持多种播放器)
        clickSpeedButton(speed) {
            try {
                Logger.log(`🎬 尝试通过UI点击设置${speed}x速度 (播放器类型: ${this.playerType})`);
                
                let speedButton = null;
                let speedSelectors = [];
                
                // 根据播放器类型选择最合适的选择器
                switch (this.playerType) {
                    case 'jwplayer':
                        speedSelectors = [
                            '.jw-playrate-label',           // JW Player速度标签 (最准确)
                            '.jw-icon-playback-rate',       // JW Player速度图标
                            '.jw-settings-playback-rate'    // JW Player设置项
                        ];
                        break;
                    
                    case 'cyberplayer':
                        speedSelectors = [
                            '.cyber-playbackrate-button',
                            '.cyber-rate-button',
                            '[class*="cyber"][class*="rate"]'
                        ];
                        break;
                    
                    case 'videojs':
                        speedSelectors = [
                            '.vjs-playback-rate',
                            '.vjs-playback-rate-value',
                            'button.vjs-playback-rate'
                        ];
                        break;
                    
                    case 'petrel':
                    case 'native':
                    default:
                        // 通用选择器
                        speedSelectors = [
                            '.jw-playrate-label',           // 优先JW Player
                            '.vjs-playback-rate',           // VideoJS
                            '.cyber-playbackrate-button',   // CyberPlayer
                            '[class*="playbackrate"]',      // 通配符
                            '[class*="playrate"]',
                            '[class*="speed-button"]'
                        ];
                }
                
                // 查找速度按钮
                for (const selector of speedSelectors) {
                    speedButton = document.querySelector(selector);
                    if (speedButton && speedButton.offsetParent !== null) {
                        const currentText = speedButton.textContent.trim();
                        Logger.success(`✅ 找到速度按钮: ${selector} (文本: "${currentText}")`);
                        
                        // 检查是否已经是目标速度
                        if (new RegExp(`^x?${speed}(\\.0)?x?$`, 'i').test(currentText)) {
                            Logger.log(`🎯 速度已经是 ${speed}x，无需切换`);
                            return true; // 已经是目标速度，返回成功
                        }
                        break;
                    }
                }
                
                // 如果没找到,尝试通过文本查找
                if (!speedButton) {
                    Logger.log('未找到速度按钮，尝试查找包含速度文本的元素');
                    const allElements = document.querySelectorAll('button, div[role="button"], span, div[class*="button"]');
                    for (const el of allElements) {
                        const text = el.textContent.trim();
                        // 匹配任意速度文本
                        if (/^(x?[\d.]+x?|倍速|playback|speed)$/i.test(text) && el.offsetParent !== null) {
                            speedButton = el;
                            Logger.success(`✅ 通过文本找到速度按钮: "${text}" (类名: ${el.className})`);
                            
                            // 检查是否已经是目标速度
                            if (new RegExp(`^x?${speed}(\\.0)?x?$`, 'i').test(text)) {
                                Logger.log(`🎯 速度已经是 ${speed}x，无需切换`);
                                return true;
                            }
                            break;
                        }
                    }
                }
                
                if (!speedButton) {
                    Logger.warn('⚠️ 未找到速度控制按钮');
                    return false;
                }
                
                // 点击速度按钮打开菜单
                speedButton.click();
                Logger.log('👆 已点击速度按钮，等待菜单出现...');
                
                // 等待菜单出现，然后查找对应速度选项
                setTimeout(() => {
                    // 根据播放器类型选择菜单项选择器
                    let optionSelectors = [];
                    if (this.playerType === 'jwplayer') {
                        optionSelectors = ['.jw-option', '.jw-settings-content-item'];
                    } else if (this.playerType === 'videojs') {
                        optionSelectors = ['.vjs-menu-item'];
                    } else if (this.playerType === 'cyberplayer') {
                        optionSelectors = ['[class*="cyber"][class*="menu-item"]'];
                    } else {
                        optionSelectors = ['[class*="option"]', '[class*="menu-item"]', '[role="menuitem"]'];
                    }
                    
                    // 查找所有速度选项
                    const speedOptions = document.querySelectorAll(optionSelectors.concat([
                        '[class*="rate"]',
                        '[class*="speed"]'
                    ]).join(', '));
                    
                    Logger.log(`📋 找到 ${speedOptions.length} 个可能的速度选项`);
                    
                    for (const option of speedOptions) {
                        const text = option.textContent.trim();
                        // 匹配 "×2", "2x", "2.0x", "x2", "2.0", "2" 等格式
                        const speedPattern = new RegExp(`^[×x]?${speed}(\\.0)?x?$`, 'i');
                        if (speedPattern.test(text) && option.offsetParent !== null) {
                            Logger.success(`✅ 找到${speed}x选项 (文本: "${text}")，点击...`);
                            option.click();
                            
                            // 验证是否成功
                            setTimeout(() => {
                                const newSpeed = this.getCurrentSpeed();
                                if (newSpeed && Math.abs(newSpeed - speed) < 0.01) {
                                    Logger.success(`🎉 UI点击成功! 当前速度: ${newSpeed}x`);
                                } else {
                                    Logger.warn(`⚠️ UI点击可能未生效, 当前速度: ${newSpeed}x`);
                                }
                            }, 200);
                            return;
                        }
                    }
                    Logger.debug(`未找到${speed}x速度选项 (可能菜单未打开或已经是目标速度)`);
                }, 300);
                
                return true; // 返回true表示已尝试点击
            } catch (error) {
                Logger.error('❌ 点击速度按钮失败:', error);
                return false;
            }
        }

        // 设置播放速度 (增强版 - 支持多播放器类型和多次重试)
        setPlaybackSpeed(speed, retryCount = 0) {
            try {
                let methodsUsed = [];
                let uiMethodSuccess = false;
                let apiMethodSuccess = false;
                
                Logger.log(`🎯 设置播放速度为 ${speed}x (播放器: ${this.playerType}, 第${retryCount + 1}次)`);
                
                // ========== 方法0: UI点击 (最可靠 - 能同步UI和倒计时) ==========
                if (retryCount === 0) {
                    const uiClicked = this.clickSpeedButton(speed);
                    if (uiClicked) {
                        methodsUsed.push('✅ UI按钮点击');
                        uiMethodSuccess = true;
                    }
                }
                
                // ========== 方法1: 播放器API调用 (根据播放器类型选择) ==========
                switch (this.playerType) {
                    case 'jwplayer':
                        // JW Player API
                        if (this.player && typeof this.player.setPlaybackRate === 'function') {
                            try {
                                this.player.setPlaybackRate(speed);
                                methodsUsed.push('✅ JWPlayer.setPlaybackRate()');
                                apiMethodSuccess = true;
                            } catch (e) {
                                Logger.debug('JWPlayer.setPlaybackRate()失败:', e);
                            }
                        }
                        // JW Player通过jwplayer(id)获取的实例可能有不同API
                        if (!apiMethodSuccess && this.player && typeof this.player.getPlaybackRate === 'function') {
                            try {
                                // JW Player 8+ 版本的API
                                this.player.setPlaybackRate(speed);
                                methodsUsed.push('✅ JWPlayer.setPlaybackRate() v8+');
                                apiMethodSuccess = true;
                            } catch (e) {
                                Logger.debug('JWPlayer v8+ API失败:', e);
                            }
                        }
                        break;
                    
                    case 'cyberplayer':
                        // CyberPlayer API
                        if (this.player && typeof this.player.setPlaybackRate === 'function') {
                            try {
                                this.player.setPlaybackRate(speed);
                                methodsUsed.push('✅ CyberPlayer.setPlaybackRate()');
                                apiMethodSuccess = true;
                            } catch (e) {
                                Logger.debug('CyberPlayer.setPlaybackRate()失败:', e);
                            }
                        }
                        // 尝试属性赋值
                        if (!apiMethodSuccess && this.player) {
                            try {
                                this.player.playbackRate = speed;
                                methodsUsed.push('✅ CyberPlayer.playbackRate属性');
                                apiMethodSuccess = true;
                            } catch (e) {
                                Logger.debug('CyberPlayer属性赋值失败:', e);
                            }
                        }
                        break;
                    
                    case 'videojs':
                        // VideoJS API
                        if (this.player && typeof this.player.playbackRate === 'function') {
                            try {
                                this.player.playbackRate(speed);
                                methodsUsed.push('✅ VideoJS.playbackRate()');
                                apiMethodSuccess = true;
                            } catch (e) {
                                Logger.debug('VideoJS.playbackRate()失败:', e);
                            }
                        }
                        break;
                    
                    case 'petrel':
                    case 'native':
                    default:
                        // 通用方法 - 尝试常见API
                        if (this.player) {
                            const methods = ['setPlaybackRate', 'playbackRate', 'setSpeed', 'speed', 'setRate'];
                            for (const method of methods) {
                                if (typeof this.player[method] === 'function') {
                                    try {
                                        this.player[method](speed);
                                        methodsUsed.push(`✅ player.${method}()`);
                                        apiMethodSuccess = true;
                                        break;
                                    } catch (e) {
                                        Logger.debug(`player.${method}()失败:`, e);
                                    }
                                }
                            }
                        }
                }
                
                // ========== 方法2: 全局CyberPlayer对象 ==========
                if (!apiMethodSuccess && unsafeWindow.cyberplayer) {
                    if (typeof unsafeWindow.cyberplayer.setPlaybackRate === 'function') {
                        try {
                            unsafeWindow.cyberplayer.setPlaybackRate(speed);
                            methodsUsed.push('✅ window.cyberplayer.setPlaybackRate()');
                            apiMethodSuccess = true;
                        } catch (e) {
                            Logger.debug('window.cyberplayer API失败:', e);
                        }
                    }
                }
                
                // ========== 方法3: 直接操作video元素 (兜底方案) ==========
                if (this.videoElement) {
                    try {
                        this.videoElement.playbackRate = speed;
                        methodsUsed.push('✅ video.playbackRate');
                        
                        // 触发ratechange事件
                        const event = new Event('ratechange', { bubbles: true, cancelable: false });
                        this.videoElement.dispatchEvent(event);
                        methodsUsed.push('✅ ratechange事件');
                    } catch (e) {
                        Logger.debug('video元素操作失败:', e);
                    }
                }
                
                // ========== 方法4: 批量设置所有video元素 ==========
                const allVideos = document.querySelectorAll('video');
                if (allVideos.length > 0) {
                    let videoCount = 0;
                    allVideos.forEach((video) => {
                        try {
                            video.playbackRate = speed;
                            videoCount++;
                        } catch (e) {
                            Logger.debug('设置video元素失败:', e);
                        }
                    });
                    if (videoCount > 0) {
                        methodsUsed.push(`✅ ${videoCount}个video元素`);
                    }
                }
                
                // ========== 总结和验证 ==========
                if (methodsUsed.length > 0) {
                    Logger.success(`📊 速度设置完成: ${methodsUsed.join(' | ')}`);
                } else {
                    Logger.warn('⚠️ 所有速度设置方法均失败');
                }
                
                if (!uiMethodSuccess && !apiMethodSuccess) {
                    Logger.error('❌ 警告: UI点击和API调用均未成功，只设置了video元素');
                }
                
                // 延迟验证 + 重试机制
                setTimeout(() => {
                    const currentSpeed = this.getCurrentSpeed();
                    Logger.log(`🔍 速度验证 - video: ${currentSpeed}x, 期望: ${speed}x`);
                    
                    // 检查player的playbackRate
                    if (this.player) {
                        const playerSpeed = typeof this.player.playbackRate === 'function' 
                            ? this.player.playbackRate() 
                            : this.player.playbackRate;
                        Logger.log(`🔍 ${this.playerType} 显示速度: ${playerSpeed}`);
                    }
                    
                    // 验证是否成功
                    const tolerance = 0.01;
                    if (currentSpeed && Math.abs(currentSpeed - speed) < tolerance) {
                        Logger.success(`✅ 速度验证成功: ${currentSpeed}x`);
                    } else if (retryCount < 3) {
                        Logger.warn(`⚠️ 速度验证失败(当前:${currentSpeed}x), 1秒后重试...`);
                        setTimeout(() => this.setPlaybackSpeed(speed, retryCount + 1), 1000);
                    } else {
                        Logger.error(`❌ 速度设置失败，已重试${retryCount + 1}次`);
                    }
                }, 500);
                
            } catch (error) {
                Logger.error('❌ 设置速度异常:', error);
                if (retryCount < 3) {
                    setTimeout(() => this.setPlaybackSpeed(speed, retryCount + 1), 1000);
                }
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
        
        // 重置倒计时状态
        resetCountdownState() {
            this.lastCountdownSeconds = null;
            this.countdownArmed = false;
            this.countdownEverSeen = false;
            this.keepAliveCooldownUntil = 0;
        }

        // 确保播放器在播放状态
        ensurePlaying() {
            try {
                if (this.playerType === 'jwplayer' && this.player && typeof this.player.play === 'function') {
                    this.player.play(true);
                } else if (this.player && typeof this.player.play === 'function') {
                    this.player.play();
                }
            } catch (error) {
                Logger.debug('尝试调用播放器播放失败', error);
            }

            if (this.videoElement && this.videoElement.paused) {
                const playPromise = this.videoElement.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => {});
                }
            }
        }

        // 跳转到指定时间点
        seekToTime(seconds) {
            let handled = false;

            if (this.player && typeof this.player.seek === 'function') {
                try {
                    this.player.seek(seconds);
                    handled = true;
                } catch (error) {
                    Logger.debug('播放器seek失败', error);
                }
            }

            if (!handled && this.videoElement) {
                try {
                    this.videoElement.currentTime = seconds;
                    handled = true;
                } catch (error) {
                    Logger.debug('video元素seek失败', error);
                }
            }

            return handled;
        }

        // 确保倒计时继续进行
        ensureCountdownActive(duration, currentTime, hasDuration) {
            if (!this.countdownEverSeen) return;
            if (this.lastCountdownSeconds === null || this.lastCountdownSeconds <= 3) return;

            const now = Date.now();
            if (now < this.keepAliveCooldownUntil) return;

            let effectiveDuration = duration;
            if (!hasDuration || !effectiveDuration || !isFinite(effectiveDuration)) {
                if (this.videoElement && isFinite(this.videoElement.duration)) {
                    effectiveDuration = this.videoElement.duration;
                } else {
                    this.ensurePlaying();
                    return;
                }
            }

            if (!effectiveDuration || !isFinite(effectiveDuration) || effectiveDuration <= 0) {
                this.ensurePlaying();
                return;
            }

            const videoElementState = this.videoElement ? {
                paused: this.videoElement.paused,
                ended: this.videoElement.ended
            } : { paused: false, ended: false };

            let playerStatePaused = false;
            try {
                if (this.playerType === 'jwplayer' && this.player && typeof this.player.getState === 'function') {
                    const state = this.player.getState();
                    if (['idle', 'paused', 'complete', 'buffering'].includes(state)) {
                        playerStatePaused = true;
                    }
                }
            } catch (error) {
                Logger.debug('获取播放器状态失败', error);
            }

            const nearEndThreshold = Math.max(effectiveDuration * 0.05, 2);
            const nearEnd = isFinite(currentTime) && (effectiveDuration - currentTime <= nearEndThreshold);
            const pausedOrEnded = videoElementState.paused || videoElementState.ended || playerStatePaused;

            if (!pausedOrEnded && !nearEnd) return;

            let targetTime = effectiveDuration * 0.01;
            if (!isFinite(targetTime) || targetTime < 0) {
                targetTime = 0;
            }

            if (effectiveDuration - targetTime < 2) {
                targetTime = Math.max(0, effectiveDuration - Math.max(5, effectiveDuration * 0.1));
            }

            const seeked = this.seekToTime(targetTime);
            this.ensurePlaying();
            this.keepAliveCooldownUntil = now + 8000;

            if (seeked) {
                Logger.log(`⏱ 倒计时剩余 ${this.lastCountdownSeconds}s，重新唤醒播放器 (跳转至 ${targetTime.toFixed(1)}s)`);
            }
        }

        // 监控播放进度
        startMonitoring() {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
            }

            this.resetCountdownState();

            let retryCount = 0;
            const maxRetries = 5;
            let speedCheckCounter = 0; // 速度检查计数器

            this.updateInterval = setInterval(() => {
                const currentTime = this.getCurrentTime();
                const duration = this.getDuration();
                const hasDuration = typeof duration === 'number' && isFinite(duration) && duration > 0;
                const requiredPercent = CONFIG.minWatchPercent;

                if (!hasDuration) {
                    if (!this.metadataListenerBound && this.videoElement) {
                        this.metadataListenerBound = true;
                        this.videoElement.addEventListener('loadedmetadata', () => {
                            this.metadataReady = true;
                            Logger.success('✅ 视频元数据已加载');
                        }, { once: true });
                    }

                    if (!this.durationFallback) {
                        retryCount++;
                        if (retryCount <= maxRetries) {
                            Logger.debug(`等待视频时长信息... (${retryCount}/${maxRetries})`);
                            if (!this.videoElement) {
                                this.videoElement = document.querySelector('.petrel-smart-player-m3u8-track video') ||
                                                   document.querySelector('.petrel-player video') ||
                                                   document.querySelector('video');

                                if (this.videoElement && this.videoElement.closest('.petrel-player')) {
                                    Logger.info('检测到Petrel播放器(海燕播放器)');
                                    this.playerType = 'petrel';
                                }
                            }
                        } else {
                            this.durationFallback = true;
                            if (!this.durationWarningShown) {
                                Logger.warn('⚠️ 未能读取视频总时长，将改用系统倒计时判定完成');
                                this.durationWarningShown = true;
                            }
                        }
                    }

                    this.updateProgressUI(currentTime, duration, null, requiredPercent);

                    const countdownCompletedFallback = this.checkSystemCompletion();

                    if (!countdownCompletedFallback) {
                        this.ensureCountdownActive(duration, currentTime, hasDuration);
                    }

                    if (countdownCompletedFallback) {
                        Logger.success('✅ 系统提示已完成学习要求');
                        this.onVideoComplete();
                    }
                    return;
                }

                if (retryCount > 0 && retryCount <= maxRetries) {
                    Logger.success(`成功获取视频信息 (时长: ${this.formatTime(duration)})`);
                    if (this.playerType === 'petrel') {
                        Logger.info('🐦 使用Petrel播放器模式');
                    }
                    retryCount = 0;
                }

                // 每5秒检查一次播放速度，确保速度保持在2倍速
                speedCheckCounter++;
                if (speedCheckCounter % 5 === 0) {
                    const currentSpeed = this.getCurrentSpeed();
                    if (currentSpeed && Math.abs(currentSpeed - CONFIG.playbackSpeed) > 0.01) {
                        Logger.warn(`⚠️ 检测到速度被重置为 ${currentSpeed}x，重新设置为 ${CONFIG.playbackSpeed}x`);
                        this.setPlaybackSpeed(CONFIG.playbackSpeed);
                    }
                }
                
                const progress = hasDuration ? (currentTime / duration * 100).toFixed(1) : null;
                
                this.stateManager.setState({
                    watchedDuration: currentTime,
                    requiredDuration: hasDuration ? duration * requiredPercent / 100 : 0
                });

                // 更新UI显示
                this.updateProgressUI(currentTime, duration, progress, requiredPercent);

                const countdownCompleted = this.checkSystemCompletion();

                if (!countdownCompleted) {
                    this.ensureCountdownActive(duration, currentTime, hasDuration);
                }

                // 优先检查系统倒计时(更准确)
                if (countdownCompleted) {
                    Logger.success('✅ 系统提示已完成学习要求');
                    this.onVideoComplete();
                    return;
                }

                // 备用方案: 检查播放进度
                if (!this.countdownEverSeen && progress !== null && progress >= requiredPercent) {
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

            let countdownElementFound = false;

            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (!element) continue;

                countdownElementFound = true;
                const text = element.textContent || '';
                const compactText = text.replace(/\s+/g, '');
                const looksLikeCountdown = /还需|倒计时|剩余/.test(compactText);
                
                // 特殊处理: PDF课件的完成提示("需完成课程内容,才能获得X学分")
                // 这种情况下没有倒计时,只要能看到这个文本就说明内容已经展示完毕
                if (/需完成课程内容/.test(text) && /学分/.test(text)) {
                    // PDF课件: 检查是否有"下一个"按钮出现(表示当前课程已完成)
                    const nextButton = document.querySelector('.ulcdsdk-nextchapterbutton');
                    if (nextButton && nextButton.offsetParent !== null) {
                        Logger.success('PDF课件: 检测到"下一个"按钮,课程已完成');
                        return true;
                    }
                    
                    // PDF课件: 检查课程目录中当前课程的完成状态
                    const currentCourse = document.querySelector('.yxtulcdsdk-catalog .liactive');
                    if (currentCourse) {
                        const completionIcon = currentCourse.querySelector('svg path[stroke="#FFF"]');
                        if (completionIcon) {
                            Logger.success('PDF课件: 课程目录显示已完成');
                            return true;
                        }
                    }
                    
                    Logger.debug('PDF课件: 等待完成标记...');
                    return false; // PDF课件需要等待完成标记
                }
                
                // 必须先检查倒计时,避免误判
                // 适配多种格式: 
                // 1. "还需 2小时 2分钟 58秒" (小时+分钟+秒)
                // 2. "还需 2小时 4秒" (小时+秒,无分钟)
                // 3. "还需 7分钟 30秒" 或 "还需 7分 30秒" (分钟+秒)
                // 4. "还需 22秒" (只有秒数)
                let totalSeconds = null;
                let countdownLabel = '';

                let match = text.match(/还需\s*(\d+)\s*小时\s*(\d+)\s*分(?:钟)?\s*(\d+)\s*秒/);
                if (match) {
                    const hours = parseInt(match[1], 10);
                    const minutes = parseInt(match[2], 10);
                    const seconds = parseInt(match[3], 10);
                    totalSeconds = hours * 3600 + minutes * 60 + seconds;
                    countdownLabel = `${hours}小时${minutes}分${seconds}秒`;
                } else {
                    match = text.match(/还需\s*(\d+)\s*小时\s*(\d+)\s*秒/);
                    if (match) {
                        const hours = parseInt(match[1], 10);
                        const seconds = parseInt(match[2], 10);
                        totalSeconds = hours * 3600 + seconds;
                        countdownLabel = `${hours}小时${seconds}秒`;
                    } else {
                        match = text.match(/还需\s*(\d+)\s*分(?:钟)?\s*(\d+)\s*秒/);
                        if (match) {
                            const minutes = parseInt(match[1], 10);
                            const seconds = parseInt(match[2], 10);
                            totalSeconds = minutes * 60 + seconds;
                            countdownLabel = `${minutes}分${seconds}秒`;
                        } else {
                            match = text.match(/还需\s*(\d+)\s*秒/);
                            if (match) {
                                const seconds = parseInt(match[1], 10);
                                totalSeconds = seconds;
                                countdownLabel = `${seconds}秒`;
                            }
                        }
                    }
                }

                if (totalSeconds !== null) {
                    if (!this.countdownEverSeen) {
                        this.countdownEverSeen = true;
                    }

                    this.lastCountdownSeconds = totalSeconds;

                    if (totalSeconds <= 30 && !this.countdownArmed) {
                        this.countdownArmed = true;
                        Logger.debug('倒计时进入30秒监控区间');
                    }

                    if (countdownLabel) {
                        Logger.debug(`系统倒计时: ${countdownLabel} (剩余${totalSeconds}秒)`);
                    } else {
                        Logger.debug(`系统倒计时剩余约 ${totalSeconds} 秒`);
                    }

                    if (totalSeconds <= 3) {
                        Logger.log('倒计时归零,学习完成');
                        this.resetCountdownState();
                        return true;
                    }

                    return false;
                }

                if (looksLikeCountdown) {
                    this.countdownEverSeen = true;
                    this.lastCountdownSeconds = null;
                    Logger.debug('检测到倒计时元素但未解析到数字,等待更新...');
                    continue;
                }

                if (text.includes('已完成') || text.includes('恭喜')) {
                    Logger.log('检测到完成提示文本');
                    this.resetCountdownState();
                    return true;
                }
            }

            if (!countdownElementFound) {
                if (this.countdownEverSeen && this.countdownArmed) {
                    Logger.success('倒计时面板已消失,判定课程完成');
                    this.resetCountdownState();
                    return true;
                }

                this.lastCountdownSeconds = null;
            }

            return false;
        }

        // 更新进度UI
        updateProgressUI(currentTime, duration, progress, requiredPercent) {
            const statusDiv = document.getElementById('famsun-auto-status');
            if (!statusDiv) return;

            const numericProgress = progress !== null && !isNaN(progress) ? parseFloat(progress) : null;
            const progressDisplay = numericProgress !== null ? `${numericProgress}%` : '⏳';
            const currentTimeStr = this.formatTime(currentTime);
            const hasDuration = typeof duration === 'number' && isFinite(duration) && duration > 0;
            const durationStr = hasDuration ? this.formatTime(duration) : '--:--';

            let progressColor = '#4CAF50';
            if (numericProgress === null) {
                progressColor = '#9E9E9E';
            } else if (numericProgress < 30) {
                progressColor = '#f44336';
            } else if (numericProgress < 80) {
                progressColor = '#FF9800';
            }
            
            // 获取系统倒计时信息
            let systemCountdown = '<div style="color: #FFD700;">等待系统倒计时...</div>';
            const countdownElement = document.querySelector('.yxtbiz-language-slot, .yxtulcdsdk-course-player__countdown');
            if (countdownElement) {
                const text = countdownElement.textContent || '';
                
                // 检查是否为PDF课件("需完成课程内容")
                if (/需完成课程内容/.test(text) && /学分/.test(text)) {
                    // 提取学分数字
                    const creditMatch = text.match(/([\d.]+)\s*学分/);
                    const credit = creditMatch ? creditMatch[1] : '未知';
                    
                    // 检查是否已完成
                    const nextButton = document.querySelector('.ulcdsdk-nextchapterbutton');
                    const currentCourse = document.querySelector('.yxtulcdsdk-catalog .liactive');
                    const isCompleted = (nextButton && nextButton.offsetParent !== null) || 
                                       (currentCourse && currentCourse.querySelector('svg path[stroke="#FFF"]'));
                    
                    if (isCompleted) {
                        systemCountdown = `<div style="color: #4CAF50; font-weight: bold;">📄 PDF课件已完成 (${credit}学分)</div>`;
                    } else {
                        systemCountdown = `<div style="color: #FFD700; font-weight: bold;">📄 PDF课件: 等待完成标记 (${credit}学分)</div>`;
                    }
                } else {
                    // 适配多种格式:
                    // 1. "还需 2小时 2分钟 58秒" (小时+分钟+秒)
                    // 2. "还需 2小时 4秒" (小时+秒,无分钟)
                    // 3. "还需 7分钟 30秒" 或 "还需 7分 30秒" (分钟+秒)
                    // 4. "还需 22秒" (只有秒数)
                    
                    // 优先匹配: 小时+分钟+秒
                    let match = text.match(/还需\s*(\d+)\s*小时\s*(\d+)\s*分(?:钟)?\s*(\d+)\s*秒/);
                    if (match) {
                        const hours = match[1];
                        const minutes = match[2];
                        const seconds = match[3];
                        systemCountdown = `<div style="color: #FFD700; font-weight: bold;">⏱ 系统要求: 还需${hours}小时${minutes}分${seconds}秒</div>`;
                    } else {
                        // 尝试匹配: 小时+秒(无分钟)
                        match = text.match(/还需\s*(\d+)\s*小时\s*(\d+)\s*秒/);
                        if (match) {
                            const hours = match[1];
                            const seconds = match[2];
                            systemCountdown = `<div style="color: #FFD700; font-weight: bold;">⏱ 系统要求: 还需${hours}小时${seconds}秒</div>`;
                        } else {
                            // 尝试匹配分钟+秒
                            match = text.match(/还需\s*(\d+)\s*分(?:钟)?\s*(\d+)\s*秒/);
                            if (match) {
                                const minutes = match[1];
                                const seconds = match[2];
                                systemCountdown = `<div style="color: #FFD700; font-weight: bold;">⏱ 系统要求: 还需${minutes}分${seconds}秒</div>`;
                            } else {
                                // 尝试匹配只有秒的格式
                                match = text.match(/还需\s*(\d+)\s*秒/);
                                if (match) {
                                    const seconds = match[1];
                                    systemCountdown = `<div style="color: #FFD700; font-weight: bold;">⏱ 系统要求: 还需${seconds}秒</div>`;
                                } else if (text.includes('已完成') || text.includes('恭喜')) {
                                    systemCountdown = `<div style="color: #4CAF50; font-weight: bold;">✅ 已完成学习要求</div>`;
                                }
                            }
                        }
                    }
                }
            }
            
            const fallbackNote = hasDuration ? '' : '<div style="font-size: 11px; color: #FFD700; margin-top: 4px;">⏱ 使用倒计时监控进度</div>';

            statusDiv.innerHTML = `
                <div style="font-size: 13px; line-height: 1.6;">
                    <div style="margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span style="font-weight: bold;">📹 播放进度</span>
                            <span style="font-weight: bold; color: #FFD700;">${progressDisplay}</span>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 4px;">
                            <div style="background: ${progressColor}; height: 100%; width: ${numericProgress !== null ? numericProgress : 0}%; transition: width 0.3s;"></div>
                        </div>
                        <div style="font-size: 12px; opacity: 0.9;">
                            ${currentTimeStr} / ${durationStr}
                        </div>
                        ${fallbackNote}
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
                // 🎯 移除手动start(),让课程切换检测自动触发
                return;
            }
            
            // 方法2: 通过课程大纲查找下一个未完成的课程
            if (this.findAndClickNextCourseInCatalog()) {
                Logger.log('已通过课程大纲跳转到下一课程');
                // 🎯 移除手动start(),让课程切换检测自动触发
                return;
            }
            
            // 方法3: 优先使用网站原生导航函数
            try {
                if (unsafeWindow.next && typeof unsafeWindow.next === 'function') {
                    Logger.log('使用原生next()函数');
                    unsafeWindow.next();
                    // 🎯 移除手动start(),让课程切换检测自动触发
                    return;
                }
                
                if (unsafeWindow.nextPage && typeof unsafeWindow.nextPage === 'function') {
                    Logger.log('使用原生nextPage()函数');
                    unsafeWindow.nextPage();
                    // 🎯 移除手动start(),让课程切换检测自动触发
                    return;
                }
            } catch (error) {
                Logger.debug('原生函数调用失败', error);
            }
            
            // 方法4: 查找"继续学习"或"下一个"按钮 (根据HTML分析结果优化)
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
                            // 🎯 移除手动start(),让课程切换检测自动触发
                            return;
                        }
                    }
                } catch (error) {
                    Logger.debug(`选择器失败: ${selector}`, error);
                }
            }
            
            // 方法5: 最后尝试通过文本查找
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
                    // 🎯 移除手动start(),让课程切换检测自动触发
                    return;
                }
            }

            Logger.log('未找到下一个按钮，当前课程学习完成');
        }

        // 通过课程大纲查找并点击下一个未完成的课程
        findAndClickNextCourseInCatalog() {
            Logger.log('尝试通过课程大纲查找下一个未完成课程...');
            
            // 方法1: 查找课程播放页的左侧目录
            const catalog = document.querySelector('.yxtulcdsdk-catalog');
            if (catalog) {
                const courseItems = catalog.querySelectorAll('li');
                let foundCurrent = false;
                
                for (const item of courseItems) {
                    // 跳过章节标题（只处理课程项）
                    const courseNameElement = item.querySelector('.item');
                    if (!courseNameElement) continue;
                    
                    // 如果是当前正在学习的课程
                    if (item.classList.contains('liactive')) {
                        foundCurrent = true;
                        Logger.debug('找到当前课程:', courseNameElement.textContent.trim());
                        continue;
                    }
                    
                    // 如果已经找到当前课程,检查下一个课程是否未完成
                    if (foundCurrent) {
                        // 检查是否为未完成课程（空心圆图标或半圆图标）
                        const statusIcon = item.querySelector('svg');
                        if (statusIcon) {
                            const iconPath = statusIcon.querySelector('path[fill="currentColor"]');
                            const isCompleted = statusIcon.querySelector('path[stroke="#FFF"]');
                            
                            // 如果不是已完成状态（没有绿色对勾）
                            if (!isCompleted && iconPath) {
                                Logger.success('找到下一个未完成课程:', courseNameElement.textContent.trim());
                                // 点击课程项
                                const clickTarget = item.querySelector('.hand') || item;
                                clickTarget.click();
                                return true;
                            }
                        }
                    }
                }
                
                Logger.debug('在播放页目录中未找到下一个未完成课程');
            }
            
            // 方法2: 查找课程大纲页面（不在播放页时）
            const chapterItems = document.querySelectorAll('.yxtulcdsdk-course-page__chapter-item');
            if (chapterItems.length > 0) {
                Logger.log('检测到课程大纲页面，共' + chapterItems.length + '个子课程');
                
                // 寻找当前正在学习的课程（有color-primary-6类的标题）
                let currentIndex = -1;
                for (let i = 0; i < chapterItems.length; i++) {
                    const titleElement = chapterItems[i].querySelector('.yxtulcdsdk-flex-1');
                    if (titleElement && titleElement.classList.contains('color-primary-6')) {
                        currentIndex = i;
                        Logger.debug('找到当前学习课程(索引' + i + '):', titleElement.textContent.trim());
                        break;
                    }
                }
                
                // 从当前课程的下一个开始查找未完成的课程
                const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
                
                for (let i = startIndex; i < chapterItems.length; i++) {
                    const item = chapterItems[i];
                    const statusIcon = item.querySelector('.yxtulcdsdk-course-page__chapter-lock svg');
                    
                    if (statusIcon) {
                        const titleElement = item.querySelector('.yxtulcdsdk-flex-1');
                        const courseName = titleElement ? titleElement.textContent.trim() : '';
                        
                        // 检查是否为未完成状态
                        // 已完成: 有绿色对勾 (path[stroke="#FFF"])
                        // 进行中: 半圆图标 (fill-rule="nonzero" 且只有一个path)
                        // 未开始: 空心圆 (fill-rule="nonzero" 且只有一个path)
                        const completedIcon = statusIcon.querySelector('path[stroke="#FFF"]');
                        
                        if (!completedIcon) {
                            // 找到未完成的课程，点击"开始学习"或"继续学习"按钮
                            const button = item.querySelector('.yxtf-button');
                            if (button) {
                                const buttonText = button.textContent.trim();
                                Logger.success(`找到下一个未完成课程(索引${i}): ${courseName}，点击"${buttonText}"按钮`);
                                button.click();
                                return true;
                            }
                        }
                    }
                }
                
                Logger.log('课程大纲中所有后续课程均已完成');
                return false;
            }
            
            Logger.debug('未找到课程大纲');
            return false;
        }

        // 停止监控
        stopMonitoring() {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }

            this.resetCountdownState();
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

    // ==================== 考试控制模块 ====================
    class ExamController {
        constructor(autoPlayer) {
            this.autoPlayer = autoPlayer;
            this.questions = [];
            this.questionMap = new Map();
            this.sources = new Set();
            this.isActive = false;
            this.lastStatus = '';
        }

        static installGlobalInterceptors() {
            if (ExamController._interceptorsInstalled) {
                return;
            }

            const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

            if (pageWindow.fetch) {
                const originalFetch = pageWindow.fetch;
                pageWindow.fetch = function(...args) {
                    return originalFetch.apply(this, args).then(response => {
                        try {
                            ExamController.dispatchFetch(args, response);
                        } catch (error) {
                            Logger.debug('考试模块拦截fetch失败', error);
                        }
                        return response;
                    });
                };
            }

            if (pageWindow.XMLHttpRequest) {
                const XMLHttpRequestPrototype = pageWindow.XMLHttpRequest.prototype;
                const originalOpen = XMLHttpRequestPrototype.open;
                const originalSend = XMLHttpRequestPrototype.send;

                XMLHttpRequestPrototype.open = function(method, url, async, user, password) {
                    this.__examInterceptUrl = url;
                    return originalOpen.apply(this, arguments);
                };

                XMLHttpRequestPrototype.send = function(body) {
                    this.addEventListener('load', function() {
                        try {
                            const controller = ExamController.activeController;
                            if (!controller) return;
                            const responseType = this.responseType || '';
                            if (responseType && responseType !== 'json' && responseType !== 'text') return;
                            const url = this.__examInterceptUrl;
                            if (!controller.shouldHandleUrl(url)) return;
                            const text = this.responseText;
                            if (!text) return;
                            controller.handleNetworkPayload(url, text);
                        } catch (error) {
                            Logger.debug('考试模块拦截XHR失败', error);
                        }
                    });
                    return originalSend.apply(this, arguments);
                };
            }

            ExamController._interceptorsInstalled = true;
            Logger.log('考试模块网络拦截器已安装');
        }

        static dispatchFetch(args, response) {
            if (!ExamController.activeController) return;
            try {
                const controller = ExamController.activeController;
                const request = args[0];
                const url = typeof request === 'string' ? request : (request && request.url);
                if (!url || !controller.shouldHandleUrl(url)) return;
                const cloned = response.clone();
                cloned.text().then(text => {
                    controller.handleNetworkPayload(url, text);
                }).catch(() => {});
            } catch (error) {
                Logger.debug('考试模块处理fetch响应异常', error);
            }
        }

        start() {
            ExamController.installGlobalInterceptors();
            ExamController.activeController = this;
            this.isActive = true;
            this.questions = [];
            this.questionMap.clear();
            this.sources.clear();
            this.updatePanel('正在监听考试接口...');
            Logger.log('考试模块已启动，等待捕获考题数据');
        }

        stop() {
            if (ExamController.activeController === this) {
                ExamController.activeController = null;
            }
            this.isActive = false;
            this.updatePanel(null);
        }

        resetForNewExam() {
            this.questions = [];
            this.questionMap.clear();
            this.sources.clear();
            if (this.isActive) {
                this.updatePanel('检测到新考试，正在重新监听...');
            }
        }

        handleNetworkPayload(url, rawText) {
            if (!this.isActive) return;
            if (!this.shouldHandleUrl(url)) return;
            if (!rawText) return;

            let data;
            try {
                data = JSON.parse(rawText);
            } catch (error) {
                return;
            }

            this.processResponse(url, data);
        }

        shouldHandleUrl(url) {
            if (!url) return false;
            const lower = String(url).toLowerCase();
            return lower.includes('/ote/') || lower.includes('exam') || lower.includes('paper') || lower.includes('practice');
        }

        processResponse(url, data) {
            if (!data) return;
            const extracted = this.extractQuestions(data);
            if (!extracted.length) return;

            let added = 0;
            for (const question of extracted) {
                if (!question.idKey) continue;
                if (!this.questionMap.has(question.idKey)) {
                    this.questionMap.set(question.idKey, question);
                    this.questions.push(question);
                    added++;
                }
            }

            if (!added) return;

            this.sources.add(url);
            Logger.success(`考试模块捕获 ${added} 道新题 (累计 ${this.questions.length})`);
            this.updatePanel(`已捕获 ${this.questions.length} 题，来自 ${this.sources.size} 个接口`);
        }

        extractQuestions(root) {
            const results = [];
            const visited = typeof WeakSet !== 'undefined' ? new WeakSet() : new Set();

            const walk = (node) => {
                if (!node || typeof node !== 'object') return;
                if (visited.has(node)) return;
                visited.add(node);

                const normalized = this.normalizeQuestion(node);
                if (normalized) {
                    results.push(normalized);
                    return;
                }

                if (Array.isArray(node)) {
                    node.forEach(item => walk(item));
                    return;
                }

                const nestedKeys = ['data', 'result', 'payload', 'content', 'body'];
                for (const key of nestedKeys) {
                    if (node[key] && typeof node[key] === 'object') {
                        walk(node[key]);
                    }
                }

                Object.keys(node).forEach(key => {
                    const value = node[key];
                    if (value && typeof value === 'object') {
                        walk(value);
                    }
                });
            };

            walk(root);
            return results;
        }

        normalizeQuestion(raw) {
            if (!raw || typeof raw !== 'object') return null;

            const titleValue = this.getFirstProperty(raw, ['questionTitle', 'title', 'stem', 'content', 'topic', 'subject', 'name', 'questionName', 'questionStem']);
            if (!titleValue) return null;

            const idValue = this.getFirstProperty(raw, ['questionId', 'id', 'itemId', 'topicId', 'subjectId', 'paperItemId']);
            const typeValue = this.getFirstProperty(raw, ['questionTypeName', 'questionType', 'typeName', 'type', 'questionCategory']);
            const answerValue = this.getFirstProperty(raw, ['answer', 'rightAnswer', 'correctAnswer', 'standardAnswer', 'correctOption', 'answerKeys', 'answerKey', 'answers']);
            const analysisValue = this.getFirstProperty(raw, ['analysis', 'explain', 'analysisContent', 'solution', 'answerAnalysis']);

            const options = this.normalizeOptions(raw);
            const title = this.cleanText(titleValue);
            if (!title) return null;

            const answer = this.formatAnswer(answerValue, options);
            const analysis = this.cleanText(analysisValue);

            const idKeyBase = (idValue || title).toString();
            const idKey = `${idKeyBase}_${typeValue || 'default'}`;

            return {
                id: idValue || idKeyBase,
                idKey,
                type: this.cleanText(typeValue),
                title,
                options,
                answer,
                analysis,
                raw
            };
        }

        normalizeOptions(raw) {
            let options = this.getFirstProperty(raw, ['optionList', 'options', 'optionVos', 'optionVOList', 'optionDtoList', 'answerOptions', 'optionItems', 'choiceList', 'opts', 'optionDetails']);
            if (!options) {
                const optionMap = this.getFirstProperty(raw, ['optionMap', 'optionsMap', 'optionDict']);
                if (optionMap && typeof optionMap === 'object' && !Array.isArray(optionMap)) {
                    options = Object.entries(optionMap).map(([label, text]) => ({ option: label, content: text }));
                }
            }

            if (!options) return [];

            if (!Array.isArray(options) && typeof options === 'object') {
                options = Object.entries(options).map(([label, text]) => ({ option: label, content: text }));
            }

            if (!Array.isArray(options)) return [];

            return options.map((item, index) => {
                const label = this.cleanText(this.getFirstProperty(item, ['option', 'optionLabel', 'label', 'code', 'identifier', 'optionNo', 'optionCode'])) || String.fromCharCode(65 + index);
                const text = this.cleanText(this.getFirstProperty(item, ['content', 'optionContent', 'text', 'title', 'optionText', 'name', 'value', 'answerText', 'description']) || item[label] || '');
                const correctRaw = this.getFirstProperty(item, ['isCorrect', 'correct', 'right', 'isRight', 'isAnswer', 'answer', 'trueAnswer', 'standardAnswer']);
                const correct = this.toBoolean(correctRaw);
                return { label, text, isCorrect: correct };
            }).filter(option => option.text || option.label);
        }

        getFirstProperty(obj, keys) {
            if (!obj) return null;
            for (const key of keys) {
                if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
                const value = obj[key];
                if (value === null || value === undefined) continue;
                if (typeof value === 'string' && value.trim() === '') continue;
                if (Array.isArray(value) && value.length === 0) continue;
                return value;
            }
            return null;
        }

        toBoolean(value) {
            if (typeof value === 'boolean') return value;
            if (value === null || value === undefined) return false;
            const normalized = String(value).trim().toLowerCase();
            if (!normalized) return false;
            return ['1', 'true', 'y', 'yes', '正确', '是'].includes(normalized);
        }

        cleanText(value) {
            if (value === null || value === undefined) return '';
            if (Array.isArray(value)) {
                return value.map(v => this.cleanText(v)).filter(Boolean).join(' / ');
            }
            if (typeof value === 'number') {
                return String(value);
            }
            if (typeof value !== 'string') {
                try {
                    return JSON.stringify(value);
                } catch (error) {
                    return '';
                }
            }
            return value
                .replace(/<\s*br\s*\/?\s*>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .replace(/\r/gi, '')
                .replace(/\u00a0/g, ' ')
                .replace(/\s+\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        formatAnswer(rawAnswer, options) {
            const answer = this.cleanText(rawAnswer);
            if (answer) return answer;
            if (!options || !options.length) return '';
            const correctOptions = options.filter(opt => opt.isCorrect);
            if (!correctOptions.length) return '';
            return correctOptions.map(opt => opt.label).join(', ');
        }

        updatePanel(statusText) {
            this.lastStatus = statusText || '';
            if (!this.autoPlayer || !this.autoPlayer.controlPanel) return;
            this.autoPlayer.controlPanel.updateExamInfo({
                visible: this.isActive,
                statusText: statusText || (this.questions.length ? `已捕获 ${this.questions.length} 题` : '等待考试接口...'),
                total: this.questions.length,
                sourceCount: this.sources.size
            });
        }

        copyQuestionsToClipboard() {
            if (!this.questions.length) {
                Logger.warn('考试模块尚未捕获到考题');
                return false;
            }

            const content = this.formatQuestionsForExport();
            try {
                GM_setClipboard(content, { type: 'text', mimetype: 'text/plain' });
                Logger.success(`已复制 ${this.questions.length} 道考题到剪贴板`);
                return true;
            } catch (error) {
                Logger.error('复制考题失败', error);
                return false;
            }
        }

        formatQuestionsForExport() {
            return this.questions.map((question, index) => {
                const lines = [];
                const header = `${index + 1}. ${question.title}${question.type ? ` (${question.type})` : ''}`;
                lines.push(header);
                if (question.options && question.options.length) {
                    question.options.forEach(option => {
                        const suffix = option.isCorrect ? ' ✅' : '';
                        lines.push(`    ${option.label}. ${option.text}${suffix}`);
                    });
                }
                if (question.answer) {
                    lines.push(`    答案：${question.answer}`);
                }
                if (question.analysis) {
                    lines.push(`    解析：${question.analysis}`);
                }
                return lines.join('\n');
            }).join('\n\n');
        }
    }

    ExamController._interceptorsInstalled = false;
    ExamController.activeController = null;

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
            // 确保面板显示与配置同步（解决页面CSS覆盖导致的不可见问题）
            if (typeof this.syncUI === 'function') this.syncUI();
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
                        <div id="famsun-exam-section" style="
                            display: none;
                            background: rgba(255,255,255,0.1);
                            padding: 10px;
                            border-radius: 5px;
                            margin-bottom: 10px;
                            font-size: 12px;
                        ">
                            <div style="font-weight: bold; margin-bottom: 6px;">📝 考试模式</div>
                            <div id="famsun-exam-status-text" style="margin-bottom: 4px;">正在监听考试接口...</div>
                            <div id="famsun-exam-count" style="margin-bottom: 8px;">累计 0 题</div>
                            <button id="famsun-exam-copy" style="
                                width: 100%;
                                border: none;
                                background: rgba(255,255,255,0.25);
                                color: white;
                                padding: 6px 0;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 12px;
                            ">复制考题到剪贴板</button>
                        </div>
                        <div style="font-size: 12px;">
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
            document.getElementById('famsun-auto-next').checked = CONFIG.autoNext;

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

            // 自动下一个
            document.getElementById('famsun-auto-next').addEventListener('change', (e) => {
                CONFIG.autoNext = e.target.checked;
                GM_setValue('autoNext', CONFIG.autoNext);
            });

            const copyButton = document.getElementById('famsun-exam-copy');
            if (copyButton) {
                copyButton.addEventListener('click', () => {
                    if (this.autoPlayer && this.autoPlayer.examController) {
                        const success = this.autoPlayer.examController.copyQuestionsToClipboard();
                        if (!success) {
                            alert('暂无可复制的考题，请等待考试数据加载。');
                        }
                    } else {
                        alert('考试模块尚未准备好，请先进入考试页面。');
                    }
                });
            }
        }

        // 同步UI显示
        syncUI() {
            const autoNextCheckbox = document.getElementById('famsun-auto-next');
            if (autoNextCheckbox) {
                autoNextCheckbox.checked = CONFIG.autoNext;
            }
        }

        updateExamInfo({ visible, statusText, total, sourceCount }) {
            const section = document.getElementById('famsun-exam-section');
            if (!section) return;

            if (!visible) {
                section.style.display = 'none';
                return;
            }

            section.style.display = 'block';

            const statusEl = document.getElementById('famsun-exam-status-text');
            const countEl = document.getElementById('famsun-exam-count');

            if (statusEl) {
                statusEl.textContent = statusText || '';
            }

            if (countEl) {
                const totalCount = typeof total === 'number' ? total : 0;
                const sourceInfo = sourceCount ? `（接口 ${sourceCount} 个）` : '';
                countEl.textContent = `累计 ${totalCount} 题${sourceInfo}`;
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
            this.examController = null;
            this.controlPanel = null;
            this.contentType = null; // 'video' | 'pdf' | 'exam'
            this.currentCourseUrl = null; // 当前课程URL
            this.lastCheckedUrl = null; // 上次检查的URL (用于智能过滤)
            this.lastVideoSrc = null; // 上次视频源 (用于智能过滤)
            this.lastNormalizedVideoSrc = null;
            this.lastCourseKey = null;
            this.urlCheckInterval = null; // URL检查定时器
            this._isHandlingCourseChange = false; // 是否正在处理课程切换
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
            } else if (this.contentType === 'exam') {
                this.examController = new ExamController(this);
            }

            // 初始化控制面板
            this.controlPanel = new ControlPanel(this);

            // 注册菜单命令
            this.registerMenuCommands();

            // 启动课程切换监听
            this.startCourseChangeDetection();

            Logger.success('初始化完成');

            // 如果配置自动开始，则自动启动
            if (CONFIG.autoStart) {
                setTimeout(() => this.start(), 2000);
            }
        }

        // 启动课程切换检测
        startCourseChangeDetection() {
            // 记录当前URL和视频源
            this.currentCourseUrl = window.location.href;
            this.lastCheckedUrl = window.location.href;
            const currentVideo = document.querySelector('video');
            this.lastVideoSrc = currentVideo ? currentVideo.src : null;
            this.lastNormalizedVideoSrc = this.normalizeVideoSrc(this.lastVideoSrc);
            this.lastCourseKey = this.getCurrentCourseKey();
            
            // 方法1: 监听URL变化 (SPA页面)
            let lastUrl = window.location.href;
            this.urlCheckInterval = setInterval(() => {
                const currentUrl = window.location.href;
                if (currentUrl !== lastUrl) {
                    Logger.log('🔄 检测到URL变化，准备重新启动...');
                    lastUrl = currentUrl;
                    this.handleCourseChange();
                }
            }, 1000);
            
            // 方法2: 监听pushState和replaceState (SPA路由)
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;
            
            history.pushState = function(...args) {
                originalPushState.apply(this, args);
                Logger.log('🔄 检测到pushState导航，准备重新启动...');
                autoPlayer.handleCourseChange();
            };
            
            history.replaceState = function(...args) {
                originalReplaceState.apply(this, args);
                Logger.log('🔄 检测到replaceState导航，准备重新启动...');
                autoPlayer.handleCourseChange();
            };
            
            // 方法3: 监听popstate (浏览器前进后退)
            window.addEventListener('popstate', () => {
                Logger.log('🔄 检测到popstate事件，准备重新启动...');
                this.handleCourseChange();
            });
            
            // 方法4: 监听DOM变化 (新视频元素出现) - 增加防抖避免初始加载时误触发
            let videoChangeTimeout = null;
            let lastVideoElement = document.querySelector('video');
            
            const observer = new MutationObserver((mutations) => {
                // 如果正在处理课程切换,跳过DOM监听触发
                if (this._isHandlingCourseChange) {
                    return;
                }
                
                // 清除之前的定时器
                if (videoChangeTimeout) {
                    clearTimeout(videoChangeTimeout);
                }
                
                // 增加防抖到1000ms,避免在课程切换过程中重复触发
                videoChangeTimeout = setTimeout(() => {
                    // 再次检查是否正在处理
                    if (this._isHandlingCourseChange) {
                        return;
                    }
                    
                    const newVideoElement = document.querySelector('video');
                    
                    // 检查是否有新的video元素,或者现有video的src变化
                    if (newVideoElement) {
                        const videoChanged = newVideoElement !== lastVideoElement;
                        const srcChanged = lastVideoElement && newVideoElement.src && 
                                         lastVideoElement.src && 
                                         newVideoElement.src !== lastVideoElement.src;
                        
                        if (videoChanged || srcChanged) {
                            const reason = videoChanged ? '新video元素' : 'video src变化';
                            Logger.log(`🎬 检测到${reason}，准备重新启动...`);
                            lastVideoElement = newVideoElement;
                            this.handleCourseChange();
                        }
                    }
                }, 1000); // 增加到1000ms防抖
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,      // 监听属性变化
                attributeFilter: ['src'] // 只监听src属性
            });
            
            Logger.success('✅ 课程切换监听已启动');
        }

        normalizeVideoSrc(src) {
            if (!src) return '';
            if (src.startsWith('blob:')) {
                return 'blob:';
            }
            try {
                const url = new URL(src, window.location.origin);
                const paramsToRemove = ['token', 'auth_key', 'ts', 'sign', 'videoKeyId', 'v', '_'];
                paramsToRemove.forEach(key => url.searchParams.delete(key));
                return `${url.origin}${url.pathname}`;
            } catch (error) {
                return src;
            }
        }

        getCurrentCourseKey() {
            const selectors = {
                title: [
                    '.yxtulcdsdk-course-player__main-title',
                    '.yxtulcdsdk-course-player__header-title',
                    '.yxtbiz-course-player__title',
                    '.yxtulcdsdk-course-page__title'
                ],
                activeCatalog: [
                    '.yxtulcdsdk-catalog .liactive .item-title',
                    '.yxtulcdsdk-catalog .liactive .item',
                    '.yxtulcdsdk-course-page__chapter-item .color-primary-6',
                    '.yxtulcdsdk-course-page__chapter-item.color-primary-6 .yxtulcdsdk-flex-1'
                ]
            };

            const getText = (selectorList) => {
                for (const selector of selectorList) {
                    const element = document.querySelector(selector);
                    if (element && element.textContent) {
                        const text = element.textContent.trim();
                        if (text) return text;
                    }
                }
                return '';
            };

            let courseId = '';
            let chapterId = '';
            try {
                const url = new URL(window.location.href);
                const courseParams = ['kngId', 'courseId', 'learningId', 'bizId'];
                const chapterParams = ['chapterId', 'kngNodeId', 'childId', 'sectionId'];
                for (const key of courseParams) {
                    if (url.searchParams.has(key)) {
                        courseId = url.searchParams.get(key);
                        break;
                    }
                }
                for (const key of chapterParams) {
                    if (url.searchParams.has(key)) {
                        chapterId = url.searchParams.get(key);
                        break;
                    }
                }
            } catch (error) {
                Logger.debug('解析URL失败', error);
            }

            const title = getText(selectors.title);
            const activeCatalog = getText(selectors.activeCatalog);
            const video = document.querySelector('video');
            const normalizedSrc = this.normalizeVideoSrc(video ? (video.currentSrc || video.src) : '');

            return [courseId, chapterId, title, activeCatalog, normalizedSrc]
                .filter(Boolean)
                .join(' | ');
        }

        // 处理课程切换
        async handleCourseChange() {
            // 防抖：避免短时间内多次触发
            if (this._courseChangeTimeout) {
                clearTimeout(this._courseChangeTimeout);
            }
            
            // 增加防抖时间到2秒,避免多个事件同时触发
            this._courseChangeTimeout = setTimeout(async () => {
                try {
                    // 如果正在处理课程切换,跳过
                    if (this._isHandlingCourseChange) {
                        Logger.debug('🔍 正在处理课程切换,跳过重复调用');
                        return;
                    }
                    
                    this._isHandlingCourseChange = true;
                    
                    // 🔍 智能检测: 是否真的需要切换?
                    const currentUrl = window.location.href;
                    const currentVideo = document.querySelector('video');
                    const currentVideoSrc = currentVideo ? currentVideo.src : null;
                    const currentNormalizedSrc = this.normalizeVideoSrc(currentVideoSrc);
                    const currentCourseKey = this.getCurrentCourseKey();
                    
                    // 检查URL的核心路径和关键参数
                    const getUrlInfo = (url) => {
                        try {
                            const urlObj = new URL(url);
                            // 提取pathname和关键参数(如vid, chapterId等)
                            const pathname = urlObj.pathname;
                            const searchParams = new URLSearchParams(urlObj.search);
                            const vid = searchParams.get('vid') || '';
                            const chapterId = searchParams.get('chapterId') || '';
                            return { pathname, vid, chapterId, fullUrl: url };
                        } catch {
                            return { pathname: url, vid: '', chapterId: '', fullUrl: url };
                        }
                    };
                    
                    const currentInfo = getUrlInfo(currentUrl);
                    const lastInfo = this.lastCheckedUrl ? getUrlInfo(this.lastCheckedUrl) : null;
                    
                    // 判断是否真正切换了课程/子课程
                    let needReload = false;
                    let changeReason = '';
                    
                    if (!lastInfo) {
                        // 首次初始化
                        needReload = false;
                        changeReason = '首次初始化';
                    } else if (currentInfo.pathname !== lastInfo.pathname) {
                        // 情况1: 页面路径变化 (切换到不同的课程)
                        needReload = true;
                        changeReason = '课程路径变化';
                    } else if (currentInfo.vid && lastInfo.vid && currentInfo.vid !== lastInfo.vid) {
                        // 情况2: 同一课程内的子视频切换 (有子课程的情况)
                        needReload = true;
                        changeReason = `子视频切换 (${lastInfo.vid} → ${currentInfo.vid})`;
                    } else if (currentInfo.chapterId && lastInfo.chapterId && currentInfo.chapterId !== lastInfo.chapterId) {
                        // 情况3: 章节ID变化
                        needReload = true;
                        changeReason = '章节切换';
                    } else if (currentNormalizedSrc && this.lastNormalizedVideoSrc && currentNormalizedSrc !== this.lastNormalizedVideoSrc) {
                        // 情况4: 视频源URL变化 (兜底检测)
                        needReload = true;
                        changeReason = '视频源变化';
                    } else if (this.lastCourseKey && currentCourseKey && currentCourseKey !== this.lastCourseKey) {
                        needReload = true;
                        changeReason = '课程标识变化';
                    } else {
                        // 情况5: 页面内部更新,不需要重启
                        needReload = false;
                        changeReason = '页面内部更新';
                    }
                    
                    // 如果不需要重载,跳过处理
                    if (!needReload) {
                        Logger.debug(`🔍 ${changeReason},跳过重启`);
                        this.lastVideoSrc = currentVideoSrc || this.lastVideoSrc;
                        this.lastCourseKey = currentCourseKey || this.lastCourseKey;
                        this.lastNormalizedVideoSrc = currentNormalizedSrc || this.lastNormalizedVideoSrc;
                        this._isHandlingCourseChange = false;
                        return;
                    }
                    
                    Logger.log(`📚 检测到课程切换 (${changeReason})`);
                    
                    // 更新记录
                    this.lastCheckedUrl = currentUrl;
                    this.lastVideoSrc = currentVideoSrc;
                    this.lastNormalizedVideoSrc = currentNormalizedSrc;
                    this.lastCourseKey = currentCourseKey;
                    
                    // 1. 停止当前播放并重置状态
                    this.stop();
                    
                    // 2. 等待新内容加载 (增加到3秒,确保视频播放器初始化完成)
                    Logger.log('⏳ 等待新视频加载...');
                    await this.sleep(3000);
                    
                    // 3. 重新检测内容类型
                    this.detectContentType();
                    
                    // 4. 重新初始化控制器
                    if (this.contentType === 'video') {
                        this.videoController = new VideoController(this.stateManager, this);
                        Logger.log('🎥 重新初始化视频控制器');
                    } else if (this.contentType === 'pdf') {
                        this.pdfController = new PDFController(this.stateManager);
                        Logger.log('📄 重新初始化PDF控制器');
                    } else if (this.contentType === 'exam') {
                        if (!this.examController) {
                            this.examController = new ExamController(this);
                        } else {
                            this.examController.resetForNewExam();
                        }
                        Logger.log('📝 重新初始化考试控制器');
                    }
                    
                    // 5. 如果配置自动开始，则自动启动
                    if (CONFIG.autoStart) {
                        Logger.log('🚀 自动重启播放...');
                        await this.sleep(1000);
                        await this.start();
                    }
                    
                    Logger.success('✅ 课程切换处理完成');
                    this._isHandlingCourseChange = false;
                } catch (error) {
                    Logger.error('❌ 课程切换处理失败:', error);
                    this._isHandlingCourseChange = false;
                }
            }, 2000); // 增加到2秒防抖
        }

        // 检测内容类型
        detectContentType() {
            const currentUrl = window.location.href;
            if (/\/ote\//i.test(currentUrl) || document.querySelector('#oteApp') || document.querySelector('#ote-app') || document.querySelector('[class*="ote-exam"]')) {
                this.contentType = 'exam';
                Logger.log('检测到考试页面');
                return;
            }

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
            
            if (this.contentType !== 'exam') {
                const startButtonClicked = await this.clickStartButton();
                if (startButtonClicked) {
                    Logger.success('已点击开始学习按钮，等待内容加载...');
                    await this.sleep(2000); // 等待内容加载
                }
            } else {
                Logger.log('考试页面跳过自动点击开始按钮');
            }
            
            // 重新检测内容类型(因为内容是动态加载的)
            const oldContentType = this.contentType;
            this.detectContentType();
            
            // 如果内容类型改变,重新初始化对应的控制器
            if (this.contentType !== oldContentType) {
                if (this.contentType === 'video') {
                    this.videoController = new VideoController(this.stateManager, this);
                } else if (this.contentType === 'pdf') {
                    this.pdfController = new PDFController(this.stateManager);
                } else if (this.contentType === 'exam') {
                    this.examController = new ExamController(this);
                }
            }

            if (this.contentType === 'exam' && !this.examController) {
                this.examController = new ExamController(this);
            }
            
            // 根据内容类型选择不同的处理方式
            if (this.contentType === 'exam') {
                await this.startExamMode();
            } else if (this.contentType === 'pdf') {
                await this.startPDFReading();
            } else {
                await this.startVideoPlaying();
            }
        }

        async startExamMode() {
            Logger.log('启动考试考题捕获...');

            if (!this.examController) {
                this.examController = new ExamController(this);
            } else {
                this.examController.resetForNewExam();
            }

            this.examController.start();
            this.stateManager.setState({
                isRunning: true,
                startTime: Date.now()
            });
            Logger.success('考试模块已启动');
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
            
            // 🔄 立即更新UI状态 (显示正在加载)
            const statusDiv = document.getElementById('famsun-auto-status');
            if (statusDiv) {
                statusDiv.innerHTML = `
                    <div style="font-size: 13px; color: #4CAF50; text-align: center;">
                        🎬 正在加载视频播放器...
                    </div>
                `;
            }
            
            if (this.videoController) {
                this.videoController.durationFallback = false;
                this.videoController.durationWarningShown = false;
                this.videoController.metadataListenerBound = false;
                this.videoController.metadataReady = false;
            }

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
                // 更新UI显示错误
                if (statusDiv) {
                    statusDiv.innerHTML = `
                        <div style="font-size: 13px; color: #f44336; text-align: center;">
                            ❌ 未找到视频播放器
                        </div>
                    `;
                }
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
            
            // 🔍 优化: 如果已经检测到视频播放器或PDF,跳过按钮查找
            const hasVideo = document.querySelector('video') !== null;
            const hasCyberPlayer = window.cyberplayer !== undefined;
            const hasPDF = document.querySelector('.yxtulcdsdk-course-player__pdfreader') !== null;
            
            if (hasVideo || hasCyberPlayer || hasPDF) {
                Logger.log('✅ 检测到内容已加载(视频/PDF),跳过按钮查找');
                return false; // 返回false表示没有点击按钮,但不是错误
            }
            
            // 定义按钮选择器和关键词（优先级从高到低）
            const buttonSelectors = [
                // YXT框架按钮
                '.yxtf-button--primary',
                '.yxtf-button',
                'button.yxt-button',
                // ULCD SDK按钮（新增）
                '.yxtulcdsdk-nextchapterbutton',
                'button[class*="yxtulcdsdk"]',
                // 通用按钮
                'button',
                'div[role="button"]',
                'a[role="button"]'
            ];
            
            // 重试机制：最多尝试15次，每次间隔1秒
            const maxRetries = 15;
            let retryCount = 0;
            
            while (retryCount < maxRetries) {
                // 收集所有可能的按钮及其优先级
                const foundButtons = [];
                
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
                            
                            if (isVisible && text) {
                                // 判断按钮类型和优先级
                                let priority = 0;
                                let buttonType = '';
                                
                                if (text.includes('下一个') || text.includes('下一章') || text.includes('下一节')) {
                                    priority = 1; // 最高优先级：下一个
                                    buttonType = '下一个';
                                } else if (text.includes('开始学习') || text.includes('开始播放')) {
                                    priority = 2; // 次优先级：开始学习/播放
                                    buttonType = '开始学习';
                                } else if (text.includes('继续学习') || text.includes('继续播放')) {
                                    priority = 3; // 第三优先级：继续学习
                                    buttonType = '继续学习';
                                } else if (text.includes('播放') && !text.includes('倍速') && !text.includes('播放器')) {
                                    priority = 4; // 第四优先级：播放
                                    buttonType = '播放';
                                }
                                
                                if (priority > 0) {
                                    foundButtons.push({
                                        button: btn,
                                        priority,
                                        buttonType,
                                        text,
                                        selector
                                    });
                                }
                            }
                        }
                    } catch (error) {
                        Logger.debug(`选择器失败: ${selector}`, error);
                    }
                }
                
                // 按优先级排序（priority 小的优先）
                foundButtons.sort((a, b) => a.priority - b.priority);
                
                // 如果找到了按钮，点击并返回
                if (foundButtons.length > 0) {
                    // 特殊处理：如果同时存在"下一个"和"继续学习"，优先点击"下一个"
                    const hasNext = foundButtons.some(item => item.priority === 1);
                    const hasContinue = foundButtons.some(item => item.priority === 3);
                    
                    if (hasNext && hasContinue) {
                        Logger.log('检测到同时存在"下一个"和"继续学习"按钮，优先点击"下一个"');
                    }
                    
                    const targetButton = foundButtons[0];
                    Logger.success(`找到按钮: "${targetButton.text}" (类型: ${targetButton.buttonType}, 选择器: ${targetButton.selector})`);
                    targetButton.button.click();
                    return true;
                }
                
                // 未找到按钮，等待后重试
                retryCount++;
                if (retryCount < maxRetries) {
                    Logger.debug(`第 ${retryCount}/${maxRetries} 次未找到按钮，等待1秒后重试...`);
                    await this.sleep(1000);
                } else {
                    Logger.warn(`尝试 ${maxRetries} 次后仍未找到开始学习按钮，可能已经在播放页面或按钮未渲染`);
                }
            }
            
            return false;
        }

        stop() {
            Logger.log('🛑 停止自动播放');
            
            // 停止视频播放
            if (this.videoController) {
                this.videoController.pause();
                this.videoController.stopMonitoring();
            }
            
            // 停止PDF浏览
            if (this.pdfController) {
                this.pdfController.destroy();
            }

            if (this.examController) {
                this.examController.stop();
            }
            
            // 重置状态
            this.stateManager.setState({ isRunning: false });
            
            // 🔄 清空UI面板显示 (避免显示旧视频的进度信息)
            this.resetUIPanel();
            
            Logger.log('✅ 已停止');
        }
        
        // 重置UI面板显示
        resetUIPanel() {
            const statusDiv = document.getElementById('famsun-auto-status');
            if (statusDiv) {
                statusDiv.innerHTML = `
                    <div style="font-size: 13px; color: #FFD700; text-align: center;">
                        🔄 准备加载新课程...
                    </div>
                `;
            }

            const examSection = document.getElementById('famsun-exam-section');
            if (examSection) {
                examSection.style.display = 'none';
            }
        }

        // 清理所有资源
        destroy() {
            Logger.log('🗑️ 清理资源...');
            
            // 停止播放
            this.stop();
            
            // 停止URL检查
            if (this.urlCheckInterval) {
                clearInterval(this.urlCheckInterval);
                this.urlCheckInterval = null;
            }
            
            // 清理反检测
            if (this.antiDetection) {
                this.antiDetection.destroy();
            }
            
            Logger.log('✅ 资源清理完成');
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

            GM_registerMenuCommand('📋 复制考试考题', () => {
                if (!this.examController) {
                    alert('考试模块尚未启动，请在考试页面使用此功能。');
                    return;
                }
                const success = this.examController.copyQuestionsToClipboard();
                if (!success) {
                    alert('暂无可复制的考题，请等待考试数据加载后重试。');
                }
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
