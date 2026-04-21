'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */

import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';

interface FieldMapProps {
  location: { lat: number; lng: number } | null;
  volunteerLocation?: { lat: number; lng: number } | null;
}

const FieldMapInner = ({ location, volunteerLocation, L }: FieldMapProps & { L: any }) => {
  const { TileLayer, Marker, useMap, Polyline } = require('react-leaflet');
  const map = useMap();

  const isValid = location && typeof location.lat === 'number' && typeof location.lng === 'number' && !isNaN(location.lat) && !isNaN(location.lng);

  useEffect(() => {
    if (map) {
      setTimeout(() => {
        try {
            map.invalidateSize();
            if (isValid && volunteerLocation) {
                // Fit bounds to show both
                map.fitBounds([
                    [location.lat, location.lng],
                    [volunteerLocation.lat, volunteerLocation.lng]
                ], { padding: [50, 50], duration: 1 });
            } else if (isValid) {
                map.flyTo([location.lat, location.lng], 16, { duration: 1 });
            }
        } catch {
            // Ignore sizing issues
        }
      }, 300);
    }
  }, [location, volunteerLocation, map, isValid]);

  if (!isValid) return null;

  return (
    <>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      <Marker
        position={[location.lat, location.lng]}
        icon={L.divIcon({
          className: 'custom-field-marker',
          html: `
            <div class="relative w-12 h-12 flex items-center justify-center">
                <div class="absolute inset-0 bg-blue-500/40 rounded-full animate-ping"></div>
                <div class="absolute inset-2 bg-blue-500/20 rounded-full animate-pulse"></div>
                <div class="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-[0_0_15px_rgba(37,99,235,0.8)]"></div>
            </div>
          `,
          iconSize: [48, 48],
          iconAnchor: [24, 24],
        })}
      />

      {volunteerLocation && (
        <>
            <Marker
                position={[volunteerLocation.lat, volunteerLocation.lng]}
                icon={L.divIcon({
                    className: 'volunteer-live-marker',
                    html: `
                        <div class="relative w-16 h-16 flex items-center justify-center">
                            <div class="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
                            <div class="w-8 h-8 rounded-[1rem] bg-slate-950 border-2 border-primary flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)]">
                                <div class="w-3 h-3 bg-primary rounded-full animate-pulse"></div>
                            </div>
                            <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-primary text-white text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest">Volunteer</div>
                        </div>
                    `,
                    iconSize: [64, 64],
                    iconAnchor: [32, 32],
                })}
            />
            <Polyline 
                positions={[
                    [location.lat, location.lng],
                    [volunteerLocation.lat, volunteerLocation.lng]
                ]}
                pathOptions={{ 
                    color: '#3b82f6', 
                    weight: 3, 
                    dashArray: '10, 10', 
                    opacity: 0.6 
                }}
            />
        </>
      )}
    </>
  );
};

export default function FieldMap(props: FieldMapProps) {
  const [L, setL] = useState<any>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsClient(true);
    let mounted = true;
    import('leaflet').then((leaflet) => {
        if (mounted) setL(leaflet);
    });
    return () => { mounted = false; };
  }, []);

  if (!isClient || !L) return (
    <div className="w-full h-full glass flex flex-col items-center justify-center animate-pulse rounded-[2rem]">
        <div className="w-8 h-8 rounded-full border-t-2 border-r-2 border-yellow animate-spin mb-4"></div>
        <div className="text-[10px] text-[var(--foreground)] font-anton uppercase tracking-widest">Acquiring Satellites...</div>
    </div>
  );

  const { MapContainer, TileLayer } = require('react-leaflet');

  return (
    <div className="w-full h-full relative overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl">
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={props.location ? 16 : 5}
        className="h-full w-full bg-[var(--background)]"
        zoomControl={false}
        dragging={true}
      >
        <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap'
        />
        <FieldMapInner {...props} L={L} />
      </MapContainer>
    </div>
  );
}
