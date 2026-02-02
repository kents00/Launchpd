/**
 * TRADER GAME - CORE LOGIC
 * A concise Vanilla JS implementation of a trading simulator.
 * Uses Lightweight Charts for professional rendering.
 */

/* --- CONFIGURATION --- */
const CONFIG = {
  initialPrice: 1000.0,
  volatility: 0.5, // Standard deviation
  tickSpeed: 100 // ms per price update
}

/* --- ENGINE --- */
class GameEngine {
  constructor () {
    // Core State
    this.balance = 10000.0
    this.position = null // { side: 'BUY'|'SELL', margin: 1000, entryPrice: 0, tp: null, sl: null }
    this.pendingOrders = [] // Array of pending { side, type, price, margin, tp, sl, id }

    // UI State (Trading Parameters)
    this.orderSide = 'BUY' // 'BUY' or 'SELL'
    this.orderType = 'market' // 'market', 'limit', 'stop'
    this.orderMargin = 1000.0
    this.orderPrice = CONFIG.initialPrice
    this.tpEnabled = false
    this.tpPrice = null
    this.slEnabled = false
    this.slPrice = null

    this.stats = {
      trades: 0,
      wins: 0,
      losses: 0
    }

    // Market Data
    this.price = CONFIG.initialPrice
    this.lastCandle = null

    // Loop Stuff
    this.lastTick = 0
    this.tickInterval = CONFIG.tickSpeed
    this.isRunning = true

    // Modules
    this.chart = new ChartManager('chart-container')
    this.ui = new UIManager(this)

    // Init
    this.generateHistory()
    this.bindEvents()
    requestAnimationFrame(this.loop.bind(this))
  }

  generateHistory () {
    const time = Math.floor(Date.now() / 1000) - 100 * 60
    const history = []
    for (let i = 0; i < 100; i++) {
      const open = this.price
      let close = open
      let high = open
      let low = open

      for (let j = 0; j < 10; j++) {
        const change = (Math.random() - 0.5) * CONFIG.volatility * 2
        close += change
        if (close > high) high = close
        if (close < low) low = close
      }

      history.push({ time: time + i * 60, open, high, low, close })
      this.price = close
    }

    const last = history[history.length - 1]
    this.lastCandle = {
      ...last,
      time: last.time + 60,
      open: last.close,
      high: last.close,
      low: last.close,
      close: last.close
    }
    this.chart.setData(history)
    this.chart.update(this.lastCandle)
    this.orderPrice = this.price
  }

