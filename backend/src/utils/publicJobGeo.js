/**
 * City coordinates in Hiro are usually Israeli Transverse Mercator (EPSG:2039) meters in pointX/pointY.
 * The public jobs API exposes WGS84 decimal degrees for maps and Google for Jobs.
 */

const ITM = Object.freeze({
  a: 6378137.0,
  f: 1 / 298.257222101,
  lat0: (31.734393611111112 * Math.PI) / 180,
  lon0: (35.204516944444444 * Math.PI) / 180,
  k0: 1.0000067,
  fe: 219529.584,
  fn: 626907.390,
});

const looksLikeItmMeters = (x, y) =>
  Number.isFinite(x) && Number.isFinite(y) && (Math.abs(x) > 1000 || Math.abs(y) > 1000);

const looksLikeWgs84 = (lat, lng) =>
  Number.isFinite(lat)
  && Number.isFinite(lng)
  && Math.abs(lat) <= 90
  && Math.abs(lng) <= 180
  && Math.abs(lat) <= 40
  && Math.abs(lng) <= 40;

/** Inverse transverse Mercator (EPSG:2039) → { lat, lng } in WGS84 degrees. */
const itmToWgs84 = (easting, northing) => {
  const x = Number(easting) - ITM.fe;
  const y = Number(northing) - ITM.fn;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { lat: null, lng: null };

  const e2 = ITM.f * (2 - ITM.f);
  const e = Math.sqrt(e2);
  const e1sq = e2 / (1 - e2);
  const n = ITM.f / (2 - ITM.f);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n3 * n;
  const n5 = n4 * n;
  const n6 = n5 * n;

  const m = ITM.a * (
    (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * ITM.lat0
    - ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * ITM.lat0)
    + ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * ITM.lat0)
    - ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * ITM.lat0)
  );

  const mu = (y + m) / (ITM.a * ITM.k0 * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
  const phi1 = mu
    + ((3 * n) / 2 - (27 * n3) / 32) * Math.sin(2 * mu)
    + ((21 * n2) / 16 - (55 * n4) / 32) * Math.sin(4 * mu)
    + ((151 * n3) / 96) * Math.sin(6 * mu)
    + ((1097 * n4) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);
  const tan2 = tanPhi1 * tanPhi1;
  const tan4 = tan2 * tan2;
  const cos2 = cosPhi1 * cosPhi1;
  const nu1 = ITM.a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const rho1 = ITM.a * (1 - e2) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const eta2 = e1sq * cos2;
  const xOverNu = x / (nu1 * ITM.k0);

  const latRad = phi1
    - (nu1 * tanPhi1 / rho1) * (
      (xOverNu * xOverNu) / 2
      - ((5 + 3 * tan2 + 10 * eta2 - 4 * eta2 * eta2 - 9 * e1sq) * Math.pow(xOverNu, 4)) / 24
      + ((61 + 90 * tan2 + 298 * eta2 + 45 * tan4 - 252 * e1sq - 3 * eta2 * eta2) * Math.pow(xOverNu, 6)) / 720
    );

  const lngRad = ITM.lon0 + (
    xOverNu
    - ((1 + 2 * tan2 + eta2) * Math.pow(xOverNu, 3)) / 6
    + ((5 - 2 * eta2 + 28 * tan2 - 3 * eta2 * eta2 + 8 * e1sq + 24 * tan4) * Math.pow(xOverNu, 5)) / 120
  ) / cosPhi1;

  return {
    lat: (latRad * 180) / Math.PI,
    lng: (lngRad * 180) / Math.PI,
  };
};

/**
 * @param {{ pointX?: number, pointY?: number, pointx?: number, pointy?: number }} row
 * @returns {{ lat: number | null, lng: number | null }}
 */
const wgs84FromCityRow = (row) => {
  const rawX = row?.pointX ?? row?.pointx;
  const rawY = row?.pointY ?? row?.pointy;
  if (rawX == null || rawY == null) return { lat: null, lng: null };
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { lat: null, lng: null };

  if (looksLikeItmMeters(x, y)) {
    const { lat, lng } = itmToWgs84(x, y);
    if (!looksLikeWgs84(lat, lng)) return { lat: null, lng: null };
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  }

  // Legacy rows may already store WGS84 (lat in Y, lng in X).
  if (looksLikeWgs84(y, x)) return { lat: y, lng: x };
  return { lat: null, lng: null };
};

module.exports = {
  itmToWgs84,
  wgs84FromCityRow,
  looksLikeItmMeters,
};
