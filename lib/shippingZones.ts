/**
 * Shipping zone utilities based on distance from Asheville, NC
 * Asheville coordinates: 35.5951° N, 82.5515° W
 */

// Asheville, NC coordinates
const ASHEVILLE_LAT = 35.5951;
const ASHEVILLE_LON = -82.5515;

/**
 * Shipping zones based on distance from Asheville
 * Zones are prioritized by distance - further zones need to ship sooner
 */
export const SHIPPING_ZONES = [
  { id: 'local', name: 'Local (0-50 mi)', maxDistance: 50, priority: 4 },
  { id: 'regional', name: 'Regional (50-499 mi)', maxDistance: 499, priority: 3 },
  { id: 'national', name: 'National (500-1000 mi)', maxDistance: 1000, priority: 2 },
  { id: 'distant', name: 'Distant (1000+ mi)', maxDistance: Infinity, priority: 1 },
] as const;

export type ShippingZoneId = typeof SHIPPING_ZONES[number]['id'];

/**
 * Parse shipping address to extract zip code and state
 */
export function parseShippingAddress(address: string): {
  zipCode?: string;
  state?: string;
  city?: string;
} {
  if (!address) return {};

  // Address format is typically:
  // "Name\nStreet\nCity State ZIP\nCountry"
  const lines = address.split('\n').map(line => line.trim()).filter(line => line);
  
  let zipCode: string | undefined;
  let state: string | undefined;
  let city: string | undefined;

  // Look for the line with city, state, zip (usually second to last line before country)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    
    // Skip country line (usually "United States")
    if (line.toLowerCase().includes('united states')) continue;
    
    // Try to extract zip code (5 digits or 5+4 format)
    const zipMatch = line.match(/\b(\d{5})(?:[-\s]?\d{4})?\b/);
    if (zipMatch) {
      zipCode = zipMatch[1];
      
      // Extract state (2-letter abbreviation before zip)
      const stateMatch = line.match(/\b([A-Z]{2})\s+\d{5}/);
      if (stateMatch) {
        state = stateMatch[1];
      }
      
      // Extract city (everything before state)
      const cityMatch = line.match(/^(.+?)\s+[A-Z]{2}\s+\d{5}/);
      if (cityMatch) {
        city = cityMatch[1].trim();
      }
      
      break;
    }
  }

  return { zipCode, state, city };
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in miles
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Get coordinates for a zip code using a simple lookup
 * This is a basic implementation - in production, you'd use a geocoding service
 * For now, we'll use state-based approximations
 */