  bindEvents () {
    // UI Side Selection
    document
      .getElementById('side-buy')
      .addEventListener('click', () => this.setSide('BUY'))
    document
      .getElementById('side-sell')
      .addEventListener('click', () => this.setSide('SELL'))

    // Tab selection
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.setOrderType(btn.dataset.tab))
    })

    // Inputs
    document.getElementById('input-margin').addEventListener('input', (e) => {
      this.orderMargin = parseFloat(e.target.value) || 0
      this.updateOverlays()
      this.ui.updateOrderLabels(this)
    })
    document.getElementById('input-price').addEventListener('input', (e) => {
      this.orderPrice = parseFloat(e.target.value) || 0
      this.updateOverlays()
      this.ui.updateOrderLabels(this)
    })

    // Toggles
    document.getElementById('tp-toggle').addEventListener('change', (e) => {
      this.tpEnabled = e.target.checked
      if (this.tpEnabled && !this.tpPrice) {
        const distance = this.price * 0.02 // Default to 2%
        this.tpPrice =
          this.orderSide === 'BUY'
            ? this.price + distance
            : this.price - distance
      }
      this.ui.updateExitInputs(this)
      this.updateOverlays()
    })
    document.getElementById('sl-toggle').addEventListener('change', (e) => {
      this.slEnabled = e.target.checked
      if (this.slEnabled && !this.slPrice) {
        const distance = this.price * 0.015 // Default to 1.5%
        this.slPrice =
          this.orderSide === 'BUY'
            ? this.price - distance
            : this.price + distance
      }
      this.ui.updateExitInputs(this)
      this.updateOverlays()
    })

    document.getElementById('input-tp').addEventListener('input', (e) => {
      this.tpPrice = parseFloat(e.target.value)
      this.updateOverlays()
    })
    document.getElementById('input-sl').addEventListener('input', (e) => {
      this.slPrice = parseFloat(e.target.value)
      this.updateOverlays()
    })

    // Execution
    document
      .getElementById('btn-execute-trade')
      .addEventListener('click', () => this.executeTrade())
    document
      .getElementById('btn-close')
      .addEventListener('click', () => this.closePosition())

    // Collapsibles
    document.querySelectorAll('.section-header').forEach((header) => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('open')
        const icon = header.querySelector('i')
        if (icon) {
          icon.classList.toggle('fa-chevron-up')
          icon.classList.toggle('fa-chevron-down')
        }
      })
    })

    // Speed
    document.querySelectorAll('.speed-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document
          .querySelectorAll('.speed-btn')
          .forEach((b) => b.classList.remove('active'))
        btn.classList.add('active')
        this.tickInterval = CONFIG.tickSpeed / parseInt(btn.dataset.speed)
      })
    })

    // Custom Steppers
    document.querySelectorAll('.stepper-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inputId = btn.dataset.input
        const input = document.getElementById(inputId)
        const step = parseFloat(input.step) || 1
        const currentVal = parseFloat(input.value) || 0

        if (btn.classList.contains('up')) {
          input.value = (currentVal + step).toFixed(2)
        } else {
          input.value = Math.max(0, currentVal - step).toFixed(2)
        }

        // Trigger input event to sync state
        input.dispatchEvent(new Event('input'))
      })
    })
  }

  setSide (side) {
    this.orderSide = side
    this.ui.updateSide(this)
    this.updateOverlays()
  }

  setOrderType (type) {
    this.orderType = type
    this.ui.updateOrderType(this)
    this.updateOverlays()
  }

  loop (timestamp) {
    if (!this.isRunning) return
    if (timestamp - this.lastTick > this.tickInterval) {
      this.simulateMarket()
      this.lastTick = timestamp
    }
    this.ui.update(this)
    requestAnimationFrame(this.loop.bind(this))
  }

  simulateMarket () {
    const change =
      (Math.random() - 0.5) *
      CONFIG.volatility *
      (Math.random() > 0.95 ? 5 : 1)
    this.price += change
    if (this.price < 0.01) this.price = 0.01

    const candle = this.lastCandle
    candle.close = this.price
    if (this.price > candle.high) candle.high = this.price
    if (this.price < candle.low) candle.low = this.price

    if (Math.random() > 0.98) {
      this.lastCandle = {
        time: candle.time + 60,
        open: this.price,
        high: this.price,
        low: this.price,
        close: this.price
      }
    }

    this.chart.update(this.lastCandle)
    this.checkTriggers()
  }

  checkTriggers () {
    // Check Pending Orders
    for (let i = this.pendingOrders.length - 1; i >= 0; i--) {
      const ord = this.pendingOrders[i]
      let trigger = false
      if (ord.type === 'limit') {
        if (ord.side === 'BUY' && this.price <= ord.price) trigger = true
        if (ord.side === 'SELL' && this.price >= ord.price) trigger = true
      } else if (ord.type === 'stop') {
        if (ord.side === 'BUY' && this.price >= ord.price) trigger = true
        if (ord.side === 'SELL' && this.price <= ord.price) trigger = true
      }

      if (trigger) {
        this.pendingOrders.splice(i, 1)
        this.openPosition(ord.side, ord.margin, ord.tp, ord.sl, ord.price)
      }
    }

    // Check Position TP/SL
    if (this.position) {
      const { side, tp, sl } = this.position
      let close = false
      let reason = ''

      if (tp) {
        if (side === 'BUY' && this.price >= tp) {
          ((close = true), (reason = 'TP'))
        }
        if (side === 'SELL' && this.price <= tp) {
          ((close = true), (reason = 'TP'))
        }
      }
      if (sl) {
        if (side === 'BUY' && this.price <= sl) {
          ((close = true), (reason = 'SL'))
        }
        if (side === 'SELL' && this.price >= sl) {
          ((close = true), (reason = 'SL'))
        }
      }

      if (close) this.closePosition(reason)
    }
  }

  getEquity () {
    if (!this.position) return this.balance
    return this.balance + this.getPnl()
  }

  getPnl () {
    if (!this.position) return 0
    const diff = this.price - this.position.entryPrice
    const units = (this.position.margin * 10) / this.position.entryPrice
    const pnl = (this.position.side === 'BUY' ? diff : -diff) * units
    return pnl
  }

  executeTrade () {
    if (this.orderType === 'market') {
      this.openPosition(
        this.orderSide,
        this.orderMargin,
        this.tpEnabled ? this.tpPrice : null,
        this.slEnabled ? this.slPrice : null
      )
    } else {
      const order = {
        id: Date.now(),
        side: this.orderSide,
        type: this.orderType,
        price: this.orderPrice,
        margin: this.orderMargin,
        tp: this.tpEnabled ? this.tpPrice : null,
        sl: this.slEnabled ? this.slPrice : null
      }
      this.pendingOrders.push(order)
      this.chart.addMarker(
        this.lastCandle.time,
        this.orderSide === 'BUY' ? 'buy' : 'sell',
        `${this.orderType.toUpperCase()} @ ${this.orderPrice.toFixed(2)}`
      )
    }
    this.updateOverlays()
  }

  openPosition (side, margin, tp = null, sl = null, price = null) {
    if (this.position) return
    const entryPrice = price || this.price

    this.position = {
      side,
      margin,
      entryPrice,
      tp,
      sl
    }

    this.ui.showPosition(true)
    this.chart.addMarker(
      this.lastCandle.time,
      side === 'BUY' ? 'buy' : 'sell',
      `Entry @ ${entryPrice.toFixed(2)}`
    )
    this.updateOverlays()
  }

  closePosition (reason = '') {
    if (!this.position) return

    const pnl = this.getPnl()
    this.balance += pnl
    this.stats.trades++
    if (pnl > 0) this.stats.wins++
    else this.stats.losses++

    this.chart.addMarker(
      this.lastCandle.time,
      this.position.side === 'BUY' ? 'sell' : 'buy',
      `${reason || 'Close'} @ ${this.price.toFixed(2)} (${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)})`
    )

    this.position = null
    this.ui.showPosition(false)
    this.updateOverlays()
  }

  cancelOrder (id) {
    this.pendingOrders = this.pendingOrders.filter((o) => o.id !== id)
    this.updateOverlays()
  }

  updateOverlays () {
    if (!this.chart.priceManager) return
    this.chart.priceManager.clear()

    const units =
      (this.orderMargin * 10) /
      (this.orderType === 'market' ? this.price : this.orderPrice)
    const pricesToFit = []

    // 1. Current Active Order Lines (The one being configured in sidebar)
    if (this.orderType !== 'market') {
      pricesToFit.push(this.orderPrice)
      this.chart.priceManager.addLine('order_active', this.orderPrice, {
        color: this.orderSide === 'BUY' ? '#00f2fe' : '#ff4d4d',
        lineStyle: 2,
        title: this.orderSide,
        units: units.toFixed(3),
        type: this.orderType.toUpperCase(),
        onDrag: (p) => {
          this.orderPrice = p
          this.ui.updatePrice(p)
          this.ui.updateOrderLabels(this)
          this.updateOverlays()
        }
      })
    } else {
      pricesToFit.push(this.price)
    }

    // 2. TP line (Active Config)
    if (this.tpEnabled) {
      pricesToFit.push(this.tpPrice)
      const pnl =
        (this.tpPrice -
          (this.orderType === 'market' ? this.price : this.orderPrice)) *
        units *
        (this.orderSide === 'BUY' ? 1 : -1)
      this.chart.priceManager.addLine('tp_active', this.tpPrice, {
        color: '#26a69a',
        lineStyle: 1,
        title: 'TP',
        type: 'TAKE PROFIT',
        pnl: `${pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`,
        onDrag: (p) => {
          this.tpPrice = p
          this.ui.updateTP(p)
          this.updateOverlays()
        },
        onCancel: () => {
          this.tpEnabled = false
          this.ui.setTPEnabled(false)
          this.updateOverlays()
        }
      })

      // Add Shaded Zone for TP
      const basePrice =
        this.orderType === 'market' ? this.price : this.orderPrice
      this.chart.priceManager.addShadedZone(
        'tp_zone_active',
        basePrice,
        this.tpPrice,
        'profit-zone'
      )
    }

    // 3. SL line (Active Config)
    if (this.slEnabled) {
      pricesToFit.push(this.slPrice)
      const pnl =
        (this.slPrice -
          (this.orderType === 'market' ? this.price : this.orderPrice)) *
        units *
        (this.orderSide === 'BUY' ? 1 : -1)
      this.chart.priceManager.addLine('sl_active', this.slPrice, {
        color: '#ef5350',
        lineStyle: 1,
        title: 'SL',
        type: 'STOP LOSS',
        pnl: `${pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`,
        onDrag: (p) => {
          this.slPrice = p
          this.ui.updateSL(p)
          this.updateOverlays()
        },
        onCancel: () => {
          this.slEnabled = false
          this.ui.setSLEnabled(false)
          this.updateOverlays()
        }
      })

      // Add Shaded Zone for SL
      const basePrice =
        this.orderType === 'market' ? this.price : this.orderPrice
      this.chart.priceManager.addShadedZone(
        'sl_zone_active',
        basePrice,
        this.slPrice,
        'loss-zone'
      )
    }

    // 4. Pending Orders
    this.pendingOrders.forEach((ord) => {
      const ordUnits = (ord.margin * 10) / ord.price
      this.chart.priceManager.addLine(`pending_${ord.id}`, ord.price, {
        color: ord.side === 'BUY' ? '#00f2fe' : '#ff4d4d',
        lineStyle: 2,
        title: ord.side,
        units: ordUnits.toFixed(3),
        type: ord.type.toUpperCase(),
        onCancel: () => this.cancelOrder(ord.id)
      })

      if (ord.tp) {
        const pnl =
          (ord.tp - ord.price) * ordUnits * (ord.side === 'BUY' ? 1 : -1)
        this.chart.priceManager.addLine(`pending_tp_${ord.id}`, ord.tp, {
          color: '#26a69a',
          lineStyle: 1,
          title: 'TP',
          type: 'TAKE PROFIT',
          pnl: `${pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
        })
      }
      if (ord.sl) {
        const pnl =
          (ord.sl - ord.price) * ordUnits * (ord.side === 'BUY' ? 1 : -1)
        this.chart.priceManager.addLine(`pending_sl_${ord.id}`, ord.sl, {
          color: '#ef5350',
          lineStyle: 1,
          title: 'SL',
          type: 'STOP LOSS',
          pnl: `${pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
        })
      }
    })

    // 5. Active Position Lines
    if (this.position) {
      const { side, entryPrice, margin, tp, sl } = this.position
      const posUnits = (margin * 10) / entryPrice

      this.chart.priceManager.addLine('pos_entry', entryPrice, {
        color: '#9aa0a6',
        lineStyle: 0,
        title: side,
        type: 'ENTRY',
        units: posUnits.toFixed(3)
      })

      if (tp) {
        this.chart.priceManager.addShadedZone(
          'pos_tp_zone',
          entryPrice,
          tp,
          'profit-zone'
        )
        const pnl = (tp - entryPrice) * posUnits * (side === 'BUY' ? 1 : -1)
        this.chart.priceManager.addLine('pos_tp', tp, {
          color: '#26a69a',
          lineStyle: 1,
          title: 'TP',
          type: 'TAKE PROFIT',
          pnl: `${pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`,
          onDrag: (p) => {
            this.position.tp = p
            this.updateOverlays()
          }
        })
      }
      if (sl) {
        this.chart.priceManager.addShadedZone(
          'pos_sl_zone',
          entryPrice,
          sl,
          'loss-zone'
        )
        const pnl = (sl - entryPrice) * posUnits * (side === 'BUY' ? 1 : -1)
        this.chart.priceManager.addLine('pos_sl', sl, {
          color: '#ef5350',
          lineStyle: 1,
          title: 'SL',
          type: 'STOP LOSS',
          pnl: `${pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`,
          onDrag: (p) => {
            this.position.sl = p
            this.updateOverlays()
          }
        })
      }
    }

    // Auto-scale to fit all relevant price lines
    if (pricesToFit.length > 0) {
      this.chart.fitPrices(pricesToFit)
    }
  }
}

