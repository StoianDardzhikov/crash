/**
 * Crash Game - Game Iframe JavaScript
 * Handles game visualization and multiplier display
 */

class CrashGame {
  constructor() {
    // Get session ID from URL
    this.sessionId = new URLSearchParams(window.location.search).get('sessionId');

    // DOM elements
    this.multiplierEl = document.getElementById('multiplier');
    this.statusTextEl = document.getElementById('statusText');
    this.countdownEl = document.getElementById('countdown');
    this.roundIdEl = document.getElementById('roundId');
    this.seedHashEl = document.getElementById('seedHash');
    this.historyBarEl = document.getElementById('historyBar');
    this.connectionStatusEl = document.getElementById('connectionStatus');
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Game state
    this.currentMultiplier = 1.00;
    this.roundStatus = 'waiting';
    this.roundStartTime = null;
    this.history = [];
    this.graphPoints = [];

    // Animation state
    this.animationFrame = null;
    this.particles = [];
    this.stars = [];
    this.rocketTrail = [];
    this.explosionParticles = [];
    this.shakeIntensity = 0;
    this.glowIntensity = 0;

    // Initialize stars background
    this.initStars();

    // Initialize
    this.init();
  }

  initStars() {
    // Create static stars for background
    for (let i = 0; i < 100; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() * 2 + 0.5,
        twinkle: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.01
      });
    }
  }

  init() {
    // Setup canvas
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Connect to WebSocket
    this.connect();

    // Start render loop
    this.render();
  }

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  connect() {
    if (!this.sessionId) {
      this.statusTextEl.textContent = 'No session ID provided';
      return;
    }

    // Connect to game namespace
    this.socket = io('/ws/game', {
      query: { sessionId: this.sessionId },
      transports: ['websocket', 'polling']
    });

    // Connection events
    this.socket.on('connect', () => {
      console.log('[Game] Connected');
      this.connectionStatusEl.textContent = 'CONNECTED';
      this.connectionStatusEl.className = 'connection-status connected';
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Game] Disconnected:', reason);
      this.connectionStatusEl.textContent = 'DISCONNECTED';
      this.connectionStatusEl.className = 'connection-status disconnected';
      this.statusTextEl.textContent = 'Connection lost...';
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Game] Connection error:', error);
      this.statusTextEl.textContent = 'Connection error';
    });

    // Game events
    this.socket.on('error', (data) => {
      console.error('[Game] Error:', data);
      this.statusTextEl.textContent = data.message || 'Error';
    });

    this.socket.on('waiting', (data) => {
      this.roundStatus = 'waiting';
      this.statusTextEl.textContent = data.message;
    });

    this.socket.on('betting_phase', (data) => {
      this.handleBettingPhase(data);
    });

    this.socket.on('round_start', (data) => {
      this.handleRoundStart(data);
    });

    this.socket.on('round_running', (data) => {
      // Reconnected during a running round
      this.handleRoundRunning(data);
    });

    this.socket.on('round_tick', (data) => {
      this.handleTick(data);
    });

    this.socket.on('round_crash', (data) => {
      this.handleCrash(data);
    });

    this.socket.on('history', (data) => {
      this.history = data;
      this.renderHistory();
    });
  }

  handleBettingPhase(data) {
    console.log('[Game] Betting phase:', data);

    this.roundStatus = 'betting';
    this.roundIdEl.textContent = data.roundId;
    this.seedHashEl.textContent = `Hash: ${data.serverSeedHash.substring(0, 16)}...`;

    this.multiplierEl.textContent = 'STARTING';
    this.multiplierEl.className = 'multiplier betting';
    this.statusTextEl.textContent = 'Place your bets!';

    // Start countdown (5 seconds)
    this.startCountdown(5);

    // Reset graph and effects
    this.graphPoints = [];
    this.currentMultiplier = 1.00;
    this.rocketTrail = [];
    this.explosionParticles = [];
    this.shakeIntensity = 0;
    this.glowIntensity = 0;
  }

  handleRoundStart(data) {
    console.log('[Game] Round started:', data);

    this.roundStatus = 'running';
    this.roundStartTime = data.startTime;
    this.countdownEl.textContent = '';

    this.multiplierEl.textContent = '1.00x';
    this.multiplierEl.className = 'multiplier';
    this.statusTextEl.textContent = '';

    this.graphPoints = [{ x: 0, y: 1 }];
    this.rocketTrail = [];
  }

  handleRoundRunning(data) {
    console.log('[Game] Reconnected to running round:', data);

    this.roundStatus = 'running';
    this.roundIdEl.textContent = data.roundId;
    this.seedHashEl.textContent = `Hash: ${data.serverSeedHash.substring(0, 16)}...`;
    this.roundStartTime = data.startTime;
    this.currentMultiplier = data.currentMultiplier;

    this.multiplierEl.textContent = `${this.currentMultiplier.toFixed(2)}x`;
    this.multiplierEl.className = 'multiplier';
    this.statusTextEl.textContent = '';
    this.countdownEl.textContent = '';
  }

  handleTick(data) {
    if (this.roundStatus !== 'running') return;

    this.currentMultiplier = data.multiplier;
    this.multiplierEl.textContent = `${this.currentMultiplier.toFixed(2)}x`;

    // Add point to graph
    this.graphPoints.push({
      x: data.elapsed / 1000,
      y: data.multiplier
    });

    // Keep graph points manageable
    if (this.graphPoints.length > 500) {
      this.graphPoints = this.graphPoints.slice(-500);
    }

    // Update glow intensity based on multiplier
    this.glowIntensity = Math.min(1, (data.multiplier - 1) / 10);

    // Update multiplier color based on value
    if (data.multiplier >= 10) {
      this.multiplierEl.style.color = '#ff00ff';
      this.multiplierEl.style.textShadow = '0 0 30px rgba(255, 0, 255, 0.8)';
    } else if (data.multiplier >= 5) {
      this.multiplierEl.style.color = '#00ffff';
      this.multiplierEl.style.textShadow = '0 0 25px rgba(0, 255, 255, 0.7)';
    } else if (data.multiplier >= 2) {
      this.multiplierEl.style.color = '#00ff88';
      this.multiplierEl.style.textShadow = '0 0 20px rgba(0, 255, 136, 0.5)';
    } else {
      this.multiplierEl.style.color = '#00ff88';
      this.multiplierEl.style.textShadow = '0 0 20px rgba(0, 255, 136, 0.5)';
    }
  }

  handleCrash(data) {
    console.log('[Game] Round crashed:', data);

    this.roundStatus = 'crashed';
    this.currentMultiplier = data.crashPoint;

    this.multiplierEl.textContent = `${data.crashPoint.toFixed(2)}x`;
    this.multiplierEl.className = 'multiplier crashed';
    this.multiplierEl.style.color = '';
    this.multiplierEl.style.textShadow = '';
    this.statusTextEl.textContent = 'CRASHED!';

    // Create explosion effect
    this.createExplosion();
    this.shakeIntensity = 20;

    // Add to history
    this.history.unshift({
      id: data.roundId,
      crashPoint: data.crashPoint,
      serverSeed: data.serverSeed,
      serverSeedHash: data.serverSeedHash
    });

    // Keep only last 20 in memory
    if (this.history.length > 20) {
      this.history.pop();
    }

    this.renderHistory();
  }

  createExplosion() {
    const width = this.canvas.width / window.devicePixelRatio;
    const height = this.canvas.height / window.devicePixelRatio;

    // Get last point position for explosion center
    let explosionX = width / 2;
    let explosionY = height / 2;

    if (this.graphPoints.length > 0) {
      const maxTime = Math.max(10, this.graphPoints[this.graphPoints.length - 1].x + 2);
      const maxMultiplier = Math.max(2, this.currentMultiplier * 1.2);
      const scaleX = (width - 80) / maxTime;
      const scaleY = (height - 100) / (maxMultiplier - 1);

      const lastPoint = this.graphPoints[this.graphPoints.length - 1];
      explosionX = 60 + lastPoint.x * scaleX;
      explosionY = height - 60 - (lastPoint.y - 1) * scaleY;
    }

    // Create explosion particles
    for (let i = 0; i < 50; i++) {
      const angle = (Math.PI * 2 * i) / 50 + Math.random() * 0.5;
      const speed = Math.random() * 8 + 4;
      this.explosionParticles.push({
        x: explosionX,
        y: explosionY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: Math.random() * 6 + 2,
        color: Math.random() > 0.5 ? '#ff4444' : '#ff8800'
      });
    }
  }

  startCountdown(seconds) {
    let remaining = seconds;
    this.countdownEl.textContent = remaining;

    const interval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        this.countdownEl.textContent = '';
        clearInterval(interval);
      } else {
        this.countdownEl.textContent = remaining;
      }
    }, 1000);
  }

  renderHistory() {
    this.historyBarEl.innerHTML = '';

    this.history.slice(0, 15).forEach(round => {
      const item = document.createElement('div');
      item.className = 'history-item';

      if (round.crashPoint < 2) {
        item.classList.add('low');
      } else if (round.crashPoint < 5) {
        item.classList.add('medium');
      } else if (round.crashPoint < 10) {
        item.classList.add('high');
      } else {
        item.classList.add('epic');
      }

      item.textContent = `${round.crashPoint.toFixed(2)}x`;
      item.title = `Round: ${round.id}`;

      this.historyBarEl.appendChild(item);
    });
  }

  render() {
    this.drawGraph();
    this.animationFrame = requestAnimationFrame(() => this.render());
  }

  drawGraph() {
    const width = this.canvas.width / window.devicePixelRatio;
    const height = this.canvas.height / window.devicePixelRatio;

    // Apply shake effect
    this.ctx.save();
    if (this.shakeIntensity > 0) {
      const shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      const shakeY = (Math.random() - 0.5) * this.shakeIntensity;
      this.ctx.translate(shakeX, shakeY);
      this.shakeIntensity *= 0.9;
      if (this.shakeIntensity < 0.5) this.shakeIntensity = 0;
    }

    // Clear canvas with fade effect
    this.ctx.fillStyle = 'rgba(10, 10, 26, 0.3)';
    this.ctx.fillRect(0, 0, width, height);

    // Draw animated stars background
    this.drawStars(width, height);

    // Draw grid with glow
    this.drawGrid(width, height);

    // Draw graph area fill and line
    if (this.graphPoints.length >= 2) {
      this.drawGraphFill(width, height);
      this.drawGraphLine(width, height);
      this.drawRocketAndTrail(width, height);
    }

    // Draw explosion particles
    this.updateAndDrawExplosion();

    // Draw axis labels
    this.drawAxisLabels(width, height);

    this.ctx.restore();
  }

  drawStars(width, height) {
    const time = Date.now() / 1000;

    this.stars.forEach(star => {
      const twinkle = Math.sin(time * star.speed * 10 + star.twinkle) * 0.5 + 0.5;
      const alpha = 0.3 + twinkle * 0.7;

      this.ctx.beginPath();
      this.ctx.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      this.ctx.fill();
    });
  }

  drawGrid(width, height) {
    const padding = { left: 60, right: 20, top: 40, bottom: 60 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    // Calculate dynamic scale
    const maxTime = this.graphPoints.length > 0
      ? Math.max(10, this.graphPoints[this.graphPoints.length - 1].x + 2)
      : 10;
    const maxMultiplier = Math.max(2, this.currentMultiplier * 1.2);

    // Draw gradient background for graph area
    const gradient = this.ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, 'rgba(0, 255, 136, 0.05)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(padding.left, padding.top, graphWidth, graphHeight);

    // Grid lines
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    this.ctx.lineWidth = 1;

    // Vertical grid lines (time)
    const timeStep = maxTime <= 20 ? 2 : maxTime <= 50 ? 5 : 10;
    for (let t = 0; t <= maxTime; t += timeStep) {
      const x = padding.left + (t / maxTime) * graphWidth;
      this.ctx.beginPath();
      this.ctx.moveTo(x, padding.top);
      this.ctx.lineTo(x, height - padding.bottom);
      this.ctx.stroke();
    }

    // Horizontal grid lines (multiplier)
    const multiplierStep = maxMultiplier <= 5 ? 1 : maxMultiplier <= 20 ? 2 : 5;
    for (let m = 1; m <= maxMultiplier; m += multiplierStep) {
      const y = height - padding.bottom - ((m - 1) / (maxMultiplier - 1)) * graphHeight;
      this.ctx.beginPath();
      this.ctx.moveTo(padding.left, y);
      this.ctx.lineTo(width - padding.right, y);
      this.ctx.stroke();

      // Multiplier labels
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      this.ctx.font = '11px monospace';
      this.ctx.textAlign = 'right';
      this.ctx.fillText(`${m.toFixed(1)}x`, padding.left - 8, y + 4);
    }

    // Time labels
    this.ctx.textAlign = 'center';
    for (let t = 0; t <= maxTime; t += timeStep) {
      const x = padding.left + (t / maxTime) * graphWidth;
      this.ctx.fillText(`${t}s`, x, height - padding.bottom + 20);
    }

    // Axis lines
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.lineWidth = 2;

    // Y axis
    this.ctx.beginPath();
    this.ctx.moveTo(padding.left, padding.top);
    this.ctx.lineTo(padding.left, height - padding.bottom);
    this.ctx.stroke();

    // X axis
    this.ctx.beginPath();
    this.ctx.moveTo(padding.left, height - padding.bottom);
    this.ctx.lineTo(width - padding.right, height - padding.bottom);
    this.ctx.stroke();
  }

  drawGraphFill(width, height) {
    const padding = { left: 60, right: 20, top: 40, bottom: 60 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    const maxTime = Math.max(10, this.graphPoints[this.graphPoints.length - 1].x + 2);
    const maxMultiplier = Math.max(2, this.currentMultiplier * 1.2);

    const scaleX = graphWidth / maxTime;
    const scaleY = graphHeight / (maxMultiplier - 1);

    // Create gradient fill under the curve
    const gradient = this.ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);

    if (this.roundStatus === 'crashed') {
      gradient.addColorStop(0, 'rgba(255, 68, 68, 0.4)');
      gradient.addColorStop(0.5, 'rgba(255, 68, 68, 0.2)');
      gradient.addColorStop(1, 'rgba(255, 68, 68, 0)');
    } else {
      const intensity = Math.min(0.6, 0.2 + this.glowIntensity * 0.4);
      gradient.addColorStop(0, `rgba(0, 255, 136, ${intensity})`);
      gradient.addColorStop(0.5, `rgba(0, 255, 136, ${intensity * 0.5})`);
      gradient.addColorStop(1, 'rgba(0, 255, 136, 0)');
    }

    this.ctx.beginPath();
    this.ctx.moveTo(padding.left, height - padding.bottom);

    this.graphPoints.forEach((point, i) => {
      const x = padding.left + point.x * scaleX;
      const y = height - padding.bottom - (point.y - 1) * scaleY;
      if (i === 0) {
        this.ctx.lineTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });

    // Close the path
    const lastPoint = this.graphPoints[this.graphPoints.length - 1];
    const lastX = padding.left + lastPoint.x * scaleX;
    this.ctx.lineTo(lastX, height - padding.bottom);
    this.ctx.closePath();

    this.ctx.fillStyle = gradient;
    this.ctx.fill();
  }

  drawGraphLine(width, height) {
    const padding = { left: 60, right: 20, top: 40, bottom: 60 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    const maxTime = Math.max(10, this.graphPoints[this.graphPoints.length - 1].x + 2);
    const maxMultiplier = Math.max(2, this.currentMultiplier * 1.2);

    const scaleX = graphWidth / maxTime;
    const scaleY = graphHeight / (maxMultiplier - 1);

    // Determine line color based on status
    let lineColor, glowColor;
    if (this.roundStatus === 'crashed') {
      lineColor = '#ff4444';
      glowColor = 'rgba(255, 68, 68, 0.8)';
    } else if (this.currentMultiplier >= 10) {
      lineColor = '#ff00ff';
      glowColor = 'rgba(255, 0, 255, 0.8)';
    } else if (this.currentMultiplier >= 5) {
      lineColor = '#00ffff';
      glowColor = 'rgba(0, 255, 255, 0.8)';
    } else {
      lineColor = '#00ff88';
      glowColor = 'rgba(0, 255, 136, 0.8)';
    }

    // Draw glow effect (multiple passes)
    for (let blur = 20; blur >= 5; blur -= 5) {
      this.ctx.beginPath();
      this.ctx.strokeStyle = glowColor;
      this.ctx.lineWidth = 3 + blur / 2;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.shadowColor = glowColor;
      this.ctx.shadowBlur = blur;

      this.graphPoints.forEach((point, i) => {
        const x = padding.left + point.x * scaleX;
        const y = height - padding.bottom - (point.y - 1) * scaleY;
        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      });

      this.ctx.stroke();
    }

    // Draw main line
    this.ctx.beginPath();
    this.ctx.strokeStyle = lineColor;
    this.ctx.lineWidth = 4;
    this.ctx.shadowBlur = 0;

    this.graphPoints.forEach((point, i) => {
      const x = padding.left + point.x * scaleX;
      const y = height - padding.bottom - (point.y - 1) * scaleY;
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });

    this.ctx.stroke();
  }

  drawRocketAndTrail(width, height) {
    if (this.roundStatus === 'crashed') return;

    const padding = { left: 60, right: 20, top: 40, bottom: 60 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    const maxTime = Math.max(10, this.graphPoints[this.graphPoints.length - 1].x + 2);
    const maxMultiplier = Math.max(2, this.currentMultiplier * 1.2);

    const scaleX = graphWidth / maxTime;
    const scaleY = graphHeight / (maxMultiplier - 1);

    const lastPoint = this.graphPoints[this.graphPoints.length - 1];
    const x = padding.left + lastPoint.x * scaleX;
    const y = height - padding.bottom - (lastPoint.y - 1) * scaleY;

    // Add to rocket trail
    this.rocketTrail.push({ x, y, life: 1, size: Math.random() * 4 + 2 });

    // Update and draw trail particles
    this.rocketTrail = this.rocketTrail.filter(p => {
      p.life -= 0.03;
      p.y += 1; // Trail falls down

      if (p.life > 0) {
        const alpha = p.life * 0.8;
        const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
        gradient.addColorStop(0, `rgba(255, 200, 100, ${alpha})`);
        gradient.addColorStop(0.5, `rgba(255, 100, 50, ${alpha * 0.5})`);
        gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');

        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
        return true;
      }
      return false;
    });

    // Draw rocket head (glowing orb)
    const pulseSize = 8 + Math.sin(Date.now() / 100) * 2;

    // Outer glow
    const rocketGlow = this.ctx.createRadialGradient(x, y, 0, x, y, pulseSize * 3);
    rocketGlow.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    rocketGlow.addColorStop(0.3, 'rgba(0, 255, 136, 0.6)');
    rocketGlow.addColorStop(0.6, 'rgba(0, 255, 136, 0.2)');
    rocketGlow.addColorStop(1, 'rgba(0, 255, 136, 0)');

    this.ctx.beginPath();
    this.ctx.arc(x, y, pulseSize * 3, 0, Math.PI * 2);
    this.ctx.fillStyle = rocketGlow;
    this.ctx.fill();

    // Inner bright core
    this.ctx.beginPath();
    this.ctx.arc(x, y, pulseSize, 0, Math.PI * 2);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fill();
  }

  updateAndDrawExplosion() {
    this.explosionParticles = this.explosionParticles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2; // Gravity
      p.vx *= 0.98; // Friction
      p.life -= 0.02;

      if (p.life > 0) {
        const alpha = p.life;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        this.ctx.fillStyle = p.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
        this.ctx.fill();

        // Add glow
        this.ctx.shadowColor = p.color;
        this.ctx.shadowBlur = 10;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;

        return true;
      }
      return false;
    });
  }

  drawAxisLabels(width, height) {
    // Y-axis label
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.translate(15, height / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.textAlign = 'center';
    this.ctx.fillText('MULTIPLIER', 0, 0);
    this.ctx.restore();

    // X-axis label
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('TIME', width / 2, height - 10);

    // Current multiplier marker on Y-axis
    if (this.graphPoints.length > 0 && this.roundStatus === 'running') {
      const padding = { left: 60, bottom: 60, top: 40 };
      const graphHeight = height - padding.top - padding.bottom;
      const maxMultiplier = Math.max(2, this.currentMultiplier * 1.2);
      const scaleY = graphHeight / (maxMultiplier - 1);

      const markerY = height - padding.bottom - (this.currentMultiplier - 1) * scaleY;

      // Draw marker line
      this.ctx.strokeStyle = 'rgba(0, 255, 136, 0.5)';
      this.ctx.setLineDash([5, 5]);
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(padding.left, markerY);
      this.ctx.lineTo(width - 20, markerY);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      // Draw current value badge
      this.ctx.fillStyle = '#00ff88';
      this.ctx.font = 'bold 11px monospace';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(`► ${this.currentMultiplier.toFixed(2)}x`, width - 70, markerY + 4);
    }
  }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.crashGame = new CrashGame();
});
