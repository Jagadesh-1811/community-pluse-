'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import { ErrorBoundary } from '@sentry/nextjs';

interface FieldMapProps {
  location: { lat: number; lng: number } | null;
  volunteerLocation?: { lat: number; lng: number } | null;
}

const hasValidLatitude = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;

const hasValidLongitude = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;

const hasValidCoords = (
  coords: { lat: number; lng: number } | null | undefined,
): coords is { lat: number; lng: number } =>
  !!coords && hasValidLatitude(coords.lat) && hasValidLongitude(coords.lng);

const FieldMapInner = ({ location, volunteerLocation, L }: FieldMapProps & { L: any }) => {
  const map = useMap();

  const hasValidLocation = hasValidCoords(location);
  const hasValidVolunteerLocation = hasValidCoords(volunteerLocation);

  useEffect(() => {
    if (!map) return;
    const timer = setTimeout(() => {
      try {
        map.invalidateSize();
        if (hasValidLocation && hasValidVolunteerLocation) {
          // Fit bounds to show both
          map.fitBounds(
            [
              [location.lat, location.lng],
              [volunteerLocation.lat, volunteerLocation.lng],
            ],
            { padding: [50, 50], duration: 1 },
          );
        } else if (hasValidLocation) {
          map.flyTo([location.lat, location.lng], 16, { duration: 1 });
        }
      } catch {
        // Ignore sizing issues
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      try {
        map.stop();
      } catch {
        /* ignore */
      }
    };
  }, [location, volunteerLocation, map, hasValidLocation, hasValidVolunteerLocation]);

  return (
    <>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {hasValidLocation && location && (
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
      )}

      {hasValidLocation && location && hasValidVolunteerLocation && volunteerLocation && (
        <>
          <Marker
            position={[volunteerLocation.lat, volunteerLocation.lng]}
            icon={L.divIcon({
              className: 'volunteer-live-marker',
              html: `
                        <div class="relative w-16 h-16 flex items-center justify-center">
                            <div class="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
                            <div class="w-8 h-8 rounded-2xl bg-slate-950 border-2 border-primary flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)]">
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
              [volunteerLocation.lat, volunteerLocation.lng],
            ]}
            pathOptions={{
              color: '#3b82f6',
              weight: 3,
              dashArray: '10, 10',
              opacity: 0.6,
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
  const mapCenter: [number, number] = hasValidCoords(props.location)
    ? [props.location.lat, props.location.lng]
    : [20.5937, 78.9629];

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsClient(true);
    let mounted = true;
    import('leaflet').then((leaflet) => {
      if (mounted) setL(leaflet);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!isClient || !L)
    return (
      <div className="w-full h-full glass flex flex-col items-center justify-center animate-pulse rounded-4xl">
        <div className="w-8 h-8 rounded-full border-t-2 border-r-2 border-yellow animate-spin mb-4"></div>
        <div className="text-[10px] text-(--foreground) font-anton uppercase tracking-widest">
          Acquiring Satellites...
        </div>
      </div>
    );

  return (
    <div className="w-full h-full relative overflow-hidden rounded-4xl border border-white/10 shadow-2xl">
      <ErrorBoundary
        fallback={
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-xs font-black uppercase tracking-widest text-emergency bg-emergency/10 backdrop-blur-md border border-emergency/25 rounded-4xl">
            Map unavailable — field reports still active via WhatsApp
          </div>
        }
      >
        <MapContainer
          key={`${mapCenter[0]}-${mapCenter[1]}`}
          center={mapCenter}
          zoom={hasValidCoords(props.location) ? 16 : 5}
          className="h-full w-full bg-(--background)"
          zoomControl={false}
          dragging={true}
        >
          <FieldMapInner {...props} L={L} />
        </MapContainer>
      </ErrorBoundary>
    </div>
  );
}
