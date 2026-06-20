let serialPort = null;
let writer = null;
let isConnected = false; let isArmed = false; let transmissionIntervalId = null;

let channels = { roll: 1500, pitch: 1500, yaw: 1500, throttle: 1000, aux1: 1000, aux2: 1000, aux3: 1000, aux4: 1000 };

// 🛠️ 核心記憶體：用來死死記住妳左手手指離開螢幕那一瞬間的「最後實體位置」
let lastLeftStickX = 40; // 預設置中
let lastLeftStickY = 80; // 預設最底 (0%油門)

const fullscreenBtn = document.getElementById('fullscreenBtn');
const connectBtn = document.getElementById('connectBtn'); const armBtn = document.getElementById('armBtn');
const leftStick = document.getElementById('leftStick'); const rightStick = document.getElementById('rightStick');

fullscreenBtn.addEventListener('click', async () => {
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape').catch(e => console.log('旋轉鎖定受阻:', e));
            }
            fullscreenBtn.textContent = "Exit 視窗";
        } else {
            await document.exitFullscreen();
            fullscreenBtn.textContent = "🖥️ 全螢幕";
        }
    } catch (error) { console.error(error); }
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) { fullscreenBtn.textContent = "🖥️ 全螢幕"; }
});

connectBtn.addEventListener('click', async () => {
    if (isConnected) { disconnectBluetooth(); return; }
    try {
        serialPort = await navigator.serial.requestPort();
        await serialPort.open({ baudRate: 115200 }); 
        writer = serialPort.writable.getWriter();
        
        isConnected = true; 
        connectBtn.textContent = "COM 埠已接通"; 
        connectBtn.classList.add('connected');
        armBtn.disabled = false; 
        armBtn.textContent = "解鎖馬達 (ARM)"; 
        armBtn.classList.add('ready');
        
        startTransmissionLoop();
    } catch (error) { 
        alert("串口連接失敗: " + error.message); 
    }
});

function disconnectBluetooth() {
    if (transmissionIntervalId) { clearInterval(transmissionIntervalId); transmissionIntervalId = null; }
    if (writer) { writer.releaseLock(); writer = null; }
    if (serialPort) { serialPort.close(); serialPort = null; }
    
    isConnected = false; isArmed = false; connectBtn.textContent = "連接藍牙"; connectBtn.classList.remove('connected');
    armBtn.disabled = true; armBtn.classList.remove('ready'); armBtn.textContent = "請先連接藍牙";
    resetSticks();
}

armBtn.addEventListener('click', () => {
    if (!isConnected) return;
    isArmed = !isArmed;
    if (isArmed) { 
        armBtn.textContent = "❗ 鎖定馬達 (DISARM)"; 
        armBtn.style.backgroundColor = "#ff2e63"; 
        channels.aux1 = 2000; 
    } else { 
        armBtn.textContent = "解鎖馬達 (ARM)"; 
        armBtn.style.backgroundColor = "#ff5722"; 
        channels.aux1 = 1000; 
        resetSticks(); 
    }
});