/* --- CHART MANAGER --- */
class ChartManager {
  constructor (containerId) {
    const container = document.getElementById(containerId)
    this.chart = LightweightCharts.createChart(container, {
      layout: { background: { color: '#000000' }, textColor: '#9aa0a6' },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' }
      },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#2d3138' },
      timeScale: { borderColor: '#2d3138', timeVisible: true }
    })

    this.candleSeries = this.chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350'
    })

    this.priceManager = new PriceLineManager(
      this.chart,
      this.candleSeries,
      'chart-overlay-labels'
    )

    new ResizeObserver((entries) => {
      if (entries.length === 0 || entries[0].target !== container) return
      const newRect = entries[0].contentRect
      this.chart.applyOptions({ height: newRect.height, width: newRect.width })
      this.priceManager.sync()
    }).observe(container)

    // Sync manager on any chart change
    this.chart
      .timeScale()
      .subscribeVisibleLogicalRangeChange(() => this.priceManager.sync())
    this.chart.priceScale('right').applyOptions({ autoScale: true })
  }

  setData (data) {
    this.candleSeries.setData(data)
  }

  update (candle) {
    this.candleSeries.update(candle)
    this.priceManager.sync()
  }

  fitPrices (prices) {
    // Simple fitting: just make sure all prices are in any current view?
    // Actually, lightweight-charts has autoScale, but we might need to manually set visible range if we want it tight.
    // For now, let's just ensure the price scale is not too compressed.
  }

  addMarker (time, type, text) {
    let color, shape, position
    const isBuy = type === 'BUY' || type === 'buy' || type === 'LONG'
    if (isBuy) {
      color = '#26a69a'
      shape = 'arrowUp'
      position = 'belowBar'
    } else {
      color = '#ef5350'
      shape = 'arrowDown'
      position = 'aboveBar'
    }
    if (!this.markers) this.markers = []
    this.markers.push({ time, position, color, shape, text })
    this.candleSeries.setMarkers(this.markers)
  }
}