function getCoordinatesFromZip(zipCode: string, state?: string): { lat: number; lon: number } | null {
  // Basic state center coordinates (approximate)
  // In production, use a geocoding API like Google Maps, Mapbox, or USPS
  const stateCenters: Record<string, { lat: number; lon: number }> = {
    'NC': { lat: 35.5, lon: -80.0 }, // North Carolina
    'SC': { lat: 33.8, lon: -80.9 }, // South Carolina
    'GA': { lat: 32.6, lon: -83.4 }, // Georgia
    'TN': { lat: 35.7, lon: -86.8 }, // Tennessee
    'VA': { lat: 37.5, lon: -78.2 }, // Virginia
    'FL': { lat: 27.8, lon: -81.8 }, // Florida
    'AL': { lat: 32.8, lon: -86.8 }, // Alabama
    'MS': { lat: 32.7, lon: -89.7 }, // Mississippi
    'KY': { lat: 37.7, lon: -85.3 }, // Kentucky
    'WV': { lat: 38.3, lon: -80.9 }, // West Virginia
    'OH': { lat: 40.4, lon: -82.8 }, // Ohio
    'PA': { lat: 40.6, lon: -77.2 }, // Pennsylvania
    'NY': { lat: 42.2, lon: -74.8 }, // New York
    'MA': { lat: 42.2, lon: -71.5 }, // Massachusetts
    'CT': { lat: 41.6, lon: -72.7 }, // Connecticut
    'NJ': { lat: 40.2, lon: -74.5 }, // New Jersey
    'MD': { lat: 39.0, lon: -76.5 }, // Maryland
    'DE': { lat: 39.2, lon: -75.5 }, // Delaware
    'TX': { lat: 31.0, lon: -99.9 }, // Texas
    'CA': { lat: 36.1, lon: -119.4 }, // California
    'WA': { lat: 47.0, lon: -120.7 }, // Washington
    'OR': { lat: 44.0, lon: -120.5 }, // Oregon
    'AZ': { lat: 34.0, lon: -111.5 }, // Arizona
    'NV': { lat: 39.3, lon: -116.6 }, // Nevada
    'UT': { lat: 39.3, lon: -111.6 }, // Utah
    'CO': { lat: 39.0, lon: -105.5 }, // Colorado
    'NM': { lat: 34.5, lon: -106.2 }, // New Mexico
    'OK': { lat: 35.5, lon: -97.5 }, // Oklahoma
    'AR': { lat: 34.7, lon: -92.3 }, // Arkansas
    'LA': { lat: 30.4, lon: -91.2 }, // Louisiana
    'MO': { lat: 38.5, lon: -92.2 }, // Missouri
    'IA': { lat: 41.9, lon: -93.6 }, // Iowa
    'MN': { lat: 46.7, lon: -94.7 }, // Minnesota
    'WI': { lat: 44.3, lon: -89.6 }, // Wisconsin
    'IL': { lat: 40.3, lon: -89.1 }, // Illinois
    'IN': { lat: 39.8, lon: -86.1 }, // Indiana
    'MI': { lat: 43.3, lon: -84.5 }, // Michigan
    'ME': { lat: 44.3, lon: -69.8 }, // Maine
    'NH': { lat: 43.4, lon: -71.6 }, // New Hampshire
    'VT': { lat: 44.2, lon: -72.6 }, // Vermont
    'RI': { lat: 41.8, lon: -71.4 }, // Rhode Island
    'HI': { lat: 21.3, lon: -157.8 }, // Hawaii
    'AK': { lat: 61.2, lon: -149.9 }, // Alaska
  };

  if (state && stateCenters[state.toUpperCase()]) {
    return stateCenters[state.toUpperCase()];
  }

  // If no state, try to estimate from zip code prefix
  // This is very approximate - zip codes starting with certain numbers are in certain regions
  const zipPrefix = parseInt(zipCode.substring(0, 3));
  
  // Very rough regional estimates based on zip code ranges
  if (zipPrefix >= 280 && zipPrefix <= 289) {
    return { lat: 35.5, lon: -80.0 }; // NC
  }
  if (zipPrefix >= 290 && zipPrefix <= 299) {
    return { lat: 33.8, lon: -80.9 }; // SC
  }
  if (zipPrefix >= 300 && zipPrefix <= 319) {
    return { lat: 33.7, lon: -84.4 }; // GA
  }
  if (zipPrefix >= 370 && zipPrefix <= 385) {
    return { lat: 35.7, lon: -86.8 }; // TN
  }
  if (zipPrefix >= 220 && zipPrefix <= 246) {
    return { lat: 37.5, lon: -78.2 }; // VA
  }
  
  // Default to Asheville if we can't determine
  return { lat: ASHEVILLE_LAT, lon: ASHEVILLE_LON };
}

/**
 * Calculate distance from Asheville for a shipping address
 * Returns distance in miles, or null if address cannot be parsed
 */
export function calculateDistanceFromAsheville(address: string): number | null {
  const parsed = parseShippingAddress(address);
  
  if (!parsed.zipCode) {
    return null;
  }

  const coords = getCoordinatesFromZip(parsed.zipCode, parsed.state);
  if (!coords) {
    return null;
  }

  return calculateDistance(
    ASHEVILLE_LAT,
    ASHEVILLE_LON,
    coords.lat,
    coords.lon
  );
}

/**
 * Assign a shipping zone based on distance from Asheville
 */
export function assignShippingZone(address: string): {
  zone: ShippingZoneId;
  distance: number | null;
  zoneName: string;
} {
  const distance = calculateDistanceFromAsheville(address);
  
  if (distance === null) {
    // If we can't calculate distance, default to 'national' zone
    const nationalZone = SHIPPING_ZONES.find(z => z.id === 'national');
    return {
      zone: 'national',
      distance: null,
      zoneName: nationalZone?.name || 'National (500-1000 mi)',
    };
  }

  // Find the appropriate zone based on distance
  for (const zone of SHIPPING_ZONES) {
    if (distance <= zone.maxDistance) {
      return {
        zone: zone.id,
        distance,
        zoneName: zone.name,
      };
    }
  }

  // Should never reach here, but fallback to distant
  return {
    zone: 'distant',
    distance,
    zoneName: 'Distant (1000+ mi)',
  };
}

