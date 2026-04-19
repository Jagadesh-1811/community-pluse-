'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */

import { useEffect, useState, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { Need } from '@/hooks/useRealtimeNeeds';
import { cn } from '../../lib/utils';

// Types for props
interface LiveMapProps {
  needs: Need[];
  onMarkerClick: (need: Need) => void;
  isPickingLocation?: boolean;
  onLocationPick?: (lat: number, lng: number) => void;
  pickedLocation?: { lat: number; lng: number } | null;
  volunteerLocation?: { lat: number; lng: number; accuracy?: number } | null;
  focusNeed?: Need | null;
  onRecenter?: () => void;
  recenterTrigger?: number; // increment to trigger re-center
  isManualMode?: boolean;
  onManualLocationSet?: (lat: number, lng: number) => void;
}

// 1. Create a "Map Inner" component that handles the actual hooks
// This needs to be a separate component so useMapEvents can access MapContainer context
const MapInner = (props: LiveMapProps & { L: any }) => {
  const { needs, onMarkerClick, isPickingLocation, onLocationPick, pickedLocation, volunteerLocation, focusNeed, recenterTrigger, isManualMode, onManualLocationSet, L } = props;
  const { TileLayer, Marker, Popup, useMapEvents, Polyline, useMap, Circle } = require('react-leaflet');

  const map = useMap();
  const hasFlownToVolunteer = useRef(false);

  // Handle Map Clicks
  useMapEvents({
    click(e: any) {
      if (isPickingLocation && onLocationPick) {
        onLocationPick(e.latlng.lat, e.latlng.lng);
      } else if (isManualMode && onManualLocationSet) {
        onManualLocationSet(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  // AUTO-FLY to volunteer location when first detected
  useEffect(() => {
    if (
      volunteerLocation &&
      !isNaN(volunteerLocation.lat) &&
      !isNaN(volunteerLocation.lng) &&
      !hasFlownToVolunteer.current &&
      map
    ) {
      try {
        const size = map.getSize();
        if (size.x > 0 && size.y > 0) {
          map.flyTo([volunteerLocation.lat, volunteerLocation.lng], 14, { duration: 2.5 });
          hasFlownToVolunteer.current = true;
        }
      } catch { /* ignore sizing */ }
    }
  }, [volunteerLocation, map]);

  const createCustomIcon = (need: Need) => {
    if (!L) return null;
    const color = need.urgency_score >= 8 ? '#FF4D00' : need.urgency_score >= 5 ? '#f97316' : '#00E676';
    const label = need.urgency_score >= 8 ? 'CRITICAL' : need.urgency_score >= 5 ? 'URGENT' : 'STABLE';
    return L.divIcon({
      className: 'custom-marker-wrapper',
      html: `
        <div class="relative w-10 h-10 flex items-center justify-center">
            <div class="absolute inset-0 rounded-full animate-ping" style="background-color: ${color}22;"></div>
            <div class="absolute inset-0 rounded-full" style="animation: ping 2s linear infinite; background-color: ${color}15;"></div>
            <div class="w-5 h-5 rounded-full border-[3px] border-white shadow-2xl" style="background-color: ${color}; box-shadow: 0 0 18px ${color}, 0 0 6px ${color}99;"></div>
            <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[7px] font-black px-1 py-0.5 rounded whitespace-nowrap" style="background-color: ${color}; color: white; letter-spacing: 0.05em;">${label}</div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
  };

  // FlyTo handler: when focusNeed changes, adjust map to show mission
  useEffect(() => {
    if (focusNeed?.lat && focusNeed?.lng && map) {
      try {
        if (volunteerLocation?.lat && volunteerLocation?.lng) {
          // Fit bounds to show both volunteer and target
          map.fitBounds([
            [volunteerLocation.lat, volunteerLocation.lng],
            [focusNeed.lat, focusNeed.lng]
          ], { padding: [100, 100], duration: 1.5 });
        } else {
          // Fallback to just fly to target if volunteer position not known
          map.flyTo([focusNeed.lat, focusNeed.lng], 15, { duration: 1.5 });
        }
      } catch { /* ignore */ }
    }
  }, [focusNeed, volunteerLocation, map]);

  // Handle manual re-center when trigger changes
  useEffect(() => {
    if (recenterTrigger && recenterTrigger > 0 && volunteerLocation && map) {
      try {
        map.flyTo([volunteerLocation.lat, volunteerLocation.lng], 16, { duration: 1.5 });
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterTrigger]);

  return (
    <>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      
      {/* Only show needs that are focused or if we decide to show all (currently hiding all until click) */}
      {needs.filter(n => n.lat && n.lng && (focusNeed ? n.id === focusNeed.id : false)).map((need) => (
        <Marker
          key={need.id}
          position={[need.lat!, need.lng!] as [number, number]}
          icon={createCustomIcon(need)}
          eventHandlers={{
            click: () => onMarkerClick(need),
          }}
        >
          <Popup className="custom-popup">
            <div className="p-2">
              <h4 className="font-bold text-slate-900">{need.location_name}</h4>
              <p className="text-xs text-slate-500 font-bold uppercase">{need.need_type}</p>
              <div className="mt-2 text-[10px] font-black uppercase text-emergency">
                Urgency: {need.urgency_score}/10
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Volunteer Location Marker - Hidden until a need is selected for dispatch/view */}
      {volunteerLocation && focusNeed && !isNaN(volunteerLocation.lat) && !isNaN(volunteerLocation.lng) && (
        <>
          {/* GPS accuracy circle */}
          {volunteerLocation.accuracy && (
            <Circle
              center={[volunteerLocation.lat, volunteerLocation.lng]}
              radius={volunteerLocation.accuracy}
              pathOptions={{
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.07,
                weight: 1,
                dashArray: '5, 8',
              }}
            />
          )}

          {/* Volunteer "You Are Here" marker */}
          <Marker
            key="volunteer-marker"
            position={[volunteerLocation.lat, volunteerLocation.lng] as [number, number]}
            icon={L.divIcon({
              className: 'custom-volunteer-marker',
              html: `
                <div class="relative flex items-center justify-center" style="width: 60px; height: 60px;">
                  <div class="absolute inset-0 rounded-full" style="background: radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 70%); animation: pulse 2s infinite;"></div>
                  <div class="absolute rounded-full" style="width: 44px; height: 44px; top: 8px; left: 8px; background: rgba(59,130,246,0.15); animation: ping 3s linear infinite;"></div>
                  <div class="rounded-full border-[3px] border-white" style="width: 24px; height: 24px; background: linear-gradient(135deg, #3b82f6, #2563eb); box-shadow: 0 0 25px rgba(59,130,246,0.7), 0 0 8px rgba(59,130,246,0.5); position: relative; z-index: 2;"></div>
                  <div class="absolute font-black text-white" style="font-size: 6px; letter-spacing: 0.1em; bottom: 0; left: 50%; transform: translateX(-50%); background: #3b82f6; padding: 1px 4px; border-radius: 2px; white-space: nowrap;">YOU</div>
                </div>
              `,
              iconSize: [60, 60],
              iconAnchor: [30, 30],
            })}
          >
            <Popup className="custom-popup">
              <div className="p-2 text-center">
                <h4 className="font-bold text-slate-900">📍 Your Location</h4>
                <p className="text-xs text-blue-600 font-bold uppercase">Active Volunteer</p>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">
                  {volunteerLocation.lat.toFixed(5)}, {volunteerLocation.lng.toFixed(5)}
                </p>
                {volunteerLocation.accuracy && (
                  <p className="text-[9px] text-slate-400 mt-0.5">±{Math.round(volunteerLocation.accuracy)}m accuracy</p>
                )}
              </div>
            </Popup>
          </Marker>
        </>
      )}

      {/* Active Focus Route: bright orange line from Volunteer → Selected Need */}
      {volunteerLocation && focusNeed?.lat && focusNeed?.lng && (
          <Polyline 
              key={`focus-route-${focusNeed.id}`}
              positions={[
                  [volunteerLocation.lat, volunteerLocation.lng], 
                  [focusNeed.lat, focusNeed.lng]
              ]}
              pathOptions={{ 
                  color: '#FF4D00', 
                  weight: 4, 
                  dashArray: '12, 8', 
                  opacity: 0.9 
              }}
          />
      )}

      {/* Polyline Routing Connector for all Dispatched / In-Progress tasks */}
      {volunteerLocation && needs.filter(n => n.lat && n.lng && n.status === 'in-progress' && n.id !== focusNeed?.id).map(need => (
          <Polyline 
              key={`route-${need.id}`}
              positions={[
                  [volunteerLocation.lat, volunteerLocation.lng], 
                  [need.lat!, need.lng!]
              ]}
              pathOptions={{ 
                  color: '#3b82f6', 
                  weight: 2, 
                  dashArray: '5, 10', 
                  opacity: 0.5 
              }}
          />
      ))}

      {/* Temporary visual pin for the currently picked location during intake */}
      {pickedLocation && (
          <Marker
              position={[pickedLocation.lat, pickedLocation.lng] as [number, number]}
              icon={L.divIcon({
                  className: 'custom-picked-marker',
                  html: `
                    <div class="relative w-10 h-10 flex items-center justify-center">
                        <div class="absolute inset-0 bg-primary/30 rounded-full animate-ping"></div>
                        <div class="w-5 h-5 rounded-full border-[3px] border-white shadow-2xl" style="background-color: #3b82f6; box-shadow: 0 0 15px #3b82f6"></div>
                    </div>
                  `,
                  iconSize: [40, 40],
                  iconAnchor: [20, 20],
              })}
          />
      )}
    </>
  );
};

// 2. Main Component with dynamic MapContainer
export default function LiveMap(props: LiveMapProps) {
  const [L, setL] = useState<any>(null);
  const [isClient, setIsClient] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  useEffect(() => {
    setIsClient(true);
    let mounted = true;
    import('leaflet').then((leaflet) => {
      if (mounted) setL(leaflet);
    });
    return () => { mounted = false; };
  }, []);

  // Re-center to volunteer location when "Locate Me" is clicked
  const handleRecenter = () => {
    setRecenterTrigger(t => t + 1);
    if (props.onRecenter) props.onRecenter();
  };


  if (!isClient || !L) return (
    <div className="w-full h-full bg-slate-900 flex items-center justify-center rounded-3xl animate-pulse">
        <div className="text-slate-700 font-black uppercase tracking-widest">Waking Up Intelligence...</div>
    </div>
  );

  const { MapContainer } = require('react-leaflet');

  return (
    <div className={cn(
      "w-full h-full relative overflow-hidden rounded-3xl border border-white/5 transition-all duration-700",
      props.isPickingLocation ? "cursor-crosshair ring-4 ring-emergency/30 ring-inset" : ""
    )}>
      <MapContainer
        center={[20.5937, 78.9629] as [number, number]}
        zoom={5}
        className="h-full w-full"
        zoomControl={false}
      >
        <MapInner {...props} L={L} recenterTrigger={recenterTrigger} />
      </MapContainer>

      {/* Crosshair Overlay in Picking Mode */}
      {props.isPickingLocation && (
        <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center">
            <div className="w-10 h-10 border-2 border-emergency rounded-full animate-ping opacity-50"></div>
            <div className="absolute inset-x-0 h-px bg-emergency/20 top-1/2"></div>
            <div className="absolute inset-y-0 w-px bg-emergency/20 left-1/2"></div>
        </div>
      )}

      {/* MAP CONTROLS — bottom right */}
      <div className="absolute bottom-6 right-6 z-50 flex flex-col gap-3">
        {/* Locate Me Button */}
        {props.volunteerLocation && (
          <button
            onClick={handleRecenter}
            title="Center on my location"
            className="group w-12 h-12 flex items-center justify-center rounded-2xl bg-blue-600 hover:bg-blue-500 text-white shadow-[0_4px_20px_rgba(59,130,246,0.4)] hover:shadow-[0_4px_30px_rgba(59,130,246,0.6)] transition-all duration-300 hover:scale-110 border border-blue-400/30"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
              <circle cx="12" cy="12" r="8" opacity="0.3"/>
            </svg>
          </button>
        )}

        {/* Volunteer Status Badge */}
        {props.volunteerLocation ? (
          <div className="bg-blue-600/90 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border border-blue-400/30 shadow-lg flex items-center gap-2 whitespace-nowrap">
            <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
            GPS Active
          </div>
        ) : (
          <div className="bg-slate-800/90 backdrop-blur-md text-slate-400 text-[9px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border border-white/10 shadow-lg flex items-center gap-2 whitespace-nowrap">
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse"></div>
            Locating...
          </div>
        )}
      </div>

      {/* Map Legend — bottom left */}
      <div className="absolute bottom-6 left-6 z-50 bg-slate-950/80 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-2.5">
        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Map Legend</p>
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] flex-shrink-0"></div>
          <span className="text-[10px] text-slate-300 font-bold">Your Location</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full bg-emergency shadow-[0_0_8px_rgba(255,77,0,0.6)] flex-shrink-0"></div>
          <span className="text-[10px] text-slate-300 font-bold">Critical Need</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)] flex-shrink-0"></div>
          <span className="text-[10px] text-slate-300 font-bold">Urgent Need</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full bg-success shadow-[0_0_8px_rgba(0,230,118,0.6)] flex-shrink-0"></div>
          <span className="text-[10px] text-slate-300 font-bold">Stable Need</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-px w-5 border-t-2 border-dashed border-emergency flex-shrink-0"></div>
          <span className="text-[10px] text-slate-300 font-bold">Route to Need</span>
        </div>
      </div>
    </div>
  );
}
