const INTERVIEW_ARRIVAL_META_KEY = 'interviewArrival';

function readInterviewArrival(metadata) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  const raw = meta[INTERVIEW_ARRIVAL_META_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      address: '',
      latitude: null,
      longitude: null,
      wazeLinkOverride: '',
      googleMapsLinkOverride: '',
    };
  }
  const lat = raw.latitude != null ? Number(raw.latitude) : null;
  const lng = raw.longitude != null ? Number(raw.longitude) : null;
  return {
    address: String(raw.address || '').trim(),
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    wazeLinkOverride: String(raw.wazeLinkOverride || '').trim(),
    googleMapsLinkOverride: String(raw.googleMapsLinkOverride || '').trim(),
  };
}

function buildWazeLink(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

function buildGoogleMapsLink(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

function resolveWazeLink(arrival) {
  const row = arrival && typeof arrival === 'object' ? arrival : readInterviewArrival(null);
  if (row.wazeLinkOverride) return row.wazeLinkOverride;
  return buildWazeLink(row.latitude, row.longitude);
}

function resolveGoogleMapsLink(arrival) {
  const row = arrival && typeof arrival === 'object' ? arrival : readInterviewArrival(null);
  if (row.googleMapsLinkOverride) return row.googleMapsLinkOverride;
  return buildGoogleMapsLink(row.latitude, row.longitude);
}

function navigationPlaceholdersFromMetadata(metadata) {
  const arrival = readInterviewArrival(metadata);
  return {
    waze_link: resolveWazeLink(arrival),
    google_maps_link: resolveGoogleMapsLink(arrival),
  };
}

module.exports = {
  INTERVIEW_ARRIVAL_META_KEY,
  readInterviewArrival,
  buildWazeLink,
  buildGoogleMapsLink,
  resolveWazeLink,
  resolveGoogleMapsLink,
  navigationPlaceholdersFromMetadata,
};