/* --- PRICE LINE MANAGER --- */
class PriceLineManager {
  constructor (chart, series, overlayId) {
    this.chart = chart
    this.series = series
    this.overlay = document.getElementById(overlayId)
    this.lines = new Map() // id -> { line, options, element }
    this.draggingId = null

    window.addEventListener('mousemove', (e) => this.onMouseMove(e))
    window.addEventListener('mouseup', () => this.onMouseUp())
    window.addEventListener('touchmove', (e) => this.onTouchMove(e), {
      passive: false
    })
    window.addEventListener('touchend', () => this.onMouseUp())
  }

  addLine (id, price, options) {
    const line = this.series.createPriceLine({
      price,
      color: options.color,
      lineWidth: 1,
      lineStyle: options.lineStyle || 0,
      axisLabelVisible: true
    })

    const el = document.createElement('div')
    el.className = `chart-label-row ${options.title.toLowerCase()}`
    el.innerHTML = `
            <div class="chart-badge ${options.title.toLowerCase()}">${options.title}</div>
            <div class="chart-value-pill ${options.title.toLowerCase()} ${options.type.toLowerCase().includes('limit') ? 'limit' : ''}">
                ${options.units ? `<span class="units-label">${options.units}</span>` : ''}
                ${options.pnl ? `<span class="pnl-label">${options.pnl}</span>` : `<span class="type-label">${options.type}</span>`}
            </div>
            ${options.onCancel ? '<div class="chart-cancel-btn"><i class="fa-solid fa-xmark"></i></div>' : ''}
        `

    if (options.onCancel) {
      el.querySelector('.chart-cancel-btn').addEventListener('click', (e) => {
        e.stopPropagation()
        options.onCancel()
      })
    }

    // Draggable parts
    const dragHandle = el.querySelector('.chart-badge')
    dragHandle.addEventListener('mousedown', (e) => {
      this.draggingId = id
      document.body.classList.add('dragging')
    })
    dragHandle.addEventListener(
      'touchstart',
      (e) => {
        if (e.cancelable) e.preventDefault()
        this.draggingId = id
        document.body.classList.add('dragging')
      },
      { passive: false }
    )

    this.overlay.appendChild(el)
    this.lines.set(id, { line, options, element: el, price })
    this.sync()
  }

