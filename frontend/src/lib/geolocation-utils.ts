/**
 * Geolocation Utilities for CommunityPulse
 * Provides distance calculations, reverse geocoding, and location validation
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format distance to human-readable string
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Estimate walking time (average 1.4 m/s or ~5 km/h)
 */
export function estimateWalkingTime(meters: number): string {
  const seconds = meters / 1.4;
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${mins > 0 ? mins + 'm' : ''}`;
}

/**
 * Estimate driving time (average 12 m/s or ~43 km/h in urban areas)
 */
export function estimateDrivingTime(meters: number): string {
  const seconds = meters / 12;
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${mins > 0 ? mins + 'm' : ''}`;
}

/**
 * Reverse geocode coordinates using OpenStreetMap's Nominatim service
 * Returns address, place name, and confidence level
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{
  address: string;
  placeName: string;
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      {
        headers: {
          'Accept-Language': 'en',
        },
      }
    );

    if (!response.ok) {
      return {
        address: 'Unknown Location',
        placeName: '',
        confidence: 'low',
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const address = data.address || {};

    // Build address string
    const parts = [];
    if (address.road) parts.push(address.road);
    if (address.building) parts.push(address.building);
    if (address.neighbourhood) parts.push(address.neighbourhood);
    if (address.suburb) parts.push(address.suburb);
    if (address.town) parts.push(address.town);
    if (address.city) parts.push(address.city);
    if (address.county) parts.push(address.county);

    const fullAddress = parts.join(', ') || data.display_name || 'Unknown Location';
    const placeName = address.town || address.city || address.county || '';

    return {
      address: fullAddress,
      placeName,
      confidence: 'medium',
    };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return {
      address: 'Unable to load address',
      placeName: '',
      confidence: 'low',
      error: String(error),
    };
  }
}

/**
 * Validate GPS coordinates
 */
export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Check if GPS accuracy is sufficient for mission-critical dispatch
 * Returns true if accuracy is acceptable (< 50m)
 */
export function isAccuracyAcceptable(
  accuracy: number | undefined,
  threshold: number = 50
): boolean {
  if (accuracy === undefined) return false;
  return accuracy <= threshold;
}

/**
 * Get accuracy description for display
 */
export function getAccuracyDescription(accuracy: number | undefined): {
  level: 'excellent' | 'good' | 'poor' | 'unknown';
  message: string;
  color: string;
} {
  if (accuracy === undefined) {
    return {
      level: 'unknown',
      message: 'Location accuracy unknown',
      color: 'gray',
    };
  }

  if (accuracy <= 10) {
    return {
      level: 'excellent',
      message: `Excellent precision (±${Math.round(accuracy)}m)`,
      color: 'emerald',
    };
  }

  if (accuracy <= 30) {
    return {
      level: 'good',
      message: `Good accuracy (±${Math.round(accuracy)}m)`,
      color: 'blue',
    };
  }

  if (accuracy <= 100) {
    return {
      level: 'poor',
      message: `Lower accuracy (±${Math.round(accuracy)}m) - verify location`,
      color: 'orange',
    };
  }

  return {
    level: 'poor',
    message: `Very low accuracy (±${Math.round(accuracy)}m) - location may be unreliable`,
    color: 'red',
  };
}

/**
 * Bearing from point A to point B (in degrees)
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = lon2 - lon1;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/**
 * Direction name from bearing
 */
export function getBearingDirection(bearing: number): string {
  const directions = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  const index = Math.round((bearing + 11.25) / 22.5) % 16;
  return directions[index];
}
