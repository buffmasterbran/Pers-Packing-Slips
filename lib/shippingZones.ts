import zoneChart from '../zone-chart.json';

/**
 * Shipping zone utilities based on zip code lookup
 * Uses zone-chart.json to map zip code prefixes to shipping zones
 */

// Zone chart data - maps zip code prefix (first 3 digits) to zone number
const zoneChartData = zoneChart as Record<string, string>;

/**
 * Get all unique zones from the zone chart
 * Zones are ordered by priority (higher zone numbers = further = ship sooner)
 */
export function getAllZones(): Array<{ zone: string; priority: number }> {
  const uniqueZones = new Set<string>();
  
  // Collect all unique zones
  for (const zone of Object.values(zoneChartData)) {
    uniqueZones.add(zone);
  }
  
  // Convert to array and sort by zone number (lower = closer, higher = further)
  // Lower zone numbers are closest, higher numbers are furthest (need to ship sooner)
  const zones = Array.from(uniqueZones)
    .map(zone => ({
      zone,
      priority: parseInt(zone) || 0,
    }))
    .sort((a, b) => a.priority - b.priority); // Lower zone numbers first (closest)
  
  return zones;
}

/**
 * Get shipping zones for filtering UI
 * Returns zones sorted from closest to furthest (lower zone numbers = closest)
 */
export const SHIPPING_ZONES = getAllZones().map(({ zone, priority }) => ({
  id: zone,
  name: `Zone ${zone}`,
  priority, // Lower priority = closer, higher priority = further (ship sooner)
}));

// Add "Unknown" as a special zone option
export const UNKNOWN_ZONE_ID = 'unknown';

export type ShippingZoneId = string; // Zone number as string (e.g., "002", "003", "004", etc.) or "unknown"

/**
 * Parse shipping address to extract zip code
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
 * Get shipping zone from zip code using zone chart
 * Returns zone number (e.g., "002", "003", "004") or null if not found
 */
export function getZoneFromZipCode(zipCode: string): string | null {
  if (!zipCode || zipCode.length < 3) {
    return null;
  }
  
  // Get first 3 digits of zip code
  const zipPrefix = zipCode.substring(0, 3);
  
  // Look up zone in chart
  return zoneChartData[zipPrefix] || null;
}

/**
 * Assign a shipping zone based on zip code lookup
 */
export function assignShippingZone(address: string): {
  zone: string | null;
  zoneName: string;
  zipCode?: string;
} {
  const parsed = parseShippingAddress(address);
  
  if (!parsed.zipCode) {
    return {
      zone: null,
      zoneName: 'Unknown',
    };
  }

  const zone = getZoneFromZipCode(parsed.zipCode);
  
  if (!zone) {
    return {
      zone: null,
      zoneName: 'Unknown',
      zipCode: parsed.zipCode,
    };
  }

  return {
    zone,
    zoneName: `Zone ${zone}`,
    zipCode: parsed.zipCode,
  };
}