function setupJoystick(zoneId, stickId, isLeftZone) {
    const zone = document.getElementById(zoneId); 
    const stick = document.getElementById(stickId); 
    const maxRadius = 40;     
    
    let activeTouchId = null;

    // 初始化對齊
    if (isLeftZone) {
        stick.style.left = lastLeftStickX + 'px';
        stick.style.top = lastLeftStickY + 'px';
    } else {
        stick.style.left = '40px';
        stick.style.top = '40px';
    }

    function handleStart(e) {
        e.preventDefault();
        if (!isConnected) return;
        if (activeTouchId === null) {
            const touch = e.changedTouches[0];
            activeTouchId = touch.identifier;
            handleMove(e);
        }
    }

    function handleMove(e) {
        e.preventDefault(); 
        if (!isConnected || activeTouchId === null) return;
        
        let touch = null;
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].identifier === activeTouchId) {
                touch = e.touches[i];
                break;
            }
        }
        if (!touch) return; 

        const rect = zone.getBoundingClientRect();
        
        // 🛠️ 幾何大一統：兩側均以純淨的 (40, 40) 的視覺包裝盒為核心座標，再加上半徑 20px 偏置
        let deltaX = touch.clientX - rect.left - 60; 
        let deltaY = touch.clientY - rect.top - 60;  
        
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance > maxRadius) { deltaX = (deltaX / distance) * maxRadius; deltaY = (deltaY / distance) * maxRadius; }
        
        if (isLeftZone) { 
            // 🛠️ 【左手不限位平滑滑動軌跡】
            let finalX = 40 + deltaX;
            let finalY = 40 + deltaY;
            
            stick.style.left = finalX + 'px'; 
            stick.style.top = finalY + 'px'; 
            
            // 記憶此時的坐標，不回彈
            lastLeftStickX = finalX;
            lastLeftStickY = finalY;
            
            channels.yaw = Math.round(1500 + (deltaX / maxRadius) * 500);
            
            // 🚀 【無公差油門線性映射】：最底（deltaY = 40）為 1000，最高（deltaY = -40）為 2000
            let rawThrottle = Math.round(1500 - (deltaY / maxRadius) * 500);
            channels.throttle = rawThrottle < 1150 ? 1000 : Math.min(2000, rawThrottle);
        } else { 
            // 右手維持標準居中360度滑動
            stick.style.left = (40 + deltaX) + 'px'; 
            stick.style.top = (40 + deltaY) + 'px'; 
            
            channels.roll = Math.round(1500 + (deltaX / maxRadius) * 500);
            channels.pitch = Math.round(1500 - (deltaY / maxRadius) * 500); 
        }
        updateUI();
    }

    function handleEnd(e) {
        e.preventDefault();
        if (activeTouchId === null) return;
        
        let touchTriggered = false;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeTouchId) {
                touchTriggered = true;
                break;
            }
        }
        
        if (touchTriggered) {
            activeTouchId = null; 
            if (isLeftZone) { 
                // 🚀 【航模級阻尼法規】：左手放開時，航向航道（Yaw）彈回 1500，
                // 但油門小圓餅死死定格在原地（lastLeftStickY）和此時的油門數據，打死不准動！
                channels.yaw = 1500;
                lastLeftStickX = 40; 
                stick.style.left = '40px';
                stick.style.top = lastLeftStickY + 'px'; 
            } else { 
                // 右手放開自動全回彈置中
                channels.pitch = 1500; channels.roll = 1500; 
                stick.style.left = '40px'; stick.style.top = '40px'; 
            }
            updateUI();
        }
    }
    
    zone.addEventListener('touchstart', handleStart); 
    zone.addEventListener('touchmove', handleMove); 
    zone.addEventListener('touchend', handleEnd);
    zone.addEventListener('touchcancel', handleEnd);
}

setupJoystick('leftZone', 'leftStick', true); 
setupJoystick('rightZone', 'rightStick', false);

function resetSticks() {
    channels.throttle = 1000; channels.yaw = 1500; channels.pitch = 1500; channels.roll = 1500;
    lastLeftStickX = 40; lastLeftStickY = 80; // 歸位到最底
    leftStick.style.left = '40px'; leftStick.style.top = '80px';  
    rightStick.style.left = '40px'; rightStick.style.top = '40px'; 
    updateUI();
}

function updateUI() {
    let dispThrottle = channels.throttle < 1150 ? 1000 : channels.throttle;
    document.getElementById('valT').textContent = Math.round((dispThrottle - 1000) / 10);
    document.getElementById('valY').textContent = channels.yaw; 
    document.getElementById('valP').textContent = channels.pitch; 
    document.getElementById('valR').textContent = channels.roll;
}

function startTransmissionLoop() {
    transmissionIntervalId = setInterval(async () => {
        if (!isConnected || !writer) return; 
        
        const mspId = 200; 
        const dataSize = 16; 
        const payload = new Uint8Array(dataSize);
        
        let cleanThrottle = channels.throttle;
        if (cleanThrottle < 1150) {
            cleanThrottle = 1000;
        }
        
        payload[0]  = channels.roll & 0xFF;        payload[1]  = (channels.roll >> 8) & 0xFF;
        payload[2]  = channels.pitch & 0xFF;       payload[3]  = (channels.pitch >> 8) & 0xFF;
        payload[4]  = channels.yaw & 0xFF;         payload[5]  = (channels.yaw >> 8) & 0xFF;
        payload[6]  = cleanThrottle & 0xFF;        payload[7]  = (cleanThrottle >> 8) & 0xFF;
        payload[8]  = channels.aux1 & 0xFF;        payload[9]  = (channels.aux1 >> 8) & 0xFF;
        payload[10] = channels.aux2 & 0xFF;        payload[11] = (channels.aux2 >> 8) & 0xFF;
        payload[12] = channels.aux3 & 0xFF;        payload[13] = (channels.aux3 >> 8) & 0xFF;
        payload[14] = channels.aux4 & 0xFF;        payload[15] = (channels.aux4 >> 8) & 0xFF;
        
        let checksum = dataSize ^ mspId;
        for (let i = 0; i < dataSize; i++) { checksum ^= payload[i]; }
        
        const buffer = new Uint8Array(6 + dataSize);
        buffer[0] = 0x24; // '$'
        buffer[1] = 0x4D; // 'M'
        buffer[2] = 0x3C; // '<'
        buffer[3] = dataSize;
        buffer[4] = mspId;
        
        for (let i = 0; i < dataSize; i++) { buffer[5 + i] = payload[i]; }
        buffer[5 + dataSize] = checksum;
        
        try { 
            await writer.write(buffer); 
        } catch (e) { console.error("中斷:", e); }
    }, 70); 
}