  addShadedZone (id, price1, price2, className) {
    const zone = document.createElement('div')
    zone.className = `chart-shaded-zone ${className}`
    this.overlay.appendChild(zone)

    if (!this.zones) this.zones = new Map()
    this.zones.set(id, { price1, price2, element: zone })
    this.sync()
  }

  clear () {
    this.lines.forEach((l) => {
      this.series.removePriceLine(l.line)
      l.element.remove()
    })
    this.lines.clear()

    if (this.zones) {
      this.zones.forEach((z) => z.element.remove())
      this.zones.clear()
    }
  }

  sync () {
    this.lines.forEach((l, id) => {
      const y = this.series.priceToCoordinate(l.price)
      if (y !== null) {
        l.element.style.top = `${y}px`
        l.element.style.display = 'flex'

        // Keep label on screen
        const rect = l.element.getBoundingClientRect()
        const containerRect = this.overlay.getBoundingClientRect()
        if (y < 20) l.element.style.top = '20px'
        if (y > containerRect.height - 20) {
          l.element.style.top = `${containerRect.height - 20}px`
        }
      } else {
        l.element.style.display = 'none'
      }
    })

    if (this.zones) {
      this.zones.forEach((z, id) => {
        const y1 = this.series.priceToCoordinate(z.price1)
        const y2 = this.series.priceToCoordinate(z.price2)

        if (y1 !== null && y2 !== null) {
          const top = Math.min(y1, y2)
          const height = Math.abs(y1 - y2)
          z.element.style.top = `${top}px`
          z.element.style.height = `${height}px`
          z.element.style.display = 'block'
        } else {
          z.element.style.display = 'none'
        }
      })
    }
  }

