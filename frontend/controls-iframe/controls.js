/**
 * Crash Game - Controls Iframe JavaScript
 * Handles player interactions: betting, cashout, balance updates
 */

class CrashControls {
  constructor() {
    // Get session ID from URL
    this.sessionId = new URLSearchParams(window.location.search).get('sessionId');

    // DOM elements
    this.balanceEl = document.getElementById('balance');
    this.betAmountEl = document.getElementById('betAmount');
    this.betBtn = document.getElementById('betBtn');
    this.cashoutBtn = document.getElementById('cashoutBtn');
    this.roundStatusEl = document.getElementById('roundStatus');
    this.currentBetInfoEl = document.getElementById('currentBetInfo');
    this.currentBetAmountEl = document.getElementById('currentBetAmount');
    this.potentialWinEl = document.getElementById('potentialWin');
    this.statusMessageEl = document.getElementById('statusMessage');
    this.connectionIndicatorEl = document.getElementById('connectionIndicator');
    this.quickBetBtns = document.querySelectorAll('.quick-bet-btn');

    // State
    this.balance = 0;
    this.currency = 'EUR';
    this.currentBet = null;
    this.hasCashedOut = false;
    this.roundStatus = 'waiting';
    this.currentMultiplier = 1.00;

    // Initialize
    this.init();
  }

  init() {
    // Setup event listeners
    this.setupEventListeners();

    // Connect to WebSocket
    this.connect();
  }

