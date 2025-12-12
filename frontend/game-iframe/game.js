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

    // Animation
    this.animationFrame = null;

    // Initialize
    this.init();
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

    // Reset graph
    this.graphPoints = [];
    this.currentMultiplier = 1.00;
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

    // Update multiplier color based on value
    if (data.multiplier >= 10) {
      this.multiplierEl.style.color = '#ff00ff';
    } else if (data.multiplier >= 5) {
      this.multiplierEl.style.color = '#00ffff';
    } else if (data.multiplier >= 2) {
      this.multiplierEl.style.color = '#00ff88';
    }
  }

  handleCrash(data) {
    console.log('[Game] Round crashed:', data);

    this.roundStatus = 'crashed';
    this.currentMultiplier = data.crashPoint;

    this.multiplierEl.textContent = `${data.crashPoint.toFixed(2)}x`;
    this.multiplierEl.className = 'multiplier crashed';
    this.multiplierEl.style.color = '';
    this.statusTextEl.textContent = 'CRASHED!';

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

    // Flash effect
    this.flashCrash();
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

  flashCrash() {
    this.canvas.style.boxShadow = '0 0 50px rgba(255, 68, 68, 0.8)';
    setTimeout(() => {
      this.canvas.style.boxShadow = '';
    }, 500);
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
      } else {
        item.classList.add('high');
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

    // Clear canvas
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    this.ctx.fillRect(0, 0, width, height);

    if (this.graphPoints.length < 2) {
      this.drawGrid(width, height);
      return;
    }

    // Draw grid
    this.drawGrid(width, height);

    // Calculate scale
    const maxTime = Math.max(10, this.graphPoints[this.graphPoints.length - 1].x + 2);
    const maxMultiplier = Math.max(2, this.currentMultiplier * 1.2);

    const scaleX = (width - 60) / maxTime;
    const scaleY = (height - 60) / (maxMultiplier - 1);

    // Draw graph line
    this.ctx.beginPath();
    this.ctx.strokeStyle = this.roundStatus === 'crashed' ? '#ff4444' : '#00ff88';
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.graphPoints.forEach((point, i) => {
      const x = 40 + point.x * scaleX;
      const y = height - 40 - (point.y - 1) * scaleY;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });

    this.ctx.stroke();

    // Draw glow effect
    this.ctx.shadowColor = this.roundStatus === 'crashed' ? '#ff4444' : '#00ff88';
    this.ctx.shadowBlur = 10;
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;

    // Draw current point
    if (this.graphPoints.length > 0) {
      const lastPoint = this.graphPoints[this.graphPoints.length - 1];
      const x = 40 + lastPoint.x * scaleX;
      const y = height - 40 - (lastPoint.y - 1) * scaleY;

      this.ctx.beginPath();
      this.ctx.arc(x, y, 6, 0, Math.PI * 2);
      this.ctx.fillStyle = this.roundStatus === 'crashed' ? '#ff4444' : '#00ff88';
      this.ctx.fill();
    }
  }

  drawGrid(width, height) {
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.lineWidth = 1;

    // Vertical lines
    for (let i = 0; i <= 10; i++) {
      const x = 40 + (width - 60) * (i / 10);
      this.ctx.beginPath();
      this.ctx.moveTo(x, 20);
      this.ctx.lineTo(x, height - 40);
      this.ctx.stroke();
    }

    // Horizontal lines
    for (let i = 0; i <= 5; i++) {
      const y = height - 40 - (height - 60) * (i / 5);
      this.ctx.beginPath();
      this.ctx.moveTo(40, y);
      this.ctx.lineTo(width - 20, y);
      this.ctx.stroke();
    }

    // Axis labels
    this.ctx.fillStyle = '#666';
    this.ctx.font = '12px sans-serif';
    this.ctx.fillText('1.00x', 5, height - 40);
    this.ctx.fillText('Time (s)', width / 2, height - 10);
  }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.crashGame = new CrashGame();
});