  onMouseMove (e) {
    if (!this.draggingId) return
    const rect = this.overlay.getBoundingClientRect()
    const y = e.clientY - rect.top
    const price = this.series.coordinateToPrice(y)

    if (price) {
      const l = this.lines.get(this.draggingId)
      l.price = price
      l.line.applyOptions({ price })
      if (l.options.onDrag) l.options.onDrag(price)
      this.sync()
    }
  }

  onTouchMove (e) {
    if (!this.draggingId) return
    if (e.cancelable) e.preventDefault()
    const rect = this.overlay.getBoundingClientRect()
    const touch = e.touches[0]
    const y = touch.clientY - rect.top
    const price = this.series.coordinateToPrice(y)

    if (price) {
      const l = this.lines.get(this.draggingId)
      l.price = price
      l.line.applyOptions({ price })
      if (l.options.onDrag) l.options.onDrag(price)
      this.sync()
    }
  }

  onMouseUp () {
    this.draggingId = null
    document.body.classList.remove('dragging')
  }
}

/* --- UI MANAGER --- */
class UIManager {
  constructor (game) {
    this.els = {
      balance: document.getElementById('balance-display'),
      equity: document.getElementById('equity-display'),
      pnl: document.getElementById('pnl-display'),
      currentPrice: document.getElementById('current-price'),
      priceBuy: document.getElementById('price-buy'),
      priceSell: document.getElementById('price-sell'),

      sideBuy: document.getElementById('side-buy'),
      sideSell: document.getElementById('side-sell'),
      btnExecute: document.getElementById('btn-execute-trade'),
      executeText: document.querySelector('#btn-execute-trade .action-text'),
      executeSub: document.querySelector('#btn-execute-trade .action-sub'),

      inputPriceGroup: document.getElementById('group-limit-price'),
      inputPrice: document.getElementById('input-price'),
      inputMargin: document.getElementById('input-margin'),
      displayUnits: document.getElementById('display-units'),

      tpInput: document.getElementById('input-tp'),
      tpToggle: document.getElementById('tp-toggle'),
      tpWrap: document.getElementById('tp-input-wrap'),
      slInput: document.getElementById('input-sl'),
      slToggle: document.getElementById('sl-toggle'),
      slWrap: document.getElementById('sl-input-wrap'),

      infoMargin: document.getElementById('info-margin'),
      infoTotal: document.querySelector('.trade-total'),

      posPanel: document.getElementById('position-panel'),
      posType: document.getElementById('pos-type'),
      posSize: document.getElementById('pos-size'),
      posEntry: document.getElementById('pos-entry'),
      posCurrent: document.getElementById('pos-current'),
      posPnl: document.getElementById('pos-pnl'),

      // Stats
      statTrades: document.getElementById('stat-trades'),
      statWins: document.getElementById('stat-wins'),
      statLosses: document.getElementById('stat-losses'),
      statWinRate: document.getElementById('stat-winrate')
    }
  }