  setupEventListeners() {
    // Bet button
    this.betBtn.addEventListener('click', () => this.placeBet());

    // Cashout button
    this.cashoutBtn.addEventListener('click', () => this.cashout());

    // Quick bet buttons
    this.quickBetBtns.forEach(btn => {
      btn.addEventListener('click', () => this.handleQuickBet(btn));
    });

    // Enter key on bet input
    this.betAmountEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.placeBet();
      }
    });
  }

  connect() {
    if (!this.sessionId) {
      this.showStatus('No session ID provided', 'error');
      return;
    }

    // Connect to controls namespace
    this.socket = io('/ws/controls', {
      query: { sessionId: this.sessionId },
      transports: ['websocket', 'polling']
    });

    // Connection events
    this.socket.on('connect', () => {
      console.log('[Controls] Connected');
      this.connectionIndicatorEl.textContent = 'CONNECTED';
      this.connectionIndicatorEl.className = 'connection-indicator connected';
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Controls] Disconnected:', reason);
      this.connectionIndicatorEl.textContent = 'DISCONNECTED';
      this.connectionIndicatorEl.className = 'connection-indicator disconnected';
      this.showStatus('Connection lost', 'error');
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Controls] Connection error:', error);
      this.showStatus('Connection error', 'error');
    });

    // Balance updates
    this.socket.on('balance_update', (data) => {
      this.handleBalanceUpdate(data);
    });

    // Bet result
    this.socket.on('bet_result', (data) => {
      this.handleBetResult(data);
    });

    // Cashout result
    this.socket.on('cashout_result', (data) => {
      this.handleCashoutResult(data);
    });

    // Bet lost (round crashed without cashout)
    this.socket.on('bet_lost', (data) => {
      this.handleBetLost(data);
    });

    // Bet status (on reconnect)
    this.socket.on('bet_status', (data) => {
      this.handleBetStatus(data);
    });

    // Round state
    this.socket.on('round_state', (data) => {
      this.handleRoundState(data);
    });

    // Round events
    this.socket.on('betting_phase', (data) => {
      this.handleBettingPhase(data);
    });

    this.socket.on('round_start', (data) => {
      this.handleRoundStart(data);
    });

    this.socket.on('round_tick', (data) => {
      this.handleTick(data);
    });

    this.socket.on('round_crash', (data) => {
      this.handleRoundCrash(data);
    });

    // Other players' actions
    this.socket.on('player_bet', (data) => {
      console.log('[Controls] Player bet:', data);
    });

    this.socket.on('player_cashout', (data) => {
      console.log('[Controls] Player cashout:', data);
    });

    // Errors
    this.socket.on('error', (data) => {
      console.error('[Controls] Error:', data);
      this.showStatus(data.message || 'Error', 'error');
    });

    this.socket.on('waiting', (data) => {
      this.roundStatusEl.textContent = data.message;
      this.roundStatusEl.className = 'round-status';
    });
  }

  handleBalanceUpdate(data) {
    console.log('[Controls] Balance update:', data);
    this.balance = data.balance;
    this.currency = data.currency || this.currency;
    this.balanceEl.textContent = `${this.balance.toFixed(2)} ${this.currency}`;
  }

  handleBetResult(data) {
    console.log('[Controls] Bet result:', data);

    if (data.success) {
      this.currentBet = data.bet;
      this.hasCashedOut = false;
      this.balance = data.newBalance;
      this.balanceEl.textContent = `${this.balance.toFixed(2)} ${this.currency}`;

      this.showStatus(`Bet placed: ${data.bet.amount} ${this.currency}`, 'success');
      this.updateUIForActiveBet();
    } else {
      this.showStatus(data.error || 'Bet failed', 'error');
      this.enableBetting();
    }
  }

  handleCashoutResult(data) {
    console.log('[Controls] Cashout result:', data);

    if (data.success) {
      this.hasCashedOut = true;
      this.balance = data.newBalance;
      this.balanceEl.textContent = `${this.balance.toFixed(2)} ${this.currency}`;

      this.showStatus(
        `Cashout: ${data.cashout.winAmount.toFixed(2)} ${this.currency} @ ${data.cashout.multiplier.toFixed(2)}x`,
        'success'
      );

      this.updateUIForCashedOut();
    } else {
      this.showStatus(data.error || 'Cashout failed', 'error');
    }
  }

  handleBetLost(data) {
    console.log('[Controls] Bet lost:', data);

    this.showStatus(
      `Lost: ${data.betAmount.toFixed(2)} ${this.currency} (crashed @ ${data.crashPoint.toFixed(2)}x)`,
      'error'
    );

    this.currentBet = null;
    this.hasCashedOut = false;
  }

  handleBetStatus(data) {
    console.log('[Controls] Bet status:', data);

    if (data.hasBet) {
      this.currentBet = { amount: data.bet.amount };
      this.hasCashedOut = data.hasCashedOut;
      this.updateUIForActiveBet();

      if (data.hasCashedOut) {
        this.updateUIForCashedOut();
      }
    }
  }

  handleRoundState(data) {
    console.log('[Controls] Round state:', data);
    this.roundStatus = data.status;
    this.currentMultiplier = data.currentMultiplier;
    this.updateRoundStatusUI();
  }

  handleBettingPhase(data) {
    console.log('[Controls] Betting phase:', data);

    this.roundStatus = 'betting';
    this.currentBet = null;
    this.hasCashedOut = false;
    this.currentMultiplier = 1.00;

    this.updateRoundStatusUI();
    this.enableBetting();
    this.hideCurrentBetInfo();

    this.showStatus('Place your bets!', 'info');
  }

  handleRoundStart(data) {
    console.log('[Controls] Round started:', data);

    this.roundStatus = 'running';
    this.currentMultiplier = 1.00;

    this.updateRoundStatusUI();
    this.disableBetting();

    if (this.currentBet && !this.hasCashedOut) {
      this.enableCashout();
    }

    this.hideStatus();
  }

  handleTick(data) {
    if (this.roundStatus !== 'running') return;

    this.currentMultiplier = data.multiplier;

    // Update round status display with current multiplier
    this.updateRoundStatusUI();

    // Update potential win
    if (this.currentBet && !this.hasCashedOut) {
      const potentialWin = (this.currentBet.amount * this.currentMultiplier).toFixed(2);
      this.potentialWinEl.textContent = `Potential: ${potentialWin} ${this.currency}`;
      this.cashoutBtn.textContent = `Cashout ${potentialWin}`;
    }
  }

  handleRoundCrash(data) {
    console.log('[Controls] Round crashed:', data);

    this.roundStatus = 'crashed';
    this.currentMultiplier = data.crashPoint;

    this.updateRoundStatusUI();
    this.disableCashout();

    if (this.currentBet && !this.hasCashedOut) {
      // Lost the bet
      this.currentBet = null;
    }
  }

  placeBet() {
    const amount = parseFloat(this.betAmountEl.value);

    if (isNaN(amount) || amount <= 0) {
      this.showStatus('Enter a valid bet amount', 'error');
      return;
    }

    if (amount > this.balance) {
      this.showStatus('Insufficient balance', 'error');
      return;
    }

    if (this.roundStatus !== 'betting') {
      this.showStatus('Betting phase has ended', 'error');
      return;
    }

    // Disable bet button while processing
    this.betBtn.disabled = true;
    this.betBtn.textContent = 'Placing...';

    // Send bet to server
    this.socket.emit('bet', { amount });
  }

  cashout() {
    if (this.roundStatus !== 'running') {
      this.showStatus('Cannot cashout now', 'error');
      return;
    }

    if (!this.currentBet) {
      this.showStatus('No active bet', 'error');
      return;
    }

    if (this.hasCashedOut) {
      this.showStatus('Already cashed out', 'error');
      return;
    }

    // Disable cashout button while processing
    this.cashoutBtn.disabled = true;
    this.cashoutBtn.textContent = 'Cashing out...';

    // Send cashout to server
    this.socket.emit('cashout');
  }

  handleQuickBet(btn) {
    const action = btn.dataset.action;
    const amount = btn.dataset.amount;

    let newAmount;

    if (action === 'half') {
      newAmount = parseFloat(this.betAmountEl.value) / 2;
    } else if (action === 'double') {
      newAmount = parseFloat(this.betAmountEl.value) * 2;
    } else if (amount === 'max') {
      newAmount = this.balance;
    } else {
      newAmount = parseFloat(amount);
    }

    // Clamp to balance
    newAmount = Math.min(newAmount, this.balance);
    newAmount = Math.max(newAmount, 0.10);

    this.betAmountEl.value = newAmount.toFixed(2);
  }

  updateRoundStatusUI() {
    this.roundStatusEl.className = 'round-status';

    switch (this.roundStatus) {
      case 'betting':
        this.roundStatusEl.textContent = 'BETTING PHASE';
        this.roundStatusEl.classList.add('betting');
        break;
      case 'running':
        this.roundStatusEl.textContent = `RUNNING - ${this.currentMultiplier.toFixed(2)}x`;
        this.roundStatusEl.classList.add('running');
        break;
      case 'crashed':
        this.roundStatusEl.textContent = `CRASHED @ ${this.currentMultiplier.toFixed(2)}x`;
        this.roundStatusEl.classList.add('crashed');
        break;
      default:
        this.roundStatusEl.textContent = 'Waiting...';
    }
  }

  updateUIForActiveBet() {
    if (this.currentBet) {
      this.currentBetInfoEl.classList.add('visible');
      this.currentBetAmountEl.textContent = `${this.currentBet.amount.toFixed(2)} ${this.currency}`;
      this.potentialWinEl.textContent = `Potential: ${this.currentBet.amount.toFixed(2)} ${this.currency}`;

      this.betBtn.classList.add('hidden');
      this.betAmountEl.disabled = true;
      this.quickBetBtns.forEach(btn => btn.disabled = true);

      if (this.roundStatus === 'running' && !this.hasCashedOut) {
        this.enableCashout();
      }
    }
  }

  updateUIForCashedOut() {
    this.cashoutBtn.disabled = true;
    this.cashoutBtn.textContent = 'Cashed Out!';
    this.cashoutBtn.style.background = 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)';
  }

  enableBetting() {
    this.betBtn.classList.remove('hidden');
    this.betBtn.disabled = false;
    this.betBtn.textContent = 'Place Bet';
    this.betAmountEl.disabled = false;
    this.quickBetBtns.forEach(btn => btn.disabled = false);
    this.hideCurrentBetInfo();
    this.disableCashout();
  }

  disableBetting() {
    this.betBtn.disabled = true;
    this.betAmountEl.disabled = true;
    this.quickBetBtns.forEach(btn => btn.disabled = true);
  }

  enableCashout() {
    this.cashoutBtn.classList.add('active');
    this.cashoutBtn.disabled = false;
    this.cashoutBtn.style.background = '';

    if (this.currentBet) {
      const potentialWin = (this.currentBet.amount * this.currentMultiplier).toFixed(2);
      this.cashoutBtn.textContent = `Cashout ${potentialWin}`;
    } else {
      this.cashoutBtn.textContent = 'Cashout';
    }
  }

  disableCashout() {
    this.cashoutBtn.classList.remove('active');
    this.cashoutBtn.disabled = true;
    this.cashoutBtn.textContent = 'Cashout';
  }

  hideCurrentBetInfo() {
    this.currentBetInfoEl.classList.remove('visible');
  }

  showStatus(message, type) {
    this.statusMessageEl.textContent = message;
    this.statusMessageEl.className = `status-message ${type}`;
    this.statusMessageEl.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (this.statusMessageEl.textContent === message) {
        this.hideStatus();
      }
    }, 5000);
  }

  hideStatus() {
    this.statusMessageEl.style.display = 'none';
  }
}

// Initialize controls when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.crashControls = new CrashControls();
});
