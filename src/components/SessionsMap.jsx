import { useEffect, useMemo, useRef, useState } from 'react'
import { REGION_COORDS, DEFAULT_CENTER, DEFAULT_ZOOM } from '../lib/regionCoords'
import { useLang } from '../lib/i18n'

// Leaflet is loaded lazily from a CDN the first time the map view opens, so it
// never weighs down the (list-first) initial bundle and there's no build-time
// dependency to install. The promise is module-scoped so repeated mounts reuse
// the single load.
let leafletPromise = null
function loadLeaflet() {
  if (typeof window !== 'undefined' && window.L) return Promise.resolve(window.L)
  if (leafletPromise) return leafletPromise
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(css)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.onload = () => resolve(window.L)
    script.onerror = () => reject(new Error('map-load-failed'))
    document.body.appendChild(script)
  })
  return leafletPromise
}

// Plots one marker per region that has upcoming sessions, sized/labelled by
// count. Clicking a marker calls onSelectRegion(region) so the parent can show
// that region's sessions; the selected marker is accented.
export default function SessionsMap({ sessions, selectedRegion, onSelectRegion }) {
  const { t } = useLang()
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const [status, setStatus] = useState('loading') // loading | ready | error

  // region name -> count, only for regions we have coordinates for.
  const counts = useMemo(() => {
    const c = {}
    for (const s of sessions) {
      if (s.region && REGION_COORDS[s.region]) c[s.region] = (c[s.region] || 0) + 1
    }
    return c
  }, [sessions])

  // One-time map init.
  useEffect(() => {
    let cancelled = false
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return
        const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(map)
        mapRef.current = map
        layerRef.current = L.layerGroup().addTo(map)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  // (Re)draw markers whenever the counts or selection change.
  useEffect(() => {
    if (status !== 'ready' || !window.L || !mapRef.current || !layerRef.current) return
    const L = window.L
    const group = layerRef.current
    group.clearLayers()

    const entries = Object.entries(counts)
    const points = []
    for (const [region, count] of entries) {
      const latlng = REGION_COORDS[region]
      points.push(latlng)
      const active = region === selectedRegion
      const size = 30 + Math.min(count, 8) * 3
      const marker = L.marker(latlng, {
        icon: L.divIcon({
          className: 'map-pin-wrap',
          html: `<div class="map-pin${active ? ' is-active' : ''}" style="width:${size}px;height:${size}px">${count}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
      })
      marker.bindTooltip(t('{region} · {n} sessions', { region, n: count }), { direction: 'top', offset: [0, -size / 2] })
      marker.on('click', () => onSelectRegion(region === selectedRegion ? null : region))
      group.addLayer(marker)
    }

    // Frame the markers (or pan to the selected one).
    if (selectedRegion && REGION_COORDS[selectedRegion]) {
      mapRef.current.setView(REGION_COORDS[selectedRegion], 12, { animate: true })
    } else if (points.length === 1) {
      mapRef.current.setView(points[0], 12)
    } else if (points.length > 1) {
      mapRef.current.fitBounds(L.latLngBounds(points).pad(0.25))
    }
  }, [counts, selectedRegion, status, onSelectRegion, t])

  if (status === 'error') {
    return (
      <div className="empty-state" style={{ padding: 24 }}>
        <p className="muted">{t("Couldn't load the map. Check your connection and try again.")}</p>
      </div>
    )
  }

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map-canvas" aria-label="Map of upcoming sessions by region" />
      {status === 'loading' && <div className="spinner" aria-label="Loading map" />}
    </div>
  )
}