  update (game) {
    const p = game.price.toFixed(2)
    this.els.currentPrice.innerText = p
    this.els.priceBuy.innerText = p
    this.els.priceSell.innerText = p

    this.els.balance.innerText = this.fmt(game.balance)
    this.els.equity.innerText = this.fmt(game.getEquity())

    const openPnl = game.getPnl()
    this.updatePnlColor(this.els.pnl, openPnl)
    this.els.pnl.innerText =
      (openPnl >= 0 && openPnl !== 0 ? '+' : '') + this.fmt(openPnl)

    if (game.position) {
      this.els.posCurrent.innerText = p
      this.els.posPnl.innerText = (openPnl >= 0 ? '+' : '') + this.fmt(openPnl)
      this.updatePnlColor(this.els.posPnl, openPnl)
    }

    // Stats
    this.els.statTrades.innerText = game.stats.trades
    this.els.statWins.innerText = game.stats.wins
    this.els.statLosses.innerText = game.stats.losses
    const winRate =
      game.stats.trades > 0
        ? ((game.stats.wins / game.stats.trades) * 100).toFixed(0)
        : 0
    this.els.statWinRate.innerText = `${winRate}%`
  }

  updateSide (game) {
    this.els.sideBuy.classList.toggle('active', game.orderSide === 'BUY')
    this.els.sideSell.classList.toggle('active', game.orderSide === 'SELL')
    this.els.btnExecute.className = `btn btn-execute-trade btn-execute-${game.orderSide.toLowerCase()}`
    this.els.executeText.innerText = game.orderSide === 'BUY' ? 'Buy' : 'Sell'
    this.updateOrderLabels(game)
  }

  updateOrderType (game) {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === game.orderType)
    })

    const isMarket = game.orderType === 'market'
    this.els.inputPriceGroup.classList.toggle('hidden', isMarket)
    if (!isMarket) this.els.inputPrice.value = game.price.toFixed(2)

    this.updateOrderLabels(game)
  }

  updateOrderLabels (game) {
    const units =
      (game.orderMargin * 10) /
      (game.orderType === 'market' ? game.price : game.orderPrice)
    this.els.displayUnits.innerText = `${units.toFixed(3)} Units`
    this.els.infoMargin.innerText = game.orderMargin.toLocaleString()
    this.els.infoTotal.innerHTML = `${(game.orderMargin * 10).toLocaleString()} <span class="currency">USD</span>`
    this.els.executeSub.innerText = `${units.toFixed(3)} BITCOIN @ ${game.orderType.toUpperCase()}`
  }

  updateExitInputs (game) {
    this.els.tpWrap.classList.toggle('disabled', !game.tpEnabled)
    this.els.tpInput.disabled = !game.tpEnabled
    if (game.tpEnabled) this.els.tpInput.value = game.tpPrice.toFixed(2)

    this.els.slWrap.classList.toggle('disabled', !game.slEnabled)
    this.els.slInput.disabled = !game.slEnabled
    if (game.slEnabled) this.els.slInput.value = game.slPrice.toFixed(2)
  }

  updatePrice (p) {
    this.els.inputPrice.value = p.toFixed(2)
  }

  updateTP (p) {
    this.els.tpInput.value = p.toFixed(2)
  }

  updateSL (p) {
    this.els.slInput.value = p.toFixed(2)
  }

  setTPEnabled (val) {
    this.els.tpToggle.checked = val
    this.els.tpWrap.classList.toggle('disabled', !val)
    this.els.tpInput.disabled = !val
  }

  setSLEnabled (val) {
    this.els.slToggle.checked = val
    this.els.slWrap.classList.toggle('disabled', !val)
    this.els.slInput.disabled = !val
  }

  showPosition (active) {
    if (active) {
      this.els.posPanel.classList.remove('hidden')
      const game = window.game
      if (game.position) {
        this.els.posType.innerText = `${game.position.side} ${game.position.margin * 10} USD`
        this.els.posType.className = `pos-type ${game.position.side.toLowerCase() === 'buy' ? 'long' : 'short'}`
        this.els.posEntry.innerText = game.position.entryPrice.toFixed(2)
      }
    } else {
      this.els.posPanel.classList.add('hidden')
    }
  }

  fmt (num) {
    return '$' + num.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')
  }

  updatePnlColor (el, amt) {
    el.classList.remove('profit', 'loss', 'neutral')
    if (amt > 0) el.classList.add('profit')
    else if (amt < 0) el.classList.add('loss')
    else el.classList.add('neutral')
  }
}

// Init
window.addEventListener('DOMContentLoaded', () => {
  window.game = new GameEngine()
})
