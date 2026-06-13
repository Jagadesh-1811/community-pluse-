'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '@/lib/auth-context';
import { Need } from '@/hooks/useRealtimeNeeds';
import { cn } from '@/lib/utils';

// Import Turf.js modules individually for optimal bundle sizes
import { circle as turfCircle, distance as turfDistance, point as turfPoint } from '@turf/turf';

// Only load Leaflet plugins on the client-side
if (typeof window !== 'undefined') {
  require('leaflet.offline');
}

// Interfaces
interface Volunteer {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: 'available' | 'busy';
  distance?: number;
}

interface LeafletOfflineMapProps {
  incidents: Need[];
  volunteers: Volunteer[];
  onIncidentClick: (incident: Need) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Component: Handles Map Layer & Offline Controller Instantiation
// ─────────────────────────────────────────────────────────────────────────────
const MapLayersAndControllers = ({
  isOnline,
  setCacheCount,
  setIsDownloading,
  setDownloadProgress,
  controlRef,
  baseLayerRef,
}: {
  isOnline: boolean;
  setCacheCount: (count: number) => void;
  setIsDownloading: (dl: boolean) => void;
  setDownloadProgress: (p: number) => void;
  controlRef: React.MutableRefObject<any>;
  baseLayerRef: React.MutableRefObject<any>;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    // Define standard OpenStreetMap tile template
    const osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    // 1. Initializing L.tileLayer.offline
    // This custom layer intercepts tile loading requests and routes them through 
    // IndexedDB storage. If a tile is cached locally, it serves it as an object URL blob.
    // Otherwise, it falls back to the network.
    // @ts-ignore
    const baseLayer = L.tileLayer.offline(osmUrl, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      minZoom: 10,
      maxZoom: 16,
    });

    baseLayer.addTo(map);
    baseLayerRef.current = baseLayer;

    // 2. Setup the savetiles controller instance
    // Holds the operational logic to query coordinate bounding boxes, calculate 
    // expected tiles to download, and execute IndexedDB inserts.
    // @ts-ignore
    const control = L.control.savetiles(baseLayer, {
      zoomlevels: [10, 11, 12, 13, 14, 15, 16], // Zoom levels to save
      saveWhatYouSee: true,                      // Bounds restricted to current viewport
      confirm: null,                             // Abort default browser popups
      confirmRemoval: null,
      parallel: 5,                               // Fetch 5 concurrent tile requests
    });
    
    controlRef.current = control;

    // 3. Register Event Listeners for tile saving progress
    baseLayer.on('savestart', (e: any) => {
      setIsDownloading(true);
      setDownloadProgress(0);
    });

    baseLayer.on('savetileend', (e: any) => {
      // Fired when an individual tile finishes caching
      const lengthSaved = e.lengthSaved || 0;
      const lengthToBeSaved = e.lengthToBeSaved || 1;
      const progress = Math.round((lengthSaved / lengthToBeSaved) * 100);
      setDownloadProgress(progress);
    });

    baseLayer.on('saveend', async () => {
      setIsDownloading(false);
      setDownloadProgress(100);
      // @ts-ignore
      const { getStorageLength } = await import('leaflet.offline');
      const count = await getStorageLength();
      setCacheCount(count);
    });

    baseLayer.on('tilesremoved', () => {
      setCacheCount(0);
    });

    return () => {
      map.removeLayer(baseLayer);
    };
  }, [map]);

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main LeafletOfflineMap Component
// ─────────────────────────────────────────────────────────────────────────────
export default function LeafletOfflineMap({
  incidents,
  volunteers,
  onIncidentClick,
}: LeafletOfflineMapProps) {
  const { user, role } = useAuth();
  
  // State variables
  const [isClient, setIsClient] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isCoordinator, setIsCoordinator] = useState(false);
  const [cacheCount, setCacheCount] = useState(0);

  // Download & Tile progress state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Radius Slider and Selected Incident State
  const [selectedIncident, setSelectedIncident] = useState<Need | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(10);

  // References
  const controlInstance = useRef<any>(null);
  const baseLayerInstance = useRef<any>(null);

  // Mount logic
  useEffect(() => {
    setIsClient(true);
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial cache check
    const checkCacheSize = async () => {
      // @ts-ignore
      const { getStorageLength } = await import('leaflet.offline');
      const count = await getStorageLength();
      setCacheCount(count);
    };
    checkCacheSize();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check Custom Claims for 'coordinator'
  useEffect(() => {
    if (user) {
      user.getIdTokenResult().then((tokenResult) => {
        setIsCoordinator(!!tokenResult.claims.coordinator || role === 'ADMIN');
      });
    }
  }, [user, role]);

  // Handle programmatic tile download trigger
  const triggerMapDownload = () => {
    if (!controlInstance.current || isDownloading || !isOnline) return;
    try {
      controlInstance.current._saveTiles();
    } catch (err) {
      console.error('Failed to trigger tile download:', err);
      setIsDownloading(false);
    }
  };

  if (!isClient) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center font-mono text-white/50 text-xs uppercase tracking-widest animate-pulse">
        Initializing Spatial Intelligence...
      </div>
    );
  }

  // Custom DivIcon styling matching the Absolute Black Protocol
  const createIncidentIcon = (incident: Need) => {
    const color = incident.urgency_score >= 8 ? '#FF4D00' : incident.urgency_score >= 5 ? '#f59e0b' : '#10b981';
    return L.divIcon({
      className: 'custom-leaflet-marker',
      html: `
        <div class="relative w-8 h-8 flex items-center justify-center">
          <div class="absolute inset-0 rounded-full animate-ping opacity-25" style="background-color: ${color};"></div>
          <div class="w-4 h-4 rounded-full border border-white" style="background-color: ${color}; box-shadow: 0 0 10px ${color}"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  };

  const createVolunteerIcon = (status: 'available' | 'busy') => {
    const color = status === 'available' ? '#10b981' : '#6b7280';
    return L.divIcon({
      className: 'custom-leaflet-volunteer',
      html: `
        <div class="relative w-6 h-6 flex items-center justify-center">
          <div class="w-3 h-3 rounded-full border border-neutral-900" style="background-color: ${color}"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 2: Turf.js GeoJSON conversion & Filtering
  // ─────────────────────────────────────────────────────────────────────────────
  let circleGeoJSON: any = null;
  let filteredVolunteers: Volunteer[] = [];

  if (selectedIncident && selectedIncident.lat && selectedIncident.lng) {
    // Note: Turf.js coordinates are represented in [longitude, latitude] sequence, 
    // contrary to Leaflet's [latitude, longitude] array representation.
    const centerPoint = [selectedIncident.lng, selectedIncident.lat];
    
    // Turf creates a standard polygon representing the exact physical circle
    circleGeoJSON = turfCircle(centerPoint, radiusKm, {
      steps: 64,
      units: 'kilometers',
    });

    const incidentPoint = turfPoint(centerPoint);

    // Calculate distance and filter volunteers inside radius
    filteredVolunteers = volunteers
      .map((vol) => {
        const volPoint = turfPoint([vol.lng, vol.lat]);
        const dist = turfDistance(incidentPoint, volPoint, { units: 'kilometers' });
        return { ...vol, distance: Math.round(dist * 10) / 10 };
      })
      .filter((vol) => vol.distance! <= radiusKm);
  }

  return (
    <div className="w-full h-full relative overflow-hidden bg-black text-white rounded-3xl border border-neutral-900">
      
      {/* 1. Offline Banners & Indicators */}
      <div className="absolute top-6 left-6 z-1000 flex flex-col gap-3 pointer-events-none">
        
        {/* Status Badge */}
        <div className="bg-black/90 backdrop-blur-md border border-neutral-900 px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-[10px] font-black uppercase tracking-widest pointer-events-auto">
          <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-amber-500 animate-pulse shadow-[0_0_8px_#f59e0b]'}`}></span>
          {isOnline ? 'Online — Live Tiles' : 'Offline — Cached Tiles'}
        </div>

        {/* Empty Cache Warn Banner */}
        {!isOnline && cacheCount === 0 && (
          <div className="bg-amber-950/25 border border-amber-500/25 text-amber-400 text-[10px] font-black uppercase tracking-widest px-4 py-3 rounded-xl flex items-center gap-2 pointer-events-auto max-w-sm">
            ⚠️ Map cache empty — download tiles while online
          </div>
        )}
      </div>

      {/* 2. Coordinator Map Controls (Download Action) */}
      {isCoordinator && isOnline && (
        <div className="absolute top-6 right-6 z-1000 flex flex-col gap-2 pointer-events-auto">
          <button
            onClick={triggerMapDownload}
            disabled={isDownloading}
            className={cn(
              "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest font-mono border transition-all duration-300",
              isDownloading 
                ? "bg-neutral-950 border-neutral-900 text-white/30 cursor-not-allowed" 
                : "bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800"
            )}
          >
            {isDownloading ? `Downloading: ${downloadProgress}%` : `Download Map Tiles`}
          </button>
          {cacheCount > 0 && (
            <div className="text-right text-[8px] font-mono text-white/40 uppercase tracking-widest">
              {cacheCount} Tiles Stored Locally
            </div>
          )}
        </div>
      )}

      {/* 3. Turf Radius Filter Control Slider */}
      {selectedIncident && (
        <div className="absolute bottom-6 left-6 right-6 md:right-auto md:w-80 z-1000 bg-black/95 backdrop-blur-md border border-neutral-900 rounded-2xl p-4 pointer-events-auto shadow-2xl">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Dispatch Radius</span>
            <span className="text-xs font-mono font-black text-amber-400">{radiusKm} KM</span>
          </div>
          <input
            type="range"
            min="1"
            max="50"
            value={radiusKm}
            onChange={(e) => setRadiusKm(parseInt(e.target.value))}
            className="w-full h-1 bg-neutral-900 rounded-lg appearance-none cursor-pointer accent-white"
          />
          <div className="mt-3 flex justify-between text-[9px] font-mono text-white/40">
            <span>VOLUNTEERS DETECTED: {filteredVolunteers.length}</span>
            <button 
              onClick={() => setSelectedIncident(null)}
              className="hover:text-white uppercase font-bold"
            >
              Clear Filter
            </button>
          </div>
        </div>
      )}

      {/* Leaflet Map Container */}
      <MapContainer
        center={[20.5937, 78.9629] as [number, number]}
        zoom={5}
        className="h-full w-full bg-black"
        zoomControl={false}
      >
        {/* Dynamic setup module injecting Leaflet.offline layer configuration */}
        <MapLayersAndControllers
          isOnline={isOnline}
          setCacheCount={setCacheCount}
          setIsDownloading={setIsDownloading}
          setDownloadProgress={setDownloadProgress}
          controlRef={controlInstance}
          baseLayerRef={baseLayerInstance}
        />

        {/* 4. Render Incident Markers */}
        {incidents.filter(inc => inc.lat && inc.lng).map((incident) => (
          <Marker
            key={incident.id}
            position={[incident.lat!, incident.lng!] as [number, number]}
            icon={createIncidentIcon(incident)}
            eventHandlers={{
              click: () => {
                setSelectedIncident(incident);
                onIncidentClick(incident);
              }
            }}
          >
            <Popup className="custom-popup">
              <div className="p-1 text-neutral-900">
                <h4 className="font-bold text-xs">{incident.location_name || 'Emergency Ticket'}</h4>
                <p className="text-[10px] text-neutral-500 font-bold uppercase mt-0.5">{incident.category}</p>
                <div className="mt-1.5 text-[9px] font-black uppercase text-red-600">
                  Priority: {incident.urgency_score}/10
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* 5. Render Turf GeoJSON Circle Layer Overlay */}
        {selectedIncident && circleGeoJSON && (
          <GeoJSON
            key={`${selectedIncident.id}-${radiusKm}`}
            data={circleGeoJSON}
            style={{
              color: '#f59e0b',    // Amber border stroke
              weight: 1.5,
              dashArray: '5, 5',
              fillColor: '#000000',
              fillOpacity: 0.15,
            }}
          />
        )}

        {/* 6. Render Filtered Volunteers inside the circle */}
        {selectedIncident && filteredVolunteers.map((vol) => (
          <Marker
            key={vol.id}
            position={[vol.lat, vol.lng]}
            icon={createVolunteerIcon(vol.status)}
          >
            <Popup className="custom-popup">
              <div className="p-1.5 text-neutral-900">
                <h4 className="font-bold text-xs">{vol.name}</h4>
                <p className="text-[10px] text-amber-600 font-mono mt-0.5">{vol.distance} KM away</p>
                <div className="mt-2 flex items-center gap-1.5 text-[9px] font-black uppercase">
                  <span className={`w-1.5 h-1.5 rounded-full ${vol.status === 'available' ? 'bg-emerald-500' : 'bg-neutral-400'}`}></span>
                  {vol.status}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
