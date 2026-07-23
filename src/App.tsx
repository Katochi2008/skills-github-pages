import { useState, useRef, useEffect, useCallback } from 'react'

type Point = { x: number; y: number }
type PathRecord = { id: string; points: Point[]; timestamp: string; label: string }

const GRID_DIVISIONS = 20

function formatCoord(v: number) {
  return (v * 100).toFixed(2)
}

function generateId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function getTimestamp() {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const currentPathRef = useRef<Point[]>([])

  const [drawing, setDrawing] = useState(false)
  const [currentPath, setCurrentPath] = useState<Point[]>([])
  const [records, setRecords] = useState<PathRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [mode, setMode] = useState<'SAFE' | 'ARMED' | 'PROJECTING'>('SAFE')
  const [sessionId] = useState(() => generateId())
  const [patientId] = useState('PT-' + generateId())

  // Keep a stable ref to the latest render state so the ResizeObserver
  // doesn't need to be re-created on every state change.
  const stateRef = useRef({ currentPath, records, selectedRecord, cursor })
  useEffect(() => {
    stateRef.current = { currentPath, records, selectedRecord, cursor }
  })

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { currentPath, records, selectedRecord, cursor } = stateRef.current
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#050709'
    ctx.fillRect(0, 0, W, H)

    // Grid lines
    ctx.strokeStyle = 'rgba(0,255,140,0.06)'
    ctx.lineWidth = 0.5
    for (let i = 0; i <= GRID_DIVISIONS; i++) {
      const x = (i / GRID_DIVISIONS) * W
      const y = (i / GRID_DIVISIONS) * H
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }

    // Center crosshair
    ctx.strokeStyle = 'rgba(0,255,140,0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 6])
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke()
    ctx.setLineDash([])

    // Saved records (straight lines: start → end)
    for (const rec of records) {
      if (rec.points.length < 2) continue
      const isSel = rec.id === selectedRecord
      const s = rec.points[0]
      const e2 = rec.points[rec.points.length - 1]
      ctx.strokeStyle = isSel ? 'rgba(0,200,255,0.9)' : 'rgba(0,255,140,0.18)'
      ctx.lineWidth = isSel ? 2 : 1
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(s.x * W, s.y * H)
      ctx.lineTo(e2.x * W, e2.y * H)
      ctx.stroke()
      ctx.fillStyle = isSel ? 'rgba(0,200,255,0.9)' : 'rgba(0,255,140,0.4)'
      ctx.beginPath()
      ctx.arc(s.x * W, s.y * H, isSel ? 3 : 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // Active path (always straight line: start → current cursor)
    if (currentPath.length >= 2) {
      const start = currentPath[0]
      const end = currentPath[currentPath.length - 1]
      ctx.strokeStyle = '#00ff8c'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.shadowColor = '#00ff8c'
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.moveTo(start.x * W, start.y * H)
      ctx.lineTo(end.x * W, end.y * H)
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.fillStyle = '#00ff8c'
      ctx.beginPath()
      ctx.arc(start.x * W, start.y * H, 4, 0, Math.PI * 2)
      ctx.fill()
    } else if (currentPath.length === 1) {
      ctx.fillStyle = '#00ff8c'
      ctx.shadowColor = '#00ff8c'
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.arc(currentPath[0].x * W, currentPath[0].y * H, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    // Cursor reticle
    if (cursor) {
      const cx = cursor.x * W
      const cy = cursor.y * H
      const r = 12
      ctx.strokeStyle = 'rgba(0,255,140,0.5)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = 'rgba(0,255,140,0.8)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cx - r - 6, cy); ctx.lineTo(cx + r + 6, cy); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx, cy - r - 6); ctx.lineTo(cx, cy + r + 6); ctx.stroke()
    }
  }, [])

  // Set up canvas sizing once; ResizeObserver is stable (no deps that change).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      redraw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [redraw])

  // Re-draw whenever state changes.
  useEffect(() => { redraw() }, [currentPath, records, selectedRecord, cursor, redraw])

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode === 'PROJECTING') return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    setDrawing(true)
    const pt = getCanvasPoint(e)
    currentPathRef.current = [pt, pt]
    setCurrentPath([pt, pt])
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getCanvasPoint(e)
    setCursor(pt)
    if (!drawingRef.current) return
    // Keep only start + current end to enforce a straight line
    currentPathRef.current = [currentPathRef.current[0], pt]
    setCurrentPath([currentPathRef.current[0], pt])
  }

  const onPointerUp = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    setDrawing(false)
    const pts = currentPathRef.current
    const [start, end] = pts
    if (start && end && (start.x !== end.x || start.y !== end.y)) {
      const rec: PathRecord = {
        id: generateId(),
        points: [start, end],
        timestamp: getTimestamp(),
        label: 'PATH-' + generateId(),
      }
      setRecords(r => [rec, ...r])
      setSelectedRecord(rec.id)
    }
    currentPathRef.current = []
    setCurrentPath([])
  }

  const clearAll = () => {
    setRecords([])
    setSelectedRecord(null)
    setCurrentPath([])
    currentPathRef.current = []
  }

  const deleteRecord = (id: string) => {
    setRecords(r => r.filter(x => x.id !== id))
    if (selectedRecord === id) setSelectedRecord(null)
  }

  const selected = records.find(r => r.id === selectedRecord)

  const exportData = () => {
    if (!selected) return
    const data = JSON.stringify(
      { id: selected.id, patient: patientId, session: sessionId, timestamp: selected.timestamp, points: selected.points },
      null, 2
    )
    const blob = new Blob([data], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = selected.label + '.json'
    a.click()
  }

  const modeColor: Record<string, string> = { SAFE: '#22c55e', ARMED: '#facc15', PROJECTING: '#ff3b5c' }

  const panelStyle: React.CSSProperties = {
    width: 220, background: '#050709', flexShrink: 0, display: 'flex', flexDirection: 'column',
  }
  const sectionStyle: React.CSSProperties = {
    padding: '12px 16px', borderBottom: '1px solid rgba(0,255,140,0.08)',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 9, letterSpacing: '0.2em', color: 'rgba(0,255,140,0.5)', marginBottom: 8,
  }

  const coordList = selected ? selected.points : currentPath
  const stride = Math.max(1, Math.floor(coordList.length / 60))
  const displayCoords = coordList.filter((_, i) => i % stride === 0)

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      background: '#06080a', height: '100vh', color: '#c8d8cc',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Top bar */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 44, flexShrink: 0,
        borderBottom: '1px solid rgba(0,255,140,0.1)', background: '#050709',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="3" fill="#00ff8c" />
              <circle cx="9" cy="9" r="6" stroke="#00ff8c" strokeWidth="1" strokeDasharray="2 2" fill="none" opacity="0.5" />
              <line x1="9" y1="0" x2="9" y2="4" stroke="#00ff8c" strokeWidth="1" opacity="0.5" />
              <line x1="9" y1="14" x2="9" y2="18" stroke="#00ff8c" strokeWidth="1" opacity="0.5" />
              <line x1="0" y1="9" x2="4" y2="9" stroke="#00ff8c" strokeWidth="1" opacity="0.5" />
              <line x1="14" y1="9" x2="18" y2="9" stroke="#00ff8c" strokeWidth="1" opacity="0.5" />
            </svg>
            <span style={{ color: '#00ff8c', fontSize: 11, letterSpacing: '0.15em', fontWeight: 700 }}>LASERPATH OS</span>
            <span style={{ color: 'rgba(0,255,140,0.3)', fontSize: 11 }}>v2.4.1</span>
          </div>
          <div style={{ width: 1, height: 20, background: 'rgba(0,255,140,0.15)' }} />
          <span style={{ fontSize: 10, color: 'rgba(200,216,204,0.4)', letterSpacing: '0.1em' }}>SESSION · {sessionId}</span>
          <span style={{ fontSize: 10, color: 'rgba(200,216,204,0.4)', letterSpacing: '0.1em' }}>PATIENT · {patientId}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: modeColor[mode], boxShadow: `0 0 8px ${modeColor[mode]}` }} />
            <span style={{ fontSize: 10, letterSpacing: '0.15em', color: modeColor[mode] }}>{mode}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
            <span style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(200,216,204,0.5)' }}>BLE CONNECTED</span>
          </div>
          <span style={{ fontSize: 10, color: 'rgba(200,216,204,0.3)' }}>
            {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </header>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* Left panel */}
        <aside style={{ ...panelStyle, borderRight: '1px solid rgba(0,255,140,0.1)' }}>
          <div style={sectionStyle}>
            <div style={labelStyle}>DEVICE CONTROL</div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: 'rgba(200,216,204,0.35)', letterSpacing: '0.1em', marginBottom: 4 }}>SYSTEM MODE</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['SAFE', 'ARMED'] as const).map(m => (
                  <button key={m} onClick={() => setMode(prev => prev === m ? 'SAFE' : m)} style={{
                    flex: 1, padding: '5px 0', fontSize: 9, letterSpacing: '0.1em', cursor: 'pointer', borderRadius: 2, transition: 'all 0.15s',
                    border: `1px solid ${mode === m ? modeColor[m] : 'rgba(0,255,140,0.15)'}`,
                    background: mode === m ? modeColor[m] + '18' : 'transparent',
                    color: mode === m ? modeColor[m] : 'rgba(200,216,204,0.4)',
                  }}>{m}</button>
                ))}
              </div>
            </div>
            <button
              onClick={() => { if (mode === 'ARMED' && selectedRecord) setMode(m => m === 'PROJECTING' ? 'ARMED' : 'PROJECTING') }}
              disabled={mode !== 'ARMED' || !selectedRecord}
              style={{
                width: '100%', padding: '7px 0', fontSize: 10, letterSpacing: '0.15em', borderRadius: 2, transition: 'all 0.15s',
                cursor: mode === 'ARMED' && selectedRecord ? 'pointer' : 'not-allowed',
                border: `1px solid ${mode === 'PROJECTING' ? '#ff3b5c' : 'rgba(255,59,92,0.3)'}`,
                background: mode === 'PROJECTING' ? 'rgba(255,59,92,0.15)' : 'transparent',
                color: mode === 'PROJECTING' ? '#ff3b5c' : 'rgba(255,59,92,0.4)',
              }}>
              {mode === 'PROJECTING' ? '■ STOP PROJECTION' : '▶ PROJECT LASER'}
            </button>
          </div>

          <div style={sectionStyle}>
            <div style={labelStyle}>PARAMETERS</div>
            {[
              { label: 'WAVELENGTH', value: '650 nm' },
              { label: 'POWER', value: '5.0 mW' },
              { label: 'SPEED', value: '120 mm/s' },
              { label: 'REPEAT', value: '1×' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 9, color: 'rgba(200,216,204,0.35)', letterSpacing: '0.08em' }}>{label}</span>
                <span style={{ fontSize: 10, color: '#00ff8c' }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ ...sectionStyle, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingBottom: 0, borderBottom: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(0,255,140,0.5)' }}>RECORDED PATHS</span>
              <span style={{ fontSize: 9, color: 'rgba(200,216,204,0.3)' }}>{records.length}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {records.length === 0 && (
                <div style={{ fontSize: 9, color: 'rgba(200,216,204,0.2)', textAlign: 'center', paddingTop: 20 }}>NO PATHS RECORDED</div>
              )}
              {records.map(rec => (
                <div key={rec.id}
                  onClick={() => setSelectedRecord(rec.id === selectedRecord ? null : rec.id)}
                  style={{
                    padding: '6px 8px', cursor: 'pointer', borderRadius: 2, transition: 'all 0.12s',
                    border: `1px solid ${rec.id === selectedRecord ? 'rgba(0,200,255,0.4)' : 'rgba(0,255,140,0.08)'}`,
                    background: rec.id === selectedRecord ? 'rgba(0,200,255,0.06)' : 'transparent',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 9, color: rec.id === selectedRecord ? '#00c8ff' : '#00ff8c' }}>{rec.label}</span>
                    <button onClick={e => { e.stopPropagation(); deleteRecord(rec.id) }}
                      style={{ fontSize: 11, color: 'rgba(255,59,92,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ fontSize: 8, color: 'rgba(200,216,204,0.3)', marginTop: 2 }}>{rec.timestamp} · {rec.points.length}pts</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(0,255,140,0.08)', display: 'flex', gap: 6 }}>
            <button onClick={clearAll} style={{ flex: 1, padding: '5px 0', fontSize: 9, letterSpacing: '0.1em', cursor: 'pointer', border: '1px solid rgba(200,216,204,0.15)', background: 'transparent', color: 'rgba(200,216,204,0.4)', borderRadius: 2 }}>
              CLEAR ALL
            </button>
            <button onClick={exportData} disabled={!selectedRecord} style={{
              flex: 1, padding: '5px 0', fontSize: 9, letterSpacing: '0.1em', borderRadius: 2,
              cursor: selectedRecord ? 'pointer' : 'not-allowed',
              border: `1px solid ${selectedRecord ? 'rgba(0,255,140,0.3)' : 'rgba(0,255,140,0.1)'}`,
              background: 'transparent',
              color: selectedRecord ? '#00ff8c' : 'rgba(0,255,140,0.25)',
            }}>EXPORT</button>
          </div>
        </aside>

        {/* Canvas */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(0,255,140,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 9, letterSpacing: '0.15em', color: 'rgba(0,255,140,0.5)' }}>PROJECTION CANVAS</span>
              {drawing && <span style={{ fontSize: 9, color: '#00ff8c' }}>● RECORDING</span>}
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              {cursor && (
                <>
                  <span style={{ fontSize: 9, color: 'rgba(200,216,204,0.35)' }}>X <span style={{ color: '#00ff8c' }}>{formatCoord(cursor.x)}</span></span>
                  <span style={{ fontSize: 9, color: 'rgba(200,216,204,0.35)' }}>Y <span style={{ color: '#00ff8c' }}>{formatCoord(cursor.y)}</span></span>
                </>
              )}
              <span style={{ fontSize: 9, color: 'rgba(200,216,204,0.25)' }}>
                {currentPath.length > 0 ? `${currentPath.length} pts` : 'CLICK & DRAG TO DRAW'}
              </span>
            </div>
          </div>

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {mode === 'PROJECTING' && (
              <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(255,59,92,0.5)', zIndex: 10, pointerEvents: 'none', boxShadow: 'inset 0 0 40px rgba(255,59,92,0.08)' }} />
            )}
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={() => setCursor(null)}
              style={{ width: '100%', height: '100%', display: 'block', cursor: mode === 'PROJECTING' ? 'not-allowed' : 'crosshair', touchAction: 'none' }}
            />
          </div>

          <div style={{ padding: '6px 16px', borderTop: '1px solid rgba(0,255,140,0.08)', display: 'flex', gap: 24, alignItems: 'center', flexShrink: 0 }}>
            {[
              { label: 'TEMP', value: '36.2°C', ok: true },
              { label: 'POWER DRAW', value: '0.8 W', ok: true },
              { label: 'BLE RSSI', value: '-52 dBm', ok: true },
              { label: 'CALIB', value: 'NOMINAL', ok: true },
              { label: 'INTERLOCK', value: mode === 'SAFE' ? 'ENGAGED' : 'RELEASED', ok: mode === 'SAFE' },
            ].map(({ label, value, ok }) => (
              <div key={label} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 8, color: 'rgba(200,216,204,0.3)', letterSpacing: '0.1em' }}>{label}</span>
                <span style={{ fontSize: 9, color: ok ? 'rgba(200,216,204,0.6)' : '#facc15' }}>{value}</span>
              </div>
            ))}
          </div>
        </main>

        {/* Right panel */}
        <aside style={{ ...panelStyle, borderLeft: '1px solid rgba(0,255,140,0.1)' }}>
          <div style={sectionStyle}>
            <div style={labelStyle}>PATH DATA</div>
            {selected
              ? <div style={{ fontSize: 8, color: 'rgba(200,216,204,0.3)' }}>{selected.label} · {selected.points.length} pts</div>
              : <div style={{ fontSize: 8, color: 'rgba(200,216,204,0.2)' }}>SELECT A PATH</div>
            }
          </div>

          {selected && (
            <div style={sectionStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
                {[
                  { label: 'POINTS', value: String(selected.points.length) },
                  { label: 'TIME', value: selected.timestamp },
                  { label: 'X START', value: formatCoord(selected.points[0].x) },
                  { label: 'Y START', value: formatCoord(selected.points[0].y) },
                  { label: 'X END', value: formatCoord(selected.points[selected.points.length - 1].x) },
                  { label: 'Y END', value: formatCoord(selected.points[selected.points.length - 1].y) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontSize: 8, color: 'rgba(200,216,204,0.3)', letterSpacing: '0.08em' }}>{label}</div>
                    <div style={{ fontSize: 9, color: '#00ff8c' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.15em', color: 'rgba(0,255,140,0.4)', marginBottom: 8 }}>COORDINATES</div>
            {displayCoords.length === 0
              ? <div style={{ fontSize: 9, color: 'rgba(200,216,204,0.15)', textAlign: 'center', paddingTop: 20 }}>—</div>
              : displayCoords.map((pt, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 8, color: 'rgba(200,216,204,0.25)', width: 20, flexShrink: 0 }}>{String(i).padStart(2, '0')}</span>
                  <span style={{ fontSize: 8, color: 'rgba(200,216,204,0.5)' }}>{formatCoord(pt.x)}, {formatCoord(pt.y)}</span>
                </div>
              ))
            }
          </div>

          <div style={{ ...sectionStyle, borderTop: '1px solid rgba(0,255,140,0.08)', borderBottom: 'none' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.15em', color: 'rgba(0,255,140,0.4)', marginBottom: 8 }}>INSTRUCTIONS</div>
            {[
              ['1', 'Draw path on canvas'],
              ['2', 'Select recorded path'],
              ['3', 'Set mode to ARMED'],
              ['4', 'Press PROJECT LASER'],
            ].map(([n, t]) => (
              <div key={n} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 8, color: '#00ff8c', opacity: 0.5, flexShrink: 0 }}>{n}.</span>
                <span style={{ fontSize: 8, color: 'rgba(200,216,204,0.35)', lineHeight: 1.5 }}>{t}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